'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const nodePtyBuildDir = path.join(root, 'node_modules', 'node-pty', 'build');
const solutionPath = path.join(nodePtyBuildDir, 'binding.sln');
const configPath = path.join(nodePtyBuildDir, 'config.gypi');
const verbose = process.env.FANBOX_BUILD_VERBOSE === '1' || process.argv.includes('--verbose');

function runNodeRebuild() {
  const cli = require.resolve('@electron/rebuild/lib/cli.js');
  return spawnSync(process.execPath, [cli, '-f', '-w', 'node-pty'], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function writeOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function writeSuccess(message, result) {
  if (verbose) {
    writeOutput(result);
    return;
  }
  console.log(message);
}

function readConfig() {
  const raw = fs.readFileSync(configPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  return JSON.parse(raw);
}

function msbuildPlatform(arch) {
  switch (String(arch || '').toLowerCase()) {
    case 'x64':
      return 'x64';
    case 'arm':
      return 'ARM';
    case 'arm64':
      return 'ARM64';
    default:
      return 'Win32';
  }
}

function vsRootFromMsbuild(msbuildPath) {
  return path.resolve(path.dirname(msbuildPath), '..', '..', '..');
}

function hasSpectreLibraries(msbuildPath) {
  const msvcDir = path.join(vsRootFromMsbuild(msbuildPath), 'VC', 'Tools', 'MSVC');
  if (!fs.existsSync(msvcDir)) return false;
  return fs.readdirSync(msvcDir, { withFileTypes: true }).some((entry) => {
    return entry.isDirectory() && fs.existsSync(path.join(msvcDir, entry.name, 'lib', 'spectre'));
  });
}

function isSpectreToolchainFailure(result) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return output.includes('MSB8040') || output.includes('Spectre-mitigated libraries');
}

function runNonSpectreFallback() {
  const config = readConfig();
  const msbuild = config.variables && config.variables.msbuild_path;
  if (!msbuild || !fs.existsSync(msbuild)) {
    console.error('[fanbox] Cannot find MSBuild path in node-pty build/config.gypi.');
    return 1;
  }
  if (!fs.existsSync(solutionPath)) {
    console.error('[fanbox] Cannot find node-pty build/binding.sln for fallback rebuild.');
    return 1;
  }
  if (hasSpectreLibraries(msbuild)) {
    console.error('[fanbox] MSB8040 was reported, but Spectre libraries appear to exist. Refusing fallback.');
    return 1;
  }

  const configuration = (config.target_defaults && config.target_defaults.default_configuration) || 'Release';
  const platform = msbuildPlatform(config.variables && config.variables.target_arch);

  if (verbose) {
    console.warn('[fanbox] Visual Studio Spectre-mitigated libraries are missing.');
    console.warn('[fanbox] Retrying node-pty with MSBuild /p:SpectreMitigation=false.');
    console.warn('[fanbox] Install the VS "C++ x64/x86 Spectre-mitigated libs" component to use node-pty upstream defaults.');
  }

  const result = spawnSync(msbuild, [
    solutionPath,
    `/p:Configuration=${configuration}`,
    `/p:Platform=${platform}`,
    '/p:SpectreMitigation=false',
    '/m',
    '/nodeReuse:false',
    '/nologo',
    '/clp:Verbosity=minimal',
  ], {
    cwd: path.join(root, 'node_modules', 'node-pty'),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    console.error(result.error && result.error.stack || result.error);
    return 1;
  }
  if (result.status === 0) {
    writeSuccess('[fanbox] node-pty rebuilt with non-Spectre MSBuild fallback (VS Spectre libs missing).', result);
    return 0;
  }
  if (!verbose) {
    console.error('[fanbox] Non-Spectre MSBuild fallback failed.');
  }
  writeOutput(result);
  return result.status || 0;
}

const result = runNodeRebuild();
if (result.error) {
  console.error(result.error && result.error.stack || result.error);
  process.exit(1);
}
if (result.status === 0) {
  writeSuccess('[fanbox] node-pty rebuilt for Electron.', result);
  process.exit(0);
}

if (process.platform !== 'win32' || !isSpectreToolchainFailure(result)) {
  writeOutput(result);
  process.exit(result.status || 1);
}

const fallbackStatus = runNonSpectreFallback();
if (fallbackStatus !== 0) {
  console.error('[fanbox] Upstream electron-rebuild output before fallback failure:');
  writeOutput(result);
}
process.exit(fallbackStatus);
