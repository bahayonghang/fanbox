'use strict';

if (process.env.FANBOX_BUILD_VERBOSE !== '1') {
  process.env.NO_UPDATE_NOTIFIER = process.env.NO_UPDATE_NOTIFIER || '1';

  const path = require('path');
  const { log } = require('builder-util');

  const original = {
    info: log.info.bind(log),
    warn: log.warn.bind(log),
    error: log.error.bind(log),
  };

  const printed = new Set();

  function messageOf(messageOrFields, message) {
    return String(message === undefined ? messageOrFields : message);
  }

  function fieldsOf(messageOrFields, message) {
    return message === undefined ? null : messageOrFields;
  }

  function relativeFile(file) {
    if (!file) return '';
    return path.relative(process.cwd(), String(file)).replace(/\\/g, '/');
  }

  function printOnce(key, line) {
    if (printed.has(key)) return;
    printed.add(key);
    console.log(line);
  }

  log.info = function quietInfo(messageOrFields, message) {
    const msg = messageOf(messageOrFields, message);
    const fields = fieldsOf(messageOrFields, message);

    if (msg === 'packaging') {
      const platform = fields && fields.platform ? fields.platform : 'app';
      const arch = fields && fields.arch ? ` ${fields.arch}` : '';
      const outDir = fields && fields.appOutDir ? ` -> ${relativeFile(fields.appOutDir)}` : '';
      printOnce(`packaging:${platform}:${arch}:${outDir}`, `[fanbox] Packaging ${platform}${arch}${outDir}`);
      return;
    }

    if (msg === 'building') {
      const target = fields && fields.target ? fields.target : 'artifact';
      const file = fields && fields.file ? ` -> ${relativeFile(fields.file)}` : '';
      console.log(`[fanbox] Building ${target}${file}`);
      return;
    }

    if (
      msg === 'electron-builder' ||
      msg.includes('@electron/rebuild already used by electron-builder') ||
      msg === 'loaded configuration' ||
      msg === 'skipped dependencies rebuild' ||
      msg === 'updating asar integrity executable resource' ||
      msg === 'signing with signtool.exe' ||
      msg === 'building block map'
    ) {
      return;
    }

    original.info(messageOrFields, message);
  };

  log.warn = function quietWarn(messageOrFields, message) {
    const msg = messageOf(messageOrFields, message);
    if (
      msg === 'author is missed in the package.json' ||
      msg === 'no signing info identified, signing is skipped' ||
      msg.includes('@electron/rebuild already used by electron-builder')
    ) {
      return;
    }

    original.warn(messageOrFields, message);
  };

  log.error = function quietError(messageOrFields, message) {
    original.error(messageOrFields, message);
  };

  process.on('exit', (code) => {
    if (code === 0) {
      console.log('[fanbox] Windows package complete.');
    } else {
      console.error('[fanbox] Build failed. Set FANBOX_BUILD_VERBOSE=1 and rerun npm run dist:win for full electron-builder output.');
    }
  });
}
