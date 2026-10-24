"""Graphics library (motion/src/elements): the shipped pack is complete, values are cleaned, plans validate."""
import json,tempfile,unittest
from pathlib import Path
import shorts

def job(d):
    p=Path(d);(p/'assets').mkdir()
    (p/'manifest.json').write_text(json.dumps({'frames':300,'fps':30,'width':1080,'height':1920,'duration':10}))
    (p/'tracks.json').write_text(json.dumps({'fps':30,'width':1080,'height':1920,'frames':300,'cuts':[],'hands':{'left':[None]*300,'right':[None]*300},'face':[None]*300,'person':[0]*300}))
    (p/'captions.json').write_text(json.dumps({'captions':[{'text':' Hi','startMs':0,'endMs':300}]}))
    (p/'workflow-mode.json').write_text('{}')
    return p

class LibraryTests(unittest.TestCase):
    def test_pack_is_complete(self):
        lib=shorts.element_catalog()
        self.assertGreaterEqual(len(lib),30)
        for i,m in lib.items():
            self.assertTrue((shorts.ELEMENTS_DIR/m['source']/f'{i}.tsx').exists(),i)
            for key in ['name','category','description','duration','layout','x','y','sound','fields']:self.assertIn(key,m,f'{i}: {key}')
            self.assertIn(m['layout'],['anchored','full'],i)
            keys=[f['key'] for f in m['fields']];self.assertEqual(len(keys),len(set(keys)),i)
            for f in m['fields']:
                self.assertIn(f['type'],['text','longtext','color','number','select','toggle','list'],f'{i}.{f["key"]}')
                if f['type']=='select':self.assertIn(f['default'],f['options'],f'{i}.{f["key"]}')
            self.assertNotIn('#FFD60A',json.dumps(m).upper(),f'{i}: no yellow')  # the creator's rule

    def test_values_are_cleaned_to_each_field(self):
        meta=shorts.element_catalog()['number-counter']
        got=shorts.element_values(meta,{'value':'250','decimals':9,'label':'ደንበኞች','bogus':1})
        self.assertEqual(got,{'value':250.0,'decimals':2,'label':'ደንበኞች'})
        handle=shorts.element_catalog()['social-handle']
        self.assertEqual(shorts.element_values(handle,{'platform':'MySpace'})['platform'],'TikTok')  # unknown choice: default
        self.assertEqual(shorts.element_values(shorts.element_catalog()['checklist'],{'items':'a\n\nb'})['items'],['a','b'])

    def test_plan_keeps_library_graphics_and_drops_unknown_ones(self):
        with tempfile.TemporaryDirectory() as d:
            p=job(d)
            plan,warnings=shorts.save_plan(p,{'events':[{'type':'element','element':'hook-title','start':0,'end':3,'x':2,'props':{'line1':'ሰላም'}},{'type':'element','element':'nope','start':5,'end':6}]})
            self.assertEqual([(e.element,e.x,e.props) for e in plan.events],[('hook-title',1.0,{'line1':'ሰላም'})])
            self.assertTrue(any('"nope" is not in the library' in w for w in warnings))
            text,_=shorts.planner_context(p)
            self.assertIn('Graphics library (type element',text);self.assertIn('- hook-title:',text)

    def test_planner_schema_accepts_library_graphics(self):
        plan=shorts.PlannerPlan.model_validate({'caption_preset':'duo','caption_y':.7,'highlight_color':'#6EC1FF','progress_bar':False,'look':'original','light':'pool','graphics_style':'glass','emphasis':[],'notes':'',
            'events':[{'type':'element','start':1,'end':3,'element':'checklist','props':{'items':['a','b']},'x':.5,'y':.35}]}).to_plan()
        self.assertEqual((plan.events[0].type,plan.events[0].element),('element','checklist'))

if __name__=='__main__':unittest.main()

FAKE='''import json,os,re,sys
p=sys.argv[2];gid=re.search(r'"id" in the JSON must be "([^"]+)"',p).group(1)
mine=re.search(r'these absolute paths: (\\S+)\\.json',p).group(1).rsplit('/',1)[0]
m={"id":gid,"name":"Fake "+gid,"category":"Test","description":"d","duration":2,"layout":"anchored","x":.5,"y":.5,"sound":"none","fields":[]}
open(f"{mine}/{gid}.json","w").write(json.dumps(m));open(f"{mine}/{gid}.tsx","w").write(os.environ.get("FAKE_TSX","export default function X() { return null; }"))
print(json.dumps({"type":"result","result":"done","is_error":False}))
'''

class MakeAndChangeTests(unittest.TestCase):
    """Describe / change / undo / delete / hide, with a stand-in for Claude Code and a temporary library."""
    def setUp(self):
        import library,os,sys,stat
        from unittest.mock import patch
        self.d=tempfile.TemporaryDirectory();root=Path(self.d.name)
        mine=root/'mine';self.lib=library
        fake=root/'claude';fake.write_text(f'#!{sys.executable}\n'+FAKE);fake.chmod(fake.stat().st_mode|stat.S_IEXEC)
        self.p=[patch.object(library,'MINE',mine),patch.object(library,'HISTORY',mine/'.history'),patch.object(library,'REVIEW',mine/'.review'),
                patch.object(library,'HIDDEN',mine/'hidden.json'),patch.object(library,'rebuild_studio',lambda:None),patch.object(library,'node',lambda *a,**k:None),
                patch.object(library,'check',lambda gid,stills=None:(os.environ.get('FAKE_OK','1')=='1','TypeScript errors: broken')),
                patch.dict(os.environ,{'CLAUDE_BIN':str(fake)})]
        for x in self.p:x.start()
    def tearDown(self):
        for x in reversed(self.p):x.stop()
        self.d.cleanup()

    def test_make_change_undo_delete(self):
        lib=self.lib;info=lib.make('A neon OPEN sign that flickers on',status=lambda *a:None)
        gid=info['id'];self.assertEqual(gid,'neon-open-sign-flickers');self.assertEqual(lib.find(gid),'mine')
        lib.change(gid,'slower please',status=lambda *a:None);self.assertEqual(len(lib.versions(gid)),1)
        lib.undo(gid);self.assertEqual(lib.versions(gid),[])
        lib.delete(gid);self.assertIsNone(lib.find(gid))

    def test_a_failed_check_never_joins_the_library(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ,{'FAKE_OK':'0'}):
            with self.assertRaisesRegex(RuntimeError,'set aside'):self.lib.make('a broken thing to test',status=lambda *a:None)
        self.assertEqual(list(self.lib.MINE.glob('*.tsx')),[])  # moved to history, not kept

    def test_pack_graphics_are_copied_not_changed_and_only_hidden(self):
        lib=self.lib;before=(lib.PACK/'topic-badge.tsx').read_text()
        info=lib.change('topic-badge','make it green',status=lambda *a:None)
        self.assertEqual(info['id'],'topic-badge-mine');self.assertEqual((lib.PACK/'topic-badge.tsx').read_text(),before)
        with self.assertRaisesRegex(ValueError,'only be hidden'):lib.delete('topic-badge')
        self.assertEqual(lib.set_hidden('topic-badge'),['topic-badge']);self.assertEqual(lib.set_hidden('topic-badge',False),[])
