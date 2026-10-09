"""Real Docker acceptance: a static nginx application, no API, worker or database."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,time,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
spec=importlib.util.spec_from_file_location('agent',root/'scripts/hosting-node-agent.py')
agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
spec=importlib.util.spec_from_file_location('backup',root/'scripts/hosting-node-backup.py')
backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
bundle=root/'test/fixtures/static-hosting'
subprocess.run(['docker','pull','nginx:alpine'],check=True)
image=json.loads(subprocess.check_output(['docker','image','inspect','nginx:alpine']))[0]['RepoDigests'][0]
descriptor={'protocolVersion':2,'projectPrefix':'static','weights':{'site':1},'appServices':['site'],'healthyServices':[],
 'httpChecks':['/'],'minMemoryMb':128,'volumes':['pages'],'files':['docker-compose.prod.yml'],'ingressService':'site','ingressPort':80,
 'infrastructureServices':[],'infrastructureHealthyServices':[],'imageVariables':['APP_IMAGE'],'originVariable':None,'originServices':[],
 'backupScript':'backup.sh','initialization':[],'bundle':str(bundle),'hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.iterdir() if p.is_file()}}
with tempfile.TemporaryDirectory() as tmp:
 workspace=Path(tmp);did=str(uuid.uuid4());project='static-'+did.replace('-','')
 config={'nodeId':str(uuid.uuid4()),'snapshotImage':image,'adapters':{'static_sample':descriptor},'useCachedImagesOnly':True,'backupRoot':str(workspace/'backups')}
 job={'id':str(uuid.uuid4()),'deploymentId':did,'appCode':'static_sample','hostname':'static.example.test','env':{'APP_IMAGE':image},'resources':{'memoryMb':128,'cpuMillis':250}}
 try:
  agent.execute(job,config,workspace)
  agent.execute(job,config,workspace) # replay uses same owned data
  cid=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).strip()
  subprocess.run(['docker','exec',cid,'sh','-c','echo persistent-proof > /usr/share/nginx/html/proof.txt'],check=True)
  backup.backup_one(config,workspace/did)
  archive=next((workspace/'backups').glob('*/pages.tar'))
  assert b'persistent-proof' in subprocess.check_output(['tar','-xOf',str(archive),'./proof.txt'])
  # Restore archive into a new isolated volume; never overwrite the active instance.
  restore=project+'_restore'
  subprocess.run(['docker','volume','create',restore],check=True)
  subprocess.run(['docker','run','--rm','-i','-v',restore+':/data','--entrypoint','tar',image,'-C','/data','-xf','-'],input=archive.read_bytes(),check=True)
  assert b'persistent-proof' in subprocess.check_output(['docker','run','--rm','-v',restore+':/data:ro','--entrypoint','cat',image,'/data/proof.txt'])
  # Add a real PostgreSQL volume to exercise safe database shutdown and physical recovery.
  subprocess.run(['docker','pull','postgres:17-alpine'],check=True)
  pgimage=json.loads(subprocess.check_output(['docker','image','inspect','postgres:17-alpine']))[0]['RepoDigests'][0]
  pgvolume=project+'_pgdata'
  subprocess.run(['docker','volume','create','--label','com.docker.compose.project='+project,'--label','com.docker.compose.volume=pgdata',pgvolume],check=True)
  pgcontainer=project+'-db'
  subprocess.run(['docker','run','-d','--name',pgcontainer,'--label','com.docker.compose.project='+project,'--label','com.docker.compose.service=db','--label','com.docker.compose.oneoff=False','-e','POSTGRES_PASSWORD=disposable-test-only','-v',pgvolume+':/var/lib/postgresql/data',pgimage],check=True)
  for attempt in range(60):
   if subprocess.run(['docker','exec',pgcontainer,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(1)
  subprocess.run(['docker','exec',pgcontainer,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',"CREATE TABLE exit_proof(value text); INSERT INTO exit_proof VALUES ('cold-database-proof');"],check=True)
  descriptor['weights']['db']=1;descriptor['infrastructureServices']=['db'];descriptor['volumes'].append('pgdata')
  # Real cold snapshot, stop and replay. Restic invocation is stubbed here; production validates offsite separately.
  spec=importlib.util.spec_from_file_location('retire',root/'scripts/hosting-node-retire.py')
  retire=importlib.util.module_from_spec(spec);spec.loader.exec_module(retire)
  fake_restic=workspace/'restic-test'
  fake_restic.write_text('#!/bin/sh\nexit 0\n');fake_restic.chmod(0o700)
  password=workspace/'password';password.write_text('disposable-test-only');password.chmod(0o600)
  config['offsite']={'binary':str(fake_restic),'passwordFile':str(password),'repository':str(workspace/'restic'),'sftpCommand':'false'}
  operation={'id':str(uuid.uuid4()),'deploymentId':did,'nodeId':config['nodeId'],'kind':'retire'}
  fake_restic.write_text('#!/bin/sh\nexit 1\n')
  try:
   retire.execute(config,workspace/did,operation)
   raise AssertionError('Failed offsite must not acknowledge completion')
  except subprocess.CalledProcessError:
   assert json.loads((workspace/did/'execution.json').read_text())['phase']=='retiring'
   assert not json.loads(subprocess.check_output(['docker','inspect',cid]))[0]['State']['Running']
  fake_restic.write_text('#!/bin/sh\nexit 0\n')
  with (workspace/did/'.env').open('a') as env_file:env_file.write('ACR_PASSWORD=platform-secret-fixture\nFD_STACK_STATUS_REPORT_TOKEN=platform-token-fixture\n')
  evidence=retire.execute(config,workspace/did,operation)
  assert evidence==retire.execute(config,workspace/did,operation)
  state=json.loads(subprocess.check_output(['docker','inspect',cid]))[0]
  assert not state['State']['Running'] and state['HostConfig']['RestartPolicy']['Name']=='no'
  cold=workspace/'backups'/evidence['backupId']/'pages.tar'
  subprocess.run(['docker','run','--rm','-i','-v',restore+':/data','--entrypoint','tar',image,'-C','/data','-xf','-'],input=cold.read_bytes(),check=True)
  assert b'persistent-proof' in subprocess.check_output(['docker','run','--rm','-v',restore+':/data:ro','--entrypoint','cat',image,'/data/proof.txt'])
  pgrestore=project+'_pgrestore'
  subprocess.run(['docker','volume','create',pgrestore],check=True)
  coldpg=workspace/'backups'/evidence['backupId']/'pgdata.tar'
  subprocess.run(['docker','run','--rm','-i','--user','0:0','-v',pgrestore+':/data','--entrypoint','tar',image,'-C','/data','-xpf','-'],input=coldpg.read_bytes(),check=True)
  restored=project+'-db-restored'
  subprocess.run(['docker','run','-d','--name',restored,'--label','com.docker.compose.project='+project,'-v',pgrestore+':/var/lib/postgresql/data',pgimage],check=True)
  for attempt in range(60):
   if subprocess.run(['docker','exec',restored,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(1)
  assert b'cold-database-proof' in subprocess.check_output(['docker','exec',restored,'psql','-U','postgres','-Atc','SELECT value FROM exit_proof'])
  assert json.loads((workspace/did/'execution.json').read_text())['phase']=='retained' 
  # Real age encryption and interrupted/resumable transfer; API state is a bounded test double.
  import base64,datetime,shutil
  from unittest.mock import patch
  spec=importlib.util.spec_from_file_location('handover',root/'scripts/hosting-node-handover.py');handover=importlib.util.module_from_spec(spec);spec.loader.exec_module(handover)
  config.update(ageBinary=shutil.which('age'),ageKeygenBinary=shutil.which('age-keygen'))
  assert config['ageBinary'] and config['ageKeygenBinary']
  transfer={'state':'preparing','received':0};received=bytearray();lost=[False]
  export_op={'id':str(uuid.uuid4()),'deploymentId':did,'nodeId':config['nodeId'],'kind':'export'}
  def api(route,payload=None):
   if payload is None:return {'exitEvidence':evidence,'retainUntil':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=1)).isoformat(),'handover':transfer,'maxBytes':1024**3}
   if payload['kind']=='begin':
    if 'sha256' in transfer:assert transfer['sha256']==payload['sha256'] and transfer['identity']==payload['identity']
    transfer.update({k:payload[k] for k in ('sha256','size','identity')});return transfer
   if payload['kind']=='chunk':
    assert payload['offset']==len(received);received.extend(base64.b64decode(payload['data']));transfer['received']=len(received)
    if not lost[0]:lost[0]=True;raise ConnectionError('Response lost after accepting first chunk')
    return transfer
   assert len(received)==transfer['size'] and hashlib.sha256(received).hexdigest()==transfer['sha256'];transfer['state']='ready';return transfer
  try:handover.execute(config,workspace/did,export_op,api);raise AssertionError('Lost response not exercised')
  except ConnectionError:pass
  handover.execute(config,workspace/did,export_op,api)
  identity=workspace/'customer.key';identity.write_text(transfer['identity']+'\n');identity.chmod(0o600)
  encrypted=workspace/'customer.tar.age';encrypted.write_bytes(received)
  decrypted=workspace/'customer.tar'
  with decrypted.open('wb') as out:subprocess.run([config['ageBinary'],'-d','-i',str(identity),str(encrypted)],stdout=out,check=True)
  delivered_env=subprocess.check_output(['tar','-xOf',str(decrypted),'.env']);assert b'platform-secret-fixture' not in delivered_env and b'FD_STACK_STATUS_REPORT_TOKEN' not in delivered_env
  delivered_pages=workspace/'delivered-pages.tar';delivered_pages.write_bytes(subprocess.check_output(['tar','-xOf',str(decrypted),'pages.tar']))
  assert b'persistent-proof' in subprocess.check_output(['tar','-xOf',str(delivered_pages),'./proof.txt'])
  assert not (workspace/did/'handover'/export_op['id']).exists()
  # Reclamation refuses the unrelated restored container sharing this project before any deletion.
  spec=importlib.util.spec_from_file_location('reclaim',root/'scripts/hosting-node-reclaim.py');reclaim=importlib.util.module_from_spec(spec);spec.loader.exec_module(reclaim)
  reclaim_op={'id':str(uuid.uuid4()),'deploymentId':did,'nodeId':config['nodeId'],'kind':'reclaim'}
  try:reclaim.execute(config,workspace,reclaim_op,api);raise AssertionError('Foreign service accepted')
  except ValueError:pass
  subprocess.run(['docker','rm','-f',restored],check=True)
  foreign=project+'-foreign-ref'
  subprocess.run(['docker','create','--name',foreign,'-v',project+'_pages:/data',image],check=True)
  try:reclaim.execute(config,workspace,reclaim_op,api);raise AssertionError('Shared volume accepted')
  except ValueError:pass
  finally:subprocess.run(['docker','rm',foreign],check=True)
  original_run=subprocess.run;removals=[0]
  def interrupted(command,*args,**kwargs):
   if command[:2]==['docker','rm']:
    removals[0]+=1
    if removals[0]==2:raise subprocess.CalledProcessError(1,command)
   return original_run(command,*args,**kwargs)
  with patch.object(reclaim.subprocess,'run',side_effect=interrupted):
   try:reclaim.execute(config,workspace,reclaim_op,api);raise AssertionError('Interrupted reclaim not exercised')
   except subprocess.CalledProcessError:pass
  reclaimed=reclaim.execute(config,workspace,reclaim_op,api)
  assert reclaimed==reclaim.execute(config,workspace,reclaim_op,api)
  assert not (workspace/did).exists() and cold.exists()
  assert not subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project]).strip()
  print('Static/PG cold recovery, real age export, interrupted transfer and owned reclamation replay passed')
 finally:
  ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
  if ids:subprocess.run(['docker','rm','-f',*ids],check=True)
  for n in (project+'_default',project+'-ingress'):subprocess.run(['docker','network','rm',n],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for v in (project+'_pages',project+'_restore',project+'_pgdata',project+'_pgrestore'):subprocess.run(['docker','volume','rm',v],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
