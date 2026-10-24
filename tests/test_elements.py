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
