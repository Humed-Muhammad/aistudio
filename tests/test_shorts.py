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

 def test_no_captions_window_is_kept_and_clamped(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d)
   plan,warnings=shorts.save_plan(p,{'events':[{'type':'no_captions','start':1,'end':99}]})
   self.assertEqual([(e.type,e.start,e.end) for e in plan.events],[('no_captions',1,3.0)]);self.assertEqual(warnings,[])
   plan,_=shorts.plan_from_json({'events':[{'type':'no_captions','start':.5,'end':2}]})
   self.assertEqual([(e.type,e.start,e.end) for e in plan.events],[('no_captions',.5,2)])

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

 def test_auto_plan_reads_json_and_keeps_chosen_preset(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);block=lambda s:Mock(text=s)
   bad=Mock(stop_reason='end_turn',content=[block('Here is the plan: {oops')])
   good=Mock(stop_reason='end_turn',content=[block('```json\n'+json.dumps({'caption_preset':'minimal','caption_y':.7,'highlight_color':'#FFE14D','progress_bar':False,'emphasis':['Hello'],'notes':'n',
    'events':[{'type':'zoom','start':1,'end':2,'scale':1.2,'focus':'face'},{'type':'card','start':.5,'end':2,'template':'blob','scene':'dark','text':'Hi','items':['a'],'value':'','label':'','active':1,'y':.5},{'type':'zoom','start':'soon'},{'type':'laser','start':1}]})+'\n```')])
   client=Mock();client.beta.messages.create.side_effect=[bad,good]
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):plan,warnings=shorts.plan_auto(p,'notes')
   first,second=client.beta.messages.create.call_args_list
   self.assertNotIn('output_format',first.kwargs);self.assertEqual(first.kwargs['model'],'claude-opus-5-5');self.assertEqual(first.kwargs['fallbacks'],'default')
   self.assertIn('JSON schema',first.kwargs['system']);self.assertIn('not valid JSON',second.kwargs['messages'][-1]['content'])
   self.assertEqual(plan.caption_preset,'bold');self.assertEqual(plan.emphasis,['Hello'])
   self.assertEqual([(e.type,e.template) for e in plan.events],[('card','list'),('zoom','list')])
   self.assertEqual(sum('left out' in w for w in warnings),2)

 def test_planner_adds_look_switches_only_when_asked(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);block=lambda s:Mock(text=s)
   reply=lambda:Mock(stop_reason='end_turn',content=[block(json.dumps({'caption_preset':'minimal','caption_y':.7,'highlight_color':'#6EC1FF','progress_bar':False,'emphasis':[],'notes':'n','look':'studio_blue',
    'events':[{'type':'look','start':0,'end':3.4,'look':'original'},{'type':'zoom','start':5,'end':6,'scale':1.2,'focus':'face'}]}))])
   def plan(notes,asked=None):
    client=Mock();client.beta.messages.create.return_value=reply()
    with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):return shorts.plan_auto(p,notes,asked=asked)[0]
   kinds=lambda pl:sorted(e.type for e in pl.events if e.type!='sfx')
   self.assertEqual(kinds(plan('')),['zoom'])  # Claude's own idea: dropped
   self.assertEqual(kinds(plan('show my real room at the start')),['look','zoom'])
   shorts.save_plan(p,{'events':[{'type':'look','start':1,'end':2,'look':'original'}]})  # the creator's own switch
   kept=plan('Current plan: … look … background …',asked='more zooms please')
   self.assertEqual([(e.start,e.end) for e in kept.events if e.type=='look'],[(1,2)])  # theirs kept, Claude's new one dropped
   self.assertEqual(kinds(plan('',asked='ክፍሉን አሳይ (show the room)')),['look','zoom'])

 def test_render_props_bundle_plan_tracks_and_captions(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);shorts.save_plan(p,{'events':[{'type':'flash','start':1,'end':1.2}]})
   props,_=shorts.render_props(p)
   self.assertEqual((props['durationInFrames'],props['video'],props['foreground']),(90,'source.mp4',None))
   self.assertEqual([e['type'] for e in props['plan']['events'] if e['type']!='sfx'],['flash']);self.assertEqual(len(props['tracks']['face']),90)

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

class ClientTests(unittest.TestCase):
 def test_clients_kits_and_delivery(self):
  from fastapi.testclient import TestClient
  import app,shorts_app,clients
  client=TestClient(app.app);ident='b'*32
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/ident).mkdir();p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x');(p/'foreground.webm').write_bytes(b'x')
   with patch.object(shorts_app,'RUNS',Path(d)),patch.object(clients,'CLIENTS',Path(d)/'clients.json'):
    self.assertEqual(client.post('/shorts/clients',json={'name':' '}).status_code,422)
    c=client.post('/shorts/clients',json={'name':'Hana Tech','notes':'Say ፖድካስት, not podcast.'}).json()
    self.assertEqual((c['name'],c['videos'],c['kit']),('Hana Tech',0,None))
    # A video's style becomes the client's kit.
    plan={'caption_preset':'sweep','caption_font':'wide','graphics_style':'noir','transition':'dip','caption_speed':1.4,
          'background':{**shorts.look('studio_haze').model_dump(),'auto':False},'events':[]}
    self.assertEqual(client.put(f'/shorts/jobs/{ident}/plan',json=plan).status_code,200)
    self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'client':c['id'],'delivery':'sent'}).json()['delivery'],'sent')
    self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'delivery':'paid'}).status_code,422)
    kc=client.put(f"/shorts/clients/{c['id']}/kit",json={'job':ident}).json()
    self.assertEqual((kc['videos'],kc['kit_summary']['captions'],kc['kit_summary']['look']),(1,'sweep','studio_haze'))
    # Claude hears the client's notes; a new video starts from the kit with every choice kept.
    self.assertIn('ፖድካስት',shorts.with_client(p,'keep the ending'));self.assertIn('keep the ending',shorts.with_client(p,'keep the ending'))
    start=shorts.kit_plan(clients.get(c['id'])['kit'])
    self.assertEqual((start.caption_preset,start.graphics_style,start.transition,start.background.pattern,start.captions_auto,start.background.auto),('sweep','noir','dip','side',False,False))
    # Applying the kit to a video keeps its graphics.
    shorts.save_plan(p,{'caption_preset':'bold','events':[{'type':'flash','start':1,'end':1.3}]})
    r=client.post(f'/shorts/jobs/{ident}/kit').json()
    self.assertEqual((r['plan']['caption_preset'],len(r['plan']['events'])),('sweep',1))
    # Deleting the client keeps the video.
    client.delete(f"/shorts/clients/{c['id']}");self.assertIsNone(client.get(f'/shorts/jobs/{ident}').json()['client'])

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

class TranscriptEditTests(unittest.TestCase):
 def setUp(self):
  self.d=tempfile.TemporaryDirectory();self.p=p=Path(self.d.name)
  caps=words(('So',0,.2),('this',.6,.8),('wroks.',.85,1.2),('This',3,3.2),('works.',3.3,3.6))
  (p/'full-captions.json').write_text(json.dumps({'language':'en','captions':caps}));(p/'source-info.json').write_text('{"duration":5}')
  (p/'units.json').write_text(json.dumps(shorts.make_units(caps)));shorts.save_cut(p,{'keep':[0,1]})
 def tearDown(self):self.d.cleanup()
 def caps(self):return json.loads((self.p/'full-captions.json').read_text())['captions']
 def test_same_word_count_keeps_each_timing(self):
  shorts.edit_part(self.p,0,'So this works.')
  c=self.caps();self.assertEqual([x['text'] for x in c[:3]],[' So',' this',' works.']);self.assertEqual((c[2]['startMs'],c[2]['endMs']),(850,1200))
  u=json.loads((self.p/'units.json').read_text())[0];self.assertEqual((u['text'],u['edited']),('So this works.',True))
 def test_new_word_count_spreads_over_spoken_time_and_shifts_later_parts(self):
  shorts.edit_part(self.p,0,'ሰላም so this really works.')
  c=self.caps();units=json.loads((self.p/'units.json').read_text())
  self.assertEqual((units[0]['first'],units[0]['last'],units[1]['first'],units[1]['last']),(0,4,5,6))
  self.assertEqual((c[0]['startMs'],c[4]['endMs']),(0,1200));self.assertEqual(c[5]['text'],' This')
  self.assertTrue(all(a['endMs']<=b['startMs'] and a['startMs']<a['endMs'] for a,b in zip(c[:5],c[1:5])))
  self.assertFalse(any(200<x['startMs']<600 for x in c[:5]))  # no word starts in the silent gap
  self.assertEqual(shorts.cut_summary(self.p)['parts'],2)
 def test_rejects_empty_and_unknown_parts(self):
  with self.assertRaises(ValueError):shorts.edit_part(self.p,0,'  ')
  with self.assertRaises(ValueError):shorts.edit_part(self.p,5,'hi')
 def test_built_edit_captions_always_update_in_place(self):
  p=self.p;caps=self.caps();units=json.loads((p/'units.json').read_text())
  ranges=shorts.layout(shorts.cut_ranges(shorts.load_cut(p),caps,units,5))
  (p/'cut-map.json').write_text(json.dumps([{k:r[k] for k in ['start','end','out','frames']} for r in ranges]));(p/'captions.json').write_text('{}')
  self.assertTrue(shorts.edit_part(p,0,'So this works.'))
  self.assertEqual([c['text'] for c in json.loads((p/'captions.json').read_text())['captions']][:3],[' So',' this',' works.'])
  # A fix never changes the audio: captions follow the built cut even when the new words would trim differently.
  self.assertTrue(shorts.edit_part(p,1,'um works.'))
  words=[c['text'] for c in json.loads((p/'captions.json').read_text())['captions']]
  self.assertIn(' works.',words);self.assertNotIn(' um',words)  # fillers are hidden from captions, as everywhere
  self.assertTrue(shorts.edit_part(p,0,'So this really nicely works.'))  # more words than were spoken: none dropped
  words=[c['text'] for c in json.loads((p/'captions.json').read_text())['captions']]
  self.assertEqual(words[:5],[' So',' this',' really',' nicely',' works.'])
  times=[c['startMs'] for c in json.loads((p/'captions.json').read_text())['captions']]
  self.assertEqual(times,sorted(times))
 def test_api_route(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  ident='c'*32;p=Path(self.d.name)/ident;p.mkdir()
  for f in Path(self.d.name).iterdir():
   if f.is_file():f.rename(p/f.name)
  (p/'upload.mp4').write_bytes(b'x');client=TestClient(app.app)
  with patch.object(shorts_app,'RUNS',Path(self.d.name)):
   j=client.put(f'/shorts/jobs/{ident}/units/0',json={'text':'So this works.'}).json()
   self.assertEqual((j['units'][0]['text'],j['units'][0]['edited'],j['units'][1]['edited']),('So this works.',True,False))
   self.assertEqual(client.put(f'/shorts/jobs/{ident}/units/0',json={'text':''}).status_code,422)

class PlannerSchemaTests(unittest.TestCase):
 def test_schemas_sent_to_claude_have_no_optional_fields(self):
  from anthropic.lib._parse._transform import transform_schema
  for model in [shorts.PlannerPlan,shorts.CutDecision]:
   schema=transform_schema(model);nodes=[schema]+list(schema.get('$defs',{}).values())
   optional=sum(len(set(n['properties'])-set(n.get('required',[]))) for n in nodes if isinstance(n,dict) and 'properties' in n)
   self.assertEqual(optional,0,model.__name__)
 def test_compact_events_convert_to_full_plan(self):
  plan=shorts.PlannerPlan(caption_preset='bold',caption_y=.7,highlight_color='#fff',progress_bar=True,look='original',light='pool',graphics_style='glass',emphasis=['three'],notes='n',events=[
   shorts.PFlash(type='flash',start=2),shorts.PSfx(type='sfx',start=2,sound='pop',volume=.5),
   shorts.PSticker(type='sticker',start=1,end=3,asset='',emoji='🔥',anchor='hand',hand='left',point='palm',trigger='open_palm',animation='pop',idle='float',size=1,x=.5,y=.5)]).to_plan()
  self.assertEqual([(e.type,e.start,e.end) for e in plan.events],[('flash',2,2.3),('sfx',2,2.3),('sticker',1,3)])
  self.assertEqual((plan.events[2].trigger,plan.progress_bar),('open_palm',True))

class ShortsJobListTests(unittest.TestCase):
 def test_create_list_rename_delete_and_progress(self):
  from fastapi.testclient import TestClient
  import app,shorts_app,threading,time
  client=TestClient(app.app);gate=threading.Event()
  def fake_prepare(src,folder,preset,status):
   status('Transcribing your recording (runs on this Mac)',.4);gate.wait(5)
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)), patch('shorts.prepare',fake_prepare):
   j=client.post('/shorts/jobs',files={'video':('my_cool-video.mov',b'x')},data={'preset':'bold'}).json()
   self.assertEqual(j['title'],'my cool video');ident=j['id']
   for _ in range(50):
    s=client.get(f'/shorts/jobs/{ident}').json()
    if s.get('progress'):break
    time.sleep(.02)
   self.assertEqual((s['state'],s['action'],s['progress']),('running','transcribe',.4))
   self.assertEqual(client.delete(f'/shorts/jobs/{ident}').status_code,409)  # busy
   gate.set();shorts_app.active[ident].join(2)
   listed=client.get('/shorts/jobs').json();self.assertEqual([(x['id'],x['state']) for x in listed],[(ident,'done')])
   self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'title':'  '}).status_code,422)
   self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'title':'Telegram pitch'}).json()['title'],'Telegram pitch')
   self.assertEqual(client.delete(f'/shorts/jobs/{ident}').status_code,200);self.assertEqual(client.get('/shorts/jobs').json(),[])

 def test_several_recordings_are_saved_in_name_order_and_joined(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);seen={}
  def fake_join(parts,dst,status):seen['parts']=[p.name for p in parts];Path(dst).write_bytes(b'x');return [{'name':p.name,'duration':1} for p in parts]
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)), patch('shorts.join_recordings',fake_join), patch('shorts.prepare',lambda *a:None):
   j=client.post('/shorts/jobs',files=[('video',('IMG_10.MOV',b'b')),('video',('IMG_9.MOV',b'a'))],data={'preset':'bold'}).json()
   shorts_app.active[j['id']].join(2)
   self.assertEqual(seen['parts'],['01-IMG_9.MOV','02-IMG_10.MOV']);self.assertEqual(j['title'],'IMG 9')
   self.assertEqual([x['name'] for x in json.loads((Path(d)/j['id']/'job.json').read_text())['parts']],['01-IMG_9.MOV','02-IMG_10.MOV'])
   self.assertEqual(client.get(f"/shorts/jobs/{j['id']}").json()['state'],'done')

def tiny_video(path,seconds=2,size=(90,160),fps=30):
 import av,numpy as np
 from fractions import Fraction
 with av.open(str(path),'w') as out:
  v=out.add_stream('libx264',rate=fps);v.width,v.height,v.pix_fmt=size[0],size[1],'yuv420p'
  for i in range(seconds*fps):
   f=av.VideoFrame.from_ndarray(np.full((size[1],size[0],3),(i*4)%255,np.uint8),format='rgb24');f.pts=i;f.time_base=Fraction(1,fps)
   for pk in v.encode(f):out.mux(pk)
  for pk in v.encode():out.mux(pk)

class ShortsBrollTests(unittest.TestCase):
 def test_clip_import_makes_renderable_video_and_planner_frames(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);src=Path(d)/'rec.mov';tiny_video(src,seconds=3,fps=60)
   self.assertEqual(shorts.add_clip(src,p,'my-demo'),'my-demo.mp4')
   self.assertEqual(shorts.load_clips(p)['my-demo.mp4'],{'duration':3.0,'width':90,'height':160})
   self.assertEqual(len(list((p/'assets'/'.frames'/'my-demo').glob('*.jpg'))),6)
   text,images=shorts.planner_context(p)
   self.assertIn('Screen recordings for broll (exact filename as asset): my-demo.mp4 (3.0s, vertical)',text)
   self.assertTrue(any(i.get('text','').startswith('Screen recording my-demo.mp4 at') for i in images))
   shorts.remove_clip(p,'my-demo.mp4');self.assertEqual(shorts.load_clips(p),{});self.assertFalse((p/'assets'/'my-demo.mp4').exists())

 def test_broll_is_fitted_to_the_recording_and_never_overlaps(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'assets'/'clips.json').write_text(json.dumps({'demo.mp4':{'duration':4,'width':886,'height':1920}}))
   plan,warnings=shorts.save_plan(p,{'events':[
    {'type':'broll','start':0,'end':2,'asset':'demo.mp4','src_start':1,'speed':2,'layout':'front'},  # needs 4 s, only 3 left
    {'type':'broll','start':1.5,'end':2.5,'asset':'demo.mp4'},                                        # overlaps
    {'type':'broll','start':2.5,'end':3,'asset':'nope.mp4'}]})
   e=plan.events[0]
   self.assertEqual(len(plan.events),1);self.assertAlmostEqual(e.speed,1.5);self.assertEqual(e.end,2)
   self.assertEqual(e.layout,'full')  # no person cutout in this job
   self.assertTrue(any('plays at 1.50x' in w for w in warnings));self.assertTrue(any('overlaps' in w for w in warnings))
   self.assertTrue(any('nope.mp4' in w for w in warnings));self.assertTrue(any('shown full screen' in w for w in warnings))

 def test_planner_broll_converts(self):
  plan=shorts.PlannerPlan(caption_preset='bold',caption_y=.7,highlight_color='#fff',progress_bar=False,look='original',light='pool',graphics_style='glass',emphasis=[],notes='',events=[
   shorts.PBroll(type='broll',start=1,end=4,asset='demo.mp4',src_start=2,speed=1.5,layout='bubble',corner='top_left')]).to_plan()
  e=plan.events[0];self.assertEqual((e.type,e.layout,e.corner,e.speed,e.src_start),('broll','bubble','top_left',1.5,2))

 def test_upload_and_delete_recording_through_api(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='c'*32
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/ident).mkdir();p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x');rec=Path(d)/'Screen Recording 1.MOV';tiny_video(rec)
   with patch.object(shorts_app,'RUNS',Path(d)):
    j=client.post(f'/shorts/jobs/{ident}/assets',files={'images':(rec.name,rec.read_bytes())}).json()
    self.assertEqual([(c['name'],c['duration']) for c in j['clips']],[('screen-recording-1.mp4',2.0)]);self.assertIn('/assets/.frames/screen-recording-1/',j['clips'][0]['poster'])
    self.assertEqual(client.post(f'/shorts/jobs/{ident}/assets',files={'images':('x.txt',b'x')}).status_code,400)
    self.assertEqual(client.delete(f'/shorts/jobs/{ident}/assets/screen-recording-1.mp4').json()['clips'],[])

class AmharicTests(unittest.TestCase):
 def w(self,t,s,e):return {'text':' '+t,'startMs':s,'endMs':e,'timestampMs':s,'confidence':1}
 def test_ethiopic_punctuation_splits_parts_and_fillers_drop(self):
  caps=[self.w('ሰላም',0,300),self.w('ነው።',300,600),self.w('እ',700,800),self.w('ቦቱ',820,1100),self.w('ይሰራል፣',1100,1400),self.w('easy',1800,2000)]
  units=shorts.make_units(caps)
  self.assertEqual([u['text'] for u in units],['ሰላም ነው።','እ ቦቱ ይሰራል፣','easy'])
  self.assertTrue(shorts.is_filler(caps[2]));self.assertFalse(shorts.is_filler(caps[3]))

 def test_scribe_words_become_captions(self):
  data={'language_code':'amh','words':[{'text':'ሰላም','type':'word','start':.1,'end':.5,'logprob':0},{'text':' ','type':'spacing','start':.5,'end':.6},
   {'text':'(laughs)','type':'audio_event','start':.6,'end':.9},{'text':'bot','type':'word','start':1.0,'end':1.0,'logprob':-.5}]}
  caps=shorts.scribe_captions(data)
  self.assertEqual([(c['text'],c['startMs'],c['endMs']) for c in caps],[(' ሰላም',100,500),(' bot',1000,1001)])
  self.assertEqual(caps[0]['confidence'],1.0)
  fixed=shorts.scribe_captions({'words':[{'text':'ബിዝነስ،','type':'word','start':0,'end':.5}]})
  self.assertEqual(fixed[0]['text'],' ቢዝነስ፣')

 def test_transcriber_choice(self):
  with patch.object(shorts,'setting',side_effect=lambda k,d='':{'ELEVENLABS_API_KEY':'k'}.get(k,d)):self.assertEqual(shorts.transcriber(),'elevenlabs')
  with patch.object(shorts,'setting',side_effect=lambda k,d='':d):self.assertEqual(shorts.transcriber(),'whisper')
  with patch.object(shorts,'setting',side_effect=lambda k,d='':{'ELEVENLABS_API_KEY':'k','SHORTS_TRANSCRIBER':'whisper'}.get(k,d)):self.assertEqual(shorts.transcriber(),'whisper')

 def test_scribe_request_sends_language_and_no_key_in_errors(self):
  with tempfile.TemporaryDirectory() as d:
   wav=Path(d)/'a.wav';wav.write_bytes(b'RIFF');out=Path(d)/'o.json'
   ok=Mock(status_code=200,json=lambda:{'language_code':'amh','words':[{'text':'ሰላም','type':'word','start':0,'end':.4}]})
   env={'ELEVENLABS_API_KEY':'secret','SHORTS_LANGUAGE':'am'}
   with patch.object(shorts,'setting',side_effect=lambda k,d='':env.get(k,d)),patch.object(shorts,'credential',return_value='secret'),patch('httpx.post',return_value=ok) as post:
    shorts.transcribe_scribe(wav,out,lambda *a:None)
   self.assertEqual(post.call_args.kwargs['data']['language_code'],'amh')
   self.assertEqual(json.loads(out.read_text())['captions'][0]['text'],' ሰላም')
   bad=Mock(status_code=401,text='invalid api key')
   with patch.object(shorts,'setting',side_effect=lambda k,d='':env.get(k,d)),patch.object(shorts,'credential',return_value='secret'),patch('httpx.post',return_value=bad):
    with self.assertRaises(RuntimeError) as e:shorts.transcribe_scribe(wav,out,lambda *a:None)
   self.assertNotIn('secret',str(e.exception))

class JoinTests(unittest.TestCase):
 def clip(self,path,seconds,grey,hz,size=(64,112),audio_seconds=None):
  import av,numpy as np
  from fractions import Fraction
  with av.open(str(path),'w') as out:
   v=out.add_stream('libx264',rate=30);v.width,v.height,v.pix_fmt=size[0],size[1],'yuv420p';a=out.add_stream('aac',rate=44100,layout='mono')
   for i in range(round(seconds*30)):
    f=av.VideoFrame.from_ndarray(np.full((size[1],size[0],3),grey,np.uint8),format='rgb24');f.pts=i;f.time_base=Fraction(1,30)
    for pk in v.encode(f):out.mux(pk)
   for pk in v.encode():out.mux(pk)
   t=np.arange(int((audio_seconds or seconds)*44100))/44100;tone=(.5*np.sin(2*np.pi*hz*t)).astype(np.float32)
   for k in range(0,len(t),1024):
    f=av.AudioFrame.from_ndarray(tone[None,k:k+1024],format='flt',layout='mono');f.sample_rate=44100;f.pts=k;f.time_base=Fraction(1,44100)
    for pk in a.encode(f):out.mux(pk)
   for pk in a.encode():out.mux(pk)

 def test_recordings_join_in_order_with_audio_in_sync(self):
  import av,numpy as np
  with tempfile.TemporaryDirectory() as d:
   a,b,dst=Path(d)/'01.mp4',Path(d)/'02.mov',Path(d)/'upload.mp4'
   self.clip(a,2,60,300,audio_seconds=1.6);self.clip(b,1,200,900,size=(72,128))  # short audio in part 1, other size in part 2
   parts=shorts.join_recordings([a,b],dst,lambda *x:None)
   self.assertEqual([p['name'] for p in parts],['01.mp4','02.mov'])
   with av.open(str(dst)) as c:grey=[int(f.to_ndarray(format='gray').mean()) for f in c.decode(video=0)]
   self.assertEqual(len(grey),90);self.assertTrue(all(abs(g-60)<6 for g in grey[:60]));self.assertTrue(all(abs(g-200)<6 for g in grey[60:]))
   self.assertEqual(shorts.probe(dst)['width'],64)
   pcm=shorts.decode_audio(dst)[0].astype(np.float32)
   for s,e,hz in [(.2,1.4,300),(2.15,2.85,900)]:
    seg=pcm[int(s*48000):int(e*48000)];self.assertAlmostEqual(np.argmax(np.abs(np.fft.rfft(seg)))*48000/len(seg),hz,delta=10)
   self.assertLess(np.abs(pcm[int(1.7*48000):int(1.95*48000)]).max(),300)  # padded silence where part 1 had no audio

 def test_landscape_part_is_refused(self):
  with tempfile.TemporaryDirectory() as d:
   a=Path(d)/'a.mp4';self.clip(a,1,90,300,size=(112,64))
   with self.assertRaises(ValueError):shorts.join_recordings([a],Path(d)/'o.mp4',lambda *x:None)

class NoiseTests(unittest.TestCase):
 def speechy(self,seconds=3):
  import numpy as np
  rng=np.random.default_rng(1);t=np.arange(seconds*48000)/48000
  burst=(np.sin(2*np.pi*3*t)>0)*np.sin(2*np.pi*220*t*(1+.3*np.sin(2*np.pi*.7*t)))  # on/off voiced tone
  x=(9000*burst+300*rng.standard_normal(len(t))).astype(np.int16);return np.stack([x,x])

 def test_align_undoes_processing_delay(self):
  import numpy as np
  ref=self.speechy();late=np.pad(ref,((0,0),(1300,0)))[:,:-200];early=ref[:,900:]
  for x in (late,early):
   out=shorts.align_to(x,ref);self.assertEqual(out.shape,ref.shape)
   self.assertTrue(np.array_equal(out[:,48000:96000],ref[:,48000:96000]))

 def test_filter_keeps_length_and_layout(self):
  ref=self.speechy();out=shorts.filter_pcm(ref,[('highpass','f=70')])
  self.assertEqual(out.shape,ref.shape);self.assertEqual(str(out.dtype),'int16')

 def test_strong_uses_elevenlabs_and_is_cached_aligned(self):
  import numpy as np
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);ref=self.speechy()
   (p/'workflow-mode.json').write_text('{"mode":"shorts","noise":"strong"}');(p/'upload.mp4').write_bytes(b'')
   shifted=np.pad(ref,((0,0),(1200,0)));wav=p/'reply.wav';shorts.write_wav(shifted[:1],wav)
   reply=Mock(status_code=200,content=wav.read_bytes())
   with patch.object(shorts,'decode_audio',side_effect=lambda f:ref if Path(f).name=='upload.mp4' else shifted),patch.object(shorts,'credential',return_value='k'),patch('httpx.post',return_value=reply) as post:
    path=shorts.job_audio(p,lambda *a:None);again=shorts.job_audio(p,lambda *a:None)
   self.assertEqual(post.call_count,1);self.assertEqual((path,again),(p/'clean-strong.wav',p/'clean-strong.wav'))
   import wave
   with wave.open(str(path)) as w:got=np.frombuffer(w.readframes(w.getnframes()),np.int16).reshape(-1,2).T
   self.assertEqual(got.shape,ref.shape);self.assertTrue(np.array_equal(got[:,48000:96000],ref[:,48000:96000]))
   self.assertFalse((p/'isolate-in.wav').exists())

 def test_words_stay_editable_while_a_render_runs(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='e'*32
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)):
   p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x');(p/'job.json').write_text('{"title":"T","created":1}')
   with patch.object(shorts_app,'busy',lambda i:True), patch.object(shorts_app,'status_of',lambda path:{'state':'running','action':'render'}):
    self.assertFalse(shorts_app.edit_locked(ident))  # a render works from its own snapshot
   with patch.object(shorts_app,'busy',lambda i:True), patch.object(shorts_app,'status_of',lambda path:{'state':'running','action':'auto'}):
    self.assertTrue(shorts_app.edit_locked(ident))  # building or planning rewrites the plan: wait
   with patch.object(shorts_app,'busy',lambda i:False):self.assertFalse(shorts_app.edit_locked(ident))

 def test_tracking_setting_via_api_and_planner(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='d'*32
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)):
   p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x');(p/'job.json').write_text('{"title":"T","created":1}')
   self.assertEqual(shorts.job_tracking(p),'full')  # older videos have no setting: full, as before
   self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'track_mode':'sometimes'}).status_code,422)
   j=client.patch(f'/shorts/jobs/{ident}',json={'track_mode':'off'}).json()
   self.assertEqual(j['track_mode'],'off');self.assertEqual(j['tracking']['frames'],90)  # the tracked summary is a separate field
   self.assertEqual(json.loads((p/'workflow-mode.json').read_text())['preset'],'bold')
   m=json.loads((p/'manifest.json').read_text());(p/'manifest.json').write_text(json.dumps({**m,'tracking':'off'}))
   text,_=shorts.planner_context(p)
   self.assertIn('No person cutout (tracking off)',text);self.assertIn('no gesture triggers',text)
   plan,warnings=shorts.save_plan(p,{'background':{'mode':'gradient','look':'studio_blue'},'events':[]})
   self.assertEqual(plan.background.mode,'original');self.assertTrue(any('tracking is set to off' in w for w in warnings))

 def test_off_means_original_audio(self):
  with tempfile.TemporaryDirectory() as d:
   self.assertIsNone(shorts.job_audio(Path(d)))

 def test_noise_setting_via_api(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);ident='c'*32
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)):
   p=Path(d)/ident;p.mkdir();(p/'upload.mp4').write_bytes(b'x');(p/'job.json').write_text('{"title":"T","created":1,"parts":[{"name":"a"}]}')
   (p/'workflow-mode.json').write_text('{"mode":"shorts","preset":"bold"}')
   self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'noise':'loud'}).status_code,422)
   self.assertEqual(client.patch(f'/shorts/jobs/{ident}',json={'noise':'light'}).json()['noise'],'light')
   self.assertEqual(json.loads((p/'workflow-mode.json').read_text())['preset'],'bold')
   client.patch(f'/shorts/jobs/{ident}',json={'title':'New'})
   self.assertEqual(json.loads((p/'job.json').read_text())['parts'],[{'name':'a'}])

class CancelTests(unittest.TestCase):
 def status(self):
  import threading
  s=lambda *a:None;s.cancelled=threading.Event();return s

 def test_cancel_endpoint_stops_a_running_step(self):
  from fastapi.testclient import TestClient
  import app,shorts_app,time
  client=TestClient(app.app)
  def slow_prepare(src,folder,preset,status):
   for i in range(400):status('Transcribing',i/400);time.sleep(.01)
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)), patch('shorts.prepare',slow_prepare):
   j=client.post('/shorts/jobs',files={'video':('a.mov',b'x')},data={'preset':'bold'}).json()
   time.sleep(.1);s=client.post(f"/shorts/jobs/{j['id']}/cancel").json()
   self.assertEqual(s['state'],'cancelled');self.assertEqual(client.get('/shorts/jobs').json()[0]['state'],'cancelled')
   self.assertEqual(client.post(f"/shorts/jobs/{j['id']}/cancel").status_code,409)

 def test_cancel_kills_helper_process_and_abandons_web_request(self):
  import time,threading
  st=self.status();proc=shorts.spawn(['sleep','30'],st);threading.Timer(.2,st.cancelled.set).start()
  t=time.time()
  with self.assertRaises(shorts.Cancelled):shorts.finished(proc,st)
  self.assertLess(time.time()-t,2)
  st=self.status();threading.Timer(.2,st.cancelled.set).start();t=time.time()
  with self.assertRaises(shorts.Cancelled):shorts.interruptible(lambda:time.sleep(30),st)
  self.assertLess(time.time()-t,2)
  self.assertEqual(shorts.interruptible(lambda:7,self.status()),7)

 def test_voiced_gaps_are_not_cut_as_pauses(self):
  import numpy as np
  caps=[{'text':' one','startMs':0,'endMs':300},{'text':' two','startMs':2300,'endMs':2600}]
  units=[{'id':0,'first':0,'last':1}];cut=shorts.CutPlan(keep=[0])
  self.assertEqual(len(shorts.cut_ranges(cut,caps,units,3,np.zeros(300,bool))),2)  # silent gap removed
  speech=np.zeros(300,bool);speech[50:220]=True
  self.assertEqual(len(shorts.cut_ranges(cut,caps,units,3,speech)),1)  # untranscribed speech kept

class CardAndSoundTests(unittest.TestCase):
 def test_cards_are_checked(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d,frames=900)
   plan,warnings=shorts.save_plan(p,{'events':[
    {'type':'card','template':'steps','start':1,'end':3,'items':['A','B','C'],'active':9},
    {'type':'card','template':'stat','start':4,'end':6,'value':''},
    {'type':'card','template':'list','start':7,'end':9,'scene':'dark','items':['x']},
    {'type':'card','template':'title','start':8,'end':10,'scene':'light','text':'Hi'},
    {'type':'card','template':'icons','start':12,'end':14,'items':['🤖 Bot','logo.png']}]})
   self.assertEqual([(e.template,e.active) for e in plan.events],[('steps',3),('list',1),('icons',1)])
   self.assertTrue(any('needs a value' in w for w in warnings));self.assertTrue(any('overlaps' in w for w in warnings))
   self.assertTrue(any('logo.png' in w for w in warnings))
   self.assertEqual(plan.caption_preset,'duo')

 def test_auto_sound_is_sparse_and_under_the_voice(self):
  E=shorts.Event
  kit={'whoosh-soft':(.07,.1,.15),'pop':(.2,.1,.4),'ui-click':(.2,.1,.4),'camera-click':(.24,.1,.5),'impact':(.01,.2,.7),'riser-bass':(1.9,.2,2.0),'riser-metal':(1.9,.2,2.0),'hit':(.01,.2,1.0)}
  plan=shorts.Plan(events=[E(type='zoom',start=1,end=2,scale=1.2),E(type='zoom',start=1.6,end=2,scale=1.3),E(type='zoom',start=5,end=6,scale=1.08),
   E(type='text',start=3,end=4,text='Hi'),E(type='sfx',start=3.05,end=3.3,sound='ding'),
   E(type='card',template='list',scene='dark',start=8,end=12,items=['a','b','c'],timeline=[(8,1),(9,2),(10,3)]),
   E(type='card',template='title',scene='light',start=20,end=22,text='Next'),E(type='card',template='steps',scene='split',start=34,end=36,items=['a','b'])])
  got=shorts.auto_sounds(plan,kit,voice=.04);s=[(round(e.start,3),e.sound) for e in got]
  self.assertIn((round(1+2/30-.07,3),'whoosh-soft'),s)  # loudest moment on the fastest zoom frame
  self.assertEqual(sum(1 for t,n in s if n=='whoosh-soft' and t<3),1)  # second zoom 0.6 s later: no pile-up
  self.assertFalse(any(abs(t-(5+2/30-.07))<.01 for t,n in s))  # gentle zoom: silent
  self.assertFalse(any(n=='pop' for t,n in s))  # the plan's ding wins
  self.assertEqual([n for t,n in s if 8<=t<=11 and n=='ui-click'],['ui-click','ui-click'])  # one per new row
  self.assertIn((6.0,'riser-bass'),s);self.assertIn((7.99,'hit'),s)  # riser ends on the scene change
  self.assertFalse(any(n.startswith('riser') and 15<t<30 for t,n in s))  # at most one every 25 s
  self.assertIn((34-2.0,'riser-metal'),s)
  for e in got:self.assertLess(e.volume*kit[e.sound][1],.04)  # every effect below the voice
  self.assertEqual(shorts.auto_sounds(plan,{'whoosh-soft':kit['whoosh-soft']},voice=.04)[0].sound,'whoosh-soft')  # missing sounds are skipped

 def test_own_sound_pack_wins_and_risers_need_it(self):
  with tempfile.TemporaryDirectory() as d:
   lib=Path(d)/'lib';(lib/'whoosh').mkdir(parents=True);(lib/'whoosh'/'Airy 01.wav').write_bytes(b'x');(lib/'riser-big.wav').write_bytes(b'x')
   with patch.object(shorts,'SFX_LIBRARY',lib),patch.object(shorts,'hosted_sound',lambda n:Path(f'/cache/{n}.wav')),patch.object(shorts,'mixkit_sound',lambda i:Path(f'/mixkit/{i}.wav')):
    self.assertEqual(shorts.sound_source('whoosh-soft').name,'Airy 01.wav');self.assertEqual(shorts.sound_source('riser-metal').name,'riser-big.wav')
    self.assertEqual(shorts.sound_source('pop'),Path('/mixkit/2364.wav'));self.assertIsNone(shorts.sound_source('impact'));self.assertIsNone(shorts.sound_source('hit'))

 def test_post_text_is_written_from_the_edit_and_cleaned(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'captions.json').write_text(json.dumps({'captions':[{'text':' ሰላም AI','startMs':0,'endMs':500}]}))
   out=shorts.PostCopy(titles=['One','Two','Three','Four'],caption=' Hi \n Comment 👇 ',hashtags=['AI','#ai','#Video Editing','#fyp'],best_time='6-11 PM')
   reply=Mock(stop_reason='end_turn',parsed_output=out)
   with patch('anthropic.Anthropic') as A:
    A.return_value.beta.messages.parse.return_value=reply
    data=shorts.post_copy(p,'series part 1')
    sent=A.return_value.beta.messages.parse.call_args.kwargs['messages'][0]['content']
   self.assertIn('ሰላም AI',sent);self.assertIn('series part 1',sent)
   self.assertEqual(data['titles'],['One','Two','Three']);self.assertEqual(data['hashtags'],['#AI','#VideoEditing','#fyp'])
   self.assertEqual(json.loads((p/'post.json').read_text())['caption'],'Hi \n Comment 👇')

 def test_half_drawn_frames_are_found(self):
  from PIL import Image
  pic=shorts.np.tile(shorts.np.linspace(0,255,960)[:,None],(1,540)).astype('uint8')  # light changing down the frame
  torn=pic.copy();torn[480:]=pic[:480]  # the glitch: the top half repeated below a hard line
  self.assertFalse(shorts.torn(Image.fromarray(pic)));self.assertTrue(shorts.torn(Image.fromarray(torn)))
  tiles=shorts.np.tile(shorts.np.linspace(20,60,192)[:,None],(5,540)).astype('uint8')  # only the wall, tiled
  self.assertTrue(shorts.torn(Image.fromarray(tiles)))
  with tempfile.TemporaryDirectory() as d:  # a plain stretch is never flagged; a lone glitch is
   path=Path(d)/'v.mp4'
   with shorts.av.open(str(path),'w') as out:
    vs=out.add_stream('libx264',rate=30);vs.width,vs.height,vs.pix_fmt=540,960,'yuv420p'
    for i in range(12):
     img=Image.fromarray(tiles if i==8 else pic if i>4 else shorts.np.full((960,540),40,'uint8')).convert('RGB')
     out.mux(vs.encode(shorts.av.VideoFrame.from_image(img).reformat(format='yuv420p')))
    out.mux(vs.encode())
   self.assertEqual(shorts.torn_frames(path),[8])

 def test_switch_effect_sets_the_flash_sound(self):
  kit={'whoosh-soft':(.1,.05,.5),'camera-click':(.01,.05,.2)}
  def sounds(t):
   plan=shorts.Plan(transition=t,events=[shorts.Event(type='flash',start=5,end=5.3)])
   return [e.sound for e in shorts.auto_sounds(plan,kit,voice=.05)]
  self.assertEqual((sounds('flash'),sounds('bloom'),sounds('dip'),sounds('none')),(['camera-click'],['whoosh-soft'],[],[]))
  self.assertEqual(shorts.Plan().transition,'bloom')
  plan=shorts.Plan(transition='bloom',events=[shorts.Event(type='flash',start=5,end=5.3,effect='flash'),shorts.Event(type='flash',start=9,end=9.3,effect='dip')])
  self.assertEqual([e.sound for e in shorts.auto_sounds(plan,kit,voice=.05)],['camera-click'])  # each switch's own effect wins

 def test_picked_sounds_win_and_jobs_pick_up_a_new_choice(self):
  ids=[i for items in shorts.MIXKIT.values() for i,_ in items]
  self.assertEqual(set(shorts.MIXKIT),set(shorts.SFX_FAMILIES));self.assertEqual(set(shorts.FAMILY.values()),set(shorts.SFX_FAMILIES))
  for fam,i in shorts.SFX_DEFAULT.items():self.assertIn(i,[x for x,_ in shorts.MIXKIT[fam]])
  with self.assertRaises(ValueError):shorts.mixkit_sound(99999999)
  with tempfile.TemporaryDirectory() as d:
   lib=Path(d)/'lib';lib.mkdir();snd=Path(d)/'snd'
   def fake(i):
    snd.mkdir(exist_ok=True);path=snd/f'{i}.wav';shorts.write_wav((shorts.np.ones((2,4800))*(900 if int(i)==772 else 90)).astype(shorts.np.int16),path);return path
   with patch.object(shorts,'SFX_LIBRARY',lib),patch.object(shorts,'mixkit_sound',fake):
    shorts.set_sound_choice('impact','mixkit:772');shorts.set_sound_choice('pop','off')
    self.assertEqual(shorts.sound_source('impact').name,'772.wav');self.assertIsNone(shorts.sound_source('pop'))
    with self.assertRaises(ValueError):shorts.set_sound_choice('nope','off')
    cat={f['id']:f for f in shorts.sound_catalog()};self.assertEqual((cat['impact']['choice'],cat['pop']['choice']),('mixkit:772','off'))
    p=job(d);shorts.sound_kit(p,['impact']);loud=shorts.sound_info(p/'sfx'/'impact.wav')[1]
    shorts.set_sound_choice('impact','mixkit:788');shorts.sound_kit(p,['impact'])
    self.assertLess(shorts.sound_info(p/'sfx'/'impact.wav')[1],loud)  # the job's copy follows the new pick

 def test_back_to_back_cards_merge_and_rows_follow_speech(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d,frames=600)
   (p/'captions.json').write_text(json.dumps({'captions':[{'text':' record','startMs':1500,'endMs':1800},{'text':' then','startMs':2000,'endMs':2200},{'text':' upload','startMs':3200,'endMs':3500}]}))
   steps=[{'type':'card','template':'steps','scene':'split','start':a,'end':b,'items':['A','B','C'],'active':n} for a,b,n in [(10,11,1),(11.05,12,2),(12.1,14,3)]]
   plan,_=shorts.save_plan(p,{'events':steps+[{'type':'card','template':'list','scene':'dim','start':1,'end':5,'items':['Record it','Upload it']}]})
   cards=[e for e in plan.events if e.type=='card']
   self.assertEqual([(c.template,c.start,c.end) for c in cards],[('list',1,5),('steps',10,14)])
   self.assertEqual([list(x) for x in cards[1].timeline],[[10,1],[11.05,2],[12.1,3]])
   self.assertEqual([list(x) for x in cards[0].timeline],[[1.4,1],[3.1,2]])  # each row when its word is spoken

 def test_hand_sticker_stays_while_the_hand_is_up(self):
  with tempfile.TemporaryDirectory() as d:
   hand=[.5,.6,.5,.5,.08,'open_palm'];left=[None]*30+[hand]*120+[None]*5+[hand]*40+[None]*105  # up 1-5 s, 5-frame dropout, up to 6.5 s
   p=job(d,frames=300,left=left)
   plan,_=shorts.save_plan(p,{'events':[{'type':'sticker','start':1.5,'end':3,'emoji':'🔥','anchor':'hand','hand':'left'}]})
   self.assertAlmostEqual(plan.events[0].end,6.5,places=2)

 def test_planner_gets_the_style_guide(self):
  self.assertIn('Card templates',shorts.planner_system());self.assertIn('Sound design is automatic',shorts.planner_system())

class PlannerGrammarTests(unittest.TestCase):
 def test_only_event_types_are_enums_and_bad_choices_fall_back(self):
  from anthropic.lib._parse._transform import transform_schema
  schema=json.dumps(transform_schema(shorts.PlannerPlan))
  self.assertLessEqual(schema.count('"enum"')+schema.count('"const"'),8)  # one marker per event type
  plan=shorts.PlannerPlan(caption_preset='fancy',caption_y=.7,highlight_color='#3D7BFF',progress_bar=False,look='original',light='pool',graphics_style='glass',emphasis=['ሰላም'],notes='',events=[
   shorts.PCard(type='card',start=1,end=3,template='hexagon',scene='dark',text='Hi',items=[],value='',label='',active=1,y=.5,side='diagonal'),
   shorts.PSfx(type='sfx',start=2,sound='laser',volume=.4)]).to_plan()
  self.assertEqual((plan.caption_preset,plan.events[0].template,plan.events[0].scene,plan.events[0].side,plan.events[1].sound),('duo','list','dark','top','whoosh'))

class BackgroundTests(unittest.TestCase):
 def test_looks_are_valid_and_checked_against_the_cutout(self):
  for name in shorts.LOOKS:self.assertEqual(shorts.look(name).look,name)
  with tempfile.TemporaryDirectory() as d:
   p=job(d)
   plan,warnings=shorts.save_plan(p,{'background':{'mode':'glow'},'events':[]})
   self.assertEqual(plan.background.mode,'original');self.assertTrue(any('cutout' in w for w in warnings))
   (p/'foreground.webm').write_bytes(b'x')
   plan,warnings=shorts.save_plan(p,{'background':{'mode':'image','image':'gone.png','glow':3,'scale':2,'color':'red'},'events':[]})
   self.assertEqual((plan.background.mode,plan.background.glow,plan.background.scale,plan.background.color),('blur',1,1.2,'#141518'))
   self.assertTrue(any('gone.png' in w for w in warnings));self.assertTrue(any('hex' in w for w in warnings))

 def test_planner_picks_a_look_unless_the_creator_chose_one(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'foreground.webm').write_bytes(b'x')
   reply=lambda look:Mock(stop_reason='end_turn',content=[Mock(text=json.dumps({'caption_preset':'clean','caption_y':.7,'highlight_color':'#FFD60A','progress_bar':False,'look':look,'emphasis':[],'notes':'','events':[]}))])
   client=Mock();client.beta.messages.create.side_effect=[reply('dark_glow'),reply('cream'),reply('no_such_look')]
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):
    plan,_=shorts.plan_auto(p);self.assertEqual((plan.background.mode,plan.background.look),('glow','dark_glow'))
    self.assertIn('dark_glow =',client.beta.messages.create.call_args.kwargs['messages'][0]['content'][-1]['text'])
    mine=plan.model_dump();mine['background']={**mine['background'],'mode':'color','color':'#FF6B3D','look':'','auto':False};shorts.save_plan(p,mine)
    plan,_=shorts.plan_auto(p);self.assertEqual((plan.background.mode,plan.background.color),('color','#FF6B3D'))  # kept
    mine['background']['auto']=True;shorts.save_plan(p,mine)
    plan,_=shorts.plan_auto(p);self.assertEqual(plan.background.mode,'original')  # unknown look: safe default

 def test_rebuild_keeps_the_look(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'foreground.webm').write_bytes(b'x');shorts.save_plan(p,{'background':shorts.LOOKS['cream']|{'auto':False},'events':[]})
   self.assertEqual(shorts.load_plan(p).background.color,'#EFE9DD')

class AutoEditTests(unittest.TestCase):
 def test_runs_cut_build_plan_and_draft_in_order(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);calls=[]
   with patch('shorts.transcript_check',return_value={'speech':60,'missing':1}),patch('shorts.setting',lambda name,default='':'key' if name=='ANTHROPIC_API_KEY' else default),\
    patch('shorts.cut_auto',lambda f,n,status:calls.append(('cut',n))),patch('shorts.apply_cut',lambda f,status:(calls.append('build'),status('Tracking',.5))),\
    patch('shorts.plan_auto',lambda f,n,status:calls.append(('plan',n))),patch('shorts.render',lambda f,final,status:calls.append(('render',final))),\
    patch('shorts.load_plan',return_value=shorts.Plan(background=shorts.look('dark_glow'))),patch('shorts.cut_summary',return_value={'kept':42}):
    seen=[];msg=shorts.auto_edit(p,'keep pricing',lambda m,pr=None:seen.append(m))
   self.assertEqual(calls,[('cut','keep pricing'),'build',('plan','keep pricing'),('render',False)])
   self.assertIn('Step 2 of 4 · Building and tracking your edit · Tracking',seen);self.assertIn('dark_glow',msg)

 def test_stops_when_speech_was_not_transcribed(self):
  with patch('shorts.transcript_check',return_value={'speech':60,'missing':20}),self.assertRaisesRegex(RuntimeError,'no transcript'):shorts.auto_edit('x')

 def test_upload_with_auto_chains_into_the_edit(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  client=TestClient(app.app);done=[]
  with tempfile.TemporaryDirectory() as d, patch.object(shorts_app,'RUNS',Path(d)), patch('shorts.prepare',lambda *a:None),\
   patch('shorts.auto_edit',lambda path,notes,status:(done.append(notes),'Draft ready')[1]):
   j=client.post('/shorts/jobs',files={'video':('a.mov',b'x')},data={'auto':'true','notes':'dark look'}).json()
   self.assertEqual(j['action'],'auto');shorts_app.active[j['id']].join(2)
   s=client.get('/shorts/jobs/'+j['id']).json();self.assertEqual((s['state'],s['status']),('done','Draft ready'));self.assertEqual(done,['dark look'])
   self.assertFalse((Path(d)/j['id']/'auto.json').exists())
   self.assertEqual(client.get('/shorts/looks').json()[0]['id'],'original')

class CaptionChoiceTests(unittest.TestCase):
 def test_no_yellow_defaults(self):
  self.assertNotIn('FFD60A',shorts.ACCENT+json.dumps(shorts.LOOKS)+json.dumps(shorts.PALETTE));self.assertNotIn('yellow_pop',shorts.LOOKS)
  self.assertEqual((shorts.Plan().caption_preset,shorts.Plan().caption_font,shorts.Plan().caption_motion),('duo','noto_black','pop'))

 def test_planner_keeps_font_motion_and_locked_captions(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'workflow-mode.json').write_text('{"mode":"shorts","preset":"duo"}')
   reply=Mock(stop_reason='end_turn',content=[Mock(text=json.dumps({'caption_preset':'bold','caption_y':.5,'highlight_color':'#FF7A59','progress_bar':False,'look':'original','emphasis':[],'notes':'','events':[]}))])
   client=Mock();client.beta.messages.create.return_value=reply
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):
    shorts.save_plan(p,{'caption_font':'agbalumo','caption_motion':'rise','events':[]})
    plan,_=shorts.plan_auto(p)
    self.assertEqual((plan.caption_preset,plan.highlight_color,plan.caption_font,plan.caption_motion),('duo','#FF7A59','agbalumo','rise'))
    self.assertIn('coral #FF7A59',client.beta.messages.create.call_args.kwargs['messages'][0]['content'][-1]['text'])
    shorts.save_plan(p,{'caption_preset':'minimal','highlight_color':'#5EEAD4','caption_y':.8,'captions_auto':False,'events':[]})
    plan,_=shorts.plan_auto(p)
    self.assertEqual((plan.caption_preset,plan.highlight_color,plan.caption_y),('minimal','#5EEAD4',.8))

 def test_studio_walls_and_face_placement_are_kept(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'foreground.webm').write_bytes(b'x')
   plan,warnings=shorts.save_plan(p,{'background':shorts.look('studio_blue').model_dump(),'caption_place':'fixed','events':[]})
   self.assertEqual((plan.background.mode,plan.caption_place,warnings),('studio','fixed',[]))
   self.assertEqual(shorts.Plan().caption_place,'face')

 def test_light_design_defaults_to_pool_and_planner_can_pick_one(self):
  self.assertEqual(shorts.look('studio_blue').pattern,'pool')
  plan=shorts.PlannerPlan(caption_preset='duo',caption_y=.7,highlight_color='#6EC1FF',progress_bar=False,look='studio_teal',light='blinds',graphics_style='glass',emphasis=[],notes='',events=[]).to_plan()
  self.assertEqual((plan.background.look,plan.background.pattern),('studio_teal','blinds'))
  plan=shorts.PlannerPlan(caption_preset='duo',caption_y=.7,highlight_color='#6EC1FF',progress_bar=False,look='studio_teal',light='disco',graphics_style='glass',emphasis=[],notes='',events=[]).to_plan()
  self.assertEqual(plan.background.pattern,'pool')
  with self.assertRaises(Exception):shorts.Background(pattern='disco')

 def test_pro_finish_is_clamped_and_on_studio_looks(self):
  b=shorts.look('studio_coral');self.assertEqual((b.tube,b.wrap>0,b.reframe>0,b.grade>0,b.grain>0),('left',True,True,True,True))
  with tempfile.TemporaryDirectory() as d:
   p=job(d);(p/'foreground.webm').write_bytes(b'x')
   plan,_=shorts.save_plan(p,{'background':{**b.model_dump(),'wrap':4,'grain':-1},'events':[]})
   self.assertEqual((plan.background.wrap,plan.background.grain),(1,0))

 def test_look_switches_are_checked_and_sent_to_the_renderer(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d,frames=300)
   plan,w=shorts.save_plan(p,{'events':[{'type':'look','start':1,'end':2,'look':'studio_blue'},{'type':'look','start':3,'end':4,'look':'original'}]})
   self.assertEqual([e.look for e in plan.events],['original']);self.assertTrue(any('cutout' in x for x in w))
   (p/'foreground.webm').write_bytes(b'x')
   plan,w=shorts.save_plan(p,{'events':[{'type':'look','start':1,'end':5,'look':'studio_blue'},{'type':'look','start':4,'end':6,'look':'original'},{'type':'look','start':7,'end':8,'look':'nope'}]})
   self.assertEqual([e.look for e in plan.events],['studio_blue']);self.assertEqual(len(w),2)
   props,_=shorts.render_props(p);self.assertEqual(props['looks']['studio_blue']['mode'],'studio')
   plan,_=shorts.plan_from_json({'events':[{'type':'look','start':1,'end':3,'look':'original'}]});self.assertEqual(plan.events[0].look,'original')

class VoiceLevelTests(unittest.TestCase):
 def test_quiet_and_loud_speech_end_up_even_at_platform_loudness(self):
  import numpy as np
  sr=shorts.SR;t=np.arange(sr*6)/sr;rng=np.random.default_rng(1)
  speech=np.sin(2*np.pi*180*t)*(0.6+0.4*np.sin(2*np.pi*3*t))*(rng.random(len(t))*.3+.7)
  amp=np.where(t<3,.03,.25)  # first half mumbled, second half loud
  pcm=(np.vstack([speech*amp]*2)*32767).astype(np.int16)
  out=shorts.level_voice(pcm).astype(np.float32)/32768
  q,l=np.abs(out[:,sr//2:int(2.5*sr)]).mean(),np.abs(out[:,int(3.5*sr):int(5.5*sr)]).mean()
  self.assertLess(l/q,2.2)  # was 8.3x apart
  self.assertAlmostEqual(shorts.loudness(out),shorts.LOUDNESS,delta=1.5);self.assertLessEqual(np.abs(out).max(),shorts.PEAK+1e-3)

 def test_setting_defaults_on_and_is_switchable(self):
  from fastapi.testclient import TestClient
  import app,shorts_app
  with tempfile.TemporaryDirectory() as d:
   ident='b'*32;p=job(Path(d)/ident);(p/'upload.mp4').write_bytes(b'x')
   self.assertEqual(shorts.job_voice(p),'level')
   with patch.object(shorts_app,'RUNS',Path(d)):
    c=TestClient(app.app)
    self.assertEqual(c.patch(f'/shorts/jobs/{ident}',json={'voice':'off'}).json()['voice'],'off')
    self.assertEqual(c.patch(f'/shorts/jobs/{ident}',json={'voice':'loud'}).status_code,422)
   self.assertIsNone(shorts.voice_track(p))

class GraphicStyleTests(unittest.TestCase):
 def test_planner_picks_a_style_unless_the_creator_chose_one(self):
  with tempfile.TemporaryDirectory() as d:
   p=job(d)
   reply=Mock(stop_reason='end_turn',content=[Mock(text=json.dumps({'caption_preset':'duo','caption_y':.7,'graphics_style':'tech','highlight_color':'#6EC1FF','progress_bar':False,'look':'original','emphasis':[],'notes':'','events':[]}))])
   client=Mock();client.beta.messages.create.return_value=reply
   with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):
    self.assertEqual(shorts.plan_auto(p)[0].graphics_style,'tech')
    shorts.save_plan(p,{'graphics_style':'editorial','graphics_auto':False,'events':[]})
    self.assertEqual(shorts.plan_auto(p)[0].graphics_style,'editorial')
   self.assertEqual(shorts.Plan().graphics_style,'glass')

class WordFixTests(TranscriptEditTests):
 def test_claude_suggests_and_nothing_changes_until_applied(self):
  out=shorts.WordFixes(fixes=[shorts.WordFix(id=0,text='So  this works.',why='spelling'),shorts.WordFix(id=1,text='This works.',why='same'),shorts.WordFix(id=9,text='x',why='bad id')])
  client=Mock();client.beta.messages.parse.return_value=Mock(stop_reason='end_turn',parsed_output=out)
  with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):
   fixes=shorts.suggest_fixes(self.p,'video about code')
  self.assertEqual(fixes,[{'id':0,'old':'So this wroks.','new':'So this works.','why':'spelling'}])
  self.assertIn('video about code',client.beta.messages.parse.call_args.kwargs['messages'][0]['content'])
  self.assertEqual(self.caps()[2]['text'].strip(),'wroks.')  # untouched
  before=[(c['startMs'],c['endMs']) for c in self.caps()]
  shorts.apply_fixes(self.p,{'0':'So this works.'})
  self.assertEqual(self.caps()[2]['text'].strip(),'works.');self.assertEqual([(c['startMs'],c['endMs']) for c in self.caps()],before)
  self.assertFalse((self.p/'word-fixes.json').exists())
