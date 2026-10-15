"""Local tracking for the shorts editor (runs in .venv-face). No paid calls.
Writes tracks.json (hands, gestures, face, cuts), foreground.webm (person cutout with alpha),
keyframes/*.jpg for planning and tracking-preview.mp4 for review."""
from pathlib import Path
from fractions import Fraction
import av, mediapipe as mp, numpy as np, sys, json, math, urllib.request
from PIL import Image, ImageDraw
root=Path(sys.argv[1]).resolve()
MODELS=Path(__file__).resolve().parent/'models'
URLS={'gesture_recognizer.task':'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
 'blaze_face_short_range.tflite':'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
 'selfie_multiclass_256x256.tflite':'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'}
GESTURES={'Open_Palm':'open_palm','Closed_Fist':'fist','Pointing_Up':'point','Thumb_Up':'thumbs_up','Victory':'peace','ILoveYou':'rock','Thumb_Down':'thumbs_down'}
GAP=6  # bridge tracking gaps up to this many frames inside one shot

def model(name):
 path=MODELS/name
 if not path.exists():
  MODELS.mkdir(exist_ok=True);tmp=path.with_suffix('.download')
  urllib.request.urlretrieve(URLS[name],str(tmp));tmp.replace(path)
 return mp.tasks.BaseOptions(model_asset_path=str(path))

class OneEuro:
 """Low jitter when still, low lag when moving."""
 def __init__(s,fps,mincut=1.2,beta=0.6):s.fps,s.mincut,s.beta,s.x,s.dx=fps,mincut,beta,None,0.
 def __call__(s,x):
  if s.x is None:s.x=x;return x
  a=lambda c:1/(1+s.fps/(2*math.pi*c))
  dx=(x-s.x)*s.fps;s.dx+=a(1.)*(dx-s.dx);s.x+=a(s.mincut+s.beta*abs(s.dx))*(x-s.x);return s.x

def find_face(detector,rgb,W,H):
 """Best face over overlapping square tiles: a whole portrait frame is letterboxed and faces shrink."""
 best=None
 for y0 in sorted({0,(H-W)//2,H-W}) if H>W else [0]:
  tile=np.ascontiguousarray(rgb[y0:y0+min(W,H)])
  for d in detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=tile)).detections:
   b=d.bounding_box;score=d.categories[0].score
   if not best or score>best[0]:best=(score,[(b.origin_x+b.width/2)/W,(y0+b.origin_y+b.height/2)/H,b.height/H,''])
 return best[1] if best else None

def hand_record(lm,gesture,W,H):
 p=np.array([[l.x*W,l.y*H] for l in lm])
 palm=p[[0,5,9,13,17]].mean(0);scale=np.linalg.norm(p[9]-p[0])
 g=GESTURES.get(gesture,'none')
 if g=='none' and np.linalg.norm(p[4]-p[8])<.35*scale:g='pinch'
 return [palm[0]/W,palm[1]/H,p[8][0]/W,p[8][1]/H,scale/H,g]

def assign(hands,last):
 """Name hands by screen side (viewer's left/right) and keep identity when one hand is visible."""
 out={'left':None,'right':None}
 if len(hands)>=2:
  a,b=sorted(hands[:2],key=lambda h:h[0]);out['left'],out['right']=a,b
 elif hands:
  h=hands[0];dist={k:math.dist(h[:2],last[k][:2]) for k in out if last[k]}
  near=min(dist,key=dist.get) if dist and min(dist.values())<.25 else None
  out[near or ('left' if h[0]<.5 else 'right')]=h
 return out

def smooth(track,cuts,fps,n):
 """Fill short gaps within a shot, then One-Euro filter numeric fields; reset at cuts."""
 track=list(track);shot=np.searchsorted(cuts,np.arange(n),side='right')
 seen=[i for i,v in enumerate(track) if v]
 for a,b in zip(seen,seen[1:]):
  if 1<b-a<=GAP+1 and shot[a]==shot[b]:
   for i in range(a+1,b):
    t=(i-a)/(b-a);track[i]=[track[a][k]+(track[b][k]-track[a][k])*t for k in range(len(track[a])-1)]+[track[a][-1]]
 filters=None
 for i,v in enumerate(track):
  if not v or (i and shot[i]!=shot[i-1]) or (i and not track[i-1]):filters=None
  if not v:continue
  filters=filters or [OneEuro(fps) for _ in v[:-1]]
  track[i]=[round(f(x),4) for f,x in zip(filters,v[:-1])]+v[-1:]
 return track

source=root/'source.mp4'
total=max(1,json.loads((root/'manifest.json').read_text())['frames']) if (root/'manifest.json').exists() else 0
def progress(value):
 if total:print(f'PROGRESS {min(1,value):.3f}',flush=True)
with av.open(str(source)) as c:
 vs=c.streams.video[0];fps=round(float(vs.average_rate));W,H=vs.width,vs.height
Path(root/'keyframes').mkdir(exist_ok=True)
gesture_opts=mp.tasks.vision.GestureRecognizerOptions(base_options=model('gesture_recognizer.task'),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_hands=2,min_hand_detection_confidence=.45,min_hand_presence_confidence=.45,min_tracking_confidence=.45)
face_opts=mp.tasks.vision.FaceDetectorOptions(base_options=model('blaze_face_short_range.tflite'),running_mode=mp.tasks.vision.RunningMode.IMAGE,min_detection_confidence=.4)
seg_opts=mp.tasks.vision.ImageSegmenterOptions(base_options=model('selfie_multiclass_256x256.tflite'),running_mode=mp.tasks.vision.RunningMode.VIDEO,output_confidence_masks=True,output_category_mask=False)
raw_hands=[];faces=[];cuts=[];coverage=[];previous=None;alpha_prev=None;last={'left':None,'right':None}
with mp.tasks.vision.GestureRecognizer.create_from_options(gesture_opts) as gestures, mp.tasks.vision.FaceDetector.create_from_options(face_opts) as detector, mp.tasks.vision.ImageSegmenter.create_from_options(seg_opts) as segmenter, av.open(str(source)) as inp, av.open(str(root/'foreground.webm'),'w') as out:
 fg=out.add_stream('libvpx-vp9',rate=fps);fg.width,fg.height,fg.pix_fmt=W,H,'yuva420p';fg.options={'crf':'32','b':'0','deadline':'realtime','cpu-used':'8','row-mt':'1'}
 for i,frame in enumerate(inp.decode(video=0)):
  rgb=np.ascontiguousarray(frame.to_ndarray(format='rgb24'))  # PyAV pads rows; MediaPipe needs packed pixels
  if i%15==0:progress(.9*i/total)
  ms=round(i*1000/fps);image=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
  small=np.asarray(Image.fromarray(rgb).convert('L').resize((64,64)),dtype=np.float32)
  if previous is not None and np.abs(small-previous).mean()>28:cuts.append(i);alpha_prev=None
  previous=small
  if i%fps==0 and i//fps%2==0:Image.fromarray(rgb).resize((360,round(360*H/W))).save(root/f'keyframes/{i/fps:07.2f}.jpg',quality=80)
  result=gestures.recognize_for_video(image,ms)
  hands=[hand_record(lm,(g[0].category_name if g else ''),W,H) for lm,g in zip(result.hand_landmarks,result.gestures)]
  current=assign(hands,last);raw_hands.append(current);last={k:current[k] or (None if i in cuts else last[k]) for k in last}
  faces.append(find_face(detector,rgb,W,H))
  background=segmenter.segment_for_video(image,ms).confidence_masks[0].numpy_view()
  person=np.clip((1-background.squeeze()-.35)/.3,0,1)
  if alpha_prev is not None:person=.6*person+.4*alpha_prev
  alpha_prev=person;coverage.append(round(float(person.mean()),3))
  mask=(person*255).astype(np.uint8)  # MediaPipe returns a soft mask already upsampled to frame size
  if mask.shape!=(H,W):mask=np.asarray(Image.fromarray(mask).resize((W,H),Image.Resampling.BILINEAR))
  rgba=np.dstack([rgb,mask])
  vf=av.VideoFrame.from_ndarray(rgba,format='rgba').reformat(format='yuva420p');vf.pts=i;vf.time_base=Fraction(1,fps)
  for p in fg.encode(vf):out.mux(p)
 for p in fg.encode():out.mux(p)
n=len(raw_hands)
tracks={'fps':fps,'width':W,'height':H,'frames':n,'cuts':cuts,
 'hands':{k:smooth([h[k] for h in raw_hands],cuts,fps,n) for k in ['left','right']},
 'face':smooth(faces,cuts,fps,n),'person':coverage}
(root/'tracks.json').write_text(json.dumps(tracks,separators=(',',':')))

# Review preview: draws exactly the smoothed data the renderer will follow.
PW=360;PH=round(PW*H/W)//2*2
with av.open(str(source)) as inp, av.open(str(root/'tracking-preview.mp4'),'w') as out:
 st=out.add_stream('libx264',rate=fps);st.width,st.height,st.pix_fmt=PW,PH,'yuv420p';st.options={'crf':'26'}
 for i,frame in enumerate(inp.decode(video=0)):
  im=frame.to_image().resize((PW,PH));d=ImageDraw.Draw(im)
  if i%60==0:progress(.9+.1*i/total)
  for side,col in [('left',(255,200,40)),('right',(80,220,255))]:
   h=tracks['hands'][side][i]
   if h:
    x,y,tx,ty,s,g=h;r=max(4,s*PH*.5)
    d.ellipse([x*PW-r,y*PH-r,x*PW+r,y*PH+r],outline=col,width=2);d.ellipse([tx*PW-3,ty*PH-3,tx*PW+3,ty*PH+3],fill=col)
    d.text((x*PW+r+3,y*PH-6),f'{side} {g}',fill=col)
  f=tracks['face'][i]
  if f:x,y,s,_=f;d.rectangle([(x-s*H/W*.4)*PW,(y-s/2)*PH,(x+s*H/W*.4)*PW,(y+s/2)*PH],outline=(140,255,140),width=2)
  if i in cuts:d.rectangle([0,0,PW-1,PH-1],outline=(255,60,60),width=6)
  d.text((6,6),f'{i/fps:5.2f}s',fill=(255,255,255))
  vf=av.VideoFrame.from_image(im);vf.pts=i;vf.time_base=Fraction(1,fps)
  for p in st.encode(vf):out.mux(p)
 for p in st.encode():out.mux(p)
seen=lambda t:sum(bool(v) for v in t)
print(json.dumps({'frames':n,'cuts':len(cuts),'left_hand_frames':seen(tracks['hands']['left']),'right_hand_frames':seen(tracks['hands']['right']),'face_frames':seen(tracks['face'])}))
