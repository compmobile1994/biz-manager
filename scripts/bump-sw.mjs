// Runs before `next build`. Rewrites public/sw.js with a fresh BUILD_ID
// constant (current ISO timestamp + git SHA if available) so every
// production deploy ships a *different* sw.js file. The browser will
// then detect the change, install the new SW, and our SW activates
// immediately (skipWaiting + clients.claim already present in the
// existing template) so the next page navigation runs the new code.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SW_PATH = './public/sw.js';

const timestamp = new Date().toISOString();
let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // Not a git repo / no git available — fall back to timestamp only
}
const buildId = gitSha ? `${gitSha}-${Date.parse(timestamp)}` : `${Date.parse(timestamp)}`;

let src = readFileSync(SW_PATH, 'utf8');

// Replace the cache-name constant (always the first `const CACHE_NAME = '...';`)
const newName = `'biz-manager-${buildId}'`;
src = src.replace(/const CACHE_NAME\s*=\s*'[^']*';/, `const CACHE_NAME = ${newName};`);

// Add a // BUILD comment near the top so any tiny file diff is enough to
// register as a "new SW" even if the cache name didn't change.
src = src.replace(/^\/\/ BUILD:.*\n/m, '');
src = `// BUILD: ${buildId} (${timestamp})\n${src}`;

writeFileSync(SW_PATH, src);
console.log(`✓ sw.js bumped to ${buildId}`);
