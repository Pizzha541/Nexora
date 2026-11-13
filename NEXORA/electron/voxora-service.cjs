'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const WebSocket = require('ws');

const PROTOCOL_VERSION = '1.0';
const CONTROL_OPERATIONS = new Set(['pause', 'resume', 'stop', 'skip', 'clearQueue']);
const QUEUE_BEHAVIORS = new Set(['append', 'replace', 'interrupt']);

function validateLocalUrl(raw, protocols, expectedPath) {
  const parsed = new URL(String(raw || ''));
  if (!protocols.includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password) {
    throw new Error('VOXORA publicó una dirección local no permitida.');
  }
  if (expectedPath && parsed.pathname !== expectedPath) throw new Error('La ruta de eventos de VOXORA no es compatible.');
  return parsed.href.replace(/\/$/, '');
}

function optionalNumber(value, name, min, max) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  return number;
}

function requestId(value) {
  const result = String(value || `nexora-${crypto.randomUUID()}`);
  if (result.length > 128) throw new Error('requestId admite como máximo 128 caracteres.');
  return result;
}

class VoxoraService {
  constructor(options = {}) {
    const localAppData = options.localAppData || process.env.LOCALAPPDATA || '';
    this.discoveryFile = options.discoveryFile || path.join(localAppData, 'Voxora', 'nexora-integration.json');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.webSocketFactory = options.webSocketFactory === undefined
      ? (url, config) => new WebSocket(url, config)
      : options.webSocketFactory;
    this.onEvent = options.onEvent || (() => {});
    this.log = options.log || (() => {});
    this.socket = null;
    this.socketFingerprint = '';
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.stopped = false;
  }

  async readDiscovery() {
    let parsed;
    try { parsed = JSON.parse(await fs.readFile(this.discoveryFile, 'utf8')); }
    catch (error) {
      if (error?.code === 'ENOENT') throw new Error('VOXORA no está abierto.');
      throw new Error('No se pudo leer el archivo de descubrimiento de VOXORA.');
    }
    if (parsed.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Protocolo VOXORA no compatible: ${parsed.protocolVersion || 'desconocido'}.`);
    const token = String(parsed.token || '');
    if (token.length < 32 || token.length > 1024 || /\s/.test(token)) throw new Error('El token local de VOXORA no es válido.');
    return {
      protocolVersion: parsed.protocolVersion,
      httpBaseUrl: validateLocalUrl(parsed.httpBaseUrl, ['http:']),
      webSocketUrl: validateLocalUrl(parsed.webSocketUrl, ['ws:'], '/api/v1/events'),
      token,
      voxoraVersion: String(parsed.voxoraVersion || ''),
      pid: Number(parsed.pid || 0),
      updatedAt: String(parsed.updatedAt || ''),
    };
  }

  async request(endpoint, options = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('El cliente HTTP local no está disponible.');
    const discovery = await this.readDiscovery();
    const target = new URL(endpoint, `${discovery.httpBaseUrl}/`);
    if (target.hostname !== '127.0.0.1' || target.origin !== new URL(discovery.httpBaseUrl).origin) throw new Error('Destino VOXORA no permitido.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(500, Number(options.timeoutMs || 5_000)));
    try {
      const response = await this.fetchImpl(target, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${discovery.token}`, 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      let body;
      try { body = await response.json(); }
      catch { throw new Error(`VOXORA devolvió una respuesta inválida (${response.status}).`); }
      if (!response.ok || !body?.ok) throw new Error(`${body?.code || `HTTP_${response.status}`}: ${body?.message || 'Error de VOXORA'}`);
      this.ensureEventSocket(discovery);
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('VOXORA no respondió a tiempo.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async summary() {
    try {
      const health = await this.request('/api/v1/health', { timeoutMs: 2_500 });
      return {
        status: health.engine?.ready === false ? 'disconnected' : 'connected',
        detail: `VOXORA ${health.voxoraVersion || 'detectado'} · ${health.engine?.state || 'listo'} · protocolo ${health.protocolVersion}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: message.includes('no está abierto') ? 'unconfigured' : 'disconnected', detail: message };
    }
  }

  async catalog() {
    const [health, voiceResult, settingResult, statusResult] = await Promise.all([
      this.request('/api/v1/health'), this.request('/api/v1/voices'), this.request('/api/v1/settings'), this.request('/api/v1/status'),
    ]);
    return {
      protocolVersion: health.protocolVersion,
      voxoraVersion: health.voxoraVersion,
      engine: health.engine,
      capabilities: health.capabilities,
      voices: Array.isArray(voiceResult.voices) ? voiceResult.voices : [],
      settings: settingResult.settings || {},
      status: statusResult.status || {},
    };
  }

  async action(value, settings = {}) {
    const id = requestId(settings.requestId);
    if (value === 'voxora.speak') {
      const text = String(settings.text || '').trim();
      if (!text) throw new Error('Escribe el texto que debe decir VOXORA.');
      if (text.length > 500) throw new Error('El texto de VOXORA admite como máximo 500 caracteres.');
      const queueBehavior = String(settings.queueBehavior || 'append');
      if (!QUEUE_BEHAVIORS.has(queueBehavior)) throw new Error('Comportamiento de cola no válido.');
      const body = {
        requestId: id, text, queueBehavior,
        voiceId: settings.voiceId ? String(settings.voiceId) : undefined,
        rate: optionalNumber(settings.rate, 'Velocidad', 0.5, 2),
        pitch: optionalNumber(settings.pitch, 'Tono', 0, 2),
        volume: optionalNumber(settings.volume, 'Volumen', 0, 1),
        priority: optionalNumber(settings.priority, 'Prioridad', -100, 100),
      };
      const result = await this.request('/api/v1/speak', { method: 'POST', body });
      return `VOXORA aceptó la frase${result.queueLength === undefined ? '.' : ` · cola: ${result.queueLength}.`}`;
    }
    if (value === 'voxora.speakClipboard') {
      const queueBehavior = String(settings.queueBehavior || 'append');
      if (!QUEUE_BEHAVIORS.has(queueBehavior)) throw new Error('Comportamiento de cola no válido.');
      await this.request('/api/v1/speak-clipboard', { method: 'POST', body: {
        requestId: id, queueBehavior,
        voiceId: settings.voiceId ? String(settings.voiceId) : undefined,
        rate: optionalNumber(settings.rate, 'Velocidad', 0.5, 2),
        pitch: optionalNumber(settings.pitch, 'Tono', 0, 2),
        volume: optionalNumber(settings.volume, 'Volumen', 0, 1),
        priority: optionalNumber(settings.priority, 'Prioridad', -100, 100),
      } });
      return 'VOXORA recibió el portapapeles.';
    }
    if (value === 'voxora.settings') {
      const body = {
        requestId: id,
        voiceId: settings.voiceId ? String(settings.voiceId) : undefined,
        rate: optionalNumber(settings.rate, 'Velocidad', 0.5, 2),
        pitch: optionalNumber(settings.pitch, 'Tono', 0, 2),
        volume: optionalNumber(settings.volume, 'Volumen', 0, 1),
      };
      await this.request('/api/v1/settings', { method: 'POST', body });
      return 'Ajustes de VOXORA aplicados.';
    }
    const operation = value.startsWith('voxora.') ? value.slice('voxora.'.length) : '';
    if (CONTROL_OPERATIONS.has(operation)) {
      await this.request('/api/v1/control', { method: 'POST', body: { requestId: id, operation } });
      return `Control VOXORA ejecutado: ${operation}.`;
    }
    throw new Error('Acción VOXORA no compatible.');
  }

  ensureEventSocket(discovery) {
    if (this.stopped || !this.webSocketFactory) return;
    const fingerprint = `${discovery.webSocketUrl}|${crypto.createHash('sha256').update(discovery.token).digest('hex')}`;
    if (this.socket && this.socketFingerprint === fingerprint && [0, 1].includes(this.socket.readyState)) return;
    if (this.socket) {
      try { this.socket.close(); } catch {}
    }
    this.socketFingerprint = fingerprint;
    const socket = this.webSocketFactory(discovery.webSocketUrl, { headers: { Authorization: `Bearer ${discovery.token}` } });
    this.socket = socket;
    socket.on('open', () => { this.reconnectAttempt = 0; this.onEvent({ type: 'voxora-status', status: 'connected' }); });
    socket.on('message', (data) => {
      try {
        const payload = JSON.parse(String(data));
        this.onEvent({ type: 'voxora-event', event: payload.type, payload });
      } catch {}
    });
    socket.on('error', (error) => this.log('voxora-websocket', error?.message || 'Error WebSocket local'));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      this.onEvent({ type: 'voxora-status', status: 'disconnected' });
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer || !this.webSocketFactory) return;
    const delays = [1_000, 2_000, 5_000, 10_000, 20_000];
    const delay = delays[Math.min(this.reconnectAttempt++, delays.length - 1)];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.readDiscovery().then((discovery) => this.ensureEventSocket(discovery)).catch(() => this.scheduleReconnect());
    }, delay);
    this.reconnectTimer.unref?.();
  }

  start() {
    this.stopped = false;
    void this.readDiscovery().then((discovery) => this.ensureEventSocket(discovery)).catch(() => this.scheduleReconnect());
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try { this.socket.close(); } catch {}
    }
    this.socket = null;
  }
}

module.exports = { VoxoraService, validateLocalUrl };
