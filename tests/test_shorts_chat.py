import unittest,tempfile,json
from types import SimpleNamespace as NS
from unittest.mock import patch,Mock
import shorts,shorts_chat
from tests.test_shorts import job

def chat_job(d):
 p=job(d)
 words=[(' Hello',0,400),(' world',400,800),(' ehh',800,1000),(' this',1200,1500),(' is',1500,1700),(' AI',1700,2100)]
 caps=[{'text':w,'startMs':s,'endMs':e,'timestampMs':None,'confidence':1} for w,s,e in words]
 (p/'full-captions.json').write_text(json.dumps({'language':'en','captions':caps}))
 (p/'units.json').write_text(json.dumps(shorts.make_units(caps)))
 shorts.save_plan(p,{'events':[{'type':'text','start':.5,'end':1.5,'text':'HOOK'},{'type':'zoom','start':2,'end':2.5}]})
 return p

def reply(*blocks,stop='end_turn'):return NS(content=list(blocks),stop_reason=stop)
def text(t):return NS(type='text',text=t)
def tool(i,name,args):return NS(type='tool_use',id=i,name=name,input=args)

def run(p,message,responses):
 client=Mock();client.beta.messages.create.side_effect=responses
 with patch('anthropic.Anthropic',return_value=client),patch('shorts.setting',lambda name,default='':default):
  return shorts_chat.send(p,message),client

class EditChatTests(unittest.TestCase):
 def test_tools_change_only_what_was_asked(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d);t=shorts_chat.Turn(p)
   t.run('update_event',{'index':0,'changes':{'text':'NEW HOOK','type':'card'}})
   t.run('add_event',{'event':{'type':'no_captions','start':1.1,'end':2.1}})
   t.run('delete_events',{'indexes':[1]})
   t.run('update_settings',{'changes':{'caption_preset':'none'}})
   with self.assertRaises(ValueError):t.run('update_settings',{'changes':{'events':[]}})
   with self.assertRaises(ValueError):t.run('update_event',{'index':1,'changes':{'text':'gone'}})
   t.finish();plan=shorts.load_plan(p)
   self.assertEqual([(e.type,e.text) for e in plan.events],[('text','NEW HOOK'),('no_captions','')])
   self.assertEqual(plan.caption_preset,'none');self.assertFalse(plan.captions_auto)
   self.assertEqual(len(t.changes),4)

 def test_set_look_keeps_the_light_design(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d);t=shorts_chat.Turn(p);t.plan.background.pattern='halo';t.plan.background.lift=.4
   t.run('set_look',{'look':'studio_teal','changes':{'tube':'right'}})
   bg=t.plan.background
   self.assertEqual((bg.look,bg.pattern,bg.tube,bg.auto,bg.lift),('studio_teal','halo','right',False,.4))
   t.run('set_look',{'changes':{'lift':3}});t.finish()
   self.assertEqual(shorts.load_plan(p).background.lift,1.)  # clamped like every strength
   with self.assertRaises(ValueError):t.run('set_look',{'look':'studio_yellow'})

 def test_replace_words_fixes_captions_in_place(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d);t=shorts_chat.Turn(p)
   with self.assertRaises(ValueError):t.run('replace_words',{'part':0,'old':'nothing','new':'x'})
   t.run('replace_words',{'part':0,'old':'world','new':'everyone'})
   caps=json.loads((p/'captions.json').read_text())['captions']
   self.assertEqual([c['text'].strip() for c in caps][:2],['Hello','everyone']);self.assertTrue(t.words_changed)

 def test_send_keeps_history_and_undo_restores(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d);before=(p/'plan.json').read_text()
   chat,client=run(p,'Hide the captions when I say this is AI',[
    reply(tool('a','add_event',{'event':{'type':'no_captions','start':1.15,'end':2.1}}),stop='tool_use'),
    reply(text('Done: captions are hidden for "this is AI".'))])
   last=chat['messages'][-1]
   self.assertEqual(last['text'],'Done: captions are hidden for "this is AI".');self.assertTrue(last['undo'])
   self.assertIn('no_captions',[e.type for e in shorts.load_plan(p).events])
   sent=client.beta.messages.create.call_args_list[1].kwargs
   self.assertEqual(sent['messages'][-1]['content'][0]['type'],'tool_result')
   self.assertIn('[1.20]this',sent['messages'][0]['content'])  # timed words of the edit
   # The next message sees the earlier exchange and what changed.
   chat,client=run(p,'Thanks',[reply(text('You are welcome.'))])
   sent=client.beta.messages.create.call_args.kwargs['messages']
   self.assertEqual(sent[0],{'role':'user','content':'Hide the captions when I say this is AI'})
   self.assertIn('Changed: Added caption pause',sent[1]['content'])
   self.assertIsNone(chat['messages'][-1]['undo'])
   shorts_chat.undo(p);self.assertEqual((p/'plan.json').read_text(),before)
   with self.assertRaises(ValueError):shorts_chat.undo(p)

 def test_tool_errors_go_back_to_claude(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d)
   chat,client=run(p,'change card 9',[
    reply(tool('a','update_event',{'index':9,'changes':{'text':'x'}}),stop='tool_use'),
    reply(text('There is no such card. Which one do you mean?'))])
   result=client.beta.messages.create.call_args.kwargs['messages'][-1]['content'][0]
   self.assertTrue(result['is_error']);self.assertIn('no event #9',result['content'])
   self.assertIsNone(chat['messages'][-1]['undo'])
   self.assertFalse(any((p/'.chat-undo').iterdir()))

 def test_failure_without_changes_raises_and_is_recorded(self):
  with tempfile.TemporaryDirectory() as d:
   p=chat_job(d)
   with self.assertRaises(RuntimeError):run(p,'do it',[reply(stop='refusal')])
   self.assertIn('declined',shorts_chat.load(p)['messages'][-1]['error'])

if __name__=='__main__':unittest.main()
