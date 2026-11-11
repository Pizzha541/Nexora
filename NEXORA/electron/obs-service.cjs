'use strict';

const crypto = require('node:crypto');
const WebSocket = require('ws');

const sha256Base64 = (value) => crypto.createHash('sha256').update(value).digest('base64');

function validateUrl(value) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (!local && url.protocol !== 'wss:') throw new Error('OBS remoto requiere una conexión wss:// cifrada.');
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('La URL de OBS debe usar ws:// o wss://.');
  return url.href;
}

class ObsService {
  constructor({ onEvent, log }) {
    this.onEvent = onEvent;
    this.log = log;
    this.socket = null;
    this.pending = new Map();
    this.connected = false;
  }

  async connect(urlValue, password = '') {
    this.disconnect();
    const url = validateUrl(urlValue);
    const socket = new WebSocket(url, { handshakeTimeout: 5000, maxPayload: 4 * 1024 * 1024 });
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OBS no respondió en 5 segundos.')), 5000);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      socket.once('error', fail);
      socket.on('message', (data) => {
        let message;
        try { message = JSON.parse(String(data)); } catch { return; }
        if (message.op === 0) {
          const authentication = message.d?.authentication;
          const response = authentication
            ? sha256Base64(`${sha256Base64(`${password}${authentication.salt}`)}${authentication.challenge}`)
            : undefined;
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0x7fffffff, ...(response ? { authentication: response } : {}) } }));
        } else if (message.op === 2) {
          clearTimeout(timer);
          socket.off('error', fail);
          this.connected = true;
          this.log('obs', `Conectado a ${url}`);
          resolve();
        }
        this.handleMessage(message);
      });
      socket.once('close', () => {
        clearTimeout(timer);
        this.connected = false;
        for (const request of this.pending.values()) request.reject(new Error('OBS se desconectó.'));
        this.pending.clear();
        this.onEvent({ type: 'obs-status', connected: false });
      });
    });
    this.onEvent({ type: 'obs-status', connected: true });
    const version = await this.request('GetVersion');
    return `OBS ${version.obsVersion || ''} conectado mediante WebSocket ${version.obsWebSocketVersion || '5.x'}.`;
  }

  handleMessage(message) {
    if (message.op === 5) this.onEvent({ type: 'obs-event', eventType: message.d?.eventType, eventData: message.d?.eventData || {} });
    if (message.op !== 7) return;
    const request = this.pending.get(message.d?.requestId);
    if (!request) return;
    this.pending.delete(message.d.requestId);
    if (message.d.requestStatus?.result) request.resolve(message.d.responseData || {});
    else request.reject(new Error(message.d.requestStatus?.comment || `OBS rechazó ${message.d.requestType}.`));
  }

  request(requestType, requestData = {}) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('OBS no está conectado.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(requestId)) reject(new Error(`Timeout de OBS: ${requestType}.`));
      }, 5000);
      timer.unref();
      this.pending.set(requestId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  async action(action, settings = {}) {
    const requests = {
      scene: ['SetCurrentProgramScene', { sceneName: String(settings.sceneName || '') }],
      recordStart: ['StartRecord', {}],
      recordStop: ['StopRecord', {}],
      recordPause: ['PauseRecord', {}],
      recordResume: ['ResumeRecord', {}],
      streamStart: ['StartStream', {}],
      streamStop: ['StopStream', {}],
      sourceEnable: ['SetSceneItemEnabled', { sceneName: String(settings.sceneName || ''), sceneItemId: Number(settings.sceneItemId), sceneItemEnabled: Boolean(settings.enabled) }],
    };
    const request = requests[action];
    if (!request) throw new Error('Acción OBS no compatible.');
    if (action === 'scene' && !request[1].sceneName) throw new Error('La escena de OBS es obligatoria.');
    return this.request(request[0], request[1]);
  }

  disconnect() {
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.connected = false;
  }
}

module.exports = { ObsService, validateUrl };
