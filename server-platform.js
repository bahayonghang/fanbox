#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { exec, spawn, execFile } = require('child_process');
const { whichBin } = require('./electron/platform/shell');

function platformOf(deps) {
  return (deps && deps.platform) || process.platform;
}

function resolveInput(p, deps) {
  const resolvePath = deps && deps.resolvePath;
  return resolvePath ? resolvePath(p) : path.resolve(String(p || ''));
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function cmdQuote(s) {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function decodeMaybeGbk(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { try { return new TextDecoder('gbk').decode(buf); } catch { return buf.toString('latin1'); } }
}

function execFileText(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: opts.timeout || 15000,
      maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
      encoding: opts.encoding || 'utf8',
      env: opts.env,
    }, (err, stdout) => (err ? reject(err) : resolve(stdout || '')));
  });
}

function execFileBuffer(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: opts.timeout || 15000,
      maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
      encoding: 'buffer',
      env: opts.env,
    }, (err, stdout) => (err ? reject(err) : resolve(stdout || Buffer.alloc(0))));
  });
}

async function dirSizeNode(dir, state) {
  if (Date.now() > state.deadline) { state.partial = true; return 0; }
  let names;
  try { names = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return 0; }
  let total = 0;
  for (const d of names) {
    if (Date.now() > state.deadline) { state.partial = true; break; }
    const full = path.join(dir, d.name);
    try {
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) total += await dirSizeNode(full, state);
      else if (d.isFile()) total += (await fsp.lstat(full)).size;
    } catch { /* ignore unreadable entries */ }
  }
  return total;
}

async function diskUsage(p, deps = {}) {
  const dir = resolveInput(p, deps);
  let names;
  try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return { ok: false, error: '读取失败：' + e.message }; }
  const dirs = [], items = [];
  await Promise.all(names.map(async (d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory() && !d.isSymbolicLink()) { dirs.push(full); return; }
    try { const st = await fsp.lstat(full); if (st.isFile()) items.push({ name: d.name, size: st.size, isDir: false }); } catch { /* ignore */ }
  }));

  let partial = false;
  if (dirs.length) {
    if (platformOf(deps) === 'win32') {
      const state = { deadline: Date.now() + (deps.timeoutMs || 4500), partial: false };
      for (const full of dirs) {
        if (Date.now() > state.deadline) { state.partial = true; break; }
        const size = await dirSizeNode(full, state);
        items.push({ name: path.basename(full), size, isDir: true, partial: state.partial });
      }
      partial = state.partial;
    } else {
      const out = await new Promise((resolve) => {
        execFile('du', ['-sk', ...dirs], { timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(stdout || ''));
      });
      for (const line of out.split('\n')) {
        const m = line.match(/^(\d+)\s+(.+)$/);
        if (m) items.push({ name: path.basename(m[2]), size: Number(m[1]) * 1024, isDir: true });
      }
    }
  }
  items.sort((a, b) => b.size - a.size);
  const total = items.reduce((a, b) => a + b.size, 0);
  return { ok: true, dir, total, items: items.slice(0, 60), more: Math.max(0, items.length - 60), partial };
}

async function zipNames(file, MAX) {
  let fd;
  try {
    fd = await fsp.open(file, 'r');
    const { size } = await fd.stat();
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await fd.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) { if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return null;
    const cdCount = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) return null;
    const cd = Buffer.alloc(cdSize);
    await fd.read(cd, 0, cdSize, cdOffset);
    const gbk = new TextDecoder('gbk');
    const out = [];
    let p = 0;
    for (let i = 0; i < cdCount && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const flag = cd.readUInt16LE(p + 8);
      const usize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const nameBuf = cd.subarray(p + 46, p + 46 + nameLen);
      let nm;
      if (flag & 0x800) nm = nameBuf.toString('utf8');
      else { try { nm = gbk.decode(nameBuf); } catch { nm = nameBuf.toString('utf8'); } }
      out.push({ name: nm, size: usize });
      p += 46 + nameLen + extraLen + commentLen;
      if (out.length > MAX) break;
    }
    return out;
  } catch { return null; }
  finally { if (fd) await fd.close().catch(() => {}); }
}

async function archiveCommandEntries(cmd, args, opts = {}) {
  const raw = await execFileBuffer(cmd, args, { timeout: opts.timeout || 15000 });
  return decodeMaybeGbk(raw);
}

async function appendTarEntries(file, entries, MAX, platform) {
  try {
    const out = await archiveCommandEntries('tar', ['-tf', file]);
    for (const line of out.split('\n')) {
      if (line.trim()) entries.push({ name: line.trim() });
      if (entries.length > MAX) break;
    }
  } catch (e) {
    if (platform === 'win32' && e && e.code === 'ENOENT') {
      const err = new Error('Windows 暂不支持预览该压缩格式');
      err.unsupported = true;
      throw err;
    }
    throw e;
  }
}

async function archiveList(p, deps = {}) {
  const file = resolveInput(p, deps);
  try { await fsp.stat(file); } catch { return { ok: false, error: '文件不存在' }; }
  const platform = platformOf(deps);
  const name = path.basename(file).toLowerCase();
  const MAX = 800;
  const entries = [];
  try {
    if (/\.(zip|jar)$/.test(name)) {
      const parsed = await zipNames(file, MAX);
      if (parsed) {
        entries.push(...parsed);
      } else if (platform === 'win32') {
        await appendTarEntries(file, entries, MAX, platform);
      } else {
        const out = await archiveCommandEntries('unzip', ['-l', '--', file]);
        for (const line of out.split('\n')) {
          const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+)$/);
          if (m) entries.push({ name: m[2], size: Number(m[1]) });
          if (entries.length > MAX) break;
        }
      }
    } else if (/\.(tar|tgz|tbz2?|txz)$/.test(name) || /\.tar\.(gz|bz2|xz|zst)$/.test(name)) {
      await appendTarEntries(file, entries, MAX, platform);
    } else if (/\.gz$/.test(name) && platform !== 'win32') {
      const out = await archiveCommandEntries('gzip', ['-l', file]);
      const m = out.split('\n')[1] && out.split('\n')[1].match(/^\s*\d+\s+(\d+)/);
      entries.push({ name: path.basename(file, '.gz'), size: m ? Number(m[1]) : undefined });
    } else {
      return { ok: false, unsupported: true, error: platform === 'win32' ? 'Windows 暂不支持预览该压缩格式' : '7z / rar 没有系统自带的解析工具，可在系统解压软件中打开' };
    }
  } catch (e) {
    if (e && e.unsupported) return { ok: false, unsupported: true, error: e.message };
    return { ok: false, error: '读取失败：' + (e.message || '').split('\n')[0] };
  }
  const truncated = entries.length > MAX;
  return { ok: true, entries: entries.slice(0, MAX), truncated };
}

function runThumbCommand(cmd, args) {
  return new Promise((resolve, reject) => execFile(cmd, args, { timeout: 15000 }, (e) => (e ? reject(e) : resolve())));
}

async function generateThumb(src, e, size, cacheFile, isImg, deps = {}) {
  if (platformOf(deps) !== 'darwin') throw new Error('当前平台不支持生成缩略图');
  await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
  if (isImg) {
    const fmt = cacheFile.endsWith('.png') ? 'png' : 'jpeg';
    await runThumbCommand('sips', ['-s', 'format', fmt, '-Z', String(size), src, '--out', cacheFile]);
    return;
  }
  const tmpDir = path.join(path.dirname(cacheFile), '_ql_' + process.pid + '_' + Math.random().toString(16).slice(2));
  await fsp.mkdir(tmpDir, { recursive: true });
  try {
    await runThumbCommand('qlmanage', ['-t', '-s', String(size), '-o', tmpDir, src]);
    const png = (await fsp.readdir(tmpDir)).find((f) => f.endsWith('.png'));
    if (!png) throw new Error('no thumb');
    await fsp.rename(path.join(tmpDir, png), cacheFile);
  } finally { fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {}); }
}

async function transcodeHeic(file, cacheFile, deps = {}) {
  if (platformOf(deps) !== 'darwin') throw new Error('当前平台不支持 HEIC 转码');
  await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
  await runThumbCommand('sips', ['-s', 'format', 'jpeg', file, '--out', cacheFile]);
}

function openInOS(target, withApp, deps = {}) {
  const platform = platformOf(deps);
  return new Promise((resolve) => {
    let cmd, args;
    if (withApp === 'terminal') {
      const dir = (() => { try { return fs.statSync(target).isDirectory() ? target : path.dirname(target); } catch { return path.dirname(target); } })();
      if (platform === 'darwin') cmd = `open -a Terminal ${shellQuote(dir)}`;
      else if (platform === 'win32') cmd = `start "" cmd /K cd /d ${cmdQuote(dir)}`;
      else cmd = `x-terminal-emulator --working-directory=${shellQuote(dir)} || gnome-terminal --working-directory=${shellQuote(dir)} || xterm`;
      exec(cmd, (err) => resolve(err ? { ok: false, error: err.message } : { ok: true, with: 'terminal' }));
      return;
    }
    if (withApp === 'editor') {
      args = [target];
      const child = spawn('code', args, { stdio: 'ignore', detached: true });
      child.on('error', () => { openDefault(target, withApp, platform).then(resolve); });
      child.on('spawn', () => { child.unref(); resolve({ ok: true, with: 'editor' }); });
      return;
    }
    openDefault(target, withApp, platform).then(resolve);
  });
}

function openDefault(target, withApp, platform) {
  return new Promise((resolve) => {
    let cmd;
    if (platform === 'darwin') {
      if (withApp === 'reveal') cmd = `open -R ${shellQuote(target)}`;
      else cmd = `open ${shellQuote(target)}`;
    } else if (platform === 'win32') {
      if (withApp === 'reveal') cmd = `explorer /select,${cmdQuote(target)}`;
      else cmd = `start "" ${cmdQuote(target)}`;
    } else {
      if (withApp === 'reveal') cmd = `xdg-open ${shellQuote(path.dirname(target))}`;
      else cmd = `xdg-open ${shellQuote(target)}`;
    }
    exec(cmd, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true, with: withApp || 'default' });
    });
  });
}

async function commandExists(bin, deps = {}) {
  return !!(await whichBin(bin, deps));
}

function decodeLsofPath(s) {
  if (!/\\x[0-9a-fA-F]{2}/.test(s)) return s;
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
      bytes.push(parseInt(s.slice(i + 2, i + 4), 16));
      i += 3;
    } else {
      for (const b of Buffer.from(s[i], 'utf8')) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function terminalCwd(pid, deps = {}) {
  return new Promise((resolve) => {
    if (!pid || platformOf(deps) !== 'darwin') return resolve(null);
    exec(`lsof -a -p ${pid} -d cwd -Fn`, { env: { ...process.env, LC_ALL: 'en_US.UTF-8' }, timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      const line = (stdout || '').split('\n').find((l) => l.startsWith('n'));
      resolve(line ? decodeLsofPath(line.slice(1)) : null);
    });
  });
}

function spotlightFind(args) {
  return new Promise((resolve) => {
    execFile('mdfind', args, { timeout: 6000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout).split('\n').filter(Boolean));
    });
  });
}

async function contentSearch(query, rootPath, deps = {}) {
  const grepFiles = deps.grepFiles;
  if (typeof grepFiles !== 'function') throw new Error('缺少 grep 搜索实现');
  const root = resolveInput(rootPath, deps);
  const q = (query || '').trim();
  if (!q || q.length < 2) return { results: [] };
  if (platformOf(deps) !== 'darwin') {
    const fb = await grepFiles(query, rootPath);
    return { ...fb, engine: 'grep' };
  }
  const kindOf = deps.kindOf || (() => 'file');
  const esc = q.replace(/[\\"*]/g, '');
  const paths = await spotlightFind(['-onlyin', root, `(kMDItemTextContent == "*${esc}*"cd) || (kMDItemDisplayName == "*${esc}*"cd)`]);
  if (paths === null || !paths.length) {
    const fb = await grepFiles(query, rootPath);
    return { ...fb, engine: 'grep' };
  }
  const results = [];
  const deadline = Date.now() + 2500;
  for (const p of paths) {
    if (results.length >= 60 || Date.now() > deadline) break;
    if (/\/(node_modules|\.git|Library\/Caches)\//.test(p)) continue;
    let st; try { st = await fsp.stat(p); } catch { continue; }
    if (st.isDirectory()) continue;
    const name = path.basename(p);
    results.push({ name, path: p, isDir: false, kind: kindOf(name, false), hidden: name.startsWith('.'), size: st.size, mtime: st.mtimeMs, btime: st.birthtimeMs || 0 });
  }
  results.sort((a, b) => b.mtime - a.mtime);
  const lower = q.toLowerCase();
  let read = 0;
  for (const r of results) {
    if (read >= 12) break;
    if (r.kind !== 'text' || r.size > 512 * 1024) continue;
    read++;
    let content; try { content = await fsp.readFile(r.path, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    const hits = [];
    for (let i = 0; i < lines.length && hits.length < 3; i++) {
      if (lines[i].toLowerCase().includes(lower)) hits.push({ line: i + 1, text: lines[i].trim().slice(0, 200) });
    }
    if (hits.length) r.hits = hits;
  }
  return { results, truncated: paths.length > results.length, engine: 'spotlight' };
}

async function findByName(name, deps = {}) {
  if (platformOf(deps) !== 'darwin') return [];
  const q = String(name || '').trim();
  if (!q) return [];
  return (await spotlightFind(['-name', q])) || [];
}

module.exports = {
  diskUsage,
  archiveList,
  generateThumb,
  transcodeHeic,
  openInOS,
  commandExists,
  terminalCwd,
  contentSearch,
  findByName,
  _test: {
    zipNames,
    decodeMaybeGbk,
    decodeLsofPath,
    shellQuote,
    cmdQuote,
    dirSizeNode,
  },
};
