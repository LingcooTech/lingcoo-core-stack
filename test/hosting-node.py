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
