import unittest,tempfile,json,re,os
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
import graphics,graphics_app

KIT_READY=graphics.HF.exists()

def png(path,alpha=False,size=(64,48)):
    Image.new('RGBA' if alpha else 'RGB',size,(255,0,0,0) if alpha else (200,40,40)).save(path);return path

class TemplateTests(unittest.TestCase):
    page=(graphics.KIT/'template'/'index.html').read_text()

    def test_content_block_is_valid_and_every_text_variable_is_used(self):
        decl=json.loads(re.search(r"data-composition-variables='(.*?)'",self.page,re.S).group(1))
        ids={v['id'] for v in decl};self.assertTrue({'headline','price','accent','image1','image2','image3','productFit'}<=ids)
        for v in decl:
            self.assertIn(v['type'],['string','number','color','boolean','enum']);self.assertIn('label',v)
            if v['type']=='color':self.assertRegex(v['default'],r'^#[0-9A-Fa-f]{6}$')
        script=self.page[self.page.rindex('<script>'):]
        for v in decl:
            if v['type']=='string' and not v['id'].startswith('image'):self.assertIn('v.'+v['id'],script,v['id'])
        for n in (1,2,3):self.assertIn(f'data-var-src="image{n}" src="assets/placeholder-{n}.svg"',self.page)

    def test_motion_kit_is_seek_safe(self):
        kit=(graphics.KIT/'kit'/'motion-kit.js').read_text().split('*/',1)[1]  # the header comment names what is avoided
        for bad in ['Math.random','Date.now','repeat: -1','.play(']:self.assertNotIn(bad,kit)
        for name in ['kenBurns','reveal','parallax','float','tilt','shine','tiles','slideshow','zoomThrough','focusPull','popIn','exit','words','countUp','typeOn']:
            self.assertIn(name,kit[kit.index('window.MotionKit'):])

    def test_fonts_css_points_at_bundled_files(self):
        css=(graphics.KIT/'kit'/'fonts.css').read_text();files={f+'.woff2' for fs in graphics.FONTS.values() for f in fs}
        self.assertEqual(set(re.findall(r'url\(fonts/([^)]+)\)',css)),files)

class EnvTests(unittest.TestCase):
    def test_cloud_keys_are_stripped_and_telemetry_is_off(self):
        with patch.dict(os.environ,{'GEMINI_API_KEY':'secret','HEYGEN_API_KEY':'x','PATH':'/usr/bin'}):
            e=graphics.env()
        self.assertNotIn('GEMINI_API_KEY',e);self.assertNotIn('HEYGEN_API_KEY',e)
        self.assertEqual(e['HYPERFRAMES_NO_TELEMETRY'],'1');self.assertEqual(e['HYPERFRAMES_FFMPEG_PATH'],str(graphics.FFMPEG))

@unittest.skipUnless(KIT_READY,'motion graphics toolchain not installed (make graphics)')
class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        p=patch.object(graphics,'RUNS',Path(self.tmp.name)/'graphics');p.start();self.addCleanup(p.stop)
        self.src=Path(self.tmp.name)

    def test_new_project_is_self_contained_and_sized(self):
        f=graphics.create('Test','landscape')
        for rel in ['index.html','kit/motion-kit.js','kit/gsap.min.js','kit/fonts.css','kit/fonts/noto-sans-ethiopic-ethiopic-700-normal.woff2',
                    'assets/placeholder-1.svg','hyperframes.json','job.json','.hyperframes/bin/ffmpeg']:self.assertTrue((f/rel).exists(),rel)
        page=(f/'index.html').read_text()
        self.assertIn('data-width="1920" data-height="1080"',page);self.assertIn('width: 1920px; height: 1080px;',page)
        self.assertEqual(graphics.duration(f),12.0)

    def test_images_fill_slots_and_transparent_product_becomes_cutout(self):
        f=graphics.create('Test')
        self.assertEqual(graphics.add_image(f,png(self.src/'Hero Shot.jpg')),'assets/hero-shot.jpg')
        self.assertEqual(graphics.add_image(f,png(self.src/'shoe.png',alpha=True)),'assets/shoe.png')
        self.assertEqual(graphics.add_image(f,png(self.src/'shoe.png')),'assets/shoe-2.jpg')
        values={v['id']:v['default'] for v in graphics.content(f)}
        self.assertEqual((values['image1'],values['image2'],values['image3'],values['productFit']),('assets/hero-shot.jpg','assets/shoe.png','assets/shoe-2.jpg','cutout'))
        self.assertEqual(graphics.images(f),['assets/hero-shot.jpg','assets/shoe-2.jpg','assets/shoe.png'])
        with self.assertRaises(ValueError):graphics.add_image(f,self.src/'notes.txt')

    def test_large_images_are_shrunk(self):
        f=graphics.create('Test');graphics.add_image(f,png(self.src/'big.jpg',size=(4000,3000)))
        self.assertEqual(Image.open(f/'assets/big.jpg').size,(2400,1800))

    def test_content_edits_round_trip_with_quotes_and_amharic(self):
        f=graphics.create('Test')
        graphics.set_content(f,{'headline':"Don't wait & save","price":'120 ብር','accent':'#3D7BFF','productFit':'cutout'})
        values={v['id']:v['default'] for v in graphics.content(f)}
        self.assertEqual((values['headline'],values['price'],values['accent']),("Don't wait & save",'120 ብር','#3D7BFF'))
        self.assertNotIn("Don't",(f/'index.html').read_text())  # the apostrophe is escaped inside the single-quoted attribute
        for bad in [{'nope':'x'},{'accent':'blue'},{'productFit':'sideways'}]:
            with self.assertRaises(ValueError):graphics.set_content(f,bad)

    def test_music_is_one_clip_across_the_video(self):
        f=graphics.create('Test');(self.src/'bed.mp3').write_bytes(b'ID3')
        graphics.add_music(f,self.src/'bed.mp3');graphics.add_music(f,self.src/'bed.mp3')
        page=(f/'index.html').read_text()
        self.assertEqual(page.count('<audio id="music"'),1);self.assertIn('src="assets/music.mp3" data-start="0" data-duration="12"',page)
        graphics.remove_music(f);self.assertNotIn('<audio',(f/'index.html').read_text());self.assertIsNone(graphics.music(f))
        with self.assertRaises(ValueError):graphics.add_music(f,self.src/'clip.mov')

    def test_brief_needs_four_parts_and_becomes_a_prompt(self):
        f=graphics.create('Fade House');graphics.add_image(f,png(self.src/'a.jpg'))
        with self.assertRaises(ValueError):graphics.save_brief(f,{'who':'x','look':' '})
        graphics.save_brief(f,{'who':'20 s Reels promo','look':'#000 and #FFD60A','scenes':'0-4 s hero','rules':'max 6 words'})
        text=graphics.prompt(f)
        for part in ['20 s Reels promo','#FFD60A','0-4 s hero','max 6 words','assets/a.jpg','Fade House']:self.assertIn(part,text)

    def test_lint_findings_are_summarised_and_expected_warning_is_ignored(self):
        f=graphics.create('Test')
        out=json.dumps({'findings':[{'code':'nested_structure_needs_subcomposition','severity':'warning','message':'x'},
                                    {'code':'media_missing_id','severity':'error','message':'audio needs an id'}]})
        with patch.object(graphics,'hyperframes',return_value=(1,'log line\n'+out)):r=graphics.check(f)
        self.assertEqual((r['ok'],r['errors'],r['warnings']),(False,1,0));self.assertEqual(r['findings'],['error: audio needs an id'])

    def test_render_refuses_a_composition_with_lint_errors(self):
        f=graphics.create('Test')
        with patch.object(graphics,'check',return_value={'ok':False,'errors':1,'warnings':0,'findings':['error: broken']}):
            with self.assertRaises(ValueError):graphics.render(f)

@unittest.skipUnless(KIT_READY,'motion graphics toolchain not installed (make graphics)')
class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        p=patch.object(graphics,'RUNS',Path(self.tmp.name)/'graphics');p.start();self.addCleanup(p.stop)
        from fastapi import FastAPI
        app=FastAPI();app.include_router(graphics_app.router);self.client=TestClient(app)

    def test_create_edit_and_guard_files(self):
        img=png(Path(self.tmp.name)/'p.png',alpha=True)
        with img.open('rb') as fh:r=self.client.post('/graphics/jobs',data={'title':'Promo','size':'square'},files=[('images',('p.png',fh,'image/png'))])
        self.assertEqual(r.status_code,200,r.text);job=r.json();ident=job['id']
        self.assertEqual((job['size'],job['images'],job['stage']),('square',['assets/p.png'],'New'))
        r=self.client.put(f'/graphics/jobs/{ident}/content',json={'price':'$30'});self.assertEqual(r.status_code,200)
        self.assertEqual(next(v['default'] for v in r.json()['content'] if v['id']=='price'),'$30')
        self.assertEqual(self.client.put(f'/graphics/jobs/{ident}/content',json={'accent':'red'}).status_code,400)
        self.assertEqual(self.client.get(f'/graphics/jobs/{ident}/files/assets/p.png').status_code,200)
        for bad in ['renders/..%2Fjob.json','assets/.hidden','kit/motion-kit.js']:
            self.assertEqual(self.client.get(f'/graphics/jobs/{ident}/files/{bad}').status_code,404,bad)
        self.assertEqual(self.client.get('/graphics/jobs/not-a-job').status_code,404)
        self.assertEqual(self.client.post('/graphics/jobs',data={'size':'tall'}).status_code,400)

FAKE_CLAUDE='''#!/usr/bin/env python3
import json,os,sys
record=os.environ['FAKE_RECORD']
json.dump({'argv':sys.argv[1:],'api_key':'ANTHROPIC_API_KEY' in os.environ},open(record,'w'))
if os.environ.get('FAKE_EDIT'):
    with open(os.environ['FAKE_EDIT'],'a') as f:f.write('<!-- built -->')
print(json.dumps({'type':'assistant','message':{'content':[{'type':'tool_use','name':'Write','input':{'file_path':'/x/index.html'}}]}}))
result={'type':'result','is_error':False,'num_turns':3,'result':'Four scenes. Edit price and cta.'}
if os.environ.get('FAKE_BRIEF'):result['structured_output']=json.loads(os.environ['FAKE_BRIEF'])
print(json.dumps(result))
'''

@unittest.skipUnless(KIT_READY,'motion graphics toolchain not installed (make graphics)')
class ClaudeCodeTests(unittest.TestCase):
    BRIEF={'who':'15 s Reels ad','look':'#3B2314 brown','scenes':'0-3 s: hero','rules':'no emoji'}
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);t=Path(self.tmp.name)
        p=patch.object(graphics,'RUNS',t/'graphics');p.start();self.addCleanup(p.stop)
        exe=t/'claude';exe.write_text(FAKE_CLAUDE);exe.chmod(0o755);self.record=t/'record.json'
        e=patch.dict(os.environ,{'CLAUDE_BIN':str(exe),'FAKE_RECORD':str(self.record),'ANTHROPIC_API_KEY':'sk-test'});e.start();self.addCleanup(e.stop)
        self.f=graphics.create('Buna')

    def calls(self):return json.loads(self.record.read_text())

    def test_draft_uses_the_plan_not_the_api_key_and_keeps_the_request(self):
        drafted={**self.BRIEF,'rules':'price is [price]','content':{'headline':'ቡና ሰዓት','price':'[price]','accent':'warm brown','bg':'#2B1A10','image1':'x.jpg'}}
        with patch.dict(os.environ,{'FAKE_BRIEF':json.dumps(drafted)}):
            brief=graphics.draft_brief(self.f,'ለቡና ቤቴ ማስታወቂያ፣ 15 ሰከንድ',lambda m,p=None:None)
        c=self.calls();self.assertFalse(c['api_key'])
        self.assertIn('dontAsk',c['argv']);self.assertEqual(c['argv'][c['argv'].index('--tools')+1],'Read')
        self.assertTrue(brief['drafted']);self.assertEqual(brief['request'],'ለቡና ቤቴ ማስታወቂያ፣ 15 ሰከንድ')
        self.assertEqual(graphics.placeholders(brief),['[price]'])
        values={v['id']:v['default'] for v in graphics.content(self.f)}  # valid drafted values land in the content block
        self.assertEqual((values['headline'],values['price'],values['bg'],values['accent'],values['image1']),('ቡና ሰዓት','[price]','#2B1A10','#FFD60A','assets/placeholder-1.svg'))
        self.assertEqual(graphics.content_gaps(self.f),['price'])
        self.assertIn('headline',json.dumps(c['argv']))  # the fields to fill are part of the request to Claude
        with self.assertRaises(ValueError):graphics.build(self.f,'haiku')
        with self.assertRaises(ValueError):graphics.draft_brief(self.f,'ad')

    def test_build_waits_for_content_placeholders_and_sends_edited_values(self):
        graphics.save_brief(self.f,self.BRIEF);graphics.set_content(self.f,{'price':'[price]'})
        with self.assertRaises(ValueError):graphics.build(self.f,'haiku')
        graphics.set_content(self.f,{'price':'120 ብር'});self.assertIn('price (Price): 120 ብር',graphics.prompt(self.f))

    def test_build_is_scoped_backs_up_and_undo_restores(self):
        graphics.save_brief(self.f,self.BRIEF);before=(self.f/'index.html').read_text();lines=[]
        with patch.dict(os.environ,{'FAKE_EDIT':str(self.f/'index.html')}),patch.object(graphics,'render') as render:
            info=graphics.build(self.f,'haiku',lambda m,p=None:lines.append(m))
        render.assert_called_once()  # the fake stopped before rendering, so the draft is rendered afterwards
        argv=self.calls()['argv'];allowed=argv[argv.index('--allowedTools')+1:argv.index('--disallowedTools')]
        job=str(self.f.resolve())
        self.assertIn(f'Write(/{job}/**)',allowed);self.assertFalse(any(r.startswith('Bash(') and job not in r for r in allowed))
        self.assertTrue(any('.env' in r for r in argv[argv.index('--disallowedTools')+1:]))
        self.assertIn('Claude is writing index.html · step 1',lines);self.assertEqual(info['summary'],'Four scenes. Edit price and cta.')
        self.assertEqual((self.f/info['backup']).read_text(),before);self.assertTrue((self.f/'index.html').read_text().endswith('<!-- built -->'))
        graphics.undo_build(self.f);self.assertEqual((self.f/'index.html').read_text(),before);self.assertEqual(graphics.claude_runs(self.f),[])

    def test_changes_stack_and_undo_steps_back_one_at_a_time(self):
        graphics.save_brief(self.f,self.BRIEF);original=(self.f/'index.html').read_text()
        with patch.dict(os.environ,{'FAKE_EDIT':str(self.f/'index.html')}),patch.object(graphics,'render'):
            graphics.build(self.f,'haiku',lambda m,p=None:None);built=(self.f/'index.html').read_text()
            info=graphics.revise(self.f,'make the price bigger','haiku',lambda m,p=None:None)
        ask=self.calls()['argv'][1]  # after -p
        self.assertIn('make the price bigger',ask);self.assertIn('Make only this change',ask);self.assertIn('2-4 moments',ask)
        self.assertEqual([r['kind'] for r in graphics.claude_runs(self.f)],['build','change']);self.assertEqual(info['request'],'make the price bigger')
        graphics.undo_build(self.f);self.assertEqual((self.f/'index.html').read_text(),built)
        graphics.undo_build(self.f);self.assertEqual((self.f/'index.html').read_text(),original)
        with self.assertRaises(ValueError):graphics.undo_build(self.f)
        with self.assertRaises(ValueError):graphics.revise(self.f,'',)

    def test_projects_built_before_changes_existed_can_still_undo(self):
        (self.f/'history').mkdir();(self.f/'history/index-old.html').write_text('<old/>')
        graphics.write(self.f,'build.json',{'model':'sonnet','summary':'x','backup':'history/index-old.html','finished':1})
        self.assertEqual(graphics.claude_runs(self.f)[0]['kind'],'build')
        graphics.undo_build(self.f);self.assertEqual((self.f/'index.html').read_text(),'<old/>');self.assertFalse((self.f/'build.json').exists())

    def test_build_that_changes_nothing_fails_instead_of_rendering_the_starter(self):
        graphics.save_brief(self.f,self.BRIEF)
        with patch.object(graphics,'render') as render,self.assertRaises(RuntimeError) as e:graphics.build(self.f,'haiku',lambda m,p=None:None)
        render.assert_not_called();self.assertIn('without changing',str(e.exception))

    def test_activity_lines_are_plain_language(self):
        self.assertEqual(graphics.activity('Read',{'file_path':'/a/review/frame-01.png'},None),'Claude is looking at the review frames')
        self.assertEqual(graphics.activity('Read',{'file_path':'/a/assets/hero.jpg'},None),'Claude is looking at hero.jpg')
        self.assertEqual(graphics.activity('Bash',{'command':'/py graphics.py snapshot /a --at 1,2'},None),'Capturing frames to review')
