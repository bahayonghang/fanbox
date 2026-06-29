'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let shotWatcher = null;
const shotSent = new Map();

function platformOf(opts = {}) {
  return opts.platform || process.platform;
}

function screenshotDir(opts = {}) {
  const platform = platformOf(opts);
  if (platform !== 'darwin') return null;
  try {
    const run = opts.execSync || execSync;
    const out = run('defaults read com.apple.screencapture location 2>/dev/null', { encoding: 'utf8' }).trim();
    if (out) return out.startsWith('~') ? path.join(os.homedir(), out.slice(1)) : out;
  } catch { /* 未自定义 → 默认桌面 */ }
  return path.join(os.homedir(), 'Desktop');
}

function screenshotState(opts = {}) {
  const platform = platformOf(opts);
  if (platform !== 'darwin') {
    return { ok: true, supported: false, watching: false, platform, reason: 'unsupported-platform' };
  }
  return { ok: true, supported: true, watching: !!shotWatcher, platform };
}

function startShotWatch(opts = {}) {
  const platform = platformOf(opts);
  if (platform !== 'darwin') return screenshotState(opts);
  if (shotWatcher) return screenshotState(opts);
  const dir = screenshotDir(opts);
  if (!dir || !fs.existsSync(dir)) return { ok: true, supported: true, watching: false, platform, reason: 'missing-directory' };
  const winProvider = typeof opts.winProvider === 'function' ? opts.winProvider : () => null;
  try {
    shotWatcher = fs.watch(dir, { persistent: false }, (evt, filename) => {
      const name = filename ? filename.toString() : '';
      // 截屏写盘有「.截屏xxx.png」点前缀的中间态，跳过；只认系统截屏的命名习惯
      if (!/^(截屏|截圖|截图|Screenshot|Screen Shot|CleanShot|SCR-)/i.test(name) || !/\.(png|jpe?g)$/i.test(name)) return;
      const fp = path.join(dir, name);
      const waitStable = (tries, lastSize) => {
        fs.stat(fp, (err, st) => {
          if (err || !st.isFile()) return;
          if (st.size >= 1000 && st.size === lastSize) {
            const last = shotSent.get(fp) || 0;
            if (Date.now() - last < 3000) return;
            shotSent.set(fp, Date.now());
            if (shotSent.size > 50) { const k = shotSent.keys().next().value; shotSent.delete(k); }
            const win = winProvider();
            if (win && !win.isDestroyed()) win.webContents.send('shot:new', { path: fp, name, size: st.size });
            return;
          }
          if (tries > 0) setTimeout(() => waitStable(tries - 1, st.size), 250);
        });
      };
      setTimeout(() => waitStable(12, -1), 350);
    });
  } catch {
    return { ok: true, supported: true, watching: false, platform, reason: 'watch-failed' };
  }
  return screenshotState(opts);
}

function stopShotWatch() {
  if (!shotWatcher) return;
  try { shotWatcher.close(); } catch { /* */ }
  shotWatcher = null;
}

function resetForTest() {
  stopShotWatch();
  shotSent.clear();
}

module.exports = {
  startShotWatch,
  screenshotState,
  stopShotWatch,
  _test: {
    screenshotDir,
    resetForTest,
  },
};
