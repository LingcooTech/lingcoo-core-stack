#!/usr/bin/env python3
"""Install reviewed hosting lifecycle runtime on an enrolled node; no instance is stopped by this upgrade."""
import datetime,fcntl,hashlib,json,os,py_compile,shutil,subprocess,sys
from pathlib import Path
allowed={'hosting-node-agent.py','hosting-node-report.py','hosting-node-operation.py','hosting-node-retire.py','hosting-node-handover.py','hosting-node-reclaim.py','hosting-node-upgrade.py','hosting_upgrade.py'}
config_path=Path(sys.argv[1]);stage=Path(sys.argv[2])
if config_path.stat().st_mode & 0o077:raise ValueError('Private config required')
config=json.loads(config_path.read_text());destination=config_path.parent
manifest=json.loads((stage/'checksums.json').read_text())
if set(manifest)!=allowed:raise ValueError('Unexpected runtime files')
for name,digest in manifest.items():
 path=stage/name
 if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Staged digest mismatch')
 py_compile.compile(str(path),doraise=True)
if not config.get('monitorOnly'):
 if not config.get('offsite'):raise ValueError('Offsite backup must be configured first')
 images=json.loads(subprocess.check_output(['docker','image','inspect','caddy:2-alpine']))
 candidates=images[0].get('RepoDigests',[])
 if not candidates:raise ValueError('Pinned snapshot tool image unavailable')
 image=candidates[0]
 subprocess.run(['docker','run','--rm','--network','none','--read-only','--entrypoint','tar',image,'--help'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 config['snapshotImage']=image
 for key,binary in [('ageBinary','age'),('ageKeygenBinary','age-keygen')]:
  path=shutil.which(binary)
  if not path:raise ValueError('Install distribution age package before activating handover')
  config[key]=path
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=destination/('exit-runtime-before-'+stamp);backup.mkdir(mode=0o700)
workspace=Path(config['workspace']);workspace.mkdir(mode=0o700,parents=True,exist_ok=True)
with (workspace/'.agent.lock').open('a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 shutil.copy2(config_path,backup/config_path.name)
 for name in allowed:
  if (destination/name).exists():shutil.copy2(destination/name,backup/name)
 try:
  for name in allowed:
   temporary=destination/(name+'.new');shutil.copyfile(stage/name,temporary);temporary.chmod(0o700);os.replace(temporary,destination/name)
  temporary=config_path.with_suffix('.new');temporary.write_text(json.dumps(config,indent=2)+'\n');temporary.chmod(0o600);os.replace(temporary,config_path)
 except Exception:
  shutil.copy2(backup/config_path.name,config_path)
  for name in allowed:
   if (backup/name).exists():shutil.copy2(backup/name,destination/name)
  raise
print(json.dumps({'updated':True,'monitorOnly':bool(config.get('monitorOnly')),'retireCapable':bool(config.get('snapshotImage') and config.get('offsite'))}))
