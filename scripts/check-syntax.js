const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function check(file) {
  const args = ['--check'];
  let input;
  if (file.startsWith('public' + path.sep)) {
    args.push('--input-type=module'); input = fs.readFileSync(file, 'utf8');
  } else args.push(file);
  const result = spawnSync(process.execPath, args, { input, encoding: 'utf8' });
  if (result.status !== 0) { console.error(file, result.stderr); process.exitCode = 1; }
}
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(js|mjs|cjs)$/.test(file)) check(file);
  }
}
for (const file of ['server.js', 'hytte.js', 'seed.js']) check(file);
for (const dir of ['lib', 'migrations', 'scripts', 'public', 'hytte-public', 'tests']) walk(dir);
if (!process.exitCode) console.log('JavaScript syntax checks passed.');
require('@apidevtools/swagger-parser').validate('docs/alfred-api.openapi.json').then(() => {
  console.log('OpenAPI contract validation passed.');
}).catch(error => { console.error('OpenAPI validation failed:', error.message); process.exitCode = 1; });
