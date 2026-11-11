'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPluginService } = require('../electron/plugin-service.cjs');

const packageFile = process.argv[2];
if (!packageFile || !fs.existsSync(packageFile)) throw new Error('Uso: node tests/macrodeck-inspection-poc.cjs <paquete.macroDeckPlugin>');
const dataRoot = fs.mkdtempSync(path.join(__dirname, '.nexora-macrodeck-poc-'));
const service = createPluginService({ dataRoot, log: () => undefined, feedback: () => undefined, openExternal: async () => undefined });
try {
  const plugin = service.install(fs.readFileSync(packageFile), {
    approvedInstall: true,
    expectedSha256: '9C286454A62946612FE8ACD5402474218AB9D423072E30974F6F71749EE877AB',
    sourceUrl: 'https://github.com/PyFlat/System-Media',
    free: true,
  });
  assert.equal(plugin.id, 'com.pyflat.system-media');
  assert.equal(plugin.ecosystem, 'macrodeck');
  assert.equal(plugin.compatibility, 'inspection-only');
  assert.equal(plugin.license, 'MIT');
  assert.ok(plugin.permissions.length > 0);
  assert.equal(plugin.actions.length, 0, 'Macro Deck anuncia acciones durante el handshake, no en el manifiesto.');
  process.stdout.write(`MACRODECK_INSPECTION_OK ${plugin.id} ${plugin.version} permissions=${plugin.permissions.length}\n`);
} finally {
  service.stopAll();
  const testsRoot = `${path.resolve(__dirname)}${path.sep}`;
  if (path.resolve(dataRoot).startsWith(testsRoot) && path.basename(dataRoot).startsWith('.nexora-macrodeck-poc-')) fs.rmSync(dataRoot, { recursive: true, force: true });
}
