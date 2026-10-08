// Runs in an isolated existing Stack runtime image with the official Tencent SDK.
const { dnspod } = require('/app/node_modules/tencentcloud-sdk-nodejs-dnspod');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > 16384) process.exit(1);
});
process.stdin.on('end', async () => {
  try {
    const data = JSON.parse(input);
    if (
      !['present', 'cleanup'].includes(data.action) ||
      data.fqdn !== '_acme-challenge.' + data.domain + '.' ||
      !data.domain.endsWith('.' + data.zone) ||
      !/^[A-Za-z0-9_-]{20,200}$/.test(data.value)
    )
      throw Error('Scope');
    const client = new dnspod.v20210323.Client({
      credential: data.credentials,
      profile: { httpProfile: { endpoint: 'dnspod.tencentcloudapi.com', reqTimeout: 20 } },
    });
    const name = data.fqdn.slice(0, -(data.zone.length + 2));
    const remark = 'lingcoo-acme:' + data.domain;
    const response = await client.DescribeRecordList({
      Domain: data.zone,
      SubDomain: name,
      RecordType: 'TXT',
      Limit: 100,
      ErrorOnEmpty: 'no',
    });
    if ((response.RecordList || []).length >= 100) throw Error('Too many records');
    const owned = (response.RecordList || []).filter(
      (r) => r.Name === name && r.Type === 'TXT' && r.Value === data.value && r.Remark === remark,
    );
    if (data.action === 'present' && !owned.length)
      await client.CreateRecord({
        Domain: data.zone,
        SubDomain: name,
        RecordType: 'TXT',
        RecordLine: '默认',
        Value: data.value,
        TTL: 600,
        Remark: remark,
      });
    if (data.action === 'cleanup')
      for (const record of owned)
        await client.DeleteRecord({ Domain: data.zone, RecordId: record.RecordId });
    console.log('DNS challenge ' + data.action + ' complete');
  } catch {
    console.error('Scoped DNS challenge operation failed');
    process.exit(1);
  }
});
