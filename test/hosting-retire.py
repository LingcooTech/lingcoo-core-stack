"""Preflight must fail before stopping anything when data ownership cannot be proven."""
import importlib.util,json,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'scripts'))
spec=importlib.util.spec_from_file_location('retire',root/'scripts/hosting-node-retire.py')
retire=importlib.util.module_from_spec(spec);spec.loader.exec_module(retire)
with tempfile.TemporaryDirectory() as tmp:
 directory=Path(tmp)/str(uuid.uuid4());directory.mkdir()
 (directory/'execution.json').write_text(json.dumps({'phase':'runtime_ready'}))
 operation={'id':str(uuid.uuid4()),'deploymentId':directory.name,'nodeId':str(uuid.uuid4())}
 config={'nodeId':operation['nodeId'],'snapshotImage':'test@sha256:'+'a'*64,'offsite':{'configured':True}}
 descriptor={'weights':{'app':1},'volumes':[],'files':['docker-compose.prod.yml']}
 for mount in [
  {'Type':'bind','Source':str(directory/'uploads'),'RW':True},
  {'Type':'bind','Source':'/other-customer/data','RW':False},
  {'Type':'volume','Name':'other_customer_data'},
 ]:
  container={'Id':'abc','Config':{'Labels':{'com.docker.compose.project':'fixture','com.docker.compose.service':'app'}},'Mounts':[mount]}
  with patch.object(retire,'instance_adapter',return_value=(descriptor,'fixture')),patch.object(retire.subprocess,'run') as run,patch.object(retire.subprocess,'check_output',side_effect=['abc',json.dumps([container])]):
   try:retire.execute(config,directory,operation);raise AssertionError('Unsafe mount accepted')
   except ValueError:pass
   assert run.call_count==1 and run.call_args.args[0][:3]==['docker','image','inspect']
   assert json.loads((directory/'execution.json').read_text())['phase']=='runtime_ready'
print('Retirement data preflight rejects writable, undeclared and foreign mounts before stopping')

# Expiration cleanup is confined to known disposable export directories.
import os
spec=importlib.util.spec_from_file_location('handover',root/'scripts/hosting-node-handover.py')
handover=importlib.util.module_from_spec(spec);spec.loader.exec_module(handover)
with tempfile.TemporaryDirectory() as tmp:
 workspace=Path(tmp);directory=workspace/str(uuid.uuid4());directory.mkdir();(directory/'execution.json').write_text(json.dumps({'phase':'retained'}))
 parent=directory/'handover';parent.mkdir()
 expired=parent/str(uuid.uuid4());expired.mkdir();(expired/'identity.txt').write_text('disposable');os.utime(expired,(0,0))
 unknown=parent/str(uuid.uuid4());unknown.mkdir();(unknown/'business-data').write_text('preserve');os.utime(unknown,(0,0))
 fresh=parent/str(uuid.uuid4());fresh.mkdir();(fresh/'identity.txt').write_text('active')
 foreign=workspace/'foreign';foreign.mkdir();(foreign/'identity.txt').write_text('preserve');linked=parent/str(uuid.uuid4());linked.symlink_to(foreign,target_is_directory=True)
 handover.cleanup_transfers(workspace)
 assert not expired.exists() and unknown.exists() and fresh.exists() and linked.is_symlink() and (foreign/'identity.txt').read_text()=='preserve'
print('Handover expiration cleanup preserves active, unknown and foreign data')

with tempfile.TemporaryDirectory() as tmp:
 base=Path(tmp);backup=base/'backup';backup.mkdir();original='APP_IMAGE=example\nACR_PASSWORD="platform-registry-secret"\nFD_STACK_STATUS_REPORT_TOKEN="platform-report-secret"\nDB_PASSWORD="customer-data-secret"\n'
 (backup/'.env').write_text(original);(backup/'pages.tar').write_bytes(b'customer-data');(backup/'SHA256SUMS').write_text('unused')
 target=handover.delivery_payload(backup,['.env','pages.tar','SHA256SUMS'],base/'delivery')
 sanitized=(target/'.env').read_text();assert 'platform-' not in sanitized and 'customer-data-secret' in sanitized and (backup/'.env').read_text()==original
 assert handover.digest(target/'.env') in (target/'SHA256SUMS').read_text()
 (backup/'.env').write_text('ACR_PASSWORD="secret\ncontinued"\n')
 try:handover.delivery_payload(backup,['.env','pages.tar','SHA256SUMS'],base/'bad');raise AssertionError('Multiline secret accepted')
 except ValueError:pass
print('Customer delivery removes platform credentials and regenerates checksums without altering cold backup')
