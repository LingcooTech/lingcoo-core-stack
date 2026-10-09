"""Real Docker acceptance: a static nginx application, no API, worker or database."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,uuid
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
 config={'adapters':{'static_sample':descriptor},'useCachedImagesOnly':True,'backupRoot':str(workspace/'backups')}
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
  print('Static adapter install, replay, backup and isolated restore passed')
 finally:
  ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
  if ids:subprocess.run(['docker','rm','-f',*ids],check=True)
  for n in (project+'_default',project+'-ingress'):subprocess.run(['docker','network','rm',n],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  for v in (project+'_pages',project+'_restore'):subprocess.run(['docker','volume','rm',v],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
