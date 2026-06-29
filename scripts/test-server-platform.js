'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const platform = require('../server-platform');

function makeCentralOnlyZip(file, rawName) {
  const cd = Buffer.alloc(46 + rawName.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt32LE(0, 16);
  cd.writeUInt32LE(0, 20);
  cd.writeUInt32LE(123, 24);
  cd.writeUInt16LE(rawName.length, 28);
  rawName.copy(cd, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(0, 16);

  fs.writeFileSync(file, Buffer.concat([cd, eocd]));
}

async function main() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fanbox-server-platform-'));
  try {
    await fsp.writeFile(path.join(dir, 'a.txt'), 'hello');
    await fsp.mkdir(path.join(dir, 'nested'));
    await fsp.writeFile(path.join(dir, 'nested', 'b.txt'), 'nested content');

    const du = await platform.diskUsage(dir, { platform: 'win32', resolvePath: (p) => path.resolve(p), timeoutMs: 5000 });
    assert.strictEqual(du.ok, true);
    assert.ok(du.items.some((it) => it.name === 'a.txt' && it.size === 5));
    assert.ok(du.items.some((it) => it.name === 'nested' && it.isDir && it.size >= 14));

    const zip = path.join(dir, 'gbk.zip');
    makeCentralOnlyZip(zip, Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x2e, 0x74, 0x78, 0x74]));
    const list = await platform.archiveList(zip, { platform: 'win32', resolvePath: (p) => path.resolve(p) });
    assert.strictEqual(list.ok, true, list.error);
    assert.deepStrictEqual(list.entries, [{ name: '中文.txt', size: 123 }]);

    const grep = await platform.contentSearch('needle', dir, {
      platform: 'win32',
      resolvePath: (p) => path.resolve(p),
      grepFiles: async () => ({ results: [{ name: 'a.txt' }], truncated: false }),
      kindOf: () => 'text',
    });
    assert.strictEqual(grep.engine, 'grep');
    assert.deepStrictEqual(grep.results, [{ name: 'a.txt' }]);

    const cwd = await platform.terminalCwd(12345, { platform: 'win32' });
    assert.strictEqual(cwd, null);

    await assert.rejects(
      platform.generateThumb(path.join(dir, 'a.txt'), 'txt', 240, path.join(dir, 'thumb.png'), false, { platform: 'win32' }),
      /当前平台不支持生成缩略图/
    );

    assert.strictEqual(platform._test.decodeLsofPath('/tmp/\\xe4\\xb8\\xad\\xe6\\x96\\x87'), '/tmp/中文');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }

  console.log('server platform tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
