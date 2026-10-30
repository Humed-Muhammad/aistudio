import json,os,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import channel,channel_youtube as yt

def fake_youtube(endpoint,params,status=None):
    """A tiny YouTube: two seeds, three channels (one small and young with an outlier)."""
    if endpoint=='search':
        ids={'space facts':['v1','v2','v3'],'budget tips':['v4']}.get(params['q'],[])
        return {'items':[{'id':{'videoId':i}} for i in ids]}
    if endpoint=='videos':
        table={'v1':('cA','Why space is silent',2_000_000,'PT12M'),'v2':('cB','Black holes explained',900_000,'PT9M30S'),
               'v3':('cB','Mars in 10 minutes',40_000,'PT10M'),'v4':('cC','Save money fast',300_000,'PT8M'),
               'r1':('cA','old',10_000,'PT11M'),'r2':('cA','old2',30_000,'PT11M'),'r3':('cB','b',800_000,'PT9M'),'r4':('cB','short',5,'PT40S')}
        out=[]
        for i in params['id'].split(','):
            c,t,v,d=table[i]
            out.append({'id':i,'snippet':{'channelId':c,'channelTitle':'Chan '+c,'title':t,'publishedAt':'2026-06-01T00:00:00Z','tags':['space']},
                        'statistics':{'viewCount':str(v),'likeCount':'10'},'contentDetails':{'duration':d}})
        return {'items':out}
    if endpoint=='channels' and params.get('forHandle'):
        return {'items':[{'id':'cB'}]} if params['forHandle']=='@bigspace' else {'items':[]}
    if endpoint=='channels':
        table={'cA':('12000','2026-01-01T00:00:00Z'),'cB':('2000000','2015-01-01T00:00:00Z'),'cC':('80000','2020-01-01T00:00:00Z')}
        return {'items':[{'id':c,'snippet':{'title':'Chan '+c,'publishedAt':table[c][1]},'statistics':{'subscriberCount':table[c][0],'videoCount':'40','viewCount':'1'},
                          'contentDetails':{'relatedPlaylists':{'uploads':'UU'+c}}} for c in params['id'].split(',')]}
    if endpoint=='playlistItems':
        ups={'UUcA':['r1','r2'],'UUcB':['r3','r4'],'UUcC':[]}[params['playlistId']]
        return {'items':[{'contentDetails':{'videoId':u}} for u in ups]}
    raise AssertionError(endpoint)

class Base(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);t=Path(self.tmp.name)
        for target,name,value in [(channel,'HOME',t/'channel'),(channel,'RESEARCH',t/'channel/research'),(channel,'PROFILES',t/'channels.json'),
                                  (yt,'HOME',t/'channel'),(yt,'CACHE',t/'channel/yt-cache'),(yt,'QUOTA_FILE',t/'channel/quota.json')]:
            p=patch.object(target,name,value);p.start();self.addCleanup(p.stop)
        e=patch.dict(os.environ,{'YOUTUBE_API_KEY':'','PEXELS_API_KEY':'','PIXABAY_API_KEY':'','FAL_KEY':''});e.start();self.addCleanup(e.stop)

class ProfileTests(Base):
    def test_profiles_are_cleaned_and_updated_in_place(self):
        p=channel.save_profile({'name':' Cosmos Daily ','niche':'space','look':{'accent':'red','style':'nope'},'upload':{'privacy':'everyone','tags':[' a ','']},'minutes':99})
        self.assertEqual((p['name'],p['look']['accent'],p['look']['style'],p['upload']['privacy'],p['upload']['tags'],p['minutes']),
                         ('Cosmos Daily','#FF7A59','cartoon','private',['a'],30))
        q=channel.save_profile({'tone':'calm','voice':{'id':'abc','bogus':1}},p['id'])
        self.assertEqual((q['id'],q['niche'],q['tone'],q['voice']['id'],'bogus' in q['voice']),(p['id'],'space','calm','abc',False))
        self.assertEqual(len(channel.profiles()),1)
        with self.assertRaises(ValueError):channel.save_profile({'name':' '})
        with self.assertRaises(KeyError):channel.save_profile({'name':'x'},'missing')
        channel.delete_profile(p['id']);self.assertEqual(channel.profiles(),[])

    def test_art_and_mascot(self):
        from PIL import Image
        p=channel.save_profile({'name':'Toons','art':{'style':'nope','prompt':' my own style ','mascot':{'name':'Bolt','description':'a robot','image':'x','extra':1}}})
        self.assertEqual((p['art']['style'],p['art']['prompt'],p['art']['stock'],p['art']['mascot']['name'],'extra' in p['art']['mascot']),('flat','my own style',False,'Bolt',False))
        art=channel.art_of(p);self.assertEqual((art['prompt'],art['mascot']),('my own style',None))  # the image path does not exist
        with patch.object(channel,'MASCOTS',channel.HOME/'mascots'):
            with self.assertRaises(ValueError):channel.design_mascots(p['id'],'a small friendly robot',allowed=1)  # no FAL_KEY
            with patch.dict(os.environ,{'FAL_KEY':'k'}):
                with self.assertRaises(ValueError):channel.design_mascots(p['id'],'a small friendly robot',allowed=.05)  # not confirmed
            own=Path(self.tmp.name)/'own.png';Image.new('RGB',(2000,1000),'red').save(own)
            q=channel.pick_mascot(p['id'],upload=own)
            self.assertEqual(q['art']['mascot']['image'],f'mascots/{p["id"]}/mascot.png')
            self.assertEqual(Image.open(channel.HOME/q['art']['mascot']['image']).size,(1024,512))
            self.assertTrue(channel.art_of(q)['mascot'].endswith('mascot.png'))
            with self.assertRaises(ValueError):channel.pick_mascot(p['id'],option='../../channels.json')

class YouTubeTests(Base):
    def test_durations(self):
        self.assertEqual([yt.seconds(x) for x in ['PT12M','PT1H2M3S','PT40S','P1DT1S','']],[720,3723,40,86401,0])

    def test_scan_scores_outliers_small_and_young_channels(self):
        with patch.object(yt,'get',side_effect=fake_youtube):data=yt.scan(['space facts','budget tips'],12,1,status=lambda m,p=None:None)
        v={x['id']:x for x in data['videos']}
        self.assertEqual(list(v),['v1','v2','v4','v3'])  # most viewed first
        self.assertEqual(v['v1']['outlier'],100.0)        # 2M against cA's median of 20K long-form views
        self.assertEqual(v['v3']['outlier'],0.1)          # cB's 40-second upload does not count in its median
        self.assertEqual(v['v1']['views_per_sub'],166.67)
        s={x['seed']:x for x in data['summary']}['space facts']
        self.assertEqual((s['videos'],s['small_channel_hits'],s['young_channel_hits'],s['outliers'][0]),(3,1,1,'v1'))
        text=yt.brief(data);self.assertIn('[v1] "Why space is silent"',text);self.assertIn('100.0× the channel median',text)

    def test_get_caches_counts_quota_and_never_leaks_the_key(self):
        class R:
            def __init__(self,code,body):self.status_code=code;self._b=body;self.text=json.dumps(body)
            def json(self):return self._b
        calls=[]
        def fake(url,params,timeout):calls.append(params);return R(200,{'items':[]})
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'SECRET123'}),patch('httpx.get',side_effect=fake):
            yt.get('search',{'q':'a'});yt.get('search',{'q':'a'});yt.get('videos',{'id':'x'})
        self.assertEqual((len(calls),yt.used_today()),(2,101))
        bad=R(403,{'error':{'message':'quota','errors':[{'reason':'quotaExceeded'}]}})
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'SECRET123'}),patch('httpx.get',return_value=bad):
            with self.assertRaises(RuntimeError) as e:yt.get('search',{'q':'b'})
        self.assertIn('quota for today is used up',str(e.exception))
        odd=R(500,{'error':{'message':'boom at ?key=SECRET123&x=1'}})
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'SECRET123'}),patch('httpx.get',return_value=odd):
            with self.assertRaises(RuntimeError) as e:yt.get('search',{'q':'c'})
        self.assertNotIn('SECRET123',str(e.exception))

    def test_scan_refuses_when_the_quota_left_is_too_small(self):
        f=channel.new_research('a, b, c',searches=4)
        yt.spend(9900)
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'k'}):
            with self.assertRaises(ValueError) as e:channel.scan(f)
        self.assertIn('units',str(e.exception))

FAKE_CLAUDE='''#!/usr/bin/env python3
import json,os,sys
json.dump({'argv':sys.argv[1:],'api_key':'ANTHROPIC_API_KEY' in os.environ},open(os.environ['FAKE_RECORD'],'w'))
print(json.dumps({'type':'assistant','message':{'content':[{'type':'tool_use','name':'Read','input':{'file_path':'/x/data.json'}}]}}))
for path,content in json.loads(os.environ.get('FAKE_WRITE','{}')).items():open(path,'w').write(content)
result={'type':'result','is_error':False,'result':'done','session_id':'sess-1'}
if os.environ.get('FAKE_OUTPUT'):result['structured_output']=json.loads(os.environ['FAKE_OUTPUT'])
print(json.dumps(result))
'''

class ClaudeTests(Base):
    REPORT={'summary':'# Start with space','niches':[
        {'name':'Budget','verdict':'maybe','demand':3,'competition':4,'faceless_fit':4,'rpm':'$8–15 (estimate)','policy_risk':'high','why':'w','angle':'a','evidence':['v4']},
        {'name':'Space','verdict':'go','demand':9,'competition':2,'faceless_fit':5,'rpm':'$3–6 (estimate)','policy_risk':'low','why':'w','angle':'a','evidence':['v1','made-up']}],
        'topics':[{'title':'Why is space silent?','niche':'Space','hook':'h','why':'w','based_on':['v1','zz'],'score':70},
                  {'title':'Mars in 10','niche':'Space','hook':'h','why':'w','based_on':[],'score':90}]}
    def setUp(self):
        super().setUp();t=Path(self.tmp.name)
        exe=t/'claude';exe.write_text(FAKE_CLAUDE);exe.chmod(0o755);self.record=t/'record.json'
        e=patch.dict(os.environ,{'CLAUDE_BIN':str(exe),'FAKE_RECORD':str(self.record),'ANTHROPIC_API_KEY':'sk-test','FAKE_OUTPUT':json.dumps(self.REPORT)})
        e.start();self.addCleanup(e.stop)

    def test_report_runs_on_the_plan_reads_the_scan_and_keeps_only_real_evidence(self):
        f=channel.new_research('space facts, budget tips',searches=1)
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'k'}),patch.object(yt,'get',side_effect=fake_youtube):
            res=channel.research(f,status=lambda m,p=None:None)
        argv=json.loads(self.record.read_text());self.assertFalse(argv['api_key'])
        a=argv['argv'];self.assertIn('dontAsk',a);self.assertEqual(a[a.index('--tools')+1],'Read,WebSearch')
        self.assertIn('[v1] "Why space is silent"',a[1])  # the scan summary is in the request
        self.assertEqual([n['name'] for n in res['niches']],['Space','Budget'])  # go first
        self.assertEqual((res['niches'][0]['demand'],res['niches'][0]['evidence']),(5,['v1']))
        self.assertEqual([t['title'] for t in res['topics']],['Mars in 10','Why is space silent?'])
        self.assertEqual(res['topics'][1]['based_on'],['v1'])
        self.assertEqual(channel.read(f,'result.json')['niches'][0]['name'],'Space')

    def test_without_a_youtube_key_the_report_is_a_labelled_brainstorm(self):
        f=channel.new_research('space facts')
        channel.research(f,status=lambda m,p=None:None)
        self.assertIn('brainstorm',channel.read(f,'data.json')['skipped'])
        self.assertIn('There is no YouTube data',json.loads(self.record.read_text())['argv'][1])

    def test_api_runs_research_in_the_background(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import channel_app
        app=FastAPI();app.include_router(channel_app.router);client=TestClient(app)
        self.assertEqual(client.post('/channel/research',json={'seeds':' '}).status_code,400)
        r=client.post('/channel/research',json={'seeds':'space facts','model':'haiku'});self.assertEqual(r.status_code,200,r.text)
        ident=r.json()['id']
        for _ in range(100):
            s=client.get(f'/channel/research/{ident}').json()
            if s['state']!='running':break
            time.sleep(.1)
        self.assertEqual(s['state'],'done',s['status']);self.assertEqual(s['best'],'Space')
        self.assertEqual(client.get('/channel/research').json()[0]['id'],ident)
        self.assertEqual(client.get('/channel/research/'+'0'*32).status_code,404)
        p=client.post('/channel/profiles',json={'name':'Cosmos'}).json()
        self.assertEqual(client.put(f'/channel/profiles/{p["id"]}',json={'niche':'space'}).json()['niche'],'space')
        self.assertEqual(client.delete(f'/channel/research/{ident}').status_code,200)

import base64,io,wave
import numpy as np
import channel_voice

def wav_bytes(seconds=.5,rate=44100):
    t=np.arange(int(seconds*rate))/rate;x=(np.sin(2*np.pi*220*t)*8000).astype(np.int16)
    buf=io.BytesIO()
    with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(x.tobytes())
    return buf.getvalue()

SCRIPT={'title':'Why space is silent','sections':[
    {'id':'s1','kind':'hook','title':'','paragraphs':[{'id':'p1','text':'Space is silent.'}]},
    {'id':'s2','kind':'chapter','title':'Sound needs air','paragraphs':[{'id':'p2','text':'Sound is a wave.'},{'id':'p3','text':'No air, no sound.'}]}]}

class VideoBase(Base):
    """A channel with a voice and one video."""
    def setUp(self):
        super().setUp()
        p=patch.object(channel,'VIDEOS',Path(self.tmp.name)/'channel/videos');p.start();self.addCleanup(p.stop)
        self.profile=channel.save_profile({'name':'Cosmos','voice':{'id':'voice1','model':'eleven_multilingual_v2'}})
        self.f=channel.new_video(self.profile['id'],'Why is space silent?',minutes=1)

    def fake_tts(self,calls):
        class R:
            status_code=200
            def __init__(self,body):self.body=body;self.text=''
            def json(self):return self.body
        def fake(path,status,json):
            calls.append((path,json));text=json['text'];n=len(text)
            return R({'audio_base64':base64.b64encode(wav_bytes()).decode(),'alignment':{'characters':list(text),
                      'character_start_times_seconds':[i*.4/n for i in range(n)],'character_end_times_seconds':[(i+1)*.4/n for i in range(n)]}})
        return fake

class ScriptTests(VideoBase):
    def test_check_script_cleans_ids_and_flags_what_is_read_aloud(self):
        script,warn,stats=channel.check_script({'sections':[{'kind':'odd','paragraphs':['Hello [music] world 🚀','  ']},
                                                           {'id':'s1','kind':'chapter','paragraphs':[{'id':'p1','text':'See www.x.com now'},{'id':'p1','text':'dup'}]}]},minutes=10)
        self.assertEqual([s['id'] for s in script['sections']],['s1','s2'])
        self.assertEqual([p['id'] for s in script['sections'] for p in s['paragraphs']],['p1','p2','p3'])
        joined=' | '.join(warn)
        for bit in ['first section should be the hook','Only 2 chapters','[music] asks the voice for a sound effect','emoji','web address','target is 10 minutes']:self.assertIn(bit,joined)
        self.assertEqual(stats['paragraphs'],3)

    def test_approval_follows_the_script(self):
        with self.assertRaises(ValueError):channel.approve(self.f)
        channel.save_script(self.f,SCRIPT);self.assertEqual(channel.job(self.f)['title'],'Why space is silent')
        channel.approve(self.f);self.assertTrue(channel.approved(self.f));self.assertEqual(channel.stage(self.f),'Approved')
        edited=json.loads(json.dumps(SCRIPT));edited['sections'][0]['paragraphs'][0]['text']='Space is very silent.'
        channel.save_script(self.f,edited);self.assertFalse(channel.approved(self.f))

    def test_voice_costs_only_new_paragraphs_and_times_every_word(self):
        channel.save_script(self.f,SCRIPT)
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}):
            est=channel.voice_estimate(self.f)
            self.assertEqual((est['credits'],len(est['todo'])),(len('Space is silent.')+len('Sound is a wave.')+len('No air, no sound.'),3))
            with self.assertRaises(ValueError):channel.voice(self.f,status=lambda m,p=None:None)  # not confirmed
            calls=[]
            with patch('shorts.elevenlabs',side_effect=self.fake_tts(calls)):data=channel.voice(self.f,status=lambda m,p=None:None,allowed=est['credits'])
        self.assertEqual(len(calls),3);self.assertIn('/v1/text-to-speech/voice1/with-timestamps',calls[0][0])
        self.assertEqual((calls[1][1]['previous_text'],calls[1][1]['next_text']),('Space is silent.','No air, no sound.'))
        w=data['words'];self.assertEqual([x['text'] for x in w[:3]],['Space','is','silent.'])
        # p2 starts after p1 (0.5 s) and a section pause; p3 after p2 and a paragraph pause
        self.assertAlmostEqual(data['paragraphs'][1]['start'],.5+channel_voice.PAUSE_SECTION,places=2)
        self.assertAlmostEqual(data['paragraphs'][2]['start'],data['paragraphs'][1]['end']+channel_voice.PAUSE_PARAGRAPH,places=2)
        self.assertEqual([s['title'] for s in data['sections']],['','Sound needs air'])
        self.assertTrue((self.f/'voice.wav').exists());self.assertTrue(channel.voiced(self.f))
        self.assertIn('00:00:00,000 --> ',(self.f/'captions.srt').read_text())
        edited=json.loads(json.dumps(SCRIPT));edited['sections'][1]['paragraphs'][1]['text']='Without air, no sound.'
        channel.save_script(self.f,edited)
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}):est=channel.voice_estimate(self.f)
        self.assertEqual((est['todo'],est['credits']),(['p3'],len('Without air, no sound.')))
        self.assertFalse(channel.voiced(self.f))

    def test_srt_breaks_at_sentences_and_length(self):
        words=[{'text':t,'start':i*.3,'end':i*.3+.25} for i,t in enumerate('One two three. Four five six seven eight nine ten eleven twelve thirteen fourteen.'.split())]
        cues=channel_voice.srt(words).strip().split('\n\n')
        self.assertEqual(cues[0].split('\n')[2],'One two three.');self.assertEqual(len(cues),3)
        self.assertEqual(channel_voice.srt([{'text':'x','start':3599.9996,'end':3600.5}]).split('\n')[1],'01:00:00,000 --> 01:00:00,500')

    def test_claude_writes_the_script_on_the_plan_and_chat_can_be_undone(self):
        t=Path(self.tmp.name);exe=t/'claude';exe.write_text(FAKE_CLAUDE);exe.chmod(0o755);record=t/'record.json'
        script=json.dumps(SCRIPT);env={'CLAUDE_BIN':str(exe),'FAKE_RECORD':str(record),'ANTHROPIC_API_KEY':'sk',
                                      'FAKE_WRITE':json.dumps({str(self.f.resolve()/'script.json'):script,str(self.f.resolve()/'sources.md'):'# Sources'})}
        with patch.dict(os.environ,env):info=channel.write_script(self.f,'haiku',status=lambda m,p=None:None)
        a=json.loads(record.read_text());self.assertFalse(a['api_key'])
        tools=a['argv'][a['argv'].index('--tools')+1];self.assertEqual(tools,'Read,Write,Edit,Glob,Bash,WebSearch,WebFetch')
        allowed=a['argv'];self.assertIn(f'Write(/{self.f.resolve()}/script.json)',allowed);self.assertNotIn(f'Write(/{self.f.resolve()}/job.json)',allowed)
        self.assertEqual(sorted(info['changes']),['script.json','sources.md'])
        new=json.loads(script);new['sections'][0]['paragraphs'][0]['text']='Listen: space is silent.'
        env['FAKE_WRITE']=json.dumps({str(self.f.resolve()/'script.json'):json.dumps(new)})
        with patch.dict(os.environ,env):ans=channel.send(self.f,'punchier hook','haiku',status=lambda m,p=None:None)
        self.assertEqual(ans['changes'],['script.json']);self.assertEqual(channel.read(self.f,'chat.json')['session'],'sess-1')
        self.assertEqual(channel.script_of(self.f)['sections'][0]['paragraphs'][0]['text'],'Listen: space is silent.')
        channel.undo(self.f);self.assertEqual(channel.script_of(self.f)['sections'][0]['paragraphs'][0]['text'],'Space is silent.')

    def test_api_guards_the_paid_voice_step(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import channel_app
        app=FastAPI();app.include_router(channel_app.router);client=TestClient(app)
        self.assertEqual(client.post('/channel/videos',json={'profile':'nope','topic':'Space'}).status_code,400)
        r=client.post('/channel/videos',json={'profile':self.profile['id'],'topic':'Black holes','minutes':2});self.assertEqual(r.status_code,200,r.text)
        ident=r.json()['id'];self.assertEqual(r.json()['stage'],'New')
        r=client.put(f'/channel/videos/{ident}/script',json=SCRIPT);self.assertEqual(r.json()['stats']['paragraphs'],3)
        self.assertEqual(client.post(f'/channel/videos/{ident}/approve').json()['stage'],'Approved')
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}):
            r=client.post(f'/channel/videos/{ident}/voice',json={'credits':5});self.assertEqual(r.status_code,409);self.assertIn('credits',r.json()['detail'])
        self.assertEqual(client.get('/channel/videos').json()[0]['id'],ident)

from fractions import Fraction
import av
import channel_media,channel_render

def tiny_video(path,seconds=1.,size=(64,48),fps=10):
    from PIL import Image
    with av.open(str(path),'w') as out:
        st=out.add_stream('libx264',rate=fps);st.width,st.height,st.pix_fmt=size[0],size[1],'yuv420p'
        for i in range(int(seconds*fps)):
            f=av.VideoFrame.from_image(Image.new('RGB',size,(i*20%255,80,160)));f.pts=i;f.time_base=Fraction(1,fps)
            for pk in st.encode(f):out.mux(pk)
        for pk in st.encode():out.mux(pk)
    return path

class ShotTests(Base):
    WORDS={'duration':10.,'words':[{'text':t,'start':s,'end':s+.3,'p':p,'s':'s1'} for t,s,p in
            [('Space',0,'p1'),('is',.4,'p1'),('silent.',.8,'p1'),('Sound',3,'p2'),('is',3.4,'p2'),('a',3.8,'p2'),('wave',4.2,'p2'),('of',4.6,'p2'),('pressure.',5,'p2'),('No',7,'p3'),("air's",7.4,'p3'),('there.',7.8,'p3')]],
           'paragraphs':[{'id':'p1','section':'s1','start':0,'end':1.1},{'id':'p2','section':'s2','start':3,'end':5.3},{'id':'p3','section':'s2','start':7,'end':8.1}],
           'sections':[{'id':'s1','title':'','kind':'hook','start':0,'end':1.1},{'id':'s2','title':'Sound needs air','kind':'chapter','start':3,'end':8.1}]}
    def setUp(self):
        super().setUp();self.f=Path(self.tmp.name)/'video';self.f.mkdir();channel.write(self.f,'words.json',self.WORDS)

    def test_locate_matches_the_phrase_and_tolerates_punctuation(self):
        ws=[w for w in self.WORDS['words'] if w['p']=='p2']
        self.assertEqual([channel_render.locate(ws,a) for a in ['','wave of pressure','WAVE, of','pressure!','not there']],[0,3,3,5,-1])
        self.assertEqual(channel_render.locate([w for w in self.WORDS['words'] if w['p']=='p3'],'airs there'),1)

    def test_check_scenes_times_cleans_and_falls_back(self):
        channel.write(self.f,'scenes.json',{'shots':[
            {'id':'a','p':'p1','kind':'ai_clip','prompt':'a star explodes','query':'supernova'},
            {'id':'b','p':'p2','kind':'chapter'},
            {'id':'c','p':'p2','at':'wave of pressure','kind':'graphic','template':'big-number','props':{'nope':1}},
            {'id':'d','p':'p2','at':'of pressure','kind':'stock','query':'sound waves'},
            {'id':'e','p':'p3','at':'gone','kind':'stock','query':'empty room','motion':'spin'},
            {'id':'f','p':'p9','kind':'stock','query':'x'},
            {'id':'a','p':'p3','kind':'stock'}]})
        shots,warn=channel_render.check_scenes(self.f,budget=0.)
        self.assertEqual([s['id'] for s in shots],['a','b','c','e'])  # d is too close after c
        self.assertEqual([s['start'] for s in shots],[0.,2.88,4.08,6.88])
        self.assertEqual([s['end'] for s in shots],[2.88,4.08,6.88,11.5])
        self.assertEqual(shots[1]['title'],'Sound needs air');self.assertEqual(shots[3]['motion'],'push');self.assertTrue(shots[0]['fallback'])
        joined=' | '.join(warn)
        for bit in ['paragraph p9','search query','"gone" is not in paragraph p3','too close','its own words','AI visuals are off']:self.assertIn(bit,joined)
        self.assertEqual([s['id'] for s in channel.read(self.f,'scenes.json')['shots']],['a','b','c','d','e'])  # the query-less duplicate is dropped

    def test_budget_keeps_ai_shots_that_fit(self):
        channel.write(self.f,'scenes.json',{'shots':[{'id':'a','p':'p1','kind':'image','prompt':'x'},{'id':'b','p':'p2','kind':'ai_clip','prompt':'y','query':'q'}]})
        with patch.dict(os.environ,{'CHANNEL_FAL_IMAGE_PRICE':'0.01','CHANNEL_FAL_VIDEO_PRICE':'0.05'}):
            shots,_=channel_render.check_scenes(self.f,budget=.2)
            self.assertEqual([s.get('fallback',False) for s in shots],[False,True])
            self.assertEqual(channel_render.plan_costs(self.f,shots)['usd'],.01)

    def test_trim_crops_to_fill_and_keeps_only_what_is_needed(self):
        src=tiny_video(Path(self.tmp.name)/'src.mp4',seconds=2,size=(80,40))
        secs=channel_media.trim(src,Path(self.tmp.name)/'out.mp4',1.,(32,48))
        self.assertEqual(secs,1.0)
        with av.open(str(Path(self.tmp.name)/'out.mp4')) as c:s=c.streams.video[0];self.assertEqual((s.width,s.height,s.frames),(32,48,30))
        self.assertAlmostEqual(channel_media.trim(src,Path(self.tmp.name)/'short.mp4',5.,(32,48)),2.0,delta=.1)  # a shorter source stays short

    def test_pick_avoids_clips_used_elsewhere(self):
        c=[{'id':'x','duration':3},{'id':'y','duration':9},{'id':'z','duration':12}]
        self.assertEqual(channel_media.pick(c,8,set())['id'],'y');self.assertEqual(channel_media.pick(c,8,{'y'})['id'],'z')
        self.assertEqual(channel_media.pick(c,20,{'z'})['id'],'y');self.assertIsNone(channel_media.pick(c,1,{'x','y','z'}))
        self.assertEqual(channel_media.best_file({'files':[{'width':3840},{'width':1280},{'width':1920}]},1920)['width'],1920)

    def test_gather_is_free_for_stock_and_spends_only_what_was_approved(self):
        channel.write(self.f,'scenes.json',{'shots':[{'id':'a','p':'p1','kind':'image','prompt':'a star'},{'id':'b','p':'p2','kind':'stock','query':'waves'}]})
        with patch.dict(os.environ,{'CHANNEL_FAL_IMAGE_PRICE':'0.01'}):
            shots,_=channel_render.check_scenes(self.f,budget=1.)
            cand={'id':'pexels-1','provider':'pexels','thumb':'t','page':'p','credit':'Ann on Pexels','duration':20,'files':[]}
            def fetch(c,dst,need,size,status=None):Path(dst).parent.mkdir(parents=True,exist_ok=True);Path(dst).write_bytes(b'v');return 6.
            def image(prompt,dst,size,status=None,refs=()):Path(dst).parent.mkdir(parents=True,exist_ok=True);Path(dst).write_bytes(b'i');return dst
            have={'pexels':True,'fal':True}
            with patch.object(channel_media,'search',return_value=[cand]),patch.object(channel_media,'fetch_clip',side_effect=fetch),patch.object(channel_media,'ai_image',side_effect=image) as made:
                out=channel_render.gather(self.f,shots,have,1.,lambda m,p=None:None,spend=0.)
                self.assertEqual((out['missing'],made.call_count,out['spent']),(['a'],0,0))  # the AI image waits for approval
                out=channel_render.gather(self.f,shots,have,1.,lambda m,p=None:None,spend=.01)
                self.assertEqual((out['missing'],made.call_count,out['spent']),([],1,.01))
                out=channel_render.gather(self.f,shots,have,1.,lambda m,p=None:None,spend=.01)
                self.assertEqual(made.call_count,1)  # nothing is made twice
        vis=channel.read(self.f,'visuals.json');self.assertTrue(vis['ready']);self.assertEqual(channel_render.credits(self.f),['Ann on Pexels'])
        self.assertEqual(channel.read(self.f,'costs.json')[0]['kind'],'image')

    def test_mascot_shots_and_prompts(self):
        channel.write(self.f,'scenes.json',{'shots':[{'id':'a','p':'p1','kind':'image','prompt':'a robot waves.','mascot':True},
                                                    {'id':'b','p':'p2','kind':'ai_clip','prompt':'a wave rolls','animate':'the wave moves right','mascot':True}]})
        shots,warn=channel_render.check_scenes(self.f,budget=5.,art={'mascot':False,'stock':False})
        self.assertNotIn('mascot',shots[0]);self.assertIn('no mascot yet',' '.join(warn))
        shots,warn=channel_render.check_scenes(self.f,budget=5.,art={'mascot':True,'stock':False})
        self.assertTrue(shots[0]['mascot']);self.assertEqual(shots[1]['animate'],'the wave moves right')
        art={'prompt':'flat vector','mascot':None}
        self.assertEqual(channel_render.full_prompt(shots[0],art),'a robot waves. The character from the reference image appears in this scene: keep its exact design, colours and proportions. Style: flat vector')
        k1=channel_render.key_of(shots[0],(1920,1080),art);k2=channel_render.key_of(shots[0],(1920,1080),{**art,'prompt':'doodle'})
        self.assertNotEqual(k1,k2)  # a new art style means new illustrations
        with patch.dict(os.environ,{'CHANNEL_FAL_IMAGE_PRICE':'0.04','CHANNEL_FAL_VIDEO_PRICE':'0.05'}):
            self.assertEqual(channel_render.plan_costs(self.f,shots,art=art)['usd'],.33)
        channel.write(self.f,'scenes.json',{'shots':[{'id':'a','p':'p1','kind':'image','prompt':'x','query':'q'}]})
        _,warn=channel_render.check_scenes(self.f,budget=0.,art={'mascot':False,'stock':False})
        self.assertIn('its words are shown instead',' '.join(warn))

    def test_props_cut_a_span_for_a_short(self):
        channel.write(self.f,'scenes.json',{'shots':[{'id':'a','p':'p1','kind':'chapter','title':'Intro'},{'id':'b','p':'p2','kind':'stock','query':'waves'},{'id':'c','p':'p3','kind':'graphic','template':'big-number','props':{'value':'1'}}]})
        channel_render.check_scenes(self.f)
        with patch.object(channel_render,'sound_levels',return_value={}):
            full=channel_render.props(self.f,{'look':{}})
            part=channel_render.props(self.f,{'look':{}},size='portrait',span=(4.,8.))
        self.assertEqual((full['width'],full['durationInFrames'],[s['kind'] for s in full['shots']]),(1920,345,['chapter','text','graphic']))
        self.assertEqual(sum(s['frames'] for s in full['shots']),345)
        self.assertEqual((part['width'],part['height'],part['voiceFrom'],part['durationInFrames']),(1080,1920,120,120))
        self.assertEqual([(s['id'],s['from'],s['offset']) for s in part['shots']],[('b',0,34),('c',86,0)])

class PublishTests(Base):
    def setUp(self):
        super().setUp()
        for name,value in [('VIDEOS',Path(self.tmp.name)/'channel/videos'),('ROOT',Path(self.tmp.name))]:
            p=patch.object(channel,name,value);p.start();self.addCleanup(p.stop)
        self.profile=channel.save_profile({'name':'Toons','voice':{'id':'v1'},'upload':{'tags':['space']}})
        self.f=channel.new_video(self.profile['id'],'Why is space silent?')
        self.assertEqual(channel.job(self.f)['minutes'],3)  # the default length
        paras=[('p1','s1',0,20),('p2','s2',21,45),('p3','s2',46,70),('p4','s3',71,100),('p5','s4',101,104)]
        channel.write(self.f,'words.json',{'duration':104.5,'words':[{'text':f'w{i}','start':a+.1*i,'end':a+.1*i+.08,'p':p,'s':sec} for p,sec,a,b in paras for i in range(3)],
            'paragraphs':[{'id':p,'section':sec,'start':a,'end':b} for p,sec,a,b in paras],
            'sections':[{'id':'s1','kind':'hook','title':'','start':0,'end':20},{'id':'s2','kind':'chapter','title':'Sound needs air','start':21,'end':70},
                        {'id':'s3','kind':'chapter','title':'How empty is space','start':71,'end':100},{'id':'s4','kind':'chapter','title':'Tiny','start':101,'end':104}]})

    def test_moments_are_whole_paragraphs_15_to_75_seconds(self):
        ms,warn=channel.check_moments(self.f,{'moments':[{'first':'p2','last':'p3','title':'Air','hook':'one two three four five six seven eight nine ten','why':'w'},
                                                        {'first':'p5','last':'p5','title':'Short'},{'first':'p3','last':'p4','title':'Overlap'},
                                                        {'first':'p9','last':'p9','title':'Ghost'},{'first':'p1','last':'p1','title':'Hook'}]})
        self.assertEqual([(m['n'],m['title']) for m in ms],[(1,'Hook'),(2,'Air')])
        self.assertEqual(ms[1]['hook'],'one two three four five six seven eight')
        self.assertEqual((ms[1]['start'],ms[1]['end']),(20.9,70.45))
        self.assertEqual(len(warn),3)
        self.assertEqual([channel.moment_count(x) for x in (100,180,600)],['1-2','2-3','3-5'])

    def test_seed_captions_and_chapters(self):
        seed=channel.seed_captions(self.f,20.9,46.3)
        self.assertEqual(seed['captions'][0],{'text':' w0','startMs':100,'endMs':180,'timestampMs':None,'confidence':1})
        self.assertEqual(len(seed['captions']),6)
        self.assertEqual([(c['time'],c['title']) for c in channel.chapters(self.f)],[('0:00','Intro'),('0:21','Sound needs air'),('1:11','How empty is space')])

    def test_description_has_chapters_sources_and_the_ai_note(self):
        (self.f/'sources.md').write_text('- Sound needs a medium: https://nasa.gov/sound. Also https://nasa.gov/sound and (https://esa.int/x).')
        d=channel.description(self.f,{'summary':'Space is silent.'})
        self.assertTrue(d.startswith('Space is silent.\n\nChapters\n0:00 Intro\n0:21 Sound needs air'))
        self.assertIn('Sources\nhttps://nasa.gov/sound\nhttps://esa.int/x',d);self.assertIn('Narration voiced with AI (ElevenLabs)',d)

    def test_video_body_schedules_privately_and_labels_synthetic_media(self):
        b=yt.video_body({'title':'T'*120,'description':'d','tags':['x'*100]*10,'privacy':'public','publish_at':'2026-11-02T18:00:00Z','synthetic':True})
        self.assertEqual(len(b['snippet']['title']),100);self.assertEqual(len(b['snippet']['tags']),4)
        self.assertEqual(b['status'],{'privacyStatus':'private','selfDeclaredMadeForKids':False,'containsSyntheticMedia':True,'publishAt':'2026-11-02T18:00:00Z'})

    def test_make_shorts_hands_each_moment_to_the_shorts_editor(self):
        import shorts
        channel.write(self.f,'moments.json',{'moments':[{'n':1,'first':'p2','last':'p3','start':20.9,'end':70.45,'title':'Air','hook':'No air, no sound','job':None}]})
        def fake_render(folder,profile,final,status,size,span,out_name):
            out=Path(folder)/'renders'/out_name;out.parent.mkdir(exist_ok=True);out.write_bytes(b'mp4');self.span=(size,span,final);return out
        with patch('channel_render.render',side_effect=fake_render),patch.object(channel,'check_shots',return_value=([],[])),patch.object(shorts,'save_status'):
            made=channel.make_shorts(self.f,edit=True,status=lambda m,p=None:None)
        self.assertEqual(self.span,('portrait',(20.9,70.45),True))
        job=made[0];self.assertEqual(channel.read(job,'job.json')['source']['kind'],'channel')
        self.assertEqual(channel.read(job,'workflow-mode.json')['tracking'],'off');self.assertIn('No air, no sound',channel.read(job,'auto.json')['notes'])
        self.assertEqual(len(channel.read(job,'seed-captions.json')['captions']),6)
        self.assertEqual(channel.read(self.f,'moments.json')['moments'][0]['job'],job.name)

    def test_upload_sends_the_post_thumbnail_and_captions(self):
        (self.f/'renders').mkdir();(self.f/'renders'/'final.mp4').write_bytes(b'v');(self.f/'thumbs').mkdir();(self.f/'thumbs'/'2.jpg').write_bytes(b'j')
        (self.f/'captions.srt').write_text('1\n00:00:00,000 --> 00:00:01,000\nHi\n')
        with self.assertRaises(ValueError):channel.upload(self.f)
        channel.write(self.f,'post.json',{'title':'Space','description':'D','tags':['a'],'synthetic':False})
        with patch.object(yt,'upload',return_value='VID') as up,patch.object(yt,'set_thumbnail',side_effect=RuntimeError('not verified')) as th,patch.object(yt,'add_captions') as cap:
            info=channel.upload(self.f,'unlisted',None,2,status=lambda m,p=None:None)
        meta=up.call_args[0][1];self.assertEqual((meta['title'],meta['privacy'],meta['category']),('Space','unlisted','27'))
        self.assertEqual(th.call_args[0],('VID',self.f/'thumbs'/'2.jpg'));cap.assert_called_once()
        self.assertEqual((info['url'],len(info['warnings'])),('https://youtu.be/VID',1));self.assertEqual(channel.stage(self.f),'Uploaded')

    def test_finish_needs_the_approved_script_and_the_confirmed_credits(self):
        channel.save_script(self.f,{'sections':[{'id':'s1','kind':'hook','paragraphs':[{'id':'p1','text':'Space is silent.'}]}]})
        with self.assertRaises(ValueError):channel.finish(self.f)
        channel.approve(self.f)
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}):
            with self.assertRaises(ValueError):channel.finish(self.f,credits=3)
            calls=[]
            with patch.object(channel,'voice',side_effect=lambda *a:calls.append('voice')),patch.object(channel,'plan_shots',side_effect=lambda *a:calls.append('shots')),\
                 patch.object(channel,'gather',side_effect=lambda f,st,spend:calls.append(('gather',spend))),patch.object(channel,'render',side_effect=lambda *a:calls.append('render')),\
                 patch.object(channel,'package',side_effect=lambda *a:calls.append('post')):
                channel.finish(self.f,credits=99,spend=2.5,status=lambda m,p=None:None)
        self.assertEqual(calls,['voice','shots',('gather',2.5),'render','post'])

class TopicTests(Base):
    TOPICS={'summary':'# Make these','topics':[
        {'title':'Why black holes spin','kind':'evergreen','hook':'h','angle':'a clearer picture','points':['one','two','three'],'why':'w','why_now':'',
         'based_on':['v1','nope'],'searches':['black holes explained'],'links':['https://nasa.gov/x','javascript:alert(1)'],'score':60},
        {'title':'The new Webb photo','kind':'viral','hook':'h','angle':'a','points':[],'why':'w','why_now':'released this week','based_on':[],
         'searches':[],'links':[],'score':90}]}
    def setUp(self):
        super().setUp();t=Path(self.tmp.name)
        p=patch.object(channel,'VIDEOS',t/'channel/videos');p.start();self.addCleanup(p.stop)
        exe=t/'claude';exe.write_text(FAKE_CLAUDE);exe.chmod(0o755);self.record=t/'record.json'
        e=patch.dict(os.environ,{'CLAUDE_BIN':str(exe),'FAKE_RECORD':str(self.record),'FAKE_OUTPUT':json.dumps(self.TOPICS)});e.start();self.addCleanup(e.stop)
        self.p=channel.save_profile({'name':'Cosmos','niche':'space facts, black holes'})

    def test_resolve_channel_from_ids_handles_and_links(self):
        with patch.object(yt,'get',side_effect=fake_youtube) as got:
            self.assertEqual(yt.resolve_channel('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'),'UCabcdefghijklmnopqrstuv')
            self.assertEqual(got.call_count,0)  # an id costs nothing
            self.assertEqual(yt.resolve_channel('https://www.youtube.com/@bigspace/videos'),'cB')
            with self.assertRaises(ValueError):yt.resolve_channel('@nobody123')
            with self.assertRaises(ValueError):yt.resolve_channel('space videos')

    def test_competitor_uploads_are_scored_against_their_channel(self):
        with patch.object(yt,'get',side_effect=fake_youtube):vids,chans,problems=yt.competitor_uploads(['@bigspace','@nobody123'],months=6,status=lambda m,p=None:None)
        self.assertEqual(problems,['No YouTube channel @nobody123.'])
        self.assertEqual((chans[0]['title'],chans[0]['median_views']),('Chan cB',800000))
        self.assertEqual({v['id']:v['outlier'] for v in vids},{'r3':1.0,'r4':0.0})
        self.assertTrue(all(v['competitor'] for v in vids))
        with patch.object(yt,'get',side_effect=fake_youtube):self.assertEqual(yt.competitor_uploads(['@bigspace'],months=1,status=lambda m,p=None:None)[0],[])  # too old

    def test_suggestions_are_best_effort(self):
        class R:
            status_code=200
            def __init__(self,q):self.q=q
            def json(self):return [self.q,[self.q+' explained',self.q+' sound','black holes explained']]
        with patch('httpx.get',side_effect=lambda url,params,timeout:R(params['q'])):got=yt.suggestions('black holes')
        self.assertEqual(got[:3],['black holes explained','black holes sound','how black holes explained'])
        self.assertEqual(len(got),len(set(got)))
        import httpx
        with patch('httpx.get',side_effect=httpx.ConnectError('down')):self.assertEqual(yt.suggestions('quasars'),[])

    def test_seeds_come_from_the_focus_else_the_niche(self):
        self.assertEqual(channel.topic_seeds(self.p,''),['space facts','black holes'])
        self.assertEqual(channel.topic_seeds(self.p,'neutron stars'),['neutron stars'])
        bare=channel.save_profile({'name':'Bare'})
        with self.assertRaises(ValueError):channel.new_topic_research(bare['id'])
        f=channel.new_topic_research(self.p['id'],'',['@bigspace',' '],months=99)
        req=channel.read(f,'request.json');self.assertEqual((req['kind'],req['months'],req['competitors']),('topics',24,['@bigspace']))
        self.assertEqual(channel.profile(self.p['id'])['competitors'],['@bigspace'])  # remembered for next time

    def test_topic_research_end_to_end(self):
        v=channel.new_video(self.p['id'],'Why is space silent?')
        f=channel.new_topic_research(self.p['id'],'',['@bigspace'],months=6)
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'k'}),patch.object(yt,'get',side_effect=fake_youtube),patch.object(yt,'suggestions',return_value=['black holes explained']):
            res=channel.research(f,status=lambda m,p=None:None)
        data=channel.read(f,'data.json');self.assertIn('r3',{x['id'] for x in data['videos']});self.assertEqual(data['competitors'][0]['id'],'cB')
        a=json.loads(self.record.read_text())['argv'];ask=a[1]
        self.assertEqual(a[a.index('--tools')+1],'Read,WebSearch,WebFetch')
        for bit in ['Why is space silent?','Competitor channels','black holes explained','section 1b']:self.assertIn(bit,ask)
        self.assertEqual([x['title'] for x in res['topics']],['The new Webb photo','Why black holes spin'])
        spin=res['topics'][1];self.assertEqual((spin['based_on'],spin['links']),(['v1'],['https://nasa.gov/x']))
        self.assertEqual(res['topics'][0]['kind'],'evergreen')
        notes=channel.topic_notes(spin);self.assertIn('Angle: a clearer picture',notes);self.assertIn('Points to make: one / two / three',notes)
        self.assertEqual(channel.research_summary(f)['best'],'The new Webb photo')

    def test_a_topic_becomes_a_video_with_its_research(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        import channel_app
        app=FastAPI();app.include_router(channel_app.router);client=TestClient(app)
        f=channel.new_topic_research(self.p['id'],'black holes')
        channel.write(f,'data.json',{'videos':[{'id':'v1'}]});channel.write(f,'result.json',channel.clean_topics(self.TOPICS,{'videos':[{'id':'v1'}]}))
        r=client.post('/channel/videos',json={'profile':self.p['id'],'topic':'Why black holes spin','hook':'h','research':f.name,'based_on':['v1']})
        self.assertEqual(r.status_code,200,r.text);vid=r.json()['id']
        self.assertIn('Angle: a clearer picture',r.json()['job']['notes'])
        self.assertEqual(client.get(f'/channel/research/{f.name}').json()['made_videos'],{'Why black holes spin':vid})
        self.assertEqual([x['kind'] for x in client.get('/channel/research?kind=topics').json()],['topics'])
        self.assertEqual(client.get('/channel/research?kind=niche').json(),[])
        q=client.get(f'/channel/quota?profile={self.p["id"]}&searches=1&competitors=2').json()
        self.assertEqual(q['seeds'],['space facts','black holes']);self.assertGreater(q['estimate'],200)

class DeliveryTests(VideoBase):
    """Scripts as a performance: [tags] for v3/v4, breaks for older models, clean captions, and a voice change that never blocks."""
    def test_spoken_and_speakable(self):
        t='Your head ticks faster. [short pause] No, really. [curious] It ran FASTER. [laughs]. They measured it.'
        self.assertEqual(channel_voice.spoken(t),'Your head ticks faster. No, really. It ran FASTER. They measured it.')
        self.assertEqual(channel_voice.speakable(t,'eleven_v4'),t)
        self.assertEqual(channel_voice.speakable(t,'eleven_multilingual_v2'),'Your head ticks faster. <break time="0.35s" /> No, really. It ran FASTER. They measured it.')
        self.assertEqual(channel_voice.spoken('Wait... [whispers] what?'),'Wait... what?')
        txt='Hi [laughs]. Yes <break time="0.4s" /> ok'
        al={'characters':list(txt),'character_start_times_seconds':[i*.1 for i in range(len(txt))],'character_end_times_seconds':[i*.1+.1 for i in range(len(txt))]}
        self.assertEqual([w['text'] for w in channel_voice.words_of(txt,al,0)],['Hi.','Yes','ok'])

    def test_settings_follow_the_model_and_delivery(self):
        self.assertEqual(channel_voice.settings_for({'model':'eleven_v4'}),{'stability':.5})
        self.assertEqual(channel_voice.settings_for({'model':'eleven_v3','delivery':'expressive'}),{'stability':0.})
        self.assertIsNone(channel_voice.settings_for({'model':'eleven_multilingual_v2','delivery':'natural'}))
        self.assertEqual(channel_voice.settings_for({'model':'eleven_multilingual_v2','delivery':'steady'})['style'],0.)
        v={'id':'a','model':'eleven_v4'}
        self.assertEqual(channel_voice.voice_key('x',v),channel_voice.voice_key('x',{**v,'delivery':'natural'}))  # old takes stay valid
        self.assertNotEqual(channel_voice.voice_key('x',v),channel_voice.voice_key('x',{**v,'delivery':'expressive'}))
        p=channel.save_profile({'name':'New','voice':{'model':'nope','delivery':'loud'}})
        self.assertEqual((p['voice']['model'],p['voice']['delivery']),('eleven_v4','natural'))

    def test_tag_warnings(self):
        w=' | '.join(channel.tag_warnings('p1','[excited] [whispers] [sighs] Hi there (pause) friend. [the narrator leans in close now] Ok [applause].'))
        for bit in ['in ( ) are read aloud','too long for a delivery cue','[applause] asks the voice for a sound effect','overacting','three cues in a row']:self.assertIn(bit,w)
        self.assertEqual(channel.tag_warnings('p1','So here is the thing. [curious] Why does time move forward? Nobody knows. [short pause] Not yet.'),[])
        guide='Your head is ticking faster than your feet. [short pause] No, really — not as a metaphor. [curious] Back in twenty ten, scientists lifted a clock by just thirty-three centimeters… about one foot… and it ran FASTER. [amazed] They actually measured it.'
        self.assertEqual(channel.tag_warnings('p1',guide),[])  # the guide's own example passes
        plain={'sections':[{'id':'s1','kind':'hook','paragraphs':[{'id':'p1','text':' '.join(['word']*90)}]}]}
        self.assertIn('No delivery cues',' '.join(channel.check_script(plain,model='eleven_v4')[1]))
        tagged={'sections':[{'id':'s1','kind':'hook','paragraphs':[{'id':'p1','text':'[curious] '+' '.join(['word']*90)}]}]}
        self.assertIn('does not perform [tags]',' '.join(channel.check_script(tagged,model='eleven_multilingual_v2')[1]))
        self.assertEqual(channel.check_script(tagged)[2]['words'],90)  # tags are not words

    def test_v4_gets_the_tags_and_a_voice_change_never_blocks(self):
        tagged=json.loads(json.dumps(SCRIPT));tagged['sections'][0]['paragraphs'][0]['text']='[curious] Space is silent.'
        channel.save_script(self.f,tagged);channel.save_profile({'voice':{'id':'voice1','model':'eleven_v4'}},self.profile['id'])
        calls=[]
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}),patch('shorts.elevenlabs',side_effect=self.fake_tts(calls)):
            est=channel.voice_estimate(self.f);data=channel.voice(self.f,status=lambda m,p=None:None,allowed=est['credits'])
        body=calls[0][1];self.assertEqual((body['text'],body['model_id'],body['voice_settings']),('[curious] Space is silent.','eleven_v4',{'stability':.5}))
        self.assertNotIn('previous_text',body)
        self.assertEqual([w['text'] for w in data['words'][:3]],['Space','is','silent.'])  # the tag is not a caption word
        self.assertNotIn('curious',(self.f/'captions.srt').read_text())
        self.assertTrue(channel.voiced(self.f));self.assertIsNone(channel.voice_changed(self.f))
        channel.save_profile({'voice':{'id':'voice2','model':'eleven_v4'}},self.profile['id'])  # the creator picks another voice later
        self.assertTrue(channel.voiced(self.f))  # the existing voice-over still renders
        self.assertEqual(channel.voice_changed(self.f),{'model':'Eleven v4','delivery':'natural','same_voice':False})
        with patch.dict(os.environ,{'ELEVENLABS_API_KEY':'k'}):self.assertEqual(len(channel.voice_estimate(self.f)['todo']),3)  # re-voicing is offered
        edited=json.loads(json.dumps(tagged));edited['sections'][1]['paragraphs'][0]['text']='Sound is a pressure wave.'
        channel.save_script(self.f,edited);self.assertFalse(channel.voiced(self.f))  # a changed script does block

    def test_perform_changes_delivery_only_and_can_be_undone(self):
        channel.save_script(self.f,SCRIPT)
        t=Path(self.tmp.name);exe=t/'claude';exe.write_text(FAKE_CLAUDE);exe.chmod(0o755);record=t/'record.json'
        new=json.loads(json.dumps(SCRIPT));new['sections'][0]['paragraphs'][0]['text']='[whispers] Space is... silent.'
        env={'CLAUDE_BIN':str(exe),'FAKE_RECORD':str(record),'FAKE_WRITE':json.dumps({str(self.f.resolve()/'script.json'):json.dumps(new)})}
        with patch.dict(os.environ,env):info=channel.perform(self.f,'haiku',status=lambda m,p=None:None)
        a=json.loads(record.read_text())['argv'];self.assertEqual(a[a.index('--tools')+1],'Read,Write,Edit,Glob,Bash')  # no web: delivery only
        self.assertIn('Keep every fact',a[1]);self.assertEqual((info['kind'],info['changes']),('perform',['script.json']))
        self.assertEqual(channel.script_of(self.f)['sections'][0]['paragraphs'][0]['text'],'[whispers] Space is... silent.')
        channel.undo(self.f);self.assertEqual(channel.script_of(self.f)['sections'][0]['paragraphs'][0]['text'],'Space is silent.')

if __name__=='__main__':unittest.main()
