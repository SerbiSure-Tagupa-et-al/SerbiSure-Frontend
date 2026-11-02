// Enumerate explicitly so npm test works on Windows and Linux with Node 20.
const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? collect(file) : /\.(?:test|spec)\.[cm]?js$/.test(entry.name) ? [file] : [];
  });
}
const files = collect('tests').sort();
if (!files.length) throw new Error('No tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
