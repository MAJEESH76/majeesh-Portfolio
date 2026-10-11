import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// GitHub Pages serves a project site under /<repo>/, so asset and nav paths get that prefix.
const result = spawnSync(npmCommand, ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    PUBLIC_BASE_PATH: 'majeesh-Portfolio',
    PUBLIC_SITE_URL: 'https://majeesh76.github.io/majeesh-Portfolio/',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
