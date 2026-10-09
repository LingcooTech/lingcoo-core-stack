import importlib.util,tempfile,json,uuid,sys
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0,str(root))
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

from hosting_adapter import resolve_adapter, instance_adapter
import hashlib
with tempfile.TemporaryDirectory() as tmp:
    bundle=Path(tmp)/'bundle';bundle.mkdir()
    files=['stack-delivery.py','docker-compose.prod.yml','docker/Caddyfile','deploy/scripts/backup.sh','deploy/scripts/backup-metadata.mjs']
    hashes={}
    for name in files:
        p=bundle/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('trusted')
        hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
    descriptor={'bundle':str(bundle),'hashes':hashes,'projectPrefix':'edu','weights':{'postgres':3,'api':5,'worker':5,'caddy':1},'appServices':['api','worker'],'healthyServices':['api'],'httpChecks':['/health/ready','/','/admin/'],'minMemoryMb':1024}
    config={'adapters':{'lingcoo_edu_oms':descriptor}}
    assert resolve_adapter(config,'lingcoo_edu_oms',True)['appServices']==['api','worker']
    directory=Path(tmp)/id;directory.mkdir()
    (directory/'execution.json').write_text(json.dumps({'appCode':'lingcoo_edu_oms','project':'edu-'+id.replace('-',''),'phase':'runtime_ready'}))
    assert instance_adapter(config,directory)[1].startswith('edu-')
    block=m.route_block(id,'edu.app.lingcoo.com',project=instance_adapter(config,directory)[1])
    assert 'reverse_proxy edu-' in block and 'retail-' not in block
    try:resolve_adapter(config,'unknown');raise AssertionError('unknown adapter accepted')
    except ValueError:pass
    config['adapters']['other']={**descriptor}
    try:resolve_adapter(config,'lingcoo_edu_oms');raise AssertionError('prefix collision accepted')
    except ValueError:pass
    del config['adapters']['other']
    (bundle/'stack-delivery.py').write_text('tampered')
    try:resolve_adapter(config,'lingcoo_edu_oms',True);raise AssertionError('tampered code accepted')
    except ValueError:pass
    (directory/'execution.json').write_text(json.dumps({'appCode':'lingcoo_edu_oms','project':'retail-'+id.replace('-','')}))
    try:instance_adapter(config,directory);raise AssertionError('foreign ownership accepted')
    except ValueError:pass
spec=importlib.util.spec_from_file_location('agent',root/'hosting-node-agent.py');agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
limits=agent.render_limits({'memoryMb':1024,'cpuMillis':1000},descriptor['weights'])
assert 'web' not in limits['services'] and sum(int(v['mem_limit'][:-1]) for v in limits['services'].values()) <= 1024
print('Trusted second adapter, ownership, injection and weighted resource checks passed')
# A failed application deployment must not adopt the Retail project or accept a smaller budget.
job={'id':str(uuid.uuid4()),'deploymentId':id,'appCode':'lingcoo_edu_oms','hostname':'edu.app.lingcoo.com','env':{'APP_IMAGE':'registry.example.test/edu@sha256:'+'a'*64},'resources':{'memoryMb':1024,'cpuMillis':1000}}
agent.validate_job(job,{'adapters':{'lingcoo_edu_oms':descriptor}})
try:agent.validate_job({**job,'resources':{'memoryMb':128}}, {'adapters':{'lingcoo_edu_oms':descriptor}});raise AssertionError('Under-budget job accepted')
except ValueError:pass
