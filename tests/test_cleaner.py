import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
import numpy as np
from fastapi.testclient import TestClient
import cleaner,cleaner_app,shorts

def word(text,s,e):return {'text':' '+text,'startMs':s,'endMs':e,'timestampMs':(s+e)//2,'confidence':1}
WORDS=[word('Hello',0,400),word('there.',450,900),word('Next',3000,3300),word('part',3350,3700),word('ends.',3750,4100)]

def recording(path,seconds=2):
    """Stereo 48 kHz tone plus hiss."""
    t=np.arange(int(seconds*shorts.SR))/shorts.SR;rng=np.random.default_rng(0)
    a=(np.sin(2*np.pi*220*t)*6000+rng.normal(0,1500,len(t))).astype(np.int16)
    shorts.write_wav(np.stack([a,a]),path);return path

def fake_scribe(wav,out,status,language=None):
    Path(out).write_text(json.dumps({'language':language,'provider':'elevenlabs','captions':WORDS}))

class TranscriptFormatTests(unittest.TestCase):
    def test_paragraph_breaks_after_long_pause_at_sentence_end(self):
        self.assertEqual(cleaner.paragraphs(WORDS),'Hello there.\n\nNext part ends.')

    def test_srt_lines_split_at_sentences(self):
        self.assertEqual(cleaner.srt(WORDS),'1\n00:00:00,000 --> 00:00:00,900\nHello there.\n\n2\n00:00:03,000 --> 00:00:04,100\nNext part ends.\n\n')

    def test_long_line_is_split(self):
        words=[word(f'w{i}',i*300,i*300+250) for i in range(20)]
        self.assertTrue(all(len(l)<=8 for l in cleaner.lines(words)))

OROMO="Afaan Oromoo afaan ummata Oromoo ti. Namoonni miliyoona hedduu afaan kana ni dubbatu. Barnoota keessatti afaan kana fayyadamuun baay'ee barbaachisaa dha. Har'a waa'ee aadaa keenya isinitti himuu barbaada."
SOMALI="Waxaan jeclahay inaan idinla wadaago sheekadan. Waa maalin wanaagsan oo qorraxdu ay soo baxday, iyo dadka oo dhan ay faraxsan yihiin."
ENGLISH="Today I want to show you how to clean the sound of a recording and get a transcript in a few seconds."

class OromoDetectionTests(unittest.TestCase):
    def test_oromo_is_recognised_from_the_words(self):
        self.assertTrue(cleaner.looks_oromo(OROMO))
        for other in [SOMALI,ENGLISH,'ሰላም ነው ዛሬ ስለ ድምፅ ማጽዳት እናወራለን እና ብዙ ነገር እንማራለን','Nagaa fi kan']:self.assertFalse(cleaner.looks_oromo(other),other)

    def test_spoken_language_overrides_a_wrong_service_guess(self):
        self.assertEqual(cleaner.spoken('som',OROMO),'om');self.assertEqual(cleaner.spoken('orm',''),'om')
        self.assertEqual(cleaner.spoken('eng',ENGLISH),'en');self.assertEqual(cleaner.spoken('amh',OROMO),'am');self.assertIsNone(cleaner.spoken('som',SOMALI))

class CleanerJobTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        patcher=patch.object(cleaner,'RUNS',Path(self.tmp.name)/'cleaner');patcher.start();self.addCleanup(patcher.stop)
        self.src=recording(Path(self.tmp.name)/'my talk.wav')

    def test_clean_and_transcribe_keeps_original_and_length(self):
        folder=cleaner.create(self.src,'light','am',True)
        with patch.object(shorts,'transcriber',return_value='elevenlabs'),patch.object(shorts,'transcribe_scribe',side_effect=fake_scribe) as scribe:
            msg=cleaner.process(folder,status=lambda *a:None)
        self.assertIn('transcript (5 words)',msg)
        self.assertEqual((folder/'input.wav').read_bytes(),self.src.read_bytes())
        self.assertEqual(shorts.decode_audio(folder/'clean.wav').shape,shorts.decode_audio(self.src).shape)
        self.assertTrue((folder/'clean.mp3').exists());self.assertFalse((folder/'clean-video.mp4').exists())
        self.assertEqual(Path(scribe.call_args[0][0]).parent,folder);self.assertEqual(scribe.call_args[0][3],'am')
        self.assertFalse((folder/'speech-16k.wav').exists())
        self.assertEqual([o['file'] for o in cleaner.outputs(folder)],['clean.mp3','clean.wav','transcript.txt','transcript.srt','transcript.json'])

    def test_transcribe_only_uses_original_sound(self):
        folder=cleaner.create(self.src,'off','en',True)
        with patch.object(shorts,'transcriber',return_value='elevenlabs'),patch.object(shorts,'transcribe_scribe',side_effect=fake_scribe):
            cleaner.process(folder,status=lambda *a:None)
        self.assertFalse((folder/'clean.wav').exists());self.assertTrue((folder/'transcript.srt').exists())

    def test_amharic_without_scribe_is_refused_clearly(self):
        folder=cleaner.create(self.src,'off','am',True)
        with patch.object(shorts,'transcriber',return_value='whisper'),self.assertRaisesRegex(ValueError,'ELEVENLABS_API_KEY'):
            cleaner.process(folder,status=lambda *a:None)

    def test_oromo_asks_scribe_for_orm_then_without_a_hint(self):
        folder=cleaner.create(self.src,'off','om',True);asked=[]
        def scribe(wav,out,status,language=None):
            asked.append(language)
            if language=='orm':raise RuntimeError('ElevenLabs transcription failed (400): unsupported language')
            Path(out).write_text(json.dumps({'language':'som','captions':[word(w,i*400,i*400+300) for i,w in enumerate(OROMO.split())]}))
        with patch.object(shorts,'transcriber',return_value='elevenlabs'),patch.object(shorts,'transcribe_scribe',side_effect=scribe):
            cleaner.process(folder,status=lambda *a:None)
        data=json.loads((folder/'transcript.json').read_text())
        self.assertEqual(asked,['orm','auto']);self.assertEqual((data['language'],data['reported']),('om','som'))
        self.assertEqual(cleaner_app.state(folder)['detected'],'om')

    def test_detect_reports_oromo(self):
        folder=cleaner.create(self.src,'off','auto',True)
        def scribe(wav,out,status,language=None):Path(out).write_text(json.dumps({'language':'som','captions':[word(w,i*400,i*400+300) for i,w in enumerate(OROMO.split())]}))
        with patch.object(shorts,'transcriber',return_value='elevenlabs'),patch.object(shorts,'transcribe_scribe',side_effect=scribe):
            cleaner.process(folder,status=lambda *a:None)
        self.assertEqual(json.loads((folder/'transcript.json').read_text())['language'],'om')

    def test_oromo_without_scribe_is_refused_clearly(self):
        folder=cleaner.create(self.src,'off','om',True)
        with patch.object(shorts,'transcriber',return_value='whisper'),self.assertRaisesRegex(ValueError,'Oromo needs ElevenLabs'):
            cleaner.process(folder,status=lambda *a:None)

    def test_bad_inputs_are_refused(self):
        with self.assertRaisesRegex(ValueError,'both'):cleaner.create(self.src,'off','am',False)
        junk=Path(self.tmp.name)/'notes.txt';junk.write_text('hello')
        with self.assertRaisesRegex(ValueError,'tool can read'):cleaner.create(junk,'light','am',True)
        self.assertEqual(list(cleaner.RUNS.iterdir()),[])

    def test_api_upload_runs_and_serves_results(self):
        from app import app
        client=TestClient(app)
        with patch.object(cleaner_app,'run') as run:
            r=client.post('/cleaner/jobs',files={'file':('my talk.wav',self.src.read_bytes(),'audio/wav')},data={'noise':'light','language':'en','transcribe':'false'})
        self.assertEqual(r.status_code,200,r.text);ident=r.json()['id'];run.assert_called_once()
        cleaner.process(cleaner.RUNS/ident,status=lambda *a:None)
        j=client.get('/cleaner/jobs/'+ident).json();self.assertEqual([o['file'] for o in j['outputs']],['clean.mp3','clean.wav'])
        d=client.get(f'/cleaner/jobs/{ident}/files/clean.mp3?download=1')
        self.assertEqual(d.status_code,200);self.assertIn('my%20talk-clean.mp3',d.headers['content-disposition'])
        self.assertEqual(client.get(f'/cleaner/jobs/{ident}/files/job.json').status_code,404)
        self.assertEqual(client.post('/cleaner/jobs',files={'file':('x.wav',self.src.read_bytes())},data={'noise':'loud'}).status_code,400)
        self.assertEqual(client.delete('/cleaner/jobs/'+ident).status_code,200);self.assertFalse((cleaner.RUNS/ident).exists())

if __name__=='__main__':unittest.main()
