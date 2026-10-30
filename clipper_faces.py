"""Where the speaker is in part of a wide video, for the 9:16 crop of a YouTube moment (runs in .venv-face, no paid calls).
  python clipper_faces.py VIDEO START END OUT.json
Writes {"fps": 5, "samples": [[x, y, h] or null, ...], "cuts": [seconds from START, ...], "jolts": [[seconds, change], ...]}:
the face picked 5 times a second (x, y centre and height as fractions of the frame), the clear shot changes, and every
smaller picture change (a cut between two cameras on the same set can change little), all found on every frame."""
from pathlib import Path
import av,mediapipe as mp,numpy as np,sys,json,math,urllib.request
src,start,end,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),Path(sys.argv[4])
MODELS=Path(__file__).resolve().parent/'models'
URL='https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'
RATE=5;CUT=28.;JOLT=4.  # mean change (0-255) of a 64x36 grey thumbnail that counts as a new shot

def model():
 path=MODELS/'blaze_face_short_range.tflite'
 if not path.exists():
  MODELS.mkdir(exist_ok=True);tmp=path.with_suffix('.download');urllib.request.urlretrieve(URL,str(tmp));tmp.replace(path)
 return mp.tasks.BaseOptions(model_asset_path=str(path))

def faces(detector,rgb):
 """Every face, over overlapping square tiles: the short-range detector misses small faces in a whole wide frame."""
 H,W=rgb.shape[:2];found=[]
 for x0 in sorted({0,(W-H)//2,W-H}) if W>H else [0]:
  tile=np.ascontiguousarray(rgb[:,x0:x0+min(W,H)])
  for d in detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=tile)).detections:
   b=d.bounding_box;found.append(((x0+b.origin_x+b.width/2)/W,(b.origin_y+b.height/2)/H,b.height/H,d.categories[0].score))
 merged=[]  # one face seen by two tiles counts once
 for f in sorted(found,key=lambda f:-f[3]):
  if all(math.dist(f[:2],g[:2])>g[2]*.5 for g in merged):merged.append(f)
 return merged

def pick(found,last):
 """The main face: big and confident, and the same person as before unless someone clearly bigger appears."""
 if not found:return None
 def worth(f):return f[2]*f[3]*(1.6 if last and math.dist(f[:2],last[:2])<.12 else 1)
 return max(found,key=worth)

opts=mp.tasks.vision.FaceDetectorOptions(base_options=model(),running_mode=mp.tasks.vision.RunningMode.IMAGE,min_detection_confidence=.45)
samples=[];cuts=[];jolts=[];prev=None;last=None;total=max(.1,end-start)
with mp.tasks.vision.FaceDetector.create_from_options(opts) as detector,av.open(src) as inp:
 vs=inp.streams.video[0];inp.seek(int(max(0,start-2)/float(vs.time_base)),stream=vs,backward=True)
 for frame in inp.decode(video=0):
  t=float(frame.time or 0)
  if t<start:continue
  if t>=end:break
  thumb=frame.reformat(width=64,height=36,format='gray').to_ndarray().astype(np.float32)
  change=float(np.abs(thumb-prev).mean()) if prev is not None else 0.
  if change>CUT:cuts.append(round(t-start,3));last=None
  elif change>JOLT:jolts.append([round(t-start,3),round(change,1)])
  prev=thumb
  if len(samples)<=(t-start)*RATE:
   rgb=np.ascontiguousarray(frame.to_ndarray(format='rgb24'))  # PyAV pads rows; MediaPipe needs packed pixels
   f=pick(faces(detector,rgb),last);last=f or last
   samples.append([round(f[0],4),round(f[1],4),round(f[2],4)] if f else None)
   if len(samples)%10==0:print(f'PROGRESS {min(1,(t-start)/total):.3f}',flush=True)
out.write_text(json.dumps({'fps':RATE,'samples':samples,'cuts':cuts,'jolts':jolts}))
