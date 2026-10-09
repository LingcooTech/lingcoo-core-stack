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
