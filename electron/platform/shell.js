'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const WIN_EXTS = ['.exe', '.cmd', '.bat', '.com'];

function pathKey(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return Object.prototype.hasOwnProperty.call(env, 'PATH') ? 'PATH' : null;
  return Object.keys(env).find((k) => k.toLowerCase() === 'path') || null;
}

function pathValue(env = process.env, platform = process.platform) {
  const k = pathKey(env, platform);
  return k ? env[k] || '' : '';
}

function uniquePathParts(parts, platform = process.platform) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const v = String(part || '').trim();
    if (!v) continue;
    const key = platform === 'win32' ? v.toLowerCase() : v;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function mergePathValues(values, platform = process.platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  const parts = [];
  for (const value of values) {
    if (!value) continue;
    parts.push(...String(value).split(delimiter));
  }
  return uniquePathParts(parts, platform).join(delimiter);
}

function normalizePathEnv(env = process.env, platform = process.platform, extraDirs = []) {
  const out = { ...env };
  if (platform !== 'win32') {
    out.PATH = mergePathValues([out.PATH, extraDirs.join(':')], platform);
    return out;
  }
  const keys = Object.keys(out).filter((k) => k.toLowerCase() === 'path');
  const selected = keys.find((k) => k === 'Path') || keys.find((k) => k === 'PATH') || keys[0] || 'Path';
  const values = keys.map((k) => out[k]);
  for (const k of keys) {
    if (k !== selected) delete out[k];
  }
  out[selected] = mergePathValues([...values, extraDirs.join(';')], platform);
  return out;
}

function normalizeHomeEnv(env = process.env, platform = process.platform) {
  const out = { ...env };
  if (platform === 'win32') {
    if (!out.USERPROFILE && out.HOME) out.USERPROFILE = out.HOME;
    if (!out.HOME && out.USERPROFILE) out.HOME = out.USERPROFILE;
  } else if (!out.HOME && out.USERPROFILE) {
    out.HOME = out.USERPROFILE;
  }
  return out;
}

function homeDirFromEnv(env = process.env, platform = process.platform) {
  if (platform === 'win32') return env.USERPROFILE || env.HOME || process.env.USERPROFILE || process.env.HOME || os.homedir();
  return env.HOME || process.env.HOME || os.homedir();
}

function fileExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function hasPathSeparator(bin) {
  return /[\\/]/.test(bin);
}

function windowsExtCandidates(bin, env = process.env) {
  const ext = path.extname(bin);
  if (ext) return [bin];
  const raw = env.PATHEXT || process.env.PATHEXT || WIN_EXTS.join(';');
  const exts = uniquePathParts(raw.split(';').map((e) => e.toLowerCase()), 'win32');
  const ordered = [...WIN_EXTS.filter((e) => exts.includes(e)), ...exts.filter((e) => !WIN_EXTS.includes(e))];
  return [...ordered.map((e) => `${bin}${e}`), bin];
}

function candidateNames(bin, env = process.env, platform = process.platform) {
  return platform === 'win32' ? windowsExtCandidates(bin, env) : [bin];
}

function pathDirs(env = process.env, platform = process.platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  return uniquePathParts(pathValue(env, platform).split(delimiter), platform);
}

function launchScore(file, platform = process.platform) {
  if (platform !== 'win32') return 0;
  const ext = path.extname(file).toLowerCase();
  const idx = WIN_EXTS.indexOf(ext);
  return idx >= 0 ? idx : WIN_EXTS.length + 1;
}

function chooseLaunchPath(files, platform = process.platform) {
  const unique = uniquePathParts(files, platform);
  if (!unique.length) return null;
  if (platform !== 'win32') return unique[0];
  return unique.sort((a, b) => launchScore(a, platform) - launchScore(b, platform))[0];
}

function cmdQuote(arg) {
  return `"${String(arg).replace(/"/g, '""')}"`;
}

function findOnPath(bin, env = process.env, platform = process.platform) {
  if (!bin || typeof bin !== 'string') return null;
  const names = candidateNames(bin, env, platform);
  if (path.isAbsolute(bin) || hasPathSeparator(bin)) {
    return chooseLaunchPath(names.filter(fileExists), platform);
  }
  const found = [];
  for (const dir of pathDirs(env, platform)) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fileExists(full)) found.push(full);
    }
  }
  return chooseLaunchPath(found, platform);
}

function windowsLaunch(bin, args) {
  const ext = path.extname(bin).toLowerCase();
  if (ext !== '.cmd' && ext !== '.bat') return { bin, args };
  const command = `""${bin}"${args.length ? ` ${args.map(cmdQuote).join(' ')}` : ''}"`;
  return {
    bin: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
    args: ['/d', '/s', '/c', command],
    windowsVerbatimArguments: true,
  };
}

function killProcess(child) {
  if (!child) return;
  if (process.platform === 'win32' && child.pid) {
    try { execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], () => {}); } catch { /* ignore */ }
    return;
  }
  try { child.kill('SIGKILL'); } catch { /* ignore */ }
}

function execFileText(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: opts.timeout || 3000, maxBuffer: opts.maxBuffer || 1024 * 1024, env: opts.env }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

function shellQuotePosix(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

async function whichBin(bin, opts = {}) {
  const platform = opts.platform || process.platform;
  const env = normalizePathEnv(normalizeHomeEnv(opts.env || process.env, platform), platform, opts.extraPathDirs || []);
  const found = findOnPath(bin, env, platform);
  if (found) return found;
  if (platform === 'win32') {
    const out = await execFileText('where.exe', [bin], { timeout: opts.timeout || 3000, env });
    return chooseLaunchPath(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter(fileExists), platform);
  }
  if (platform === 'darwin') {
    const shell = env.SHELL || process.env.SHELL || '/bin/zsh';
    const out = await execFileText(shell, ['-ilc', `command -v ${shellQuotePosix(bin)} 2>/dev/null || true`], { timeout: opts.timeout || 8000, env });
    const candidate = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop();
    return candidate && fileExists(candidate) ? candidate : null;
  }
  return null;
}

async function spawnCommand(bin, args = [], opts = {}) {
  const idleMs = opts.idleMs || 120000;
  const maxMs = opts.maxMs || 1800000;
  const baseEnv = normalizeHomeEnv(opts.env || process.env);
  const env = normalizePathEnv(baseEnv, process.platform, opts.extraPathDirs || []);
  const cwd = opts.cwd || homeDirFromEnv(env);
  const started = Date.now();
  const resolved = path.isAbsolute(bin) || hasPathSeparator(bin)
    ? bin
    : (await whichBin(bin, { env, timeout: opts.whichTimeout || 8000 })) || bin;
  const launch = process.platform === 'win32' ? windowsLaunch(resolved, args) : { bin: resolved, args };

  return new Promise((resolve) => {
    let child;
    let out = '';
    let err = '';
    let done = false;
    let lineBuf = '';
    let idleTimer = null;
    let maxTimer = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      resolve({ ...r, out, err: r.err == null ? err : r.err, ms: Date.now() - started });
    };
    const kill = (reason) => {
      killProcess(child);
      finish({ ok: false, timedOut: true, timeoutReason: reason, err: `${err}\n[超时:${reason}]` });
    };
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => kill('idle'), idleMs);
    };
    maxTimer = setTimeout(() => kill('max'), maxMs);
    armIdle();
    try {
      child = spawn(launch.bin, launch.args.map(String), {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: !!launch.windowsVerbatimArguments,
      });
    } catch (e) {
      finish({ ok: false, err: String(e && e.message || e) });
      return;
    }
    child.stdout.on('data', (d) => {
      if (done) return;
      armIdle();
      const s = d.toString('utf8');
      out += s;
      if (!opts.onLine) return;
      lineBuf += s;
      let nl;
      while ((nl = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        try { opts.onLine(line); } catch { /* ignore */ }
      }
    });
    child.stderr.on('data', (d) => {
      if (done) return;
      armIdle();
      err += d.toString('utf8');
    });
    child.on('error', (e) => finish({ ok: false, err: String(e && e.message || e) }));
    child.on('close', (code) => finish({ ok: code === 0, code }));
    try {
      if (opts.stdinText != null) child.stdin.write(opts.stdinText);
      child.stdin.end();
    } catch { /* ignore */ }
  });
}

module.exports = {
  spawnCommand,
  whichBin,
  normalizeHomeEnv,
  normalizePathEnv,
  mergePathValues,
  pathValue,
  pathDirs,
  findOnPath,
  _test: {
    candidateNames,
    chooseLaunchPath,
    cmdQuote,
    windowsLaunch,
  },
};
