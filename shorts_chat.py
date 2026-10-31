"""Edit chat: the creator talks to Claude beside the live preview, and Claude changes the edit in place with small
tools (one graphic, a caption pause, a word, the look) instead of re-planning the video. Nothing is rebuilt, re-cut
or rendered; the preview reloads from plan.json and captions.json. The conversation is kept per video in chat.json,
and every turn that changed something can be undone (its files are backed up first in .chat-undo/).
Paid: one Claude API conversation turn per message, with the creator's ANTHROPIC_API_KEY (text only, no frames)."""
from pathlib import Path
import json,shutil,time
from pydantic import ValidationError
import shorts
from shorts import Event,Plan,Background,LOOKS,LOOK_NOTES,PALETTE

FILES=['plan.json','plan-warnings.json','full-captions.json','units.json','captions.json']  # what a chat turn may change
HISTORY=20  # earlier messages Claude sees (10 exchanges)
ROUNDS=12  # tool rounds in one turn
CAPTION_KEYS={'caption_preset','caption_font','caption_motion','caption_fill','caption_case','caption_place','caption_y','caption_speed','caption_size','highlight_color','emphasis','progress_bar'}
SETTING_KEYS=CAPTION_KEYS|{'graphics_style','transition','auto_sound'}
NAMES={'text':'text pop','sticker':'image','zoom':'zoom','shake':'shake','flash':'switch effect','sfx':'sound','broll':'screen recording',
       'card':'card','no_captions':'caption pause','look':'look switch','element':'graphic'}

SYSTEM="""You are the editing assistant inside a local editor for vertical short videos. The creator chats with you while watching
the live preview, and you change the edit with your tools: precisely, in place, and only what they ask.
- Change only what the creator asks. Never re-plan, restyle, retime or remove anything else. When a request could mean several
  items (which caption? which card?), ask one short question instead of guessing; when only one item fits, just do it.
- The creator points at moments by their words ("when I say ..."), by time, or by order ("the second card"). Find the words in
  the transcript and use their start times (edit seconds). Events are listed with # indexes that stay valid for the whole turn.
- Hide captions for a moment or a range: add a no_captions event from just before the first word's start to the last word's end.
  Hide all captions: update_settings caption_preset "none". Show them again: delete that no_captions event, or set a preset.
- Fix what a caption says: replace_words (part number, the exact old words as they appear in that part, the new words). It changes
  the text only; the voice and the cut stay as they are.
- Caption style for the whole video: update_settings (caption_preset, caption_font, caption_motion, caption_fill, caption_case,
  caption_place, caption_y, caption_speed, caption_size, highlight_color, emphasis, progress_bar).
- Graphics: update_event to change text, items, colours, timing, position, size or a library graphic's props (only the keys you
  change); add_event for a new one; delete_events to remove. Text goes in the language spoken (Amharic in Ethiopic script).
- Look: set_look with a look name and/or background field changes (pattern, lamp, tube, colours, strengths). A different look for
  only part of the video is a look event (start, end, look; original shows the real room).
- Graphics style, switch effect and sounds: update_settings graphics_style, transition, auto_sound; one-off sounds are sfx events.
- You cannot cut, reorder, re-transcribe, re-track or render. To remove or reorder spoken parts, tell the creator to untick them
  in the Cut section and rebuild. To see changes in a file, they render a new draft.
- Never cover the speaker's face: put text pops, cards and graphics where the face position line says there is room (the check
  moves anything that would cover it). Things the speaker names (vehicles, places, actions) go on an icons card with real icons
  ("car መኪና", "-car" crossed out, "+walk" ticked; icon names below), not chips.
- No yellow unless the creator asks (gold or cream then), no hard black text outlines, no emoji on cards unless the creator asks.
- When a tool returns an error, fix the call and try again, or tell the creator what is not possible.
- After the tools, reply in one or two short sentences in the creator's language (Amharic or English, as they wrote), saying
  what you changed or asking your question. No JSON, no lists of fields."""

TOOLS=[
 {'name':'update_event','description':'Change fields of one listed event. Only give the fields that change; props merges into the graphic\'s props.',
  'input_schema':{'type':'object','properties':{'index':{'type':'integer','description':'# of the event'},
   'changes':{'type':'object','description':'event fields and their new values'}},'required':['index','changes']}},
 {'name':'add_event','description':'Add one event (text pop, card, library graphic, zoom, shake, flash, sfx, sticker, broll, no_captions, look).',
  'input_schema':{'type':'object','properties':{'event':{'type':'object','description':'type, start, end and the fields it needs'}},'required':['event']}},
 {'name':'delete_events','description':'Remove events by #.',
  'input_schema':{'type':'object','properties':{'indexes':{'type':'array','items':{'type':'integer'}}},'required':['indexes']}},
 {'name':'update_settings','description':'Change video-wide settings: '+', '.join(sorted(SETTING_KEYS))+'.',
  'input_schema':{'type':'object','properties':{'changes':{'type':'object'}},'required':['changes']}},
 {'name':'set_look','description':'Change the background look: a named look and/or background fields.',
  'input_schema':{'type':'object','properties':{'look':{'type':'string','description':'look name, or empty to keep the current one'},
   'changes':{'type':'object','description':'background fields to change, e.g. pattern, lamp, tube, color, light_color, grade'}},'required':[]}},
 {'name':'replace_words','description':'Correct the words of one transcript part (what the captions say). The voice and cut stay.',
  'input_schema':{'type':'object','properties':{'part':{'type':'integer'},'old':{'type':'string','description':'exact words as written in the part'},
   'new':{'type':'string'}},'required':['part','old','new']}},
]

def reference():
    """The stable half of the context (cached): field reference, looks, palette, the graphics library, the style guide."""
    lib=shorts.element_catalog()
    parts=[SYSTEM,
     'Event fields (JSON schema):\n'+json.dumps(Event.model_json_schema(),ensure_ascii=False,separators=(',',':')),
     'Background fields (JSON schema):\n'+json.dumps(Background.model_json_schema(),ensure_ascii=False,separators=(',',':')),
     'Video settings (JSON schema):\n'+json.dumps({k:v for k,v in Plan.model_json_schema()['properties'].items() if k in SETTING_KEYS},ensure_ascii=False,separators=(',',':')),
     'Looks: '+'; '.join(f'{k} = {v}' for k,v in LOOK_NOTES.items()),
     'Accent palette: '+', '.join(f'{k} {v}' for k,v in PALETTE.items()),
     'Icon names for icons cards: '+', '.join(shorts.icon_names()),
     'Graphics library (type element; id: what it is · fields key=default):\n'+'\n'.join(
        f"- {i}: {m['description']} · "+', '.join(f"{f['key']}={json.dumps(f['default'],ensure_ascii=False)}" for f in m['fields']) for i,m in lib.items())]
    if shorts.STYLE_GUIDE.exists():parts.append('The creator\'s style guide:\n'+shorts.STYLE_GUIDE.read_text())
    return '\n\n'.join(parts)

def clock(t):return f'{int(t//60)}:{t%60:04.1f}'
def label(e):
    name=(shorts.element_catalog().get(e.element,{}).get('name') or e.element) if e.type=='element' else NAMES[e.type]
    words=e.text or ' · '.join(e.items[:2]) or next((str(v) for v in (e.props or {}).values() if isinstance(v,str) and v.strip()),'')
    return f'{name} at {clock(e.start)}'+(f' “{words[:32]}”' if words else '')

def state_text(folder,plan):
    """The edit as it is now: settings, numbered events, timed transcript parts, uploads."""
    folder=Path(folder);duration=json.loads((folder/'manifest.json').read_text())['duration']
    lines=[f'The edit now ({duration:.2f}s long; all times are edit seconds):',
     'Settings: '+json.dumps(plan.model_dump(include=SETTING_KEYS|{'captions_auto','graphics_auto'}),ensure_ascii=False),
     'Background: '+json.dumps(plan.background.model_dump(),ensure_ascii=False),shorts.face_note(folder,plan),'Events:']
    lines+=[f'#{i} '+json.dumps({k:round(v,3) if isinstance(v,float) else v for k,v in e.model_dump(exclude_defaults=True).items()},ensure_ascii=False)
            for i,e in enumerate(plan.events)] or ['(none)']
    lines.append('Transcript parts in the edit, [start s]word:')
    lines+=[f"part {u['id']}: "+' '.join(f"[{c['startMs']/1000:.2f}]{c['text'].strip()}" for c in words) for u,words in shorts.edit_words(folder) if words] or ['(no speech)']
    images=sorted(p.name for p in (folder/'assets').iterdir() if p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif')) if (folder/'assets').exists() else []
    lines.append('Uploaded images: '+(', '.join(images) or 'none')+' · screen recordings: '+(', '.join(shorts.load_clips(folder)) or 'none'))
    warnings=json.loads((folder/'plan-warnings.json').read_text()) if (folder/'plan-warnings.json').exists() else []
    if warnings:lines.append('Current warnings: '+'; '.join(warnings))
    return '\n'.join(lines)

def load(folder):
    path=Path(folder)/'chat.json'
    try:return json.loads(path.read_text())
    except (OSError,ValueError):return {'messages':[]}

def save(folder,chat):
    path=Path(folder)/'chat.json';tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(chat,ensure_ascii=False,indent=1));tmp.replace(path)

def clear(folder):
    folder=Path(folder);(folder/'chat.json').unlink(missing_ok=True);shutil.rmtree(folder/'.chat-undo',ignore_errors=True)

def history(chat):
    """Earlier turns as plain text: what was asked, what Claude said and changed (and whether the creator undid it)."""
    out=[]
    for m in chat['messages'][-HISTORY:]:
        if m['role']=='user':out.append({'role':'user','content':m['text']})
        else:
            text=m.get('text') or m.get('error','')
            if m.get('changes'):text+='\n(Changed: '+'; '.join(m['changes'])+')'
            if m.get('undone'):text+='\n(The creator undid these changes.)'
            out.append({'role':'assistant','content':text or '(no reply)'})
    while out and out[0]['role']!='user':out.pop(0)
    return out

class Turn:
    """One message's tool calls, applied to an in-memory plan; deleted events stay as None until the end so # indexes hold."""
    def __init__(self,folder):
        self.folder=Path(folder);self.plan=shorts.load_plan(folder);self.events=list(self.plan.events)
        self.changes=[];self.plan_changed=False;self.words_changed=False

    def event(self,i):
        if not isinstance(i,int) or not 0<=i<len(self.events) or self.events[i] is None:raise ValueError(f'There is no event #{i}.')
        return self.events[i]

    def run(self,name,args):
        if name=='update_event':
            old=self.event(args.get('index'));changes=dict(args.get('changes') or {});changes.pop('type',None)
            if 'props' in changes:changes['props']={**old.props,**(changes['props'] or {})}
            if {'x','y','size'}&changes.keys():changes['placed']=True  # moved on the creator's word: keep it there
            new=Event.model_validate({**old.model_dump(),**changes});self.events[args['index']]=new
            self.changes.append('Changed '+label(new));self.plan_changed=True
            return f"#{args['index']} is now "+json.dumps(new.model_dump(exclude_defaults=True),ensure_ascii=False)
        if name=='add_event':
            data=dict(args.get('event') or {})
            if data.get('type') in ('flash','sfx') and 'end' not in data and 'start' in data:data['end']=data['start']+.3
            new=Event.model_validate(data);self.events.append(new)
            self.changes.append('Added '+label(new));self.plan_changed=True
            return f'Added as #{len(self.events)-1}'
        if name=='delete_events':
            gone=[self.event(i) for i in args.get('indexes') or []]
            for i in args['indexes']:self.events[i]=None
            self.changes+=['Removed '+label(e) for e in gone];self.plan_changed=True
            return f'Removed {len(gone)}'
        if name=='update_settings':
            changes=dict(args.get('changes') or {});unknown=set(changes)-SETTING_KEYS
            if unknown:raise ValueError(f"Not a video setting: {', '.join(sorted(unknown))}. Settings are: {', '.join(sorted(SETTING_KEYS))}.")
            if CAPTION_KEYS&set(changes):changes['captions_auto']=False  # the creator chose: later planning keeps it
            if 'graphics_style' in changes:changes['graphics_auto']=False
            self.plan=Plan.model_validate({**self.plan.model_dump(),**changes})
            self.changes.append('Set '+', '.join(f'{k} {v}' for k,v in changes.items() if not k.endswith('_auto')));self.plan_changed=True
            return 'Settings changed'
        if name=='set_look':
            name_,changes=args.get('look') or '',dict(args.get('changes') or {})
            if name_ and name_ not in LOOKS:raise ValueError(f"Unknown look {name_}. Looks: {', '.join(LOOKS)}.")
            old=self.plan.background;base=shorts.look(name_).model_dump() if name_ else old.model_dump()
            if name_:base.update(pattern=old.pattern,lamp=old.lamp,lift=old.lift)  # the creator's light design and brightening stay when the wall changes
            self.plan.background=Background.model_validate({**base,**changes,'auto':False})
            self.changes.append('Look '+(name_ or 'adjusted')+(' ('+', '.join(changes)+')' if changes else ''));self.plan_changed=True
            return 'Look changed'
        if name=='replace_words':
            units=json.loads((self.folder/'units.json').read_text());part=args.get('part')
            if not isinstance(part,int) or not 0<=part<len(units):raise ValueError(f'There is no part {part}.')
            text=' '.join(units[part]['text'].split());old=' '.join(str(args.get('old','')).split());new=' '.join(str(args.get('new','')).split())
            if not old or old not in text:raise ValueError(f'"{old}" is not in part {part}. Its words are: {text}')
            fixed=text.replace(old,new,1)
            if not fixed.strip():raise ValueError('A part needs at least one word. To hide its captions, add a no_captions event instead.')
            shorts.edit_part(self.folder,part,fixed);self.words_changed=True
            self.changes.append(f'Caption words “{old}” → “{new}”')
            return f'Part {part} now reads: {fixed}'
        raise ValueError(f'Unknown tool {name}')

    def finish(self):
        """Save the plan once (checked like every plan); returns its warnings."""
        if not self.plan_changed:return []
        self.plan.events=[e for e in self.events if e is not None]
        return shorts.save_plan(self.folder,self.plan)[1]

def backup(folder,ident):
    folder=Path(folder);dest=folder/'.chat-undo'/ident;dest.mkdir(parents=True,exist_ok=True)
    for name in FILES:
        if (folder/name).exists():shutil.copy2(folder/name,dest/name)
    return dest

def send(folder,text):
    """One creator message: Claude edits with tools, then replies. Returns the updated chat."""
    import anthropic
    folder=Path(folder);chat=load(folder);text=text.strip()
    if not text:raise ValueError('Write what you want changed.')
    ident=str(int(time.time()*1000));saved=backup(folder,ident);turn=Turn(folder)
    client=anthropic.Anthropic(api_key=shorts.setting('ANTHROPIC_API_KEY') or None)
    messages=history(chat)+[{'role':'user','content':state_text(folder,turn.plan)+'\n\nThe creator says: '+text}]
    system=[{'type':'text','text':reference(),'cache_control':{'type':'ephemeral'}}]
    reply='';error=None
    try:
        for _ in range(ROUNDS):
            response=client.beta.messages.create(
                model=shorts.setting('SHORTS_CHAT_MODEL','claude-opus-5-5'),max_tokens=16000,output_config={'effort':'medium'},
                betas=['server-side-fallback-2026-07-01'],fallbacks='default',system=system,tools=TOOLS,messages=messages)
            if response.stop_reason=='refusal':raise RuntimeError('Claude declined this request.')
            reply=''.join(b.text for b in response.content if b.type=='text').strip() or reply
            calls=[b for b in response.content if b.type=='tool_use']
            if response.stop_reason!='tool_use' or not calls:
                if response.stop_reason=='max_tokens':raise RuntimeError('Claude ran out of room for this request. Ask for one change at a time.')
                break
            results=[]
            for call in calls:
                try:results.append({'type':'tool_result','tool_use_id':call.id,'content':turn.run(call.name,call.input)})
                except (ValueError,ValidationError,KeyError,TypeError) as e:
                    results.append({'type':'tool_result','tool_use_id':call.id,'content':f'Error: {e}','is_error':True})
            messages+=[{'role':'assistant','content':response.content},{'role':'user','content':results}]
        else:reply=reply or 'I stopped after many steps. Check the preview and tell me what is still missing.'
    except Exception as e:error=e
    warnings=turn.finish() if turn.changes else []  # changes made before a failure still count, and can be undone
    changed=turn.plan_changed or turn.words_changed
    if not changed:shutil.rmtree(saved,ignore_errors=True)
    chat['messages'].append({'role':'user','text':text,'time':time.time()})
    answer={'role':'assistant','text':reply,'changes':turn.changes,'warnings':warnings,'undo':ident if changed else None,'time':time.time()}
    if error is not None:answer['error']=str(error)
    chat['messages'].append(answer);save(folder,chat)
    if error is not None and not changed:raise error
    return chat

def undo(folder):
    """Put back the files from before the latest chat change that is not undone yet (one step per call)."""
    folder=Path(folder);chat=load(folder)
    last=next((m for m in reversed(chat['messages']) if m.get('undo') and not m.get('undone')),None)
    if not last:raise ValueError('There is no chat change to undo.')
    saved=folder/'.chat-undo'/last['undo']
    if not saved.exists():raise ValueError('The backup for that change is gone.')
    for name in FILES:
        if (saved/name).exists():shutil.copy2(saved/name,folder/name)
    last['undone']=True;save(folder,chat);return chat
