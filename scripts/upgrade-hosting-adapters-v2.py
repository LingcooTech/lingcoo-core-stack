#!/usr/bin/env python3
"""Operator-only staged upgrade. App/deployment mapping is explicit, never inferred by core."""
import fcntl,hashlib,json,os,shutil,subprocess,sys,time
from pathlib import Path
stage=Path(sys.argv[1]).resolve();root=Path(sys.argv[2]).resolve()
sys.path.insert(0,str(stage/'scripts'))
from hosting_adapter import resolve_adapter,project_name
path=root/'node.json';config=json.loads(path.read_text())
mapping=json.loads((stage/'migration.json').read_text())
version=hashlib.sha256((stage/'migration.json').read_bytes()+b''.join(p.read_bytes() for p in sorted((stage/'scripts').glob('*.py')))).hexdigest()[:16]
active=[t for t in ['lingcoo-hosting.timer','lingcoo-hosting-backup.timer'] if subprocess.run(['systemctl','is-active','--quiet',t]).returncode==0]
try:
 if active:subprocess.run(['systemctl','stop',*active],check=True)
 for _ in range(90):
  if all(subprocess.check_output(['systemctl','show','-p','ActiveState','--value',s],text=True).strip() not in ('active','activating','deactivating') for s in ['lingcoo-hosting.service','lingcoo-hosting-backup.service']):break
  time.sleep(2)
 else:raise RuntimeError('Node still busy')
 with (Path(config['workspace'])/'.agent.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  journals=[]
  if not config.get('monitorOnly'):
   for code, source in mapping['applications'].items():
    old=Path(source['bundle'])
    old_hashes=config.get('adapters',{}).get(code,{}).get('hashes') or config.get(source.get('legacyHashesKey',''),{})
    if not old_hashes:raise ValueError('Existing trusted hashes required')
    for name,digest in old_hashes.items():
     if hashlib.sha256((old/name).read_bytes()).hexdigest()!=digest:raise ValueError('Existing bundle modified')
    bundle=root/'adapters'/code/('v2-'+version)/'bundle'
    if not bundle.exists():
     bundle.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(old,bundle)
    shutil.copyfile(stage/'applications'/code/'stack-delivery.py',bundle/'stack-delivery.py')
    descriptor=json.loads((stage/'applications'/code/'hosting-adapter.json').read_text())
    descriptor['bundle']=str(bundle)
    descriptor['hashes']={str(p.relative_to(bundle)):hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    config.setdefault('adapters',{})[code]=descriptor
    resolve_adapter(config,code,True)
   for journal in Path(config['workspace']).glob('*/execution.json'):
    data=json.loads(journal.read_text());code=data.get('appCode') or mapping['deployments'].get(journal.parent.name)
    if not code:raise ValueError('Explicit instance migration mapping required')
    project=project_name(resolve_adapter(config,code,True),journal.parent.name)
    if data.get('project',project)!=project:raise ValueError('Project mismatch')
    ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).split()
    if not ids:raise ValueError('Existing instance containers required')
    data.update(appCode=code,project=project);journals.append((journal,data))
  config.pop('retailBundle',None);config.pop('bundleHashes',None)
  for source in (stage/'scripts').glob('*.py'):compile(source.read_text(),str(source),'exec')
  backup=root/'agent-backups'/('v2-'+time.strftime('%Y%m%dT%H%M%S'));backup.mkdir(parents=True,mode=0o700)
  changed=[]
  try:
   for dest,value in [(path,json.dumps(config)),*[(j,json.dumps(v)) for j,v in journals]]:
    saved=backup/(hashlib.sha256(str(dest).encode()).hexdigest()+'.json');shutil.copy2(dest,saved);changed.append((dest,saved))
    temp=dest.with_suffix('.v2-new');temp.write_text(value);temp.chmod(0o600);os.replace(temp,dest)
   for source in (stage/'scripts').glob('*.py'):
    dest=root/source.name;saved=backup/source.name
    if dest.exists():shutil.copy2(dest,saved);changed.append((dest,saved))
    temp=dest.with_suffix('.v2-new');shutil.copyfile(source,temp);temp.chmod(0o700);os.replace(temp,dest)
  except Exception:
   for dest,saved in reversed(changed):shutil.copy2(saved,dest)
   raise
 print(json.dumps({'upgraded':True,'monitorOnly':config.get('monitorOnly',False),'adapters':list(config.get('adapters',{})),'migratedInstances':len(journals)}))
finally:
 if active:subprocess.run(['systemctl','start',*active],check=True)
