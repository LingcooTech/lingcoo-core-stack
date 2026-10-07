import assert from 'node:assert/strict';
import test from 'node:test';
import { DnsPodHostingProvider } from '../src/modules/deployment/hosting-dns';

const input = {
  deploymentId: '00000000-0000-4000-8000-000000000001',
  hostname: 'shop123.app.lingcoo.com',
  ip: '192.0.2.1',
};
const record = {
  RecordId: 42,
  Name: 'shop123.app',
  Type: 'A',
  Value: input.ip,
  Status: 'ENABLE',
  Remark: 'lingcoo-deployment:' + input.deploymentId,
};

test('DNS retry adopts only the exact record owned by this deployment', async () => {
  let creates = 0;
  const provider = new DnsPodHostingProvider(
    {
      DescribeRecordList: async () => ({ RecordList: [record] }),
      CreateRecord: async () => {
        creates++;
        return { RecordId: 99 };
      },
    },
    'lingcoo.com',
    'app.lingcoo.com',
  );
  assert.equal(await provider.ensureRecord(input), 42);
  assert.equal(creates, 0);
});

test('DNS collisions never overwrite another owner, target, type or disabled record', async () => {
  for (const override of [
    { Remark: '' },
    { Value: '192.0.2.2' },
    { Type: 'CNAME' },
    { Status: 'DISABLE' },
  ]) {
    const provider = new DnsPodHostingProvider(
      {
        DescribeRecordList: async () => ({ RecordList: [{ ...record, ...override }] }),
        CreateRecord: async () => {
          assert.fail('Must not create a conflicting record');
        },
      },
      'lingcoo.com',
      'app.lingcoo.com',
    );
    await assert.rejects(provider.ensureRecord(input));
  }
});

test('DNS scope validation happens before calling the cloud provider', async () => {
  const provider = new DnsPodHostingProvider(
    {
      DescribeRecordList: async () => {
        assert.fail('Invalid input must not reach provider');
      },
      CreateRecord: async () => {
        assert.fail('Invalid input must not reach provider');
      },
    },
    'lingcoo.com',
    'app.lingcoo.com',
  );
  for (const hostname of [
    'lingcoo.com',
    'stack.lingcoo.com',
    'shop.app.lingcoo.com.attacker.test',
    'a.b.app.lingcoo.com',
  ]) {
    await assert.rejects(provider.ensureRecord({ ...input, hostname }));
  }
  await assert.rejects(provider.ensureRecord({ ...input, ip: 'not-an-ip' }));
});
