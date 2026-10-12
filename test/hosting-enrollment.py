import importlib.util,json,tempfile,uuid
from pathlib import Path
s=importlib.util.spec_from_file_location('prepare','scripts/prepare-hosting-node.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'node.json';c={'stackUrl':'https://stack.example.com','nodeId':str(uuid.uuid4()),'reportToken':'x'*43}
 p.write_text(json.dumps(c));p.chmod(0o600);assert m.validate_config(p)==c
 for invalid in [{**c,'stackUrl':'https://user:secret@stack.example.com'}, {**c,'nodeId':'invalid'}, {**c,'monitorOnly':False}]:
  p.write_text(json.dumps(invalid))
  try: m.validate_config(p)
  except ValueError: pass
  else: raise AssertionError('invalid enrollment accepted')
 p.write_text(json.dumps(c));p.chmod(0o644)
 try: m.validate_config(p)
 except ValueError: pass
 else: raise AssertionError('public credential accepted')
 p.chmod(0o600);link=Path(d)/'link';link.symlink_to(p)
 try: m.validate_config(link)
 except ValueError: pass
 else: raise AssertionError('symlink accepted')
print('Enrollment identity and private-file validation passed')

from unittest.mock import patch
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'enroll.json';c={'stackUrl':'https://stack.example.com','nodeId':str(uuid.uuid4()),'reportToken':'x'*43}
 p.write_text(json.dumps(c));p.chmod(0o600)
 m.NODE_DIRECTORY=Path(d)/'agent'
 with patch.object(m, 'inspect', return_value={'ready':True}), patch.object(m.os,'geteuid',return_value=0), patch.object(m.subprocess,'run') as run:
  m.install(p)
  installed=json.loads((m.NODE_DIRECTORY/'node.json').read_text())
  assert installed['monitorOnly'] is True and installed['reportToken']==c['reportToken']
  assert (m.NODE_DIRECTORY/'node.json').stat().st_mode & 0o077 == 0
  assert Path(installed['workspace']).is_dir()
  assert (m.NODE_DIRECTORY/'hosting-node-agent.py').exists()
  assert len(run.call_args_list)==2
  try: m.install(p)
  except ValueError: pass
  else: raise AssertionError('existing node overwritten')
  assert len(run.call_args_list)==2
print('Monitoring enrollment preserves credentials and rejects reinstall')
