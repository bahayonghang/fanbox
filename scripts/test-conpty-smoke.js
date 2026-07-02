'use strict';

const fs = require('fs');
const path = require('path');
const { whichBin } = require('../electron/platform/shell');

if (process.platform !== 'win32') {
  console.log('conpty smoke skipped: non-Windows platform');
  process.exit(0);
}

let pty;
try {
  pty = require('node-pty');
} catch (err) {
  console.error('conpty smoke failed: node-pty is not available. Run `npm run rebuild`.');
  console.error(err && err.message || err);
  process.exit(1);
}

const TEST_CWD = process.cwd();
const SHELL_TIMEOUT_MS = 12000;
const activePtys = new Set();

function cleanupActivePtys() {
  for (const child of activePtys) {
    try { child.kill(); } catch { /* ignore */ }
  }
  activePtys.clear();
}

process.once('exit', cleanupActivePtys);

function fileExists(file) {
  try {
    return !!file && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

async function firstFound(names) {
  for (const name of names) {
    if (!name) continue;
    if (path.isAbsolute(name) && fileExists(name)) return name;
    const found = await whichBin(name, { timeout: 3000 });
    if (found) return found;
  }
  return null;
}

async function findGitBash() {
  const candidates = [];
  const git = await whichBin('git', { timeout: 3000 });
  if (git) {
    candidates.push(path.resolve(path.dirname(git), '..', 'bin', 'bash.exe'));
    candidates.push(path.resolve(path.dirname(git), '..', 'usr', 'bin', 'bash.exe'));
  }
  candidates.push(
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LocalAppData || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  );
  const pathBash = await whichBin('bash.exe', { timeout: 3000 });
  if (pathBash && /[\\/]Git[\\/]/i.test(pathBash)) candidates.push(pathBash);
  return candidates.find(fileExists) || null;
}

function stripAnsi(value) {
  return String(value || '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][AB0]/g, '');
}

function cleanOutput(value) {
  return stripAnsi(value)
    .replace(/\0/g, '')
    .replace(/\r/g, '\n');
}

function normalizePathText(value) {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

function outputContainsCwd(output) {
  return normalizePathText(output).includes(normalizePathText(TEST_CWD));
}

function tail(value) {
  const text = cleanOutput(value);
  return text.slice(Math.max(0, text.length - 2000));
}

function runPtyCase(options) {
  const label = options.label;
  const shell = options.shell;
  const args = options.args || [];
  const timeoutMs = options.timeoutMs || SHELL_TIMEOUT_MS;
  const steps = options.steps || [];
  const check = options.check;

  return new Promise((resolve, reject) => {
    let raw = '';
    let done = false;
    let matched = false;
    let child;
    const timers = [];

    function clearTimers() {
      for (const timer of timers.splice(0)) clearTimeout(timer);
    }

    function finish(err) {
      if (done) return;
      done = true;
      clearTimers();
      activePtys.delete(child);
      if (child && err) {
        try { child.kill(); } catch { /* ignore */ }
      }
      if (err) reject(err);
      else resolve(cleanOutput(raw));
    }

    function fail(reason) {
      finish(new Error(`${label} ${reason}\n--- output tail ---\n${tail(raw)}`));
    }

    function pass() {
      if (done || matched) return;
      matched = true;
      try { child.write('exit\r'); } catch { /* ignore */ }
      timers.push(setTimeout(() => finish(null), 1500));
    }

    console.log(`conpty smoke running: ${label}`);
    try {
      child = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: TEST_CWD,
        env: { ...process.env, TERM: 'xterm-256color', FANBOX: '1' },
      });
      activePtys.add(child);
    } catch (err) {
      reject(new Error(`${label} failed to spawn ${shell}: ${err && err.message || err}`));
      return;
    }

    child.onData((data) => {
      raw += data;
      if (check(cleanOutput(raw))) pass();
    });
    child.onExit(({ exitCode }) => {
      if (!done && check(cleanOutput(raw))) finish(null);
      else if (!done) fail(`exited before expected output (code ${exitCode})`);
    });

    let at = 500;
    for (const step of steps) {
      at += step.delayMs || 0;
      timers.push(setTimeout(() => {
        if (!done) child.write(step.data);
      }, at));
    }
    timers.push(setTimeout(() => fail('timed out'), timeoutMs));
  });
}

async function runShellSmoke(label, shell, commands, marker, args = []) {
  await runPtyCase({
    label,
    shell,
    args,
    steps: [{ data: commands }],
    check: (out) => out.includes(marker) && outputContainsCwd(out),
  });
  console.log(`conpty smoke passed: ${label}`);
}

function verifyAgentLaunchContracts() {
  const appJs = fs.readFileSync(path.join(TEST_CWD, 'public', 'app.js'), 'utf8');
  const expected = [
    "const AGENT_REGISTRY = [",
    "{ id: 'claude', label: 'Claude Code', cmd: 'claude --dangerously-skip-permissions'",
    "{ id: 'codex', label: 'Codex', cmd: 'codex'",
    "const AGENT_DEFAULTS = ['claude', 'codex'];",
    'term.launchAgent(a.cmd)',
  ];
  for (const snippet of expected) {
    if (!appJs.includes(snippet)) {
      throw new Error(`agent launch contract changed: missing ${snippet}`);
    }
  }
  console.log('conpty smoke passed: agent launch command contracts');
}

async function main() {
  const powershell = await firstFound(['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh']);
  if (!powershell) throw new Error('PowerShell not found');

  const cmd = await firstFound([process.env.ComSpec, process.env.COMSPEC, 'cmd.exe', 'cmd']);
  if (!cmd) throw new Error('cmd.exe not found');

  await runShellSmoke(
    'powershell',
    powershell,
    'Write-Output (Get-Location).Path\rWrite-Output FANBOX_CONPTY_POWERSHELL_OK\rexit\r',
    'FANBOX_CONPTY_POWERSHELL_OK',
  );

  await runShellSmoke(
    'cmd',
    cmd,
    'cd\r\necho FANBOX_CONPTY_CMD_OK\r\nexit\r\n',
    'FANBOX_CONPTY_CMD_OK',
  );

  const gitBash = await findGitBash();
  if (gitBash) {
    await runShellSmoke(
      'git bash',
      gitBash,
      'pwd -W\r\necho FANBOX_CONPTY_BASH_OK\r\nexit\r\n',
      'FANBOX_CONPTY_BASH_OK',
      ['--login', '-i'],
    );
  } else {
    console.log('conpty smoke skipped: Git Bash not found');
  }

  verifyAgentLaunchContracts();

  console.log('conpty smoke tests passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
