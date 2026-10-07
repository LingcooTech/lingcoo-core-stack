import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('hosting ingress validates aliases, preserves existing routes and removes detached domains', () => {
  execFileSync('python3', ['test/hosting-node.py'], { stdio: 'pipe' });
});
