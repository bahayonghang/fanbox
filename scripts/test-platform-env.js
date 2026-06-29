'use strict';

const assert = require('assert');
const { fullEnv, resetEnvCache, _test } = require('../electron/platform/env');

async function main() {
  assert.deepStrictEqual(_test.parseWinInetProxy('0x0', '127.0.0.1:7890'), {});
  assert.deepStrictEqual(_test.parseWinInetProxy('0x1', '127.0.0.1:7890'), {
    http_proxy: 'http://127.0.0.1:7890',
    https_proxy: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://127.0.0.1:7890',
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    all_proxy: 'http://127.0.0.1:7890',
    ALL_PROXY: 'http://127.0.0.1:7890',
  });
  assert.strictEqual(_test.parseWinInetProxy('1', 'http=127.0.0.1:7890;https=127.0.0.1:7891').https_proxy, 'http://127.0.0.1:7891');
  assert.strictEqual(_test.parseWinHttpProxyOutput('Proxy Server(s) : 127.0.0.1:7890').http_proxy, 'http://127.0.0.1:7890');
  assert.deepStrictEqual(_test.parseWinHttpProxyOutput('Direct access (no proxy server).'), {});

  const normalized = _test.normalizeEnv({
    Path: 'C:\\Windows',
    PATH: 'C:\\Tools',
    USERPROFILE: 'C:\\Users\\demo',
    APPDATA: 'C:\\Users\\demo\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local',
  }, 'win32');
  assert.strictEqual(normalized.USERPROFILE, 'C:\\Users\\demo');
  assert.strictEqual(normalized.HOME, 'C:\\Users\\demo');
  assert.ok(normalized.Path.includes('C:\\Windows'));
  assert.ok(normalized.Path.includes('C:\\Tools'));
  assert.ok(normalized.Path.includes('C:\\Users\\demo\\AppData\\Roaming\\npm'));

  resetEnvCache();
  const env = await fullEnv();
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path');
  assert.ok(pathKey && env[pathKey], 'fullEnv should preserve PATH/Path');
  assert.ok(env.HOME || env.USERPROFILE, 'fullEnv should preserve home');
  assert.ok(/UTF-8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || ''), 'fullEnv should set UTF-8 locale');

  console.log('platform env tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
