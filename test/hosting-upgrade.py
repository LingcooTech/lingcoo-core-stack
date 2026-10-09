import importlib.util,json,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'scripts'))
import hosting_upgrade
plan={'id':str(uuid.uuid4()),'appCode':'fixture','label':'Compatible runtime','fromImage':'example/app@sha256:'+'a'*64,'toImage':'example/app@sha256:'+'b'*64,'schemaPolicy':'no-migration','reviewEvidence':'Reviewed migration-free build'}
with patch.object(hosting_upgrade,'resolve_adapter'):
 assert hosting_upgrade.release({},plan,verify=False)==plan
 for bad in [{**plan,'schemaPolicy':'migration'},{**plan,'toImage':'app:latest'},{**plan,'command':['rm']},{**plan,'reviewEvidence':''}]:
  try:hosting_upgrade.release({},bad,verify=False);raise AssertionError('Unsafe plan accepted')
  except ValueError:pass
with patch.object(hosting_upgrade,'release',return_value=plan):
 try:hosting_upgrade.catalog({'monitorOnly':False,'upgradeReleases':[plan,plan]});raise AssertionError('Duplicate release accepted')
 except ValueError:pass
 assert hosting_upgrade.catalog({'monitorOnly':True,'upgradeReleases':[plan]})==[]
print('Upgrade plans reject commands, tags, schema changes and duplicate identities')
