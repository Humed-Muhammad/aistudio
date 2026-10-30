import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
import numpy as np
import clipper,shorts

def clip_job(d,parts=12,each=6.):
 """A downloaded video's folder with a transcript of `parts` sentences, `each` seconds apart."""
 p=Path(d)
 units=[{'id':k,'first':k,'last':k,'start':k*each,'end':k*each+each-.5,'text':f'Sentence {k}.'} for k in range(parts)]
 (p/'units.json').write_text(json.dumps(units))
 (p/'source-info.json').write_text(json.dumps({'duration':parts*each,'width':1920,'height':1080,'audio':True}))
 (p/'job.json').write_text(json.dumps({'url':'https://youtu.be/x','title':'Talk','language':'en'}))
 return p

class CaptionTests(unittest.TestCase):
 def test_auto_captions_keep_word_times(self):
  data={'events':[{'tStartMs':1000,'dDurationMs':2000,'segs':[{'utf8':'hello'},{'utf8':' world','tOffsetMs':600}]},
                  {'tStartMs':1500,'aAppend':1,'segs':[{'utf8':'\n'}]},
                  {'tStartMs':3000,'dDurationMs':1000,'segs':[{'utf8':'again','tOffsetMs':0}]}]}
  words=clipper.json3_captions(data)
  self.assertEqual([(w['text'],w['startMs'],w['endMs']) for w in words],[(' hello',1000,1600),(' world',1600,3000),(' again',3000,4000)])

 def test_uploaded_captions_spread_words_over_the_line(self):
  words=clipper.json3_captions({'events':[{'tStartMs':0,'dDurationMs':1000,'segs':[{'utf8':'ab abcdef ab'}]}]})
  self.assertEqual([w['text'] for w in words],[' ab',' abcdef',' ab'])
  self.assertEqual(words[0]['startMs'],0);self.assertEqual(words[-1]['endMs'],1000);self.assertLess(words[1]['startMs'],words[2]['startMs'])

 def test_captions_never_a_machine_translation(self):
  j=lambda lang:[{'ext':'vtt','url':'v'},{'ext':'json3','url':lang}]
  info={'language':'en','subtitles':{},'automatic_captions':{'am':j('am'),'en-orig':j('en-orig'),'fr':j('fr')}}
  self.assertEqual(clipper.pick_captions(info,'en'),('en-orig','youtube-auto'))
  self.assertEqual(clipper.pick_captions(info,'auto'),('en-orig','youtube-auto'))
  self.assertIsNone(clipper.pick_captions(info,'am'))  # 'am' here is YouTube translating the English, not Amharic speech
  info['subtitles']={'am':j('am-real')}
  self.assertEqual(clipper.pick_captions(info,'am'),('am-real','youtube-captions'))

 def test_links(self):
  for ok in ['https://www.youtube.com/watch?v=abc','https://youtu.be/abc','https://youtube.com/shorts/abc','https://m.youtube.com/watch?v=a&t=3']:
   self.assertEqual(clipper.check_url(' '+ok+' '),ok)
  for bad in ['https://vimeo.com/1','youtube.com/watch?v=a','https://youtube.com.evil.com/watch?v=a','file:///etc/passwd']:
   with self.assertRaises(ValueError):clipper.check_url(bad)

class MomentTests(unittest.TestCase):
 def test_moments_are_checked_ranked_and_deduplicated(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d)
   out=clipper.save_moments(p,{'summary':'s','moments':[
    {'first':0,'last':4,'title':'A','hook':'h','kind':'viral','score':70,'why':'w'},
    {'first':2,'last':6,'title':'B overlaps A','kind':'story','score':90},
    {'first':8,'last':7,'title':'Backwards'},
    {'first':9,'last':9,'title':'Too short'},
    {'start':48,'end':66,'title':'By time','kind':'nonsense','score':140}]})
   self.assertEqual([(m['n'],m['title'],m['first'],m['last']) for m in out['moments']],[(1,'By time',8,10),(2,'B overlaps A',2,6)])
   self.assertEqual(out['moments'][0]['kind'],'key');self.assertEqual(out['moments'][0]['score'],100)
   self.assertEqual(out['moments'][1]['start'],12-clipper.PAD_IN)
   self.assertTrue(any('overlaps' in w and w.startswith('A:') for w in out['warnings']))
   self.assertTrue(any('Backwards' in w for w in out['warnings']));self.assertTrue(any('Too short' in w for w in out['warnings']))

 def test_made_shorts_stay_linked_when_moments_are_found_again(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d);m={'first':0,'last':4,'title':'A','score':60}
   first=clipper.save_moments(p,{'moments':[m]});first['moments'][0]['job']='f'*32;clipper.write(p,'moments.json',first)
   again=clipper.save_moments(p,{'moments':[{'first':6,'last':10,'title':'New','score':90},m]})
   self.assertEqual([x['job'] for x in again['moments']],[None,'f'*32])

 def test_nothing_usable_is_an_error(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):clipper.save_moments(clip_job(d),{'moments':[{'first':0,'last':0}]})

 def test_context_lists_parts_replays_and_instructions(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d);units=json.loads((p/'units.json').read_text())
   for u,r in zip(units,clipper.replay_levels([{'start_time':0,'end_time':10,'value':.9},{'start_time':10,'end_time':80,'value':.1}],units)):u['replay']=r
   (p/'units.json').write_text(json.dumps(units))
   text=clipper.find_context(p,'5','short','only money tips')
   self.assertIn('[0] 0:00-0:05 (replay 0.90): Sentence 0.',text);self.assertIn('[3] 0:18-0:23: Sentence 3.',text)
   self.assertIn('the 5 strongest moments',text);self.assertIn('15-30 seconds',text);self.assertIn('only money tips',text)

 def test_seed_words_only_from_an_exact_transcript(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d);words=[{'text':' a','startMs':9000,'endMs':9500},{'text':' b','startMs':10200,'endMs':10800},{'text':' c','startMs':30000,'endMs':30400}]
   clipper.write(p,'transcript.json',{'provider':'youtube-auto','exact':False,'captions':words})
   self.assertIsNone(clipper.seed_words(p,10,20))
   clipper.write(p,'transcript.json',{'provider':'elevenlabs','exact':True,'language':'amh','captions':words})
   seed=clipper.seed_words(p,10,20)
   self.assertEqual([(w['text'],w['startMs'],w['endMs']) for w in seed['captions']],[(' b',200,800)]);self.assertEqual(seed['language'],'amh')

 def test_amharic_without_captions_waits_for_the_creators_ok(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d);(p/'workflow-mode.json').write_text('{"mode":"clips","language":"am"}')
   with patch('shorts.transcriber',return_value='elevenlabs'),patch('shorts.transcribe') as paid:
    msg=clipper.transcribe(p,lambda *a:None)
   paid.assert_not_called();self.assertIn('ElevenLabs',msg);self.assertEqual(json.loads((p/'transcript-needed.json').read_text())['minutes'],1.2)
   with patch('shorts.transcriber',return_value='whisper'),self.assertRaises(ValueError):clipper.transcribe(p,lambda *a:None)

class FindTests(unittest.TestCase):
 def stream(self,stop,picks=None):
  final=type('M',(),{'stop_reason':stop,'parsed_output':picks})()
  ctx=type('S',(),{'__enter__':lambda s:type('X',(),{'get_final_message':lambda x:final})(),'__exit__':lambda s,*a:False})()
  client=type('C',(),{})();client.beta=type('B',(),{})();client.beta.messages=type('Ms',(),{})();self.sent={}
  def stream(**kw):self.sent.update(kw);return ctx
  client.beta.messages.stream=stream;return client

 def test_moments_are_streamed_with_room_to_think(self):
  with tempfile.TemporaryDirectory() as d:
   p=clip_job(d);picks=clipper.MomentPicks(summary='s',moments=[clipper.Moment(first=0,last=4,title='A',hook='h',kind='viral',score=80,why='w')])
   with patch('anthropic.Anthropic',return_value=self.stream('end_turn',picks)):out=clipper.find_auto(p)
   self.assertEqual(out['moments'][0]['title'],'A');self.assertGreaterEqual(self.sent['max_tokens'],64000)
   self.assertEqual(self.sent['output_format'],clipper.MomentPicks);self.assertEqual(self.sent['output_config']['effort'],'high')

 def test_running_out_of_room_says_what_to_do(self):
  with tempfile.TemporaryDirectory() as d:
   with patch('anthropic.Anthropic',return_value=self.stream('max_tokens')),self.assertRaisesRegex(RuntimeError,'ran out of room'):clipper.find_auto(clip_job(d))

class FramingTests(unittest.TestCase):
 def test_still_speaker_gets_one_steady_crop_and_faceless_shots_are_shown_whole(self):
  samples=[[.70+.01*(i%2),.4,.2] for i in range(25)]+[None]*25
  plan=clipper.shot_plan({'fps':5,'samples':samples,'cuts':[5.0],'jolts':[]},10,'auto')
  self.assertEqual([(a,b,m) for a,b,m,_ in plan],[(0,150,'follow'),(150,300,'fit')])
  self.assertTrue(np.allclose(plan[0][3],np.median([s[0] for s in samples[:25]])))
  self.assertEqual([m for *_,m,_ in clipper.shot_plan({'fps':5,'samples':samples,'cuts':[],'jolts':[]},10,'fit')],['fit'])

 def test_face_jump_is_a_cut_on_the_changed_frame(self):
  samples=[[.75,.4,.2]]*10+[[.25,.4,.2]]*10
  scan={'fps':5,'samples':samples,'cuts':[],'jolts':[[1.85,6.],[1.9,20.]]}
  self.assertEqual(clipper.face_jumps(scan),[1.9])
  plan=clipper.shot_plan(scan,4,'auto')
  self.assertEqual([(a,b,round(float(c[0]),2)) for a,b,_,c in plan],[(0,57,.75),(57,120,.25)])
  self.assertEqual(clipper.face_jumps({'fps':5,'samples':[[.75,.4,.2]]*5+[[.25,.4,.2]]+[[.75,.4,.2]]*5,'jolts':[]}),[])  # one stray detection

 def test_moving_speaker_is_followed_smoothly(self):
  samples=[[.3+.4*i/49,.4,.2] for i in range(50)]
  _,_,mode,centre=clipper.shot_plan({'fps':5,'samples':samples,'cuts':[],'jolts':[]},10,'follow')[0]
  self.assertEqual(mode,'follow');self.assertEqual(len(centre),300)
  self.assertTrue(np.all(np.diff(centre)>=-1e-9));self.assertLess(float(np.abs(np.diff(centre)).max()),.01)

class SeedTests(unittest.TestCase):
 def test_seeded_words_are_used_once_instead_of_a_paid_transcript(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'workflow-mode.json').write_text('{"mode":"shorts","language":"am"}')
   (p/'seed-captions.json').write_text(json.dumps({'language':'amh','captions':[{'text':' ሰላም','startMs':100,'endMs':600,'timestampMs':None,'confidence':1}]}))
   with patch('shorts.speech_wav',return_value=True),patch('shorts.refine_timing',side_effect=lambda c,w:c),patch('shorts.transcribe_scribe') as paid:
    words=shorts.transcribe(p/'upload.mp4',p)
   paid.assert_not_called();self.assertEqual(words[0]['text'],' ሰላም');self.assertFalse((p/'seed-captions.json').exists())

if __name__=='__main__':unittest.main()
