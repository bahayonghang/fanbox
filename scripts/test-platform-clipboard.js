'use strict';

const assert = require('assert');
const clipboardPlatform = require('../electron/platform/clipboard');

async function main() {
  const writes = [];
  const win = await clipboardPlatform.copyFile('C:\\Users\\demo\\a b.txt', {
    platform: 'win32',
    clipboard: { writeText: (text) => writes.push(text) },
  });
  assert.strictEqual(win.ok, true);
  assert.strictEqual(win.mode, 'path-text');
  assert.deepStrictEqual(writes, ['C:\\Users\\demo\\a b.txt']);

  const calls = [];
  const mac = await clipboardPlatform.copyFile('/tmp/a " b.txt', {
    platform: 'darwin',
    execFile(file, args, cb) {
      calls.push({ file, args });
      cb(null);
    },
  });
  assert.strictEqual(mac.ok, true);
  assert.strictEqual(mac.mode, 'file-object');
  assert.strictEqual(calls[0].file, 'osascript');
  assert.strictEqual(calls[0].args[calls[0].args.length - 1], '/tmp/a " b.txt');
  assert.ok(!calls[0].args.slice(0, -1).join('\n').includes('/tmp/a " b.txt'));

  let wroteImage = false;
  const img = clipboardPlatform.copyImage('/tmp/demo.png', {
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    clipboard: { writeImage: () => { wroteImage = true; } },
  });
  assert.strictEqual(img.ok, true);
  assert.strictEqual(wroteImage, true);

  assert.strictEqual(clipboardPlatform.fileCopyLabel('darwin').actionTitle, '复制文件（访达里可粘贴）');
  assert.strictEqual(clipboardPlatform.fileCopyLabel('win32').successText, '已复制文件路径');

  console.log('platform clipboard tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
