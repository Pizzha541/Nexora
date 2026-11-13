'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VoxoraService } = require('../electron/voxora-service.cjs');

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-voxora-'));
  const discoveryFile = path.join(temporary, 'nexora-integration.json');
  const token = 'a'.repeat(64);
  fs.writeFileSync(discoveryFile, JSON.stringify({
    protocolVersion: '1.0', httpBaseUrl: 'http://127.0.0.1:8791',
    webSocketUrl: 'ws://127.0.0.1:8791/api/v1/events', token,
    voxoraVersion: '0.12.0', pid: 42, updatedAt: new Date().toISOString(),
  }));
  const calls = [];
  const responses = {
    '/api/v1/health': { ok: true, voxoraVersion: '0.12.0', protocolVersion: '1.0', engine: { ready: true, state: 'idle' }, capabilities: { speak: true } },
    '/api/v1/voices': { ok: true, voices: [{ id: 'voice-1', name: 'Helena', language: 'es-ES', engine: 'microsoft' }] },
    '/api/v1/settings': { ok: true, settings: { voiceId: 'voice-1', rate: 1, pitch: 1, volume: 1 } },
    '/api/v1/status': { ok: true, status: { state: 'idle', queueLength: 0 } },
    '/api/v1/speak': { ok: true, itemId: 'item-1', queueLength: 1 },
    '/api/v1/control': { ok: true },
  };
  const service = new VoxoraService({
    discoveryFile, webSocketFactory: null,
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      calls.push({ path: url.pathname, body: options.body ? JSON.parse(options.body) : undefined });
      return { ok: true, status: 200, json: async () => responses[url.pathname] };
    },
  });
  try {
    const summary = await service.summary();
    assert.equal(summary.status, 'connected');
    const catalog = await service.catalog();
    assert.equal(catalog.voices[0].id, 'voice-1');
    const spoken = await service.action('voxora.speak', { text: 'Hola', queueBehavior: 'interrupt', priority: 20 });
    assert.match(spoken, /aceptó/i);
    assert.equal(calls.at(-1).body.text, 'Hola');
    assert.equal(calls.at(-1).body.queueBehavior, 'interrupt');
    assert.equal(calls.at(-1).body.priority, 20);
    await service.action('voxora.pause');
    assert.equal(calls.at(-1).body.operation, 'pause');
    await assert.rejects(() => service.action('voxora.speak', { text: 'x'.repeat(501) }), /500/);

    fs.writeFileSync(discoveryFile, JSON.stringify({ protocolVersion: '1.0', httpBaseUrl: 'http://example.com', webSocketUrl: 'ws://127.0.0.1:8791/api/v1/events', token }));
    await assert.rejects(() => service.readDiscovery(), /no permitida/i);
    process.stdout.write(`VOXORA_SERVICE_OK requests=${calls.length}\n`);
  } finally {
    service.stop();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
