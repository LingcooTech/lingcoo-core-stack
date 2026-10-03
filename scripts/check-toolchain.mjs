import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const nodeVersion = readFileSync(new URL('.node-version', root), 'utf8').trim();
const npmVersion = pkg.packageManager?.replace(/^npm@/, '');
const agent = process.env.npm_config_user_agent;
const actualNpm =
  agent?.match(/^npm\/([^ ]+)/)?.[1] ??
  execFileSync('npm', ['--version'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
const problems = [];
if (pkg.engines.node !== nodeVersion || pkg.engines.npm !== npmVersion)
  problems.push('package.json engines, packageManager and .node-version must agree');
if (process.versions.node !== nodeVersion)
  problems.push(`Use Node ${nodeVersion}; current version is ${process.versions.node}`);
if (actualNpm !== npmVersion || (agent && !agent.startsWith('npm/')))
  problems.push(`Use npm ${npmVersion}; current package manager is ${agent ?? actualNpm}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.info(`[toolchain] Node ${nodeVersion}, npm ${npmVersion}`);
