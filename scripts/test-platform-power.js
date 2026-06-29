'use strict';

const assert = require('assert');
const power = require('../electron/platform/power');

function fakeBlocker() {
  let next = 1;
  const started = new Set();
  return {
    started,
    start(type) {
      assert.strictEqual(type, 'prevent-display-sleep');
      const id = next++;
      started.add(id);
      return id;
    },
    stop(id) {
      started.delete(id);
    },
    isStarted(id) {
      return started.has(id);
    },
  };
}

function main() {
  assert.strictEqual(power._test.modeFor('darwin'), 'pmset');
  assert.strictEqual(power._test.modeFor('win32'), 'powerSaveBlocker');
  assert.strictEqual(power._test.modeFor('linux'), null);

  let calls = [];
  let r = power.refreshPowerGuard({
    platform: 'darwin',
    lidIntent: true,
    terminalsSize: 1,
    wechatStayAwake: false,
    wechatConnected: false,
    active: false,
    setDisableSleep(on) { calls.push(on); return true; },
  });
  assert.deepStrictEqual(calls, [true]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.mode, 'pmset');

  const blocker = fakeBlocker();
  power._test.resetForTest();
  r = power.refreshPowerGuard({
    platform: 'win32',
    powerSaveBlocker: blocker,
    lidIntent: false,
    terminalsSize: 0,
    wechatStayAwake: true,
    wechatConnected: true,
    active: false,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.mode, 'powerSaveBlocker');
  assert.strictEqual(blocker.started.size, 1);

  r = power.refreshPowerGuard({
    platform: 'win32',
    powerSaveBlocker: blocker,
    lidIntent: false,
    terminalsSize: 0,
    wechatStayAwake: true,
    wechatConnected: false,
    active: true,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active, false);
  assert.strictEqual(blocker.started.size, 0);

  const state = power.powerState({ platform: 'win32', stayAwake: true, active: false });
  assert.strictEqual(state.supported, true);
  assert.strictEqual(state.mode, 'powerSaveBlocker');
  assert.strictEqual(state.stayAwake, true);

  const unsupported = power.powerState({ platform: 'linux', stayAwake: true, active: true });
  assert.strictEqual(unsupported.supported, false);
  assert.strictEqual(unsupported.unsupported, true);
  assert.strictEqual(unsupported.reason, 'unsupported-platform');
  assert.strictEqual(unsupported.active, false);

  console.log('platform power tests passed');
}

try {
  main();
} catch (err) {
  console.error(err && err.stack || err);
  process.exit(1);
}
