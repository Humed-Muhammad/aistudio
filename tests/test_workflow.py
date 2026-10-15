import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch,Mock
import mask_review,seedance_bridge

class WorkflowTests(unittest.TestCase):
 def test_mask_changed_invalidates_approval(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in mask_review.FILES:(p/name).write_bytes(b'original')
   fingerprint=mask_review.fingerprint(p)
   mask_review.review(p,True,'Entire clip reviewed',fingerprint)
   mask_review.require_approved(p)
   (p/'mask.mp4').write_bytes(b'changed')
   with self.assertRaises(ValueError):mask_review.require_approved(p)
   with self.assertRaises(ValueError):mask_review.review(p,True,'stale',fingerprint)
 def test_existing_submission_not_requeued(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'seedance-response.json').write_text('{}')
   with patch('mask_review.require_approved'),patch('seedance_bridge.requests.post') as post:
    with self.assertRaises(ValueError):seedance_bridge.submit(p,'prompt','reference.png')
    post.assert_not_called()
 def test_edit_draft_self_contained(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'audio-manifest.json').write_text('{}')
   response=Mock();response.json.return_value={'requestId':'fake-id'}
   with patch('mask_review.require_approved'),patch('seedance_bridge.provider',return_value='enhancor'),patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.setting',return_value='https://example.org/callback'),patch('seedance_bridge.upload',return_value='https://example.org/media'),patch('audio_workflow.prepare_seedance_video',return_value=p/'seedance-input.mp4'),patch('seedance_bridge.requests.post',return_value=response) as post:
    seedance_bridge.submit(p,'Replace one subject','reference.png')
    payload=post.call_args.kwargs['json']
    self.assertTrue(payload['is_draft']);self.assertEqual(payload['mode'],'edit');self.assertEqual(payload['audios'],[]);self.assertEqual(len(payload['videos']),1)
    self.assertTrue((p/'generation.json').exists())
 def test_collection_downloads_and_restores(self):
  with tempfile.TemporaryDirectory() as d:
   response=Mock();response.json.return_value={'status':'COMPLETED','result':'https://example.org/result.mp4'}
   media=Mock();media.content=b'video'
   with patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.requests.post',return_value=response),patch('seedance_bridge.requests.get',return_value=media),patch('seedance_bridge.finish_preview') as restore:
    seedance_bridge.wait_and_finish(d,'fake-id')
    self.assertEqual((Path(d)/'seedance-result.mp4').read_bytes(),b'video');restore.assert_called_once()
 def test_hd_only_reuses_draft(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in ['upload.mp4','final-preview.mp4']:(p/name).write_bytes(b'test')
   (p/'generation.json').write_text(json.dumps({'request_id':'draft'}))
   (p/'seedance-request.json').write_text(json.dumps({'is_draft':True,'webhook_url':''}))
   response=Mock();response.json.return_value={'requestId':'hd-id'}
   with patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.requests.post',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit_hd(p),'hd-id')
    self.assertEqual(post.call_args.kwargs['json'],{'draft_id':'draft','webhook_url':''})
    with self.assertRaises(ValueError):seedance_bridge.submit_hd(p)

 def test_replicate_draft_uses_reference_fields(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'audio-manifest.json').write_text('{}')
   response=Mock(ok=True);response.json.return_value={'id':'pred-id'}
   with patch('mask_review.require_approved'),patch('mask_review.is_mesh',return_value=False),patch('seedance_bridge.provider',return_value='replicate'),patch('seedance_bridge.credential',return_value='test'),patch('audio_workflow.prepare_seedance_video',return_value=p/'seedance-input.mp4'),patch('seedance_bridge.seconds',return_value=6.4),patch('seedance_bridge.nearest_ratio',return_value='16:9'),patch('seedance_bridge.replicate_upload',side_effect=lambda path:'https://api.replicate.com/v1/files/'+Path(path).name),patch('seedance_bridge.requests.post',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit(p,'Replace @Image1 in @Video1','reference.png'),'pred-id')
    self.assertIn('models/bytedance/seedance-2.0/predictions',post.call_args.args[0])
    data=post.call_args.kwargs['json']['input']
    self.assertEqual(data['resolution'],'480p');self.assertEqual(data['duration'],6);self.assertEqual(len(data['reference_videos']),1);self.assertEqual(len(data['reference_images']),1)
    self.assertNotIn('@',data['prompt']);self.assertIn('[Video1]',data['prompt'])
    self.assertEqual(json.loads((p/'generation.json').read_text())['provider'],'replicate')
    self.assertEqual(seedance_bridge.saved_provider(p),'replicate')
 def test_replicate_refuses_long_reference_before_upload(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'audio-manifest.json').write_text('{}')
   with patch('mask_review.require_approved'),patch('mask_review.is_mesh',return_value=False),patch('seedance_bridge.provider',return_value='replicate'),patch('seedance_bridge.credential',return_value='test'),patch('audio_workflow.prepare_seedance_video',return_value=p/'seedance-input.mp4'),patch('seedance_bridge.seconds',return_value=20.0),patch('seedance_bridge.requests.post') as post:
    with self.assertRaises(ValueError):seedance_bridge.submit(p,'prompt','reference.png')
    post.assert_not_called()
 def test_replicate_hd_rerenders_same_seed_at_1080p(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in ['upload.mp4','final-preview.mp4']:(p/name).write_bytes(b'test')
   (p/'generation.json').write_text(json.dumps({'request_id':'draft'}))
   (p/'seedance-request.json').write_text(json.dumps({'provider':'replicate','is_draft':True,'input':{'prompt':'x','resolution':'480p','seed':7},'local_inputs':{'videos':['v.mp4'],'images':['i.png']}}))
   response=Mock(ok=True);response.json.return_value={'id':'hd-pred'}
   with patch('mask_review.require_approved'),patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.replicate_upload',return_value='https://example.org/f'),patch('seedance_bridge.requests.post',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit_hd(p),'hd-pred')
    data=post.call_args.kwargs['json']['input'];self.assertEqual(data['resolution'],'1080p');self.assertEqual(data['seed'],7)
    self.assertEqual(seedance_bridge.saved_provider(p/'hd'),'replicate')
 def test_replicate_collection_restores_audio(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'seedance-response.json').write_text(json.dumps({'requestId':'pred','provider':'replicate'}))
   media=Mock();media.content=b'video'
   with patch('seedance_bridge.credential',return_value='test'),patch('media_host.replicate_get',return_value={'status':'succeeded','output':'https://replicate.delivery/out.mp4'}),patch('seedance_bridge.requests.get',return_value=media),patch('seedance_bridge.finish_preview') as restore:
    seedance_bridge.wait_and_finish(d,'pred')
    self.assertEqual((Path(d)/'seedance-result.mp4').read_bytes(),b'video');restore.assert_called_once()

 def test_wan_job_sends_original_video_and_photo(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'workflow-mode.json').write_text(json.dumps({'mode':'wan'}))
   response=Mock(ok=True);response.json.return_value={'id':'wan-id'}
   with patch('mask_review.require_approved'),patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.replicate_upload',side_effect=lambda path:'https://example.org/'+Path(path).name),patch('seedance_bridge.requests.post',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit(p,'ignored','me.jpg'),'wan-id')
    self.assertIn('models/wan-video/wan-2.2-animate-replace/predictions',post.call_args.args[0])
    data=post.call_args.kwargs['json']['input']
    self.assertEqual(data['video'],'https://example.org/seedance-input.mp4');self.assertEqual(data['character_image'],'https://example.org/me.jpg')
    self.assertEqual(data['resolution'],'480');self.assertFalse(data['merge_audio']);self.assertNotIn('prompt',data)
    self.assertEqual(seedance_bridge.saved_provider(p),'wan')
    with self.assertRaises(ValueError):seedance_bridge.submit_wan(p,'me.mp4')
 def test_wan_hd_rerenders_at_720(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   for name in ['upload.mp4','final-preview.mp4']:(p/name).write_bytes(b'test')
   (p/'generation.json').write_text(json.dumps({'request_id':'draft'}))
   (p/'seedance-request.json').write_text(json.dumps({'provider':'wan','model':'wan-video/wan-2.2-animate-replace','is_draft':True,'hd_resolution':'720','input':{'resolution':'480','seed':3},'local_inputs':{'video':'v.mp4','character_image':'i.png'}}))
   response=Mock(ok=True);response.json.return_value={'id':'hd-wan'}
   with patch('mask_review.require_approved'),patch('seedance_bridge.credential',return_value='test'),patch('seedance_bridge.replicate_upload',return_value='https://example.org/f'),patch('seedance_bridge.requests.post',return_value=response) as post:
    self.assertEqual(seedance_bridge.submit_hd(p),'hd-wan')
    data=post.call_args.kwargs['json']['input'];self.assertEqual(data['resolution'],'720');self.assertEqual(data['seed'],3)
    self.assertEqual(seedance_bridge.saved_provider(p/'hd'),'wan')

if __name__=='__main__':unittest.main()
