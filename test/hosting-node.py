import importlib.util,tempfile,json,uuid
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1] / 'scripts'
spec=importlib.util.spec_from_file_location('ingress',root/'hosting-node-ingress.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
id=str(uuid.uuid4())
block=m.route_block(id,'foo.app.lingcoo.com',['shop.example.com'])
assert 'foo.app.lingcoo.com, shop.example.com {' in block
for name in ['bad.example.com\nadmin off','*.example.com','http://example.com','foo.example.com:80']:
 try:m.route_block(id,'foo.app.lingcoo.com',[name]);raise AssertionError('accepted injection')
 except ValueError:pass
with tempfile.TemporaryDirectory() as tmp:
 w=Path(tmp);d=w/id;d.mkdir();(d/'execution.json').write_text(json.dumps({'phase':'runtime_ready'}));p=w/'Caddyfile';old='existing.example.com {\n respond "OK"\n}\n';p.write_text(old)
 with patch.object(m.subprocess,'check_output',return_value=b'{}'),patch.object(m.subprocess,'run') as run,patch.object(m,'sync_origins'):
  m.publish({'gatewayConfigPath':str(p),'gatewayContainer':'gateway'},w,{'deploymentId':id,'hostname':'foo.app.lingcoo.com','aliases':[{'hostname':'shop.example.com'}]})
  assert old.strip() in p.read_text() and 'shop.example.com' in p.read_text()
  m.publish({'gatewayConfigPath':str(p),'gatewayContainer':'gateway'},w,{'deploymentId':id,'hostname':'foo.app.lingcoo.com','aliases':[]})
  assert 'shop.example.com' not in p.read_text() and old.strip() in p.read_text()
print('Ingress aliases, injection rejection, existing routes and removal checks passed')

with tempfile.TemporaryDirectory() as tmp:
    directory = Path(tmp)
    (directory / '.env').write_text("APP_IMAGE='test-image'\nCORS_ORIGIN='https://foo.app.lingcoo.com'\n")
    with patch.object(m.subprocess, 'run'):
        m.sync_origins(directory, id, ['foo.app.lingcoo.com', 'shop.example.com'])
    text = (directory / '.env').read_text()
    assert "CORS_ORIGIN='https://foo.app.lingcoo.com,https://shop.example.com'" in text
    assert "APP_IMAGE='test-image'" in text
print('Managed environment quoting preserved')

wild=m.route_block(id,'foo.app.lingcoo.com',['shop.example.com'],'app.lingcoo.com')
assert 'foo.app.lingcoo.com {\n  tls /data/lingcoo-platform-tls/current/' in wild
assert 'shop.example.com {\n  header' in wild
try:
    m.route_block(id,'nested.foo.app.lingcoo.com',[],'app.lingcoo.com')
    raise AssertionError('Nested wildcard accepted')
except ValueError:pass
spec=importlib.util.spec_from_file_location('ops',root/'hosting-node-operation.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
with tempfile.TemporaryDirectory() as tmp:
    workspace=Path(tmp);directory=workspace/id;directory.mkdir();(directory/'execution.json').write_text(json.dumps({'phase':'runtime_ready'}));(directory/'operations').mkdir()
    oid=str(uuid.uuid4());op={'id':oid,'deploymentId':id,'nodeId':id,'kind':'restart'}
    journal=directory/'operations'/(oid+'.json');journal.write_text(json.dumps({'state':'running'}))
    with patch.object(ops.subprocess,'run') as run:
        assert ops.execute({'nodeId':id},workspace,op) is False
        run.assert_not_called()
    journal.write_text(json.dumps({'state':'succeeded'}))
    assert ops.execute({'nodeId':id},workspace,op) is True
    try:
        ops.execute({'nodeId':id},workspace,{**op,'kind':'shell'})
        raise AssertionError('Arbitrary command accepted')
    except ValueError:pass
print('Wildcard scope and interrupted operation replay verified')
spec=importlib.util.spec_from_file_location('cert',root/'hosting-certificate-receive.py');cert=importlib.util.module_from_spec(spec);spec.loader.exec_module(cert)
with patch.object(cert,'run',return_value=b'X509v3 Subject Alternative Name: DNS:*.other.example.com'):
    try:cert.inspect_certificate(Path('cert'),Path('key'),'app.lingcoo.com');raise AssertionError('Foreign wildcard accepted')
    except ValueError:pass
with patch.object(cert,'run',side_effect=[b'DNS:*.app.lingcoo.com, DNS:app.lingcoo.com',b'public-key-1',b'public-key-2']):
    try:cert.inspect_certificate(Path('cert'),Path('key'),'app.lingcoo.com');raise AssertionError('Mismatched key accepted')
    except ValueError:pass
print('Certificate scope and key mismatch rejection verified')
