import importlib.util,json,tempfile,hashlib,sys
from pathlib import Path
from unittest.mock import patch
script=Path(__file__).resolve().parents[1]/'scripts'/'upgrade-hosting-compose.py'
spec=importlib.util.spec_from_file_location('upgrade',script);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary);target=root/'agent';target.mkdir();target=target.resolve();stage=root/'stage';stage.mkdir();workspace=root/'instances';workspace.mkdir()
    config=target/'node.json';config.write_text(json.dumps({'workspace':str(workspace),'reportToken':'private-token','monitorOnly':True}));config.chmod(0o600)
    manifest={}
    for name in module.FILES:
        (target/name).write_text('old = True\n')
        content=b'new = True\n';(stage/name).write_bytes(content);manifest[name]=hashlib.sha256(content).hexdigest()
    (stage/'checksums.json').write_text(json.dumps(manifest))
    (stage/'hosting_compose.py').write_text('tampered = True\n')
    try:module.upgrade(config,stage);raise AssertionError('Checksum mismatch accepted')
    except ValueError:pass
    assert (target/'hosting-node-agent.py').read_text()=='old = True\n'
    (stage/'hosting_compose.py').write_bytes(b'new = True\n')
    original=module.atomic
    failed=[False]
    def interrupted(path,content):
        if path==target/'hosting-node-ingress.py' and content==b'new = True\n' and not failed[0]:
            failed[0]=True;raise OSError('Simulated partial copy failure')
        original(path,content)
    with patch.object(module,'atomic',side_effect=interrupted):
        try:module.upgrade(config,stage);raise AssertionError('Expected interruption')
        except OSError:pass
    assert all((target/name).read_text()=='old = True\n' for name in module.FILES)
    assert 'composeRunnerSha256' not in json.loads(config.read_text())
    result=module.upgrade(config,stage)
    assert result['monitorOnly'] is True and 'private-token' not in json.dumps(result)
    assert json.loads(config.read_text())['reportToken']=='private-token'
    assert all((target/name).read_text()=='new = True\n' for name in module.FILES)
print('Agent update verifies staged artifacts, rolls back interruptions and preserves private configuration')
