'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { keyCode, resolveHotkey, sendWindowsHotkey } = require('../electron/input-service.cjs');

assert.equal(keyCode('F18'), 0x81);
assert.equal(keyCode('F24'), 0x87);
assert.equal(keyCode('ENTER'), 0x0D);
assert.equal(keyCode('NUMPAD7'), 0x67);

assert.deepEqual(resolveHotkey({ value: 'F18' }), {
  key: 'F18',
  modifiers: [],
  codes: [0x81],
  label: 'F18',
});

assert.deepEqual(resolveHotkey({ value: 'F24', settings: { modifiers: ['control', 'shift'] } }).codes, [0x11, 0x10, 0x87]);
assert.deepEqual(resolveHotkey({ value: 'CTRL+ALT+DELETE' }).codes, [0x11, 0x12, 0x2E]);
assert.throws(() => resolveHotkey({ value: '' }), /Selecciona una tecla válida/);

let captured;
const fakeSpawn = (file, args, options) => {
  captured = { file, args, options };
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('close', 0));
  return child;
};

(async () => {
  const message = await sendWindowsHotkey({ value: 'F18' }, { platform: 'win32', spawnImpl: fakeSpawn });
  assert.match(message, /Windows aceptó F18/);
  assert.equal(captured.file, 'powershell.exe');
  assert.equal(captured.options.windowsHide, true);
  assert.match(captured.args.at(-1), /SendInput/);
  assert.match(captured.args.at(-1), /Size=32/);
  assert.match(captured.args.at(-1), /uint16/);
  assert.match(captured.args.at(-1), /129/);
  console.log('input-service POC: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
