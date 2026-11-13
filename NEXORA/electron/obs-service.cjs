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
          // Suscribe los eventos normales (bits 0-11), no los medidores de audio de alta frecuencia.
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0x0fff, ...(response ? { authentication: response } : {}) } }));
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
    const required = (key, label) => {
      const value = String(settings[key] ?? '').trim();
      if (!value) throw new Error(`${label} es obligatorio.`);
      return value;
    };
    const number = (key, fallback, min, max) => Math.min(max, Math.max(min, Number(settings[key] ?? fallback)));
    const parseRef = (key, label) => {
      try {
        const value = JSON.parse(required(key, label));
        if (!Array.isArray(value) || value.length < 2) throw new Error();
        return value;
      } catch { throw new Error(`${label} no es válido. Actualiza el catálogo de OBS y vuelve a elegirlo.`); }
    };
    const toggle = async (getType, stateKey, setType, setKey, requestData = {}) => {
      const current = await this.request(getType, requestData);
      return this.request(setType, { ...requestData, [setKey]: !Boolean(current[stateKey]) });
    };

    const direct = {
      scene: ['SetCurrentProgramScene', () => ({ sceneName: required('sceneName', 'La escena') })],
      previewScene: ['SetCurrentPreviewScene', () => ({ sceneName: required('sceneName', 'La escena') })],
      profile: ['SetCurrentProfile', () => ({ profileName: required('profileName', 'El perfil') })],
      sceneCollection: ['SetCurrentSceneCollection', () => ({ sceneCollectionName: required('sceneCollectionName', 'La colección') })],
      recordStart: ['StartRecord', () => ({})],
      recordStop: ['StopRecord', () => ({})],
      recordPause: ['PauseRecord', () => ({})],
      recordResume: ['ResumeRecord', () => ({})],
      streamStart: ['StartStream', () => ({})],
      streamStop: ['StopStream', () => ({})],
      replayBufferSave: ['SaveReplayBuffer', () => ({})],
      studioTransition: ['TriggerStudioModeTransition', () => ({})],
      hotkey: ['TriggerHotkeyByName', () => ({ hotkeyName: required('hotkeyName', 'El atajo') })],
      mediaAction: ['TriggerMediaInputAction', () => ({ inputName: required('inputName', 'La fuente'), mediaAction: required('mediaAction', 'La acción multimedia') })],
      inputVolume: ['SetInputVolume', () => ({ inputName: required('inputName', 'La fuente'), inputVolumeMul: number('volumePercent', 100, 0, 2000) / 100 })],
      inputAudioMonitor: ['SetInputAudioMonitorType', () => ({ inputName: required('inputName', 'La fuente'), monitorType: required('monitorType', 'El tipo de monitorización') })],
      transition: ['SetCurrentSceneTransition', () => ({ transitionName: required('transitionName', 'La transición') })],
      screenshot: ['SaveSourceScreenshot', () => ({ sourceName: required('sourceName', 'La fuente'), imageFormat: String(settings.imageFormat || 'png'), imageFilePath: required('imageFilePath', 'El archivo de destino') })],
    };
    if (direct[action]) {
      const [requestType, requestData] = direct[action];
      const result = await this.request(requestType, requestData());
      if (action === 'transition' && settings.transitionDuration !== undefined) await this.request('SetCurrentSceneTransitionDuration', { transitionDuration: number('transitionDuration', 300, 50, 20000) });
      return result;
    }

    if (action === 'recordToggle') return this.request('ToggleRecord');
    if (action === 'recordPauseToggle') return this.request('ToggleRecordPause');
    if (action === 'recordChapter') return this.request('CreateRecordChapter', String(settings.chapterName || '').trim() ? { chapterName: String(settings.chapterName).trim() } : {});
    if (action === 'virtualCameraToggle') return this.request('ToggleVirtualCam');
    if (action === 'streamToggle') return this.request('ToggleStream');
    if (action === 'replayBufferToggle') return this.request('ToggleReplayBuffer');
    if (action === 'studioModeToggle') return toggle('GetStudioModeEnabled', 'studioModeEnabled', 'SetStudioModeEnabled', 'studioModeEnabled');
    if (action === 'inputMuteToggle') {
      const inputName = required('inputName', 'La fuente');
      return toggle('GetInputMute', 'inputMuted', 'SetInputMute', 'inputMuted', { inputName });
    }
    if (action === 'sourceVisibilityToggle') {
      const [sceneName, rawId] = parseRef('sceneItemRef', 'La fuente de escena');
      const sceneItemId = Number(rawId);
      return toggle('GetSceneItemEnabled', 'sceneItemEnabled', 'SetSceneItemEnabled', 'sceneItemEnabled', { sceneName: String(sceneName), sceneItemId });
    }
    if (action === 'filterToggle') {
      const [sourceName, filterName] = parseRef('filterRef', 'El filtro');
      const requestData = { sourceName: String(sourceName), filterName: String(filterName) };
      return toggle('GetSourceFilter', 'filterEnabled', 'SetSourceFilterEnabled', 'filterEnabled', requestData);
    }
    if (action === 'sceneTransitionOverride') {
      return this.request('SetSceneSceneTransitionOverride', {
        sceneName: required('sceneName', 'La escena'),
        transitionName: required('transitionName', 'La transición'),
        transitionDuration: number('transitionDuration', 300, 50, 20000),
      });
    }
    throw new Error('Acción OBS no compatible.');
  }

  async getScenes() {
    const data = await this.request('GetSceneList');
    return {
      current: String(data.currentProgramSceneName || ''),
      scenes: Array.isArray(data.scenes)
        ? data.scenes.map((scene) => String(scene.sceneName || '')).filter(Boolean)
        : [],
    };
  }

  async getCatalog() {
    const safe = async (requestType, requestData = {}, fallback = {}) => {
      try { return await this.request(requestType, requestData); }
      catch (error) { this.log('obs-catalog', `${requestType}: ${error.message}`); return fallback; }
    };
    const [sceneData, inputData, profileData, collectionData, transitionData, hotkeyData] = await Promise.all([
      safe('GetSceneList', {}, { scenes: [] }),
      safe('GetInputList', {}, { inputs: [] }),
      safe('GetProfileList', {}, { profiles: [] }),
      safe('GetSceneCollectionList', {}, { sceneCollections: [] }),
      safe('GetSceneTransitionList', {}, { transitions: [] }),
      safe('GetHotkeyList', {}, { hotkeys: [] }),
    ]);
    const scenes = (sceneData.scenes || []).map((item) => String(item.sceneName || '')).filter(Boolean);
    const inputs = (inputData.inputs || []).map((item) => String(item.inputName || '')).filter(Boolean);
    const sceneItemGroups = await Promise.all(scenes.map(async (sceneName) => {
      const data = await safe('GetSceneItemList', { sceneName }, { sceneItems: [] });
      return (data.sceneItems || []).map((item) => ({ sceneName, sceneItemId: Number(item.sceneItemId), sourceName: String(item.sourceName || '') })).filter((item) => Number.isFinite(item.sceneItemId) && item.sourceName);
    }));
    const filterSources = [...new Set([...inputs, ...scenes])];
    const filterGroups = await Promise.all(filterSources.map(async (sourceName) => {
      const data = await safe('GetSourceFilterList', { sourceName }, { filters: [] });
      return (data.filters || []).map((item) => ({ sourceName, filterName: String(item.filterName || '') })).filter((item) => item.filterName);
    }));
    return {
      currentScene: String(sceneData.currentProgramSceneName || ''),
      scenes,
      inputs,
      profiles: (profileData.profiles || []).map(String),
      sceneCollections: (collectionData.sceneCollections || []).map(String),
      transitions: (transitionData.transitions || []).map((item) => String(item.transitionName || '')).filter(Boolean),
      hotkeys: (hotkeyData.hotkeys || []).map(String),
      sceneItems: sceneItemGroups.flat(),
      filters: filterGroups.flat(),
    };
  }

  disconnect() {
    try { this.socket?.close(); } catch {}
    this.socket = null;
    this.connected = false;
  }
}

module.exports = { ObsService, validateUrl };
