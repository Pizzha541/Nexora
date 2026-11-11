'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { createPluginService } = require('../electron/plugin-service.cjs');

const dataRoot = fs.mkdtempSync(path.join(__dirname, '.nexora-plugin-security-'));
const service = createPluginService({ dataRoot, log: () => undefined, feedback: () => undefined, openExternal: async () => undefined });
try {
  const archive = new AdmZip();
  archive.addFile('sample.sdPlugin/manifest.json', Buffer.from(JSON.stringify({ UUID: 'com.nexora.security-test', Name: 'Security Test', Version: '1.0.0.0', SDKVersion: 2, CodePath: 'plugin.js', Actions: [] })));
  archive.addFile('sample.sdPlugin/plugin.js', Buffer.from('process.exit(0);'));
  assert.throws(() => service.install(archive.toBuffer(), { approvedInstall: false }), /confirmación explícita/);

  const unsafe = new AdmZip();
  unsafe.addFile('sample.sdPlugin/manifest.json', Buffer.from(JSON.stringify({ UUID: 'com.nexora.unsafe', Name: 'Unsafe', Version: '1.0.0.0', SDKVersion: 2, CodePath: 'plugin.js', Actions: [] })));
  unsafe.addFile('../escape.txt', Buffer.from('blocked'));
  const unsafeBuffer = unsafe.toBuffer();
  const names = new AdmZip(unsafeBuffer).getEntries().map((entry) => entry.entryName);
  if (names.some((name) => name.includes('..'))) assert.throws(() => service.install(unsafeBuffer, { approvedInstall: true }), /salir|insegura/);
  assert.equal(fs.existsSync(path.join(__dirname, 'escape.txt')), false);

  const protectedPackage = new AdmZip();
  protectedPackage.addFile('marketplace.sdPlugin/manifest.json', Buffer.concat([
    Buffer.from('ELGATO', 'ascii'),
    Buffer.alloc(64),
  ]));
  assert.throws(
    () => service.install(protectedPackage.toBuffer(), { approvedInstall: true }),
    /protegido por DRM de Elgato/,
  );
  process.stdout.write('PLUGIN_SECURITY_OK\n');
} finally {
  service.stopAll();
  const testsRoot = `${path.resolve(__dirname)}${path.sep}`;
  if (path.resolve(dataRoot).startsWith(testsRoot) && path.basename(dataRoot).startsWith('.nexora-plugin-security-')) fs.rmSync(dataRoot, { recursive: true, force: true });
}
