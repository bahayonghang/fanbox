'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(port, child) {
  const url = `http://localhost:${port}/api/release/inspect?path=${encodeURIComponent(os.tmpdir())}`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* server not ready */ }
    await wait(100);
  }
  throw new Error('server did not start in time');
}

async function json(url, options) {
  const res = await fetch(url, options);
  return res.json();
}

function writeProject(dir, version) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fanbox-release-test',
    version,
    scripts: {
      dist: 'electron-builder --mac',
      'dist:win': 'electron-builder --win',
    },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [Unreleased]\n\n- Windows package\n\n');
}

async function main() {
  const port = 38000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FANBOX_PORT: String(port), FANBOX_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanbox-release-'));
  try {
    writeProject(dir, '2.3.3');
    await waitForServer(port, child);
    const base = `http://localhost:${port}`;

    const inspected = await json(`${base}/api/release/inspect?path=${encodeURIComponent(dir)}`);
    assert.strictEqual(inspected.ok, true, inspected.error);
    assert.strictEqual(inspected.hasWinDist, true);
    assert.strictEqual(inspected.nextWinVersion, '2.3.3-win.1');

    let prepared = await json(`${base}/api/release/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: dir,
        channel: 'win',
        version: '2.3.3-win.1',
        notes: '- Windows package',
        doDist: true,
        doPush: false,
        doRelease: true,
      }),
    });
    assert.strictEqual(prepared.ok, true, prepared.error);
    assert.match(prepared.cmd, /npm run dist:win/);
    assert.match(prepared.cmd, /gh release create v2\.3\.3-win\.1/);
    assert.match(prepared.cmd, /dist\/\*2\.3\.3-win\.1\*\.exe/);
    assert.match(prepared.cmd, /dist\/\*2\.3\.3-win\.1\*\.zip/);
    assert.doesNotMatch(prepared.cmd, /\.dmg/);

    writeProject(dir, '2.3.3');
    prepared = await json(`${base}/api/release/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: dir,
        channel: 'source',
        version: '2.3.4',
        notes: '- Source release',
        doDist: true,
        doPush: false,
        doRelease: true,
      }),
    });
    assert.strictEqual(prepared.ok, true, prepared.error);
    assert.match(prepared.cmd, /npm run dist(?!:win)/);
    assert.match(prepared.cmd, /gh release create v2\.3\.4/);
    assert.match(prepared.cmd, /dist\/\*2\.3\.4\*\.dmg/);
    assert.doesNotMatch(prepared.cmd, /\.exe/);
    assert.doesNotMatch(prepared.cmd, /\.zip/);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (child.exitCode && child.exitCode !== 0) throw new Error(output);
  console.log('release wizard tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
