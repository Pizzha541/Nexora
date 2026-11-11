'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPluginService } = require('../electron/plugin-service.cjs');

async function main() {
  const packageFile = process.argv[2];
  if (!packageFile || !fs.existsSync(packageFile)) throw new Error('Uso: node tests/plugin-poc.cjs <paquete.streamDeckPlugin>');
  const dataRoot = fs.mkdtempSync(path.join(__dirname, '.nexora-plugin-poc-'));
  process.stderr.write(`[poc-root] ${dataRoot}\n`);
  const feedback = [];
  const service = createPluginService({
    dataRoot,
    log: (kind, value) => process.stderr.write(`[${kind}] ${value}\n`),
    feedback: (value) => feedback.push(value),
    openExternal: async () => undefined,
    runtimeExecutable: process.env.NEXORA_PLUGIN_NODE_EXECUTABLE,
  });
  try {
    const plugin = service.install(fs.readFileSync(packageFile), {
      approvedInstall: true,
      declaredLicense: 'MIT',
      sourceUrl: 'https://github.com/elgatosf/streamdeck-plugin-samples/tree/main/hello-world',
      free: true,
    });
    assert.equal(plugin.id, 'com.elgato.hello-world');
    assert.equal(plugin.compatibility, 'experimental-runtime');
    assert.equal(plugin.actions.length, 1);
    assert.equal(plugin.executionApproved, false);
    service.approve(plugin.id, true);
    const result = await service.execute(plugin.id, plugin.actions[0].id, {}, 'nexora-poc-context', 0);
    assert.equal(result.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok(feedback.some((value) => value.event === 'setTitle'), 'El plugin no devolvió setTitle al host NEXORA.');
    process.stdout.write(`PLUGIN_POC_OK ${plugin.id} ${plugin.actions[0].id}\n`);
  } finally {
    service.stopAll();
    const testsRoot = `${path.resolve(__dirname)}${path.sep}`;
    if (!process.env.KEEP_POC && path.resolve(dataRoot).startsWith(testsRoot) && path.basename(dataRoot).startsWith('.nexora-plugin-poc-')) {
      fs.rmSync(dataRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
