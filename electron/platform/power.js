'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

let blockerId = null;

function platformOf(opts = {}) {
  return opts.platform || process.platform;
}

function modeFor(platform) {
  if (platform === 'darwin') return 'pmset';
  if (platform === 'win32') return 'powerSaveBlocker';
  return null;
}

function unsupported(platform) {
  return { ok: false, supported: false, unsupported: true, reason: 'unsupported-platform', platform };
}

function trySetDisableSleep(on, opts = {}) {
  const platform = platformOf(opts);
  if (platform !== 'darwin') return false;
  if (typeof opts.setDisableSleep === 'function') return !!opts.setDisableSleep(!!on);
  try {
    execFileSync('/usr/bin/sudo', ['-n', 'pmset', '-a', 'disablesleep', on ? '1' : '0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function tempDir(opts = {}) {
  try {
    if (opts.app && typeof opts.app.getPath === 'function') return opts.app.getPath('temp');
  } catch { /* ignore */ }
  return os.tmpdir();
}

function installSudoers(opts = {}) {
  return new Promise((resolve) => {
    const platform = platformOf(opts);
    if (platform !== 'darwin') return resolve(false);
    const user = (os.userInfo().username || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!user) return resolve(false);
    const sh = [
      '#!/bin/sh', 'set -e',
      'f=/etc/sudoers.d/fanbox-pmset',
      "cat > \"$f\" <<'EOF'",
      `${user} ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1`,
      'EOF',
      'chown root:wheel "$f"',
      'chmod 440 "$f"',
      '/usr/sbin/visudo -cf "$f" || { rm -f "$f"; exit 1; }',
      '',
    ].join('\n');
    let tmp;
    try {
      tmp = path.join(tempDir(opts), 'fanbox-sudoers-install.sh');
      fs.writeFileSync(tmp, sh, { mode: 0o700 });
    } catch {
      return resolve(false);
    }
    const apple = `do shell script "/bin/sh " & quoted form of "${tmp}" with administrator privileges`;
    console.log('[lid] running osascript admin prompt, tmp =', tmp);
    const run = opts.execFile || execFile;
    run('/usr/bin/osascript', ['-e', apple], (err, stdout, stderr) => {
      console.log('[lid] osascript done. err =', err && err.message, '| stderr =', stderr);
      try { fs.unlinkSync(tmp); } catch { /* */ }
      resolve(!err);
    });
  });
}

async function ensurePmsetRule(opts = {}) {
  const platform = platformOf(opts);
  if (platform !== 'darwin') return false;
  if (trySetDisableSleep(false, opts)) return true;
  return installSudoers(opts);
}

function wantActive(ctx = {}) {
  return !!((ctx.lidIntent && Number(ctx.terminalsSize || 0) > 0) || (ctx.wechatStayAwake && ctx.wechatConnected));
}

function setWindowsBlocker(on, opts = {}) {
  const blocker = opts.powerSaveBlocker;
  if (!blocker || typeof blocker.start !== 'function' || typeof blocker.stop !== 'function') return false;
  if (on) {
    if (blockerId != null && (!blocker.isStarted || blocker.isStarted(blockerId))) return true;
    blockerId = blocker.start('prevent-display-sleep');
    return blockerId != null && (!blocker.isStarted || blocker.isStarted(blockerId));
  }
  if (blockerId != null) {
    try {
      if (!blocker.isStarted || blocker.isStarted(blockerId)) blocker.stop(blockerId);
    } catch { /* ignore */ }
    blockerId = null;
  }
  return true;
}

function applyNativeState(on, opts = {}) {
  const platform = platformOf(opts);
  if (platform === 'darwin') return trySetDisableSleep(on, opts);
  if (platform === 'win32') return setWindowsBlocker(on, opts);
  return false;
}

function refreshPowerGuard(ctx = {}) {
  const platform = platformOf(ctx);
  const mode = modeFor(platform);
  if (!mode) return { ...unsupported(platform), active: false, want: false };
  const want = wantActive(ctx);
  const current = !!ctx.active;
  if (want === current) return { ok: true, supported: true, platform, mode, active: current, want };
  const ok = applyNativeState(want, ctx);
  return { ok, supported: true, platform, mode, active: want && ok, want };
}

function cleanupPowerGuard(opts = {}) {
  const platform = platformOf(opts);
  if (platform === 'darwin') return trySetDisableSleep(false, opts);
  if (platform === 'win32') return setWindowsBlocker(false, opts);
  return false;
}

function powerState(ctx = {}) {
  const platform = platformOf(ctx);
  const mode = modeFor(platform);
  if (!mode) return { ...unsupported(platform), stayAwake: !!ctx.stayAwake, active: false };
  return {
    ok: true,
    supported: true,
    platform,
    mode,
    stayAwake: !!ctx.stayAwake,
    active: !!ctx.active,
  };
}

function resetForTest() {
  blockerId = null;
}

module.exports = {
  trySetDisableSleep,
  installSudoers,
  ensurePmsetRule,
  refreshPowerGuard,
  cleanupPowerGuard,
  powerState,
  _test: {
    modeFor,
    wantActive,
    resetForTest,
  },
};
