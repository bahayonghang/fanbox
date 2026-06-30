'use strict';

const assert = require('assert');
const update = require('../electron/platform/update');

function fakeFetch(map) {
  return async (url) => {
    const hit = map[url];
    if (!hit) return { ok: false, url };
    if (hit.redirect) return { ok: true, url: hit.redirect };
    return {
      ok: hit.ok !== false,
      url,
      json: async () => hit.json,
    };
  };
}

async function main() {
  const assets = [
    { name: 'FanBox-2.4.0-mac.dmg', browser_download_url: 'https://github.com/bahayonghang/fanbox/releases/download/v2.4.0/FanBox.dmg' },
    { name: 'FanBox-2.4.0-win-x64.zip', browser_download_url: 'https://github.com/bahayonghang/fanbox/releases/download/v2.4.0/FanBox.zip' },
    { name: 'FanBox-2.4.0-win-x64.exe', browser_download_url: 'https://github.com/bahayonghang/fanbox/releases/download/v2.4.0/FanBox.exe' },
  ];
  assert.strictEqual(update._test.selectWindowsAsset(assets).name, 'FanBox-2.4.0-win-x64.exe');
  assert.strictEqual(update._test.selectWindowsAsset(assets.slice(0, 1)), null);

  const fetch = fakeFetch({
    'https://api.github.com/repos/alchaincyf/fanbox/releases/latest': {
      json: { tag_name: 'v2.4.0', html_url: 'https://github.com/alchaincyf/fanbox/releases/tag/v2.4.0', assets: [] },
    },
    'https://api.github.com/repos/bahayonghang/fanbox/releases/latest': {
      json: { tag_name: 'v2.4.1', html_url: 'https://github.com/bahayonghang/fanbox/releases/tag/v2.4.1', assets },
    },
  });
  let result = await update.checkUpdates({
    fetch,
    platform: 'win32',
    currentVersion: '2.3.3',
    env: {},
  });
  assert.strictEqual(result.primary.kind, 'release');
  assert.strictEqual(result.primary.version, '2.4.1');
  assert.strictEqual(result.primary.url.endsWith('.exe'), true);
  assert.strictEqual(result.upstream.kind, 'source');

  result = await update.checkUpdates({
    fetch,
    platform: 'darwin',
    currentVersion: '2.3.3',
    env: {},
  });
  assert.strictEqual(result.primary.kind, 'source');
  assert.strictEqual(result.release, null);

  result = await update.checkUpdates({
    fetch,
    platform: 'win32',
    currentVersion: '2.3.3',
    env: { FANBOX_RELEASE_REPO: '' },
  });
  assert.strictEqual(result.primary.kind, 'source');
  assert.strictEqual(result.release, null);

  const fallbackFetch = fakeFetch({
    'https://api.github.com/repos/alchaincyf/fanbox/releases/latest': { ok: false },
    'https://github.com/alchaincyf/fanbox/releases/latest': {
      redirect: 'https://github.com/alchaincyf/fanbox/releases/tag/v2.5.0',
    },
  });
  const upstream = await update.checkUpstream({ fetch: fallbackFetch, env: {} });
  assert.strictEqual(upstream.version, '2.5.0');
  assert.strictEqual(upstream.url, 'https://github.com/alchaincyf/fanbox/releases/tag/v2.5.0');

  assert.strictEqual(update._test.normalizeRepo('https://github.com/demo/fanbox-windows.git', 'x/y'), 'demo/fanbox-windows');
  assert.strictEqual(update.cmpVer('v2.4.0-win.1', '2.3.9'), 1);
  assert.strictEqual(update.cmpVer('v2.3.3-win.1', '2.3.3') > 0, true);
  assert.strictEqual(update.cmpVer('v2.3.3-win.2', '2.3.3-win.1') > 0, true);
  assert.strictEqual(update.cmpVer('v2.3.4', '2.3.3-win.9') > 0, true);
  assert.strictEqual(update.cmpVer('v2.3.3-win.1', '2.3.3-win.1'), 0);

  const winSuffixFetch = fakeFetch({
    'https://api.github.com/repos/alchaincyf/fanbox/releases/latest': {
      json: { tag_name: 'v2.3.3', html_url: 'https://github.com/alchaincyf/fanbox/releases/tag/v2.3.3', assets: [] },
    },
    'https://api.github.com/repos/bahayonghang/fanbox/releases/latest': {
      json: { tag_name: 'v2.3.3-win.1', html_url: 'https://github.com/bahayonghang/fanbox/releases/tag/v2.3.3-win.1', assets },
    },
  });
  result = await update.checkUpdates({
    fetch: winSuffixFetch,
    platform: 'win32',
    currentVersion: '2.3.3',
    env: {},
  });
  assert.strictEqual(result.primary.kind, 'release');
  assert.strictEqual(result.primary.version, '2.3.3-win.1');

  result = await update.checkUpdates({
    fetch: winSuffixFetch,
    platform: 'win32',
    currentVersion: '2.3.3-win.1',
    env: {},
  });
  assert.strictEqual(result.release, null);

  console.log('platform update tests passed');
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
