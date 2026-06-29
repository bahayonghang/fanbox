'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { normalizeHomeEnv, normalizePathEnv } = require('./shell');

let cached = null;

const PROXY_KEYS = ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY'];

function userShell() {
  return process.env.SHELL || '/bin/zsh';
}

function hasProxyEnv(env) {
  return PROXY_KEYS.some((k) => env[k]);
}

function proxyUrl(raw, kind = 'http') {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return `${kind === 'socks' ? 'socks5h' : 'http'}://${s}`;
}

function proxyEnvFromUrl(url) {
  if (!url) return {};
  return { http_proxy: url, https_proxy: url, HTTP_PROXY: url, HTTPS_PROXY: url, all_proxy: url, ALL_PROXY: url };
}

function parseWinInetProxy(proxyEnable, proxyServer) {
  if (!/0x1|\b1\b/i.test(String(proxyEnable || ''))) return {};
  const raw = String(proxyServer || '').trim();
  if (!raw) return {};
  const byScheme = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) byScheme[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  if (Object.keys(byScheme).length) {
    const onlySocks = byScheme.socks && !byScheme.http && !byScheme.https;
    const http = proxyUrl(byScheme.http || byScheme.https || byScheme.socks, onlySocks ? 'socks' : 'http');
    const https = proxyUrl(byScheme.https || byScheme.http || byScheme.socks, onlySocks ? 'socks' : 'http');
    return { http_proxy: http, https_proxy: https, HTTP_PROXY: http, HTTPS_PROXY: https, all_proxy: https || http, ALL_PROXY: https || http };
  }
  return proxyEnvFromUrl(proxyUrl(raw));
}

function parseRegQueryValue(stdout, valueName) {
  const re = new RegExp(`^\\s*${valueName}\\s+REG_\\w+\\s+(.+?)\\s*$`, 'im');
  return (String(stdout || '').match(re) || [])[1] || '';
}

function parseWinHttpProxyOutput(stdout) {
  const out = String(stdout || '');
  if (/Direct access/i.test(out)) return {};
  const proxy = (out.match(/Proxy Server\(s\)\s*:\s*(.+)/i) || [])[1];
  return proxyEnvFromUrl(proxyUrl(proxy));
}

function defaultWindowsExtraPathDirs(env) {
  const dirs = [];
  const join = path.win32.join;
  if (env.APPDATA) dirs.push(join(env.APPDATA, 'npm'));
  if (env.LOCALAPPDATA) {
    dirs.push(join(env.LOCALAPPDATA, 'Programs'));
    dirs.push(join(env.LOCALAPPDATA, 'Programs', 'nodejs'));
  }
  if (env.ProgramFiles) dirs.push(join(env.ProgramFiles, 'nodejs'));
  if (env['ProgramFiles(x86)']) dirs.push(join(env['ProgramFiles(x86)'], 'nodejs'));
  if (env.USERPROFILE) {
    dirs.push(join(env.USERPROFILE, '.local', 'bin'));
    dirs.push(join(env.USERPROFILE, 'scoop', 'shims'));
  }
  return dirs;
}

function normalizeEnv(env, platform = process.platform) {
  const homeEnv = normalizeHomeEnv(env, platform);
  const extra = platform === 'win32' ? defaultWindowsExtraPathDirs(homeEnv) : [];
  return normalizePathEnv(homeEnv, platform, extra);
}

function execFileText(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: opts.timeout || 3000, maxBuffer: opts.maxBuffer || 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

function dumpShellEnv() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') return resolve({});
    const marker = '__FANBOX_ENV_8f3a__';
    const cmd = `printf '%s\\n' '${marker}'; env; printf '%s\\n' '${marker}'`;
    execFile(userShell(), ['-ilc', cmd], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = String(stdout || '');
      const seg = out.split(marker)[1] || '';
      const env = {};
      for (const line of seg.split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
      }
      resolve(env);
    });
  });
}

async function windowsProxyEnv() {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const regOut = await execFileText('reg.exe', ['query', key], { timeout: 3000 });
  const winInet = parseWinInetProxy(parseRegQueryValue(regOut, 'ProxyEnable'), parseRegQueryValue(regOut, 'ProxyServer'));
  if (Object.keys(winInet).length) return winInet;
  const winHttp = await execFileText('netsh.exe', ['winhttp', 'show', 'proxy'], { timeout: 3000 });
  return parseWinHttpProxyOutput(winHttp);
}

function darwinProxyEnv() {
  return new Promise((resolve) => {
    execFile('scutil', ['--proxy'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve({});
      const out = String(stdout || '');
      const grab = (k) => (out.match(new RegExp(`\\b${k} : (\\S+)`)) || [])[1];
      let url = '';
      if (grab('HTTPSEnable') === '1') url = `http://${grab('HTTPSProxy')}:${grab('HTTPSPort')}`;
      else if (grab('HTTPEnable') === '1') url = `http://${grab('HTTPProxy')}:${grab('HTTPPort')}`;
      else if (grab('SOCKSEnable') === '1') url = `socks5h://${grab('SOCKSProxy')}:${grab('SOCKSPort')}`;
      resolve(proxyEnvFromUrl(url));
    });
  });
}

function sysProxyEnv() {
  if (process.platform === 'darwin') return darwinProxyEnv();
  if (process.platform === 'win32') return windowsProxyEnv();
  return Promise.resolve({});
}

async function build() {
  const shellEnv = await dumpShellEnv();
  const env = normalizeEnv({ ...process.env, ...shellEnv });
  if (!hasProxyEnv(env)) Object.assign(env, await sysProxyEnv());
  if (!/UTF-8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')) env.LANG = 'en_US.UTF-8';
  return env;
}

function fullEnv() {
  if (!cached) cached = build();
  return cached;
}

function resetEnvCache() {
  cached = null;
}

module.exports = {
  fullEnv,
  resetEnvCache,
  sysProxyEnv,
  dumpShellEnv,
  _test: {
    hasProxyEnv,
    normalizeEnv,
    parseWinInetProxy,
    parseWinHttpProxyOutput,
    proxyEnvFromUrl,
    proxyUrl,
    defaultWindowsExtraPathDirs,
  },
};
