import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Netlify serves the site from the domain root. SITE_URL points at GitHub Pages (/majeesh-Portfolio/),
// so without an explicit root URL the layout would prefix fonts and icons with that path.
// URL is set by Netlify during its builds; the fallback covers a local build for drag-and-drop.
const result = spawnSync(npmCommand, ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    PUBLIC_SITE_URL: process.env.URL || 'https://marvelous-monstera-f414b0.netlify.app/',
    // Keep the Netlify copy out of search results; GitHub Pages is the canonical site.
    STAGING: 'true',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
