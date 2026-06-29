'use strict';

const { execFile } = require('child_process');

function platformOf(opts = {}) {
  return opts.platform || process.platform;
}

function copyImage(filePath, deps = {}) {
  try {
    const nativeImage = deps.nativeImage;
    const clipboard = deps.clipboard;
    if (!nativeImage || !clipboard) return { ok: false, error: '剪贴板不可用' };
    const img = nativeImage.createFromPath(filePath);
    if (!img || img.isEmpty()) return { ok: false, error: '不是可读图片' };
    clipboard.writeImage(img);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message || String(err) };
  }
}

function copyFile(filePath, deps = {}) {
  const platform = platformOf(deps);
  if (!filePath) return Promise.resolve({ ok: false, error: '路径为空' });
  if (platform !== 'darwin') {
    try {
      if (!deps.clipboard || typeof deps.clipboard.writeText !== 'function') {
        return Promise.resolve({ ok: false, error: '剪贴板不可用' });
      }
      deps.clipboard.writeText(String(filePath));
      return Promise.resolve({ ok: true, mode: 'path-text' });
    } catch (err) {
      return Promise.resolve({ ok: false, mode: 'path-text', error: err && err.message || String(err) });
    }
  }
  return new Promise((resolve) => {
    const run = deps.execFile || execFile;
    // argv 传路径，避免拼进 AppleScript 字面量被注入
    run('osascript', ['-e', 'on run argv', '-e', 'set the clipboard to (POSIX file (item 1 of argv))', '-e', 'end run', filePath], (err) => {
      resolve({ ok: !err, mode: 'file-object', error: err && err.message });
    });
  });
}

function fileCopyLabel(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      actionTitle: '复制文件（访达里可粘贴）',
      successText: '已复制文件，可在访达里粘贴',
    };
  }
  return {
    actionTitle: '复制文件路径',
    successText: '已复制文件路径',
  };
}

module.exports = {
  copyImage,
  copyFile,
  fileCopyLabel,
};
