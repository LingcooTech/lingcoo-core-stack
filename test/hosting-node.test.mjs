import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('hosting ingress validates aliases, preserves existing routes and removes detached domains', () => {
  execFileSync('python3', ['test/hosting-node.py'], { stdio: 'pipe' });
});

test(
  'heterogeneous Docker adapter installs, replays, backs up and restores',
  {
    skip: process.env.CI !== 'true',
    timeout: 300_000,
  },
  () => {
    execFileSync('python3', ['test/hosting-static-docker.py'], { stdio: 'pipe', timeout: 290_000 });
  },
);

test('retirement preflight refuses unsafe data mounts before stopping services', () => {
  execFileSync('python3', ['test/hosting-retire.py'], { stdio: 'pipe' });
});

test('upgrade release approval excludes arbitrary commands and mutable images', () => {
  execFileSync('python3', ['test/hosting-upgrade.py'], { stdio: 'pipe' });
});
test(
  'controlled Docker upgrade rolls back failures and interruptions without losing persistent data',
  { skip: process.env.CI !== 'true', timeout: 300_000 },
  () => {
    execFileSync('python3', ['test/hosting-upgrade-docker.py'], {
      stdio: 'pipe',
      timeout: 290_000,
    });
  },
);
