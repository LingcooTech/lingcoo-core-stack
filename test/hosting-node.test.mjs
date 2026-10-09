import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('hosting ingress validates aliases, preserves existing routes and removes detached domains', () => {
  execFileSync('python3', ['test/hosting-node.py'], { stdio: 'pipe' });
});

test(
  'heterogeneous Docker adapter installs, replays, backs up and restores',
  {
    skip: process.env.CI !== 'true',
    timeout: 180_000,
  },
  () => {
    execFileSync('python3', ['test/hosting-static-docker.py'], { stdio: 'pipe', timeout: 170_000 });
  },
);
