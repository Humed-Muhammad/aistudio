import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch,Mock
from pydantic import ValidationError
import shorts

def job(d,frames=90,left=None,face=None):
 p=Path(d);(p/'assets').mkdir(parents=True,exist_ok=True)
 (p/'manifest.json').write_text(json.dumps({'frames':frames,'fps':30,'width':1080,'height':1920,'duration':frames/30}))
 hand=[.5,.6,.5,.5,.08,'open_palm']
 (p/'tracks.json').write_text(json.dumps({'fps':30,'width':1080,'height':1920,'frames':frames,'cuts':[45],
  'hands':{'left':left if left is not None else [hand]*frames,'right':[None]*frames},'face':face if face is not None else [[.5,.3,.2,'']]*frames,'person':[.3]*45+[.8]*45}))
 (p/'captions.json').write_text(json.dumps({'language':'en','captions':[{'text':' Hello','startMs':0,'endMs':400,'timestampMs':200,'confidence':1}]}))
 (p/'workflow-mode.json').write_text('{"mode":"shorts","preset":"bold"}')
 return p

class ShortsPlanTests(unittest.TestCase):
 def test_plan_is_clamped_and_unrenderable_items_reported(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d,left=[None]*90)
   plan,warnings=shorts.save_plan(p,{'events':[
    {'type':'text','start':-1,'end':99,'text':'HOOK'},
    {'type':'sticker','start':0,'end':1,'asset':'missing.png'},
    {'type':'sticker','start':0,'end':1,'emoji':'🔥','anchor':'hand','hand':'left'},
    {'type':'text','start':1,'end':2,'text':'  '}]})
   self.assertEqual([(e.type,e.start,e.end) for e in plan.events],[('text',0,3.0),('sticker',0,1)])
   self.assertTrue(any('missing.png' in w for w in warnings));self.assertTrue(any('no left hand' in w for w in warnings))
   self.assertEqual(json.loads((p/'plan-warnings.json').read_text()),warnings)

 def test_behind_subject_text_warns_when_person_fills_frame(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);tracks=json.loads((p/'tracks.json').read_text());tracks['person']=[.9]*90;(p/'tracks.json').write_text(json.dumps(tracks))
   _,warnings=shorts.save_plan(p,{'events':[{'type':'text','start':0,'end':1,'text':'BIG','behind_subject':True}]})
   self.assertTrue(any('90%' in w for w in warnings))

 def test_invalid_plan_is_rejected_and_not_saved(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d)
   with self.assertRaises(ValidationError):shorts.save_plan(p,{'events':[{'type':'explode','start':0,'end':1}]})
   self.assertFalse((p/'plan.json').exists())

 def test_captions_drop_dashes_and_sound_annotations(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'c.json';words=[' -',' Hello',' (upbeat',' music)',' world',' [Music]',' —',' *outro*',' *soft',' music*']
   path.write_text(json.dumps({'captions':[{'text':w,'startMs':i,'endMs':i+1} for i,w in enumerate(words)]}))
   self.assertEqual([c['text'] for c in shorts.clean_captions(path)],[' Hello',' world'])

 def test_planner_context_summarizes_gestures_and_assets(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'assets'/'logo.png').write_bytes(b'\x89PNG')
   text,images=shorts.planner_context(p,'Logo on my palm')
   self.assertIn('left hand (screen side) gestures: 0.00-3.00s open_palm (middle third)',text)
   self.assertIn('Person fills >55% of frame (avoid behind_subject text): 1.50-3.00s',text)
   self.assertIn('logo.png',text);self.assertIn('[0.00]Hello',text);self.assertIn('Logo on my palm',text)
   self.assertEqual(images[-1]['source']['media_type'],'image/png')

 def test_auto_plan_uses_structured_output_and_keeps_chosen_preset(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);response=Mock(stop_reason='end_turn',parsed_output=shorts.PlannerPlan(caption_preset='minimal',caption_y=.7,highlight_color='#FFE14D',progress_bar=False,notes='',events=[shorts.PZoom(type='zoom',start=1,end=2,scale=1.2,focus='face')]))
   client=Mock();client.beta.messages.parse.return_value=response
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):plan,_=shorts.plan_auto(p,'notes')
   kwargs=client.beta.messages.parse.call_args.kwargs
   self.assertIs(kwargs['output_format'],shorts.PlannerPlan);self.assertEqual(kwargs['model'],'claude-opus-5-5');self.assertEqual(kwargs['fallbacks'],'default')
   self.assertEqual(plan.caption_preset,'bold');self.assertEqual(len(plan.events),1)

 def test_render_props_bundle_plan_tracks_and_captions(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);shorts.save_plan(p,{'events':[{'type':'flash','start':1,'end':1.2}]})
   props,_=shorts.render_props(p)
   self.assertEqual((props['durationInFrames'],props['video'],props['foreground']),(90,'source.mp4',None))
   self.assertEqual(props['plan']['events'][0]['type'],'flash');self.assertEqual(len(props['tracks']['face']),90)

class ShortsApiTests(unittest.TestCase):
 def test_rejects_unknown_jobs_bad_plans_and_bad_images(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='a'*32
  self.assertEqual(client.get('/shorts/jobs/'+'0'*32).status_code,404)
  self.assertEqual(client.get('/shorts/jobs/not-a-job').status_code,404)
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/ident).mkdir();p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x')
   with patch.object(shorts_app,'RUNS',Path(d)):
    r=client.put(f'/shorts/jobs/{ident}/plan',json={'events':[{'type':'text'}]})
    self.assertEqual(r.status_code,422);self.assertIn('start',r.json()['detail'])
    r=client.put(f'/shorts/jobs/{ident}/plan',json={'caption_preset':'minimal','events':[]})
    self.assertEqual(r.status_code,200);self.assertEqual(r.json()['plan']['caption_preset'],'minimal')
    self.assertEqual(client.post(f'/shorts/jobs/{ident}/assets',files={'images':('evil.sh',b'x')}).status_code,400)
    r=client.post(f'/shorts/jobs/{ident}/assets',files={'images':('My Logo!.PNG',b'\x89PNG')})
    self.assertEqual(r.json()['assets'],['my-logo.png'])

def words(*spec):
 """spec: (text,start_s,end_s) -> whisper-style captions."""
 return [{'text':' '+t,'startMs':round(a*1000),'endMs':round(b*1000),'timestampMs':None,'confidence':None} for t,a,b in spec]

class ShortsCutTests(unittest.TestCase):
 def setUp(self):
  self.caps=words(('So',0,.2),('um',.3,.5),('this',.6,.8),('works.',.85,1.2),('This',3,3.2),('works.',3.3,3.6),('Next',3.7,3.9),('point.',4,4.4))
 def test_units_split_at_sentences_and_pauses(self):
  units=shorts.make_units(self.caps)
  self.assertEqual([u['text'] for u in units],['So um this works.','This works.','Next point.'])
  self.assertEqual((units[1]['first'],units[1]['last'],units[1]['start']),(4,5,3.0))
 def test_ranges_drop_parts_and_fillers_without_bleeding_into_them(self):
  units=shorts.make_units(self.caps);cut=shorts.CutPlan(keep=[0,2])  # drop the retake "This works."
  ranges=shorts.layout(shorts.cut_ranges(cut,self.caps,units,5))
  self.assertEqual([r['words'] for r in ranges],[[0],[2,3],[6,7]])
  self.assertAlmostEqual(ranges[0]['end'],.3)      # stops where "um" starts
  self.assertAlmostEqual(ranges[1]['start'],.54)   # 60 ms lead-in, after "um" ends
  self.assertAlmostEqual(ranges[2]['start'],3.64)  # never reaches into the dropped part
  untouched=shorts.layout(shorts.cut_ranges(shorts.CutPlan(keep=[0,1,2],tighten=False),self.caps,units,5))
  self.assertEqual(len(untouched),1)  # consecutive parts play as one piece
 def test_captions_follow_the_cut_timeline(self):
  units=shorts.make_units(self.caps);ranges=shorts.layout(shorts.cut_ranges(shorts.CutPlan(keep=[0,2]),self.caps,units,5))
  out=shorts.remap_captions(self.caps,ranges)
  self.assertEqual([c['text'].strip() for c in out],['So','this','works.','Next','point.'])
  self.assertEqual(out[0]['startMs'],0);self.assertEqual(out[1]['startMs'],round(ranges[1]['out']*1000)+60)
  self.assertTrue(all(a['startMs']<=b['startMs'] for a,b in zip(out,out[1:])))
 def test_cut_validation(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'units.json').write_text(json.dumps(shorts.make_units(self.caps)))
   with self.assertRaises(ValueError):shorts.save_cut(p,{'keep':[0,9]})
   with self.assertRaises(ValueError):shorts.save_cut(p,{'keep':[1,1]})
   self.assertEqual(shorts.save_cut(p,{'keep':[2,0],'max_pause':9}).max_pause,2.0)
 def test_auto_cut_keeps_tighten_settings(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'units.json').write_text(json.dumps(shorts.make_units(self.caps)));(p/'source-info.json').write_text('{"duration":5}')
   shorts.save_cut(p,{'keep':[0,1,2],'tighten':False})
   decision=shorts.CutDecision(keep=[0,2],removed=[shorts.Removal(id=1,why='retake of part 0')],summary='Two points.')
   client=Mock();client.beta.messages.parse.return_value=Mock(stop_reason='end_turn',parsed_output=decision)
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):cut=shorts.cut_auto(p,'keep the ending')
   prompt=client.beta.messages.parse.call_args.kwargs['messages'][0]['content']
   self.assertIn('[1] 3.0-3.6s: This works.',prompt);self.assertIn('keep the ending',prompt)
   self.assertEqual((cut.keep,cut.tighten,cut.removed[0]['why']),([0,2],False,'retake of part 0'))

 def test_cut_media_joins_exact_frames_and_audio(self):
  import av,numpy as np
  from fractions import Fraction
  with tempfile.TemporaryDirectory() as d:
   src=Path(d)/'in.mp4';dst=Path(d)/'out.mp4'
   with av.open(str(src),'w') as out:  # grey level = second, tone = 200 Hz * (second+1)
    v=out.add_stream('libx264',rate=30);v.width,v.height,v.pix_fmt=64,112,'yuv420p';a=out.add_stream('aac',rate=48000,layout='mono')
    for i in range(120):
     f=av.VideoFrame.from_ndarray(np.full((112,64,3),40+50*(i//30),np.uint8),format='rgb24');f.pts=i;f.time_base=Fraction(1,30)
     for pk in v.encode(f):out.mux(pk)
    for pk in v.encode():out.mux(pk)
    t=np.arange(4*48000)/48000;tone=(.5*np.sin(2*np.pi*200*(np.floor(t)+1)*t)).astype(np.float32)
    for k in range(0,len(t),1024):
     f=av.AudioFrame.from_ndarray(tone[None,k:k+1024],format='flt',layout='mono');f.sample_rate=48000;f.pts=k;f.time_base=Fraction(1,48000)
     for pk in a.encode(f):out.mux(pk)
    for pk in a.encode():out.mux(pk)
   ranges=shorts.layout([{'start':1.2,'end':1.8,'words':[]},{'start':3.1,'end':3.6,'words':[]}])
   meta=shorts.cut_media(src,dst,ranges)
   self.assertEqual((meta['frames'],meta['width'],meta['height']),(33,64,112))
   with av.open(str(dst)) as c:
    grey=[int(f.to_ndarray(format='gray').mean()) for f in c.decode(video=0)]
   self.assertEqual(len(grey),33);self.assertTrue(all(abs(g-90)<6 for g in grey[:18]));self.assertTrue(all(abs(g-190)<6 for g in grey[18:]))
   pcm=shorts.decode_audio(dst)[0].astype(np.float32)
   for a,b,hz in [(.1,.5,400),(.7,1.0,800)]:
    seg=pcm[int(a*48000):int(b*48000)];spectrum=np.abs(np.fft.rfft(seg));self.assertAlmostEqual(np.argmax(spectrum)*48000/len(seg),hz,delta=15)

class ShortsCutApiTests(unittest.TestCase):
 def test_cut_routes_validate_and_report_kept_length(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='b'*32
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/ident;p.mkdir();(p/'upload.mp4').write_bytes(b'x')
   caps=words(('One.',0,.5),('Two.',2,2.5),('Three.',4,4.5))
   (p/'full-captions.json').write_text(json.dumps({'language':'en','captions':caps}));(p/'source-info.json').write_text('{"duration":6}')
   (p/'units.json').write_text(json.dumps(shorts.make_units(caps)));shorts.save_cut(p,{'keep':[0,1,2]})
   with patch.object(shorts_app,'RUNS',Path(d)):
    j=client.get(f'/shorts/jobs/{ident}').json()
    self.assertEqual([u['text'] for u in j['units']],['One.','Two.','Three.']);self.assertEqual(j['cut_summary']['kept_parts'],3)
    self.assertEqual(client.put(f'/shorts/jobs/{ident}/cut',json={'keep':[7]}).status_code,422)
    j=client.put(f'/shorts/jobs/{ident}/cut',json={'keep':[0,2]}).json()
    self.assertEqual(j['cut']['keep'],[0,2]);self.assertLess(j['cut_summary']['kept'],1.5)

class PlannerSchemaTests(unittest.TestCase):
 def test_schemas_sent_to_claude_have_no_optional_fields(self):
  from anthropic.lib._parse._transform import transform_schema
  for model in [shorts.PlannerPlan,shorts.CutDecision]:
   schema=transform_schema(model);nodes=[schema]+list(schema.get('$defs',{}).values())
   optional=sum(len(set(n['properties'])-set(n.get('required',[]))) for n in nodes if isinstance(n,dict) and 'properties' in n)
   self.assertEqual(optional,0,model.__name__)
 def test_compact_events_convert_to_full_plan(self):
  plan=shorts.PlannerPlan(caption_preset='bold',caption_y=.7,highlight_color='#fff',progress_bar=True,notes='n',events=[
   shorts.PFlash(type='flash',start=2),shorts.PSfx(type='sfx',start=2,sound='pop',volume=.5),
   shorts.PSticker(type='sticker',start=1,end=3,asset='',emoji='🔥',anchor='hand',hand='left',point='palm',trigger='open_palm',animation='pop',idle='float',size=1,x=.5,y=.5)]).to_plan()
  self.assertEqual([(e.type,e.start,e.end) for e in plan.events],[('flash',2,2.3),('sfx',2,2.3),('sticker',1,3)])
  self.assertEqual((plan.events[2].trigger,plan.progress_bar),('open_palm',True))
