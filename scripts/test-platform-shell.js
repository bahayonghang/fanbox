'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  spawnCommand,
  whichBin,
  normalizeHomeEnv,
  normalizePathEnv,
  mergePathValues,
  _test,
} = require('../electron/platform/shell');

async function main() {
  assert.strictEqual(mergePathValues(['A;B', 'b;C'], 'win32'), 'A;B;C');
  const env = normalizePathEnv({ PATH: 'A', Path: 'B', USERPROFILE: 'C:\\Users\\demo' }, 'win32', ['C']);
  assert.deepStrictEqual(Object.keys(env).filter((k) => k.toLowerCase() === 'path'), ['Path']);
  assert.strictEqual(env.Path, 'A;B;C');
  assert.strictEqual(normalizeHomeEnv({ USERPROFILE: 'C:\\Users\\demo' }, 'win32').HOME, 'C:\\Users\\demo');
  assert.strictEqual(_test.chooseLaunchPath(['tool', 'tool.cmd', 'tool.exe'], 'win32'), 'tool.exe');
  assert.deepStrictEqual(_test.windowsLaunch('x.cmd', ['a b']).args, ['/d', '/s', '/c', '""x.cmd" "a b""']);

  const nodePath = await whichBin('node');
  assert.ok(nodePath, 'whichBin(node) should find node');
  assert.ok(path.isAbsolute(nodePath), `whichBin(node) should be absolute: ${nodePath}`);

  const r = await spawnCommand(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
    stdinText: 'hello stdin',
    idleMs: 5000,
    maxMs: 10000,
  });
  assert.strictEqual(r.ok, true, r.err);
  assert.strictEqual(r.out, 'hello stdin');

  const argv = await spawnCommand(process.execPath, ['-e', 'console.log(process.argv[1])', '引号 " quote\nnext'], {
    idleMs: 5000,
    maxMs: 10000,
  });
  assert.strictEqual(argv.ok, true, argv.err);
  assert.strictEqual(argv.out.trim(), '引号 " quote\nnext');

  const idle = await spawnCommand(process.execPath, ['-e', 'setTimeout(()=>{}, 1000)'], {
    idleMs: 80,
    maxMs: 5000,
  });
  assert.strictEqual(idle.ok, false);
  assert.strictEqual(idle.timedOut, true);
  assert.strictEqual(idle.timeoutReason, 'idle');

  if (process.platform === 'win32') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanbox platform-'));
    const cmd = path.join(dir, 'echo-argv.cmd');
    const js = path.join(dir, 'echo.js');
    fs.writeFileSync(js, [
      'const chunks = [];',
      'process.stdin.on("data", d => chunks.push(d));',
      'process.stdin.on("end", () => console.log(process.argv.slice(2).join("|") + "::" + Buffer.concat(chunks).toString("utf8")));',
      '',
    ].join('\n'));
    fs.writeFileSync(cmd, '@echo off\r\nnode "%~dp0echo.js" %*\r\n');
    try {
      const shim = await spawnCommand(cmd, ['a b', '中文'], { stdinText: 'stdin 中文', idleMs: 5000, maxMs: 10000 });
      assert.strictEqual(shim.ok, true, shim.err);
      assert.strictEqual(shim.out.trim(), 'a b|中文::stdin 中文');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('platform shell tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
