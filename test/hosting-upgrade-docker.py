"""Disposable real Docker runtime upgrade, rollback and interrupted-operation recovery."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'scripts'))
def load(name):
 spec=importlib.util.spec_from_file_location(name,root/'scripts'/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
agent=load('hosting-node-agent');upgrade=load('hosting-node-upgrade');bundle=root/'test/fixtures/static-hosting'
images=[]
for tag in ['nginx:alpine','nginx:stable-alpine']:
 subprocess.run(['docker','pull',tag],check=True)
 images.append(json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['RepoDigests'][0])
assert images[0]!=images[1]
descriptor={'protocolVersion':2,'projectPrefix':'upgrade','weights':{'site':1},'appServices':['site'],'healthyServices':[], 'httpChecks':['/'],'minMemoryMb':128,'volumes':['pages'],'files':['docker-compose.prod.yml'],'ingressService':'site','ingressPort':80,'infrastructureServices':[],'infrastructureHealthyServices':[],'imageVariables':['APP_IMAGE'],'originVariable':None,'originServices':[],'backupScript':'backup.sh','initialization':[],'bundle':str(bundle),'hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.iterdir() if p.is_file()}}
with tempfile.TemporaryDirectory() as tmp:
 workspace=Path(tmp);did=str(uuid.uuid4());project='upgrade-'+did.replace('-','');directory=workspace/did
 fake=workspace/'restic';fake.write_text('#!/bin/sh\nexit 0\n');fake.chmod(0o700);password=workspace/'password';password.write_text('fixture');password.chmod(0o600)
 backups=workspace/'backups';backups.mkdir()
 config={'nodeId':str(uuid.uuid4()),'snapshotImage':images[0],'adapters':{'static_sample':descriptor},'useCachedImagesOnly':True,'backupRoot':str(backups),'offsite':{'binary':str(fake),'passwordFile':str(password),'repository':str(workspace/'repo'),'sftpCommand':'false'}}
 if os.environ.get('STACK_UPGRADE_OFFSITE_CONFIG'):
  config['offsite']=json.loads(Path(os.environ['STACK_UPGRADE_OFFSITE_CONFIG']).read_text())['offsite']
 def restic(args):
  o=config['offsite'];return subprocess.check_output([o['binary'],'-o','sftp.command='+o['sftpCommand'],*args],env={**os.environ,'RESTIC_REPOSITORY':o['repository'],'RESTIC_PASSWORD_FILE':o['passwordFile'],'GOMEMLIMIT':'256MiB'},stderr=subprocess.DEVNULL)
 job={'id':str(uuid.uuid4()),'deploymentId':did,'appCode':'static_sample','hostname':'upgrade.example.test','env':{'APP_IMAGE':images[0]},'resources':{'memoryMb':128,'cpuMillis':250}}
 def plan(source,target):return {'id':str(uuid.uuid4()),'appCode':'static_sample','label':'Reviewed fixture','fromImage':source,'toImage':target,'schemaPolicy':'no-migration','reviewEvidence':'Same static runtime; persistent data verified'}
 def operation():return {'id':str(uuid.uuid4()),'deploymentId':did,'nodeId':config['nodeId'],'kind':'upgrade'}
 try:
  agent.execute(job,config,workspace)
  cid=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).strip()
  subprocess.run(['docker','exec',cid,'sh','-c','echo upgrade-persistence > /usr/share/nginx/html/proof.txt'],check=True)
  first=plan(*images);config['upgradeReleases']=[first];op=operation()
  proof=upgrade.execute(config,directory,op,lambda _:first);assert proof['outcome']=='upgraded' and proof['backup']
  assert proof==upgrade.execute(config,directory,op,lambda _:first)
  if os.environ.get('STACK_UPGRADE_OFFSITE_CONFIG'):
   snapshots=json.loads(restic(['snapshots','--json','--tag','deployment:'+did]));assert snapshots
   assert restic(['dump',snapshots[-1]['id'],str(backups/proof['backup']['backupId']/'SHA256SUMS')])==(backups/proof['backup']['backupId']/'SHA256SUMS').read_bytes()
  # Real rollback: fail the new Compose launch only, then execute the old Compose launch.
  second=plan(images[1],images[0]);config['upgradeReleases']=[second];op=operation();original=upgrade.subprocess.run;failed=[False]
  def failing(args,*a,**kw):
   if 'up' in args and '--force-recreate' in args and not failed[0]:failed[0]=True;raise subprocess.CalledProcessError(1,args)
   return original(args,*a,**kw)
  with patch.object(upgrade.subprocess,'run',side_effect=failing):proof=upgrade.execute(config,directory,op,lambda _:second)
  assert proof['outcome']=='rolled_back' and proof['runningImage']==images[1]
  # Simulated process interruption after original config and intention persisted; next attempt restores only old code.
  op=operation();original_store=upgrade.store;interrupted=[False]
  def crash(path,value):
   original_store(path,value)
   if path.name==op['id']+'.json' and value.get('phase')=='applying' and not interrupted[0]:interrupted[0]=True;raise KeyboardInterrupt()
  try:
   with patch.object(upgrade,'store',side_effect=crash):upgrade.execute(config,directory,op,lambda _:second)
   raise AssertionError('Expected interruption')
  except KeyboardInterrupt:pass
  proof=upgrade.execute(config,directory,op,lambda _:second);assert proof['outcome']=='rolled_back'
  # Revoked/unapproved targets are rejected without stopping the running service.
  config['upgradeReleases']=[];op=operation();proof=upgrade.execute(config,directory,op,lambda _:second);assert proof['outcome']=='rejected'
  cid=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).strip()
  assert b'upgrade-persistence' in subprocess.check_output(['docker','exec',cid,'cat','/usr/share/nginx/html/proof.txt'])
  assert json.loads((directory/'execution.json').read_text())['phase']=='runtime_ready'
  print(json.dumps({'realDockerUpgrade':True,'completionReplay':True,'failedLaunchRollback':True,'interruptedRollback':True,'unapprovedReleaseRejected':True,'persistentDataVerified':True,'realEncryptedOffsiteRoundTrip':bool(os.environ.get('STACK_UPGRADE_OFFSITE_CONFIG')),'productionCustomerModified':False}))
 finally:
  if os.environ.get('STACK_UPGRADE_OFFSITE_CONFIG'):
   snapshots=json.loads(restic(['snapshots','--json','--tag','deployment:'+did]));snapshot_ids=[s['id'] for s in snapshots if s.get('tags')==['deployment:'+did]]
   if snapshot_ids:restic(['forget',*snapshot_ids])
  ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
  if ids:subprocess.run(['docker','rm','-f',*ids],check=True)
  for volume in descriptor['volumes']:subprocess.run(['docker','volume','rm',project+'_'+volume],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  networks=subprocess.check_output(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+project],text=True).split()
  if networks:subprocess.run(['docker','network','rm',*networks],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
