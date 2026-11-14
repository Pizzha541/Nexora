'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, shell, Tray, utilityProcess } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createPluginService } = require('./plugin-service.cjs');
const { ObsService } = require('./obs-service.cjs');
const { VoxoraService } = require('./voxora-service.cjs');
const { createUpdateService } = require('./update-service.cjs');

let window = null;
let tray = null;
let worker = null;
let workerConnected = false;
let requestId = 0;
let activeKeys = null;
let rendererReady = false;
let pluginService = null;
let obsService = null;
let voxoraService = null;
let updateService = null;
const propertyInspectorWindows = new Map();
const pending = new Map();
const buttonEvents = [];
const pendingKeySync = new Map();
const longPressTimers = new Map();
const multiSwitchStates = new Map();
let keySyncTimer = null;
let usbSequence = Promise.resolve();
let reconnectTimer = null;
let initialRestoreTimer = null;
let screensaverTimer = null;
let screensaverActive = false;
let shuttingDown = false;
let backgroundNoticeShown = false;

const windowsLocalData = process.platform === 'win32'
  ? path.resolve(app.getPath('appData'), '..', 'Local')
  : app.getPath('appData');
const dataRoot = path.join(windowsLocalData, 'Nexora', 'NEXORA', 'data');
app.setPath('userData', dataRoot);
const smokeTest = process.argv.includes('--smoke-test');
const rendererSmokeTest = process.argv.includes('--renderer-smoke-test');
const uiSmokeTest = process.argv.includes('--ui-smoke-test');
const captureUiArgument = process.argv.find((argument) => argument.startsWith('--capture-ui='));
const captureUiPath = captureUiArgument ? path.resolve(captureUiArgument.slice('--capture-ui='.length)) : null;
const captureSectionArgument = process.argv.find((argument) => argument.startsWith('--capture-section='));
const captureSection = captureSectionArgument ? captureSectionArgument.slice('--capture-section='.length) : null;
const captureOnboarding = process.argv.includes('--capture-onboarding');
const isolatedTestRun = smokeTest || rendererSmokeTest || uiSmokeTest || Boolean(captureUiPath);
const instanceLock = isolatedTestRun || app.requestSingleInstanceLock();
if (!instanceLock) app.quit();

function ensureDirectories() {
  for (const directory of ['profiles', 'macros', 'assets', 'backups', 'logs', 'plugins']) {
    fs.mkdirSync(path.join(dataRoot, directory), { recursive: true });
  }
}

function appendLog(kind, message) {
  try {
    fs.mkdirSync(path.join(dataRoot, 'logs'), { recursive: true });
    fs.appendFileSync(
      path.join(dataRoot, 'logs', 'electron.log'),
      `${new Date().toISOString()} [${kind}] ${String(message)}\n`,
      'utf8',
    );
  } catch {}
}

process.on('uncaughtException', (error) => appendLog('uncaughtException', error?.stack || error));
process.on('unhandledRejection', (error) => appendLog('unhandledRejection', error?.stack || error));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return structuredClone(fallback); }
}

function writeJson(file, value) {
  ensureDirectories();
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  if (fs.existsSync(file)) {
    const backup = path.join(dataRoot, 'backups', `${path.basename(file)}.bak`);
    fs.copyFileSync(file, backup);
  }
  const descriptor = fs.openSync(temporary, 'wx');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function createKey(index) {
  return { index, name: `Tecla ${index + 1}`, color: '#000000', text: '', animated: false, actions: [{ kind: 'none' }] };
}

const nexoraPresetPack = [
  ['nexora-preset-record', 'record.svg', 'NEXORA · Grabar'],
  ['nexora-preset-live', 'live.svg', 'NEXORA · Directo'],
  ['nexora-preset-camera', 'camera.svg', 'NEXORA · Cámara'],
  ['nexora-preset-replay', 'replay.svg', 'NEXORA · Replay'],
  ['nexora-preset-save', 'save.svg', 'NEXORA · Guardar'],
  ['nexora-preset-studio', 'studio.svg', 'NEXORA · Studio Mode'],
  ['nexora-preset-scenes', 'scenes.svg', 'NEXORA · Escenas'],
  ['nexora-preset-microphone', 'microphone.svg', 'NEXORA · Micrófono'],
  ['nexora-preset-visibility', 'visibility.svg', 'NEXORA · Visibilidad'],
  ['nexora-preset-screenshot', 'screenshot.svg', 'NEXORA · Captura'],
  ['nexora-preset-channel', 'channel.svg', 'NEXORA · Canal'],
  ['nexora-preset-chat', 'chat.svg', 'NEXORA · Chat'],
];

const defaultExamples = [
  ['OBS · Grabar', '#dc2626', { kind: 'obs', value: 'recordToggle', settings: { longPress: false } }, 'nexora-preset-record'],
  ['OBS · Directo', '#7c3aed', { kind: 'obs', value: 'streamToggle', settings: { longPress: false } }, 'nexora-preset-live'],
  ['OBS · Cámara virtual', '#2563eb', { kind: 'obs', value: 'virtualCameraToggle' }, 'nexora-preset-camera'],
  ['OBS · Replay', '#059669', { kind: 'obs', value: 'replayBufferToggle' }, 'nexora-preset-replay'],
  ['OBS · Guardar replay', '#0d9488', { kind: 'obs', value: 'replayBufferSave' }, 'nexora-preset-save'],
  ['OBS · Studio Mode', '#4f46e5', { kind: 'obs', value: 'studioModeToggle' }, 'nexora-preset-studio'],
  ['OBS · Escena', '#334155', { kind: 'obs', value: 'scene', settings: {} }, 'nexora-preset-scenes'],
  ['OBS · Silenciar fuente', '#475569', { kind: 'obs', value: 'inputMuteToggle', settings: {} }, 'nexora-preset-microphone'],
  ['OBS · Mostrar fuente', '#374151', { kind: 'obs', value: 'sourceVisibilityToggle', settings: {} }, 'nexora-preset-visibility'],
  ['OBS · Captura', '#1f2937', { kind: 'obs', value: 'screenshot', settings: { imageFormat: 'png' } }, 'nexora-preset-screenshot'],
  ['Twitch · Canal', '#9146ff', { kind: 'native', value: 'twitch.channel', settings: {} }, 'nexora-preset-channel'],
  ['Twitch · Chat', '#772ce8', { kind: 'native', value: 'twitch.chat', settings: {} }, 'nexora-preset-chat'],
];

function createProfile(name = 'Perfil principal') {
  return {
    id: crypto.randomUUID(),
    name,
    description: 'Perfil local de NEXORA',
    keys: Array.from({ length: 12 }, (_, index) => {
      const key = createKey(index);
      const [name, color, action, iconPath] = defaultExamples[index];
      return { ...key, name, color, iconPath, actions: [structuredClone(action)] };
    }),
    folders: [],
    updatedAt: new Date().toISOString(),
  };
}

function defaultVisualSettings() {
  return {
    initialScreenEnabled: false,
    initialDurationSeconds: 5,
    panoramic: false,
    fit: 'cover',
    screensaverEnabled: false,
    screensaverIdleSeconds: 300,
  };
}

function listJson(directory) {
  ensureDirectories();
  return fs.readdirSync(path.join(dataRoot, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(dataRoot, directory, entry.name), null))
    .filter(Boolean);
}

const visualExtensions = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.svg', 'image/svg+xml'],
]);

function baseCampImageRoot(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return null;
  const resolved = path.resolve(candidate);
  const endings = [
    path.join(resolved, 'resources', 'bin', 'wwwroot', 'images'),
    path.join(resolved, 'wwwroot', 'images'),
    path.join(resolved, 'images'),
    resolved,
  ];
  return endings.find((item) => fs.existsSync(item) && fs.statSync(item).isDirectory()) || null;
}

function detectedBaseCampImageRoot() {
  const candidates = [];
  const installationInfo = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Mountain Base Camp', 'InstallationInfo.xml');
  if (fs.existsSync(installationInfo)) {
    const match = /<InsatllDirectory>([^<]+)<\/InsatllDirectory>/i.exec(fs.readFileSync(installationInfo, 'utf8'));
    if (match) candidates.push(match[1].trim());
  }
  candidates.push(
    path.join(process.resourcesPath, 'basecamp-assets'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Mountain Base Camp'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mountain Base Camp'),
    path.resolve(app.getAppPath(), '..', 'USER_FILES', 'device', 'basecamp app original', 'Mountain Base Camp'),
  );
  for (const candidate of candidates) {
    const root = baseCampImageRoot(candidate);
    if (root) return root;
  }
  return null;
}

function collectVisualFiles(root, limit = 2500) {
  const files = [];
  const pending = [path.resolve(root)];
  while (pending.length && files.length < limit) {
    const directory = pending.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && visualExtensions.has(path.extname(entry.name).toLowerCase())) files.push(target);
      if (files.length >= limit) break;
    }
  }
  return files;
}

function importVisualFiles(files, currentAssets, source = 'basecamp', sourceRoot = null) {
  const assets = [...currentAssets];
  let imported = 0;
  let changed = false;
  for (const file of files) {
    const stat = fs.statSync(file);
    if (!stat.size || stat.size > 12 * 1024 * 1024) continue;
    const bytes = fs.readFileSync(file);
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const relativeDirectory = source === 'basecamp' && sourceRoot
      ? path.relative(sourceRoot, path.dirname(file)).split(path.sep).filter(Boolean)[0]
      : undefined;
    const existingIndex = assets.findIndex((asset) => asset.id === id);
    if (existingIndex >= 0) {
      if (relativeDirectory && !assets[existingIndex].category) {
        assets[existingIndex] = { ...assets[existingIndex], category: relativeDirectory };
        changed = true;
      }
      continue;
    }
    const extension = path.extname(file).toLowerCase();
    const fileName = `${id}${extension === '.jpeg' ? '.jpg' : extension}`;
    fs.copyFileSync(file, path.join(dataRoot, 'assets', fileName));
    assets.push({
      id, name: path.basename(file), mimeType: visualExtensions.get(extension), fileName,
      sizeBytes: stat.size, animated: extension === '.gif', importedAt: new Date().toISOString(), source, category: relativeDirectory,
    });
    imported += 1;
    changed = true;
  }
  if (changed) writeJson(path.join(dataRoot, 'assets', 'index.json'), assets);
  return { assets, imported };
}

function ensureNexoraPresetAssets(currentAssets) {
  const roots = [
    path.join(app.getAppPath(), 'dist', 'assets', 'presets'),
    path.join(app.getAppPath(), 'public', 'assets', 'presets'),
  ];
  const root = roots.find((candidate) => fs.existsSync(candidate));
  if (!root) return currentAssets;
  const assets = [...currentAssets];
  let changed = false;
  for (const [id, sourceName, name] of nexoraPresetPack) {
    const source = path.join(root, sourceName);
    if (!fs.existsSync(source)) continue;
    const fileName = `${id}.svg`;
    const target = path.join(dataRoot, 'assets', fileName);
    const bytes = fs.readFileSync(source);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes);
    const entry = { id, name, mimeType: 'image/svg+xml', fileName, sizeBytes: bytes.length, animated: false, importedAt: new Date(0).toISOString(), source: 'nexora' };
    const index = assets.findIndex((asset) => asset.id === id);
    if (index < 0) { assets.push(entry); changed = true; }
    else if (JSON.stringify(assets[index]) !== JSON.stringify(entry)) { assets[index] = entry; changed = true; }
  }
  if (changed) writeJson(path.join(dataRoot, 'assets', 'index.json'), assets);
  return assets;
}

function loadRepository() {
  let profiles = listJson('profiles');
  if (!profiles.length) {
    const profile = createProfile();
    profiles = [profile];
    writeJson(path.join(dataRoot, 'profiles', `${profile.id}.json`), profile);
  }
  const settingsFile = path.join(dataRoot, 'settings.json');
  const settingsExisted = fs.existsSync(settingsFile);
  const settings = readJson(settingsFile, {
    activeProfileId: profiles[0].id,
    deviceMode: 'simulation',
    githubOwner: '',
    githubRepository: '',
    updaterPublicKey: '',
    onboardingCompleted: false,
    visualSettings: defaultVisualSettings(),
  });
  let settingsChanged = !settingsExisted;
  if (settings.onboardingCompleted === undefined) {
    settings.onboardingCompleted = settingsExisted;
    settingsChanged = true;
  }
  if (!settings.visualSettings) settingsChanged = true;
  settings.visualSettings = { ...defaultVisualSettings(), ...(settings.visualSettings || {}) };
  if (Array.isArray(settings.profileOrder)) {
    const order = new Map(settings.profileOrder.map((id, index) => [id, index]));
    profiles.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }
  if (!profiles.some((profile) => profile.id === settings.activeProfileId)) {
    settings.activeProfileId = profiles[0].id;
    settingsChanged = true;
  }
  let assets = readJson(path.join(dataRoot, 'assets', 'index.json'), [])
    .filter((asset) => fs.existsSync(path.join(dataRoot, 'assets', asset.fileName)));
  assets = ensureNexoraPresetAssets(assets);
  if (!settings.nexoraPresetKeysMigrated) {
    for (const profile of profiles) {
      let profileChanged = false;
      const keys = profile.keys.map((key, index) => {
        const example = defaultExamples[index];
        if (!example || key.iconPath || key.name !== example[0] || key.actions?.[0]?.kind !== example[2].kind || key.actions?.[0]?.value !== example[2].value) return key;
        profileChanged = true;
        return { ...key, iconPath: example[3] };
      });
      if (profileChanged) {
        profile.keys = keys;
        writeJson(path.join(dataRoot, 'profiles', `${profile.id}.json`), profile);
      }
    }
    settings.nexoraPresetKeysMigrated = true;
    settingsChanged = true;
  }
  if (!settings.baseCampAssetsImportedFrom) {
    const baseCampRoot = detectedBaseCampImageRoot();
    if (baseCampRoot) {
      const result = importVisualFiles(collectVisualFiles(baseCampRoot), assets, 'basecamp', baseCampRoot);
      assets = result.assets;
      settings.baseCampAssetsImportedFrom = baseCampRoot;
      settings.baseCampCategoriesMigrated = 1;
      settingsChanged = true;
    }
  }
  if (!settings.baseCampCategoriesMigrated) {
    const baseCampRoot = detectedBaseCampImageRoot();
    if (baseCampRoot) {
      const result = importVisualFiles(collectVisualFiles(baseCampRoot), assets, 'basecamp', baseCampRoot);
      assets = result.assets;
      settings.baseCampCategoriesMigrated = 1;
      settingsChanged = true;
    }
  }
  if (settingsChanged) writeJson(settingsFile, settings);
  return { settings, profiles, macros: listJson('macros'), assets };
}

function saveSettings(settings) { writeJson(path.join(dataRoot, 'settings.json'), settings); }
function saveProfile(profile) {
  if (!profile?.id || !profile.name?.trim() || !Array.isArray(profile.keys) || profile.keys.length !== 12) throw new Error('Perfil inválido.');
  profile.updatedAt = new Date().toISOString();
  writeJson(path.join(dataRoot, 'profiles', `${profile.id}.json`), profile);
  return profile;
}
function saveMacro(macro) {
  if (!macro?.id || !macro.name?.trim() || !Array.isArray(macro.steps) || !macro.steps.length) throw new Error('Macro inválida.');
  writeJson(path.join(dataRoot, 'macros', `${macro.id}.json`), macro);
  return macro;
}

function sendEvent(value) {
  if (value?.type === 'log') appendLog(value.level || 'info', value.message || '');
  if (window && !window.isDestroyed()) window.webContents.send('nexora:event', value);
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

async function applyPluginFeedback(value) {
  const keyIndex = Number(value?.keyIndex);
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > 11 || !workerConnected) return;
  const cacheRoot = path.join(dataRoot, 'plugins', 'runtime-cache');
  fs.mkdirSync(cacheRoot, { recursive: true });
  let file = null;
  if (value.event === 'setTitle' && typeof value.payload?.title === 'string') {
    const lines = value.payload.title.split(/\r?\n/).slice(0, 4);
    const spans = lines.map((line, index) => `<tspan x="51" dy="${index === 0 ? 0 : 19}">${escapeXml(line.slice(0, 18))}</tspan>`).join('');
    const firstY = Math.max(22, 52 - ((lines.length - 1) * 9));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="102" height="102"><rect width="102" height="102" rx="8" fill="#09070f"/><text x="51" y="${firstY}" fill="#ffffff" font-family="Segoe UI,Arial" font-size="15" font-weight="600" text-anchor="middle">${spans}</text></svg>`;
    file = path.join(cacheRoot, `${crypto.createHash('sha256').update(svg).digest('hex')}.svg`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, svg, 'utf8');
  } else if (value.event === 'setImage' && typeof value.payload?.image === 'string') {
    const match = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([a-z0-9+/=]+)$/i.exec(value.payload.image);
    if (match) {
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 0 && bytes.length <= 8 * 1024 * 1024) {
        const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase() === 'svg+xml' ? 'svg' : match[1].toLowerCase();
        file = path.join(cacheRoot, `${crypto.createHash('sha256').update(bytes).digest('hex')}.${extension}`);
        if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      }
    }
  }
  if (file) {
    const result = await serialWorkerRequest('image', { key: keyIndex + 1, file });
    if (!result.ok) appendLog('plugin-feedback-usb', result.error);
  }
}

function startWorker() {
  worker = utilityProcess.fork(path.join(__dirname, 'usb-worker.cjs'), [], {
    serviceName: 'NEXORA USB Service',
    stdio: 'pipe',
  });
  worker.on('message', handleWorkerMessage);
  worker.stderr?.setEncoding('utf8');
  worker.stderr?.on('data', (value) => sendEvent({ type: 'log', level: 'error', message: String(value).trim() }));
  worker.on('exit', (code) => {
    appendLog('usb-worker-exit', code);
    workerConnected = false;
    for (const resolve of pending.values()) resolve({ ok: false, error: `Servicio USB detenido (${code}).` });
    pending.clear();
    sendEvent({ type: 'status', connected: false, message: 'Servicio USB detenido.' });
  });
  worker.on('error', (error) => appendLog('usb-worker-error', error?.report || JSON.stringify(error)));
}

function handleWorkerMessage(message) {
  if (message.type === 'response') {
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); }
    return;
  }
  if (message.type === 'status') {
    const wasConnected = workerConnected;
    workerConnected = Boolean(message.connected && message.ready !== false);
    if (!wasConnected && workerConnected) void syncInitialOrPage();
    if (!workerConnected) scheduleReconnect();
  }
  if (message.type === 'event' && (message.name === 'buttonDown' || message.name === 'buttonUp')) {
    const event = { key: message.key, pressed: message.name === 'buttonDown', timestampMs: Date.now(), rawOffset42: 0, rawOffset47: 0 };
    buttonEvents.push(event);
    if (buttonEvents.length > 512) buttonEvents.shift();
    if (event.pressed && screensaverActive) void wakeScreensaver();
    else {
      scheduleScreensaver();
      const timer = longPressTimers.get(event.key);
      if (!event.pressed && timer) {
        clearTimeout(timer);
        longPressTimers.delete(event.key);
      } else if (event.pressed) {
        const action = activeKeys?.[event.key - 1]?.actions?.[0];
        if (action?.kind === 'obs' && action.settings?.longPress === true) {
          const nextTimer = setTimeout(() => { longPressTimers.delete(event.key); void runKeyAction(event.key); }, 5000);
          longPressTimers.set(event.key, nextTimer);
        } else void runKeyAction(event.key);
      }
    }
  }
  sendEvent(message);
}

function scheduleReconnect() {
  if (reconnectTimer || shuttingDown) return;
  let repository;
  try { repository = loadRepository(); } catch { return; }
  if (repository.settings.deviceMode !== 'hardware') return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    const result = await serialWorkerRequest('connect');
    if (result.ok) await syncInitialOrPage();
    else scheduleReconnect();
  }, 2000);
  reconnectTimer.unref();
}

function workerRequest(command, payload = {}, timeout = 180_000) {
  return new Promise((resolve) => {
    if (!worker?.pid) return resolve({ ok: false, error: 'El servicio USB no está disponible.' });
    const id = ++requestId;
    const timer = setTimeout(() => {
      if (pending.delete(id)) resolve({ ok: false, error: 'Tiempo de espera USB agotado.' });
    }, timeout);
    timer.unref();
    pending.set(id, (value) => { clearTimeout(timer); resolve(value); });
    worker.postMessage({ id, command, ...payload });
  });
}

function serialWorkerRequest(command, payload = {}, timeout = 180_000) {
  const run = () => workerRequest(command, payload, timeout);
  const result = usbSequence.then(run, run);
  usbSequence = result.then(() => undefined, () => undefined);
  return result;
}

function cancelPendingKeySync(message = 'Sincronización sustituida por una página más reciente.') {
  if (keySyncTimer) clearTimeout(keySyncTimer);
  keySyncTimer = null;
  for (const item of pendingKeySync.values()) {
    item.waiters.forEach((resolve) => resolve({ ok: true, superseded: true, message }));
  }
  pendingKeySync.clear();
}

async function writeHardwareKey(key) {
  if (!workerConnected) return { ok: true, deferred: true };
  const repository = loadRepository();
  const action = key?.actions?.[0];
  const functional = Boolean(action && action.kind !== 'none');
  const file = functional ? (key?.iconPath ? assetPath(key.iconPath, repository) : defaultActionIconPath(action, key?.color)) : null;
  const visual = { key: key.index + 1, file, text: functional ? String(key.text || '') : '', color: functional ? String(key.color || '#111018') : '#000000' };
  return (file || visual.text)
    ? serialWorkerRequest(key.animated && file ? 'gifStart' : 'image', visual)
    : serialWorkerRequest('clear', { key: key.index + 1 });
}

async function flushPendingKeySync() {
  if (keySyncTimer) clearTimeout(keySyncTimer);
  keySyncTimer = null;
  const jobs = [...pendingKeySync.values()].sort((left, right) => left.key.index - right.key.index);
  pendingKeySync.clear();
  for (const job of jobs) {
    const result = await writeHardwareKey(job.key);
    job.waiters.forEach((resolve) => resolve(result));
    sendEvent({ type: 'hardware-sync', keyIndex: job.key.index, ok: Boolean(result.ok), deferred: Boolean(result.deferred), error: result.error });
  }
}

function queueHardwareKey(key) {
  if (!key || !Number.isInteger(key.index) || key.index < 0 || key.index > 11) return Promise.resolve({ ok: false, error: 'Tecla fuera de rango.' });
  if (!activeKeys) activeKeys = Array.from({ length: 12 }, (_, index) => ({ index, actions: [{ kind: 'none' }] }));
  activeKeys[key.index] = structuredClone(key);
  return new Promise((resolve) => {
    const current = pendingKeySync.get(key.index);
    pendingKeySync.set(key.index, { key: structuredClone(key), waiters: [...(current?.waiters || []), resolve] });
    if (keySyncTimer) clearTimeout(keySyncTimer);
    keySyncTimer = setTimeout(() => { void flushPendingKeySync(); }, 90);
    keySyncTimer.unref();
  });
}

async function syncDesiredPage(repository = loadRepository()) {
  if (!activeKeys || !workerConnected || repository.settings.deviceMode !== 'hardware') return { ok: true, deferred: true };
  cancelPendingKeySync();
  const result = await serialWorkerRequest('page', { keys: mapHardwareKeys(activeKeys, repository) });
  if (result.ok) scheduleScreensaver(repository);
  return result;
}

function scheduleScreensaver(repository) {
  if (screensaverTimer) clearTimeout(screensaverTimer);
  screensaverTimer = null;
  const settings = repository?.settings || readJson(path.join(dataRoot, 'settings.json'), { deviceMode: 'simulation', visualSettings: defaultVisualSettings() });
  const visual = { ...defaultVisualSettings(), ...(settings.visualSettings || {}) };
  if (!workerConnected || settings.deviceMode !== 'hardware' || !visual.screensaverEnabled || screensaverActive || initialRestoreTimer) return;
  screensaverTimer = setTimeout(async () => {
    screensaverTimer = null;
    const current = loadRepository();
    const saver = current.settings.visualSettings;
    if (!workerConnected || current.settings.deviceMode !== 'hardware' || !saver.screensaverEnabled) return;
    const file = saver.screensaverAssetId ? assetPath(saver.screensaverAssetId, current) : builtinBannerPath();
    screensaverActive = true;
    const result = await serialWorkerRequest('startupImage', { file, fit: saver.fit });
    screensaverActive = Boolean(result.ok);
  }, Math.max(30, Number(visual.screensaverIdleSeconds || 300)) * 1000);
  screensaverTimer.unref();
}

async function wakeScreensaver(repository = loadRepository()) {
  if (!screensaverActive) { scheduleScreensaver(repository); return; }
  screensaverActive = false;
  await syncDesiredPage(repository);
}

async function syncInitialOrPage(repository = loadRepository()) {
  if (initialRestoreTimer) clearTimeout(initialRestoreTimer);
  if (screensaverTimer) clearTimeout(screensaverTimer);
  initialRestoreTimer = null;
  screensaverTimer = null;
  screensaverActive = false;
  const visual = repository.settings.visualSettings;
  if (!workerConnected || repository.settings.deviceMode !== 'hardware' || !visual.initialScreenEnabled) return syncDesiredPage(repository);
  const file = visual.initialAssetId ? assetPath(visual.initialAssetId, repository) : builtinInitialScreenPath();
  const result = await serialWorkerRequest('startupImage', { file, fit: visual.fit });
  if (!result.ok) return result;
  initialRestoreTimer = setTimeout(() => { initialRestoreTimer = null; void syncDesiredPage(); }, Math.max(1, Number(visual.initialDurationSeconds || 5)) * 1000);
  initialRestoreTimer.unref();
  return result;
}

function assetPath(assetId, repository = loadRepository()) {
  const asset = repository.assets.find((item) => item.id === assetId);
  if (!asset) return null;
  const file = path.join(dataRoot, 'assets', asset.fileName);
  return fs.existsSync(file) ? file : null;
}

function builtinBannerPath() {
  const target = path.join(dataRoot, 'assets', 'builtin-nexora-banner.png');
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(app.getAppPath(), 'dist', 'assets', 'noxorabanner.png'), target);
  }
  return target;
}

function builtinInitialScreenPath() {
  const target = path.join(dataRoot, 'assets', 'builtin-nexora-initial-screen.png');
  if (!fs.existsSync(target)) {
    const candidates = [
      path.join(process.resourcesPath, 'branding', 'initial_screen.png'),
      path.resolve(app.getAppPath(), '..', 'USER_FILES', 'branding', 'initial_screen.png'),
      path.join(app.getAppPath(), 'dist', 'assets', 'noxorabanner.png'),
    ];
    const source = candidates.find((candidate) => fs.existsSync(candidate));
    if (!source) throw new Error('No se encontró el Initial Screen incluido.');
    fs.copyFileSync(source, target);
  }
  return target;
}

function defaultActionIconPath(action, color = '#111827') {
  if (!action || action.kind === 'none' || action.kind === 'delay') return null;
  const labels = {
    recordToggle: 'REC', recordStart: 'REC', recordStop: 'STOP', streamToggle: 'LIVE', streamStart: 'LIVE', streamStop: 'OFF',
    scene: 'SCN', previewScene: 'PREV', virtualCameraToggle: 'CAM', replayBufferToggle: 'RPL', replayBufferSave: 'SAVE',
    studioModeToggle: 'STD', sourceVisibilityToggle: 'EYE', inputMuteToggle: 'MIC', screenshot: 'SHOT', transition: 'FX', filterToggle: 'FLT',
  };
  const fallback = { multiAction: 'MULTI', multiSwitch: 'SW', hotkey: 'KEY', media: 'MEDIA', profile: 'PROF', folder: 'DIR', openUrl: 'WEB', launchPath: 'APP', plugin: 'PLUG', native: 'APP', obs: 'OBS' };
  const label = String(labels[action.value] || fallback[action.kind] || 'NX').slice(0, 5);
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#111827';
  const signature = crypto.createHash('sha256').update(`${action.kind}:${action.value || ''}:${safeColor}:${label}`).digest('hex').slice(0, 20);
  const directory = path.join(dataRoot, 'assets', 'action-icons');
  const target = path.join(directory, `${signature}.svg`);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(directory, { recursive: true });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="102" height="102" viewBox="0 0 102 102"><defs><radialGradient id="g"><stop offset="0" stop-color="${safeColor}"/><stop offset="1" stop-color="#050506"/></radialGradient></defs><rect width="102" height="102" rx="16" fill="url(#g)"/><rect x="19" y="19" width="64" height="64" rx="14" fill="none" stroke="#fff" stroke-width="4" opacity=".9"/><text x="51" y="58" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="${label.length > 4 ? 16 : 20}" font-weight="700">${label}</text></svg>`;
    fs.writeFileSync(target, svg, 'utf8');
  }
  return target;
}

function mapHardwareKeys(keys, repository = loadRepository()) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = keys[index] || {};
    const action = key.actions?.[0];
    const functional = Boolean(action && action.kind !== 'none');
    return {
      file: functional ? (key.iconPath ? assetPath(key.iconPath, repository) : defaultActionIconPath(action, key.color)) : null,
      animated: functional && Boolean(key.animated), text: functional ? String(key.text || '') : '', color: functional ? String(key.color || '#111018') : '#000000',
    };
  });
}

function findFolderById(folders, id) {
  for (const folder of folders || []) {
    if (folder.id === id) return folder;
    const nested = findFolderById(folder.children, id);
    if (nested) return nested;
  }
  return null;
}

function sendMediaKey(value) {
  const codes = { playPause: 0xB3, next: 0xB0, previous: 0xB1, volumeUp: 0xAF, volumeDown: 0xAE, mute: 0xAD };
  const code = codes[value];
  if (!code || process.platform !== 'win32') throw new Error('Control multimedia no compatible en este sistema.');
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NXMedia { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }'; [NXMedia]::keybd_event(${code},0,0,[UIntPtr]::Zero); [NXMedia]::keybd_event(${code},0,2,[UIntPtr]::Zero)`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: 'ignore' });
  child.unref();
}

function sendNativeHotkey(value) {
  const shortcuts = {
    'discord.mute': [0x11, 0x10, 0x4D],
    'discord.deafen': [0x11, 0x10, 0x44],
  };
  const keys = shortcuts[value];
  if (!keys || process.platform !== 'win32') throw new Error('Atajo nativo no compatible en este sistema.');
  const down = keys.map((key) => `[NXKeys]::keybd_event(${key},0,0,[UIntPtr]::Zero)`).join(';');
  const up = [...keys].reverse().map((key) => `[NXKeys]::keybd_event(${key},0,2,[UIntPtr]::Zero)`).join(';');
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NXKeys { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }';${down};Start-Sleep -Milliseconds 45;${up}`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: 'ignore' });
  child.unref();
}

function sendConfiguredHotkey(action) {
  if (process.platform !== 'win32') throw new Error('Los atajos configurables requieren Windows.');
  const rawKey = String(action.value || '').trim().toUpperCase();
  const aliases = { ENTER: 0x0D, RETURN: 0x0D, ESC: 0x1B, ESCAPE: 0x1B, SPACE: 0x20, TAB: 0x09, BACKSPACE: 0x08, DELETE: 0x2E, UP: 0x26, DOWN: 0x28, LEFT: 0x25, RIGHT: 0x27, HOME: 0x24, END: 0x23 };
  let keyCode = aliases[rawKey];
  if (!keyCode && /^[A-Z0-9]$/.test(rawKey)) keyCode = rawKey.charCodeAt(0);
  const functionMatch = /^F([1-9]|1[0-2])$/.exec(rawKey);
  if (!keyCode && functionMatch) keyCode = 0x6F + Number(functionMatch[1]);
  if (!keyCode) throw new Error('Tecla no permitida. Usa A-Z, 0-9, F1-F12, Enter, Escape, flechas, Tab, Space o Delete.');
  const modifierCodes = { control: 0x11, shift: 0x10, alt: 0x12, meta: 0x5B };
  const modifiers = Array.isArray(action.settings?.modifiers) ? action.settings.modifiers : Array.isArray(action.modifiers) ? action.modifiers : [];
  const keys = [...new Set(modifiers.map((value) => modifierCodes[String(value).toLowerCase()]).filter(Boolean)), keyCode];
  const down = keys.map((key) => `[NXHotkey]::keybd_event(${key},0,0,[UIntPtr]::Zero)`).join(';');
  const up = [...keys].reverse().map((key) => `[NXHotkey]::keybd_event(${key},0,2,[UIntPtr]::Zero)`).join(';');
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NXHotkey { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }';${down};Start-Sleep -Milliseconds 45;${up}`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: 'ignore' });
  child.unref();
}

async function executeNativeAction(value, settings = {}) {
  if (value.startsWith('voxora.')) return voxoraService.action(value, settings);
  if (value === 'discord.mute' || value === 'discord.deafen') return sendNativeHotkey(value);
  const externalTargets = {
    'discord.open': 'discord://-/channels/@me',
    'spotify.open': 'spotify:',
    'twitch.dashboard': 'https://dashboard.twitch.tv/',
    'twitch.streamManager': 'https://dashboard.twitch.tv/stream-manager',
    'twitch.following': 'https://www.twitch.tv/directory/following/live',
    'camo.support': 'https://reincubate.com/support/camo/',
  };
  if (externalTargets[value]) { await shell.openExternal(externalTargets[value]); return; }
  if (value === 'spotify.uri') {
    const uri = String(settings.uri || '').trim();
    if (!/^spotify:[a-z][a-z0-9-]*:[a-zA-Z0-9:_-]+$/i.test(uri) || uri.length > 500) throw new Error('La URI de Spotify no es válida.');
    await shell.openExternal(uri);
    return;
  }
  if (value === 'discord.channel') {
    const target = new URL(String(settings.url || '').trim());
    if (target.protocol !== 'https:' || !['discord.com', 'canary.discord.com', 'ptb.discord.com'].includes(target.hostname) || !target.pathname.startsWith('/channels/')) throw new Error('El enlace debe ser un canal válido de discord.com.');
    await shell.openExternal(target.href);
    return;
  }
  if (value === 'twitch.channel' || value === 'twitch.chat') {
    const channel = String(settings.channel || '').trim();
    if (!/^[a-zA-Z0-9_]{1,25}$/.test(channel)) throw new Error('El nombre del canal de Twitch no es válido.');
    const target = value === 'twitch.chat'
      ? `https://www.twitch.tv/popout/${channel}/chat?popout=`
      : `https://www.twitch.tv/${channel}`;
    await shell.openExternal(target);
    return;
  }
  if (value === 'camo.custom') {
    const executable = String(settings.executablePath || '').trim();
    if (!path.isAbsolute(executable) || path.extname(executable).toLowerCase() !== '.exe' || !fs.existsSync(executable)) throw new Error('Selecciona un ejecutable válido de Camo Studio.');
    const error = await shell.openPath(executable);
    if (error) throw new Error(error);
    return;
  }
  if (value === 'camo.open') {
    const candidates = [
      path.join(windowsLocalData, 'Programs', 'Camo Studio', 'Camo Studio.exe'),
      path.join(windowsLocalData, 'Camo Studio', 'Camo Studio.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Camo Studio', 'Camo Studio.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Reincubate', 'Camo Studio', 'Camo Studio.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Camo Studio', 'Camo Studio.exe'),
    ];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executable) {
      await shell.openExternal('https://reincubate.com/camo/');
      throw new Error('Camo Studio no está en una ruta conocida; se abrió su página oficial.');
    }
    const error = await shell.openPath(executable);
    if (error) throw new Error(error);
    return;
  }
  throw new Error('Acción nativa desconocida o no autorizada.');
}

async function executeAction(action, keyIndex, depth = 0) {
  if (!action || action.kind === 'none') return;
  if (depth > 3) throw new Error('La secuencia supera la profundidad permitida.');
  if (action.kind === 'delay') {
    const delayMs = Math.max(0, Math.min(60_000, Number(action.settings?.delayMs || 0)));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }
  if (action.kind === 'multiAction' || action.kind === 'multiSwitch') {
    let steps = Array.isArray(action.steps) ? action.steps : [];
    let switchKey = null;
    let currentState = 0;
    if (action.kind === 'multiSwitch') {
      switchKey = String(action.contextId || `key-${keyIndex}`);
      currentState = Number(multiSwitchStates.get(switchKey) || 0) % 2;
      steps = Array.isArray(action.states?.[currentState]) ? action.states[currentState] : [];
    }
    if (steps.length > 100) throw new Error('Una Multi Action admite como máximo 100 pasos.');
    for (const step of steps) await executeAction(step?.action, keyIndex, depth + 1);
    if (switchKey) {
      const nextState = currentState === 0 ? 1 : 0;
      multiSwitchStates.set(switchKey, nextState);
      sendEvent({ type: 'plugin-feedback', event: 'setState', keyIndex, payload: { state: nextState } });
    }
    return;
  }
  if (action.kind === 'hotkey') {
    sendConfiguredHotkey(action);
  } else if (action.kind === 'openUrl') {
    const rawUrl = String(action.value || '').trim();
    if (!rawUrl) throw new Error('La dirección web es obligatoria.');
    const target = new URL(/^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('URL no permitida.');
    await shell.openExternal(target.href);
  } else if (action.kind === 'launchPath') {
    if (!path.isAbsolute(action.value || '')) throw new Error('La ruta debe ser absoluta.');
    const error = await shell.openPath(action.value);
    if (error) throw new Error(error);
  } else if (action.kind === 'media') {
    sendMediaKey(action.value);
  } else if (action.kind === 'native') {
    await executeNativeAction(action.value, action.settings || {});
  } else if (action.kind === 'plugin') {
    await pluginService.execute(action.pluginId, action.actionId, action.settings || {}, action.contextId, keyIndex);
  } else if (action.kind === 'obs') {
    await obsService.action(action.value, action.settings || {});
  } else if (action.kind === 'profile') {
    const repository = loadRepository();
    const profile = repository.profiles.find((item) => item.id === action.value);
    if (!profile) throw new Error('Perfil no encontrado.');
    repository.settings.activeProfileId = profile.id;
    saveSettings(repository.settings);
    activeKeys = structuredClone(profile.keys);
    await syncDesiredPage(repository);
    sendEvent({ type: 'navigate-profile', profileId: profile.id });
  } else if (action.kind === 'folder') {
    const repository = loadRepository();
    const profile = repository.profiles.find((item) => item.id === repository.settings.activeProfileId);
    const folder = findFolderById(profile?.folders, action.value);
    if (!folder) throw new Error('Carpeta no encontrada.');
    activeKeys = structuredClone(folder.keys);
    await syncDesiredPage(repository);
    sendEvent({ type: 'navigate-folder', folderId: folder.id });
  } else {
    throw new Error(`La acción ${action.kind} todavía no tiene ejecutor seguro.`);
  }
}

async function executeKeyAction(key, keyIndex) {
  return executeAction(key?.actions?.[0], keyIndex, 0);
}

async function runKeyAction(keyNumber) {
  try {
    await executeKeyAction(activeKeys?.[keyNumber - 1], keyNumber - 1);
  } catch (error) {
    sendEvent({ type: 'log', level: 'error', message: `Tecla ${keyNumber}: ${error.message}` });
  }
}

async function invoke(command, args) {
  const repository = loadRepository();
  if (command === 'get_bootstrap_state') {
    const mode = repository.settings.deviceMode || 'simulation';
    const voxora = await voxoraService.summary();
    return {
      version: app.getVersion(), activeProfileId: repository.settings.activeProfileId,
      profiles: repository.profiles, macros: repository.macros, assets: repository.assets,
      plugins: pluginService?.list() || [], pluginCatalog: pluginService?.catalog() || [],
      onboardingCompleted: Boolean(repository.settings.onboardingCompleted),
      visualSettings: repository.settings.visualSettings, startupWarning: undefined,
      device: mode === 'simulation'
        ? { connected: true, mode, name: 'DisplayPad simulado' }
        : { connected: workerConnected, mode, name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009, lastError: workerConnected ? undefined : 'Pulsa «Volver a detectar».' },
      integrations: [
        { id: 'obs', name: 'OBS Studio', status: obsService?.connected ? 'connected' : 'unconfigured', detail: obsService?.connected ? 'WebSocket 5.x conectado' : 'WebSocket 5.x · puerto 4455', priority: 1 },
        { id: 'voxora', name: 'VOXORA TTS', status: voxora.status, detail: voxora.detail, priority: 2 },
        { id: 'discord', name: 'Discord', status: 'unconfigured', detail: 'Módulo oficial/autorizado por definir', priority: 3 },
        { id: 'twitch', name: 'Twitch', status: 'unconfigured', detail: 'Módulo preparado', priority: 4 },
      ],
      updaterConfigured: true,
    };
  }
  if (command === 'set_onboarding_completed') {
    repository.settings.onboardingCompleted = Boolean(args.completed);
    saveSettings(repository.settings);
    return repository.settings.onboardingCompleted;
  }
  if (command === 'save_profile') return saveProfile(structuredClone(args.profile));
  if (command === 'create_profile') return saveProfile(createProfile(args.name));
  if (command === 'duplicate_profile') {
    const source = repository.profiles.find((profile) => profile.id === args.profileId);
    if (!source) throw new Error('Perfil no encontrado.');
    const copy = structuredClone(source);
    copy.id = crypto.randomUUID();
    copy.name = `${copy.name} (copia)`;
    return saveProfile(copy);
  }
  if (command === 'delete_profile') {
    if (repository.profiles.length <= 1) throw new Error('No se puede eliminar el único perfil.');
    const source = path.join(dataRoot, 'profiles', `${args.profileId}.json`);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(dataRoot, 'backups', `deleted-${args.profileId}-${Date.now()}.json`));
      fs.unlinkSync(source);
    }
    const remaining = repository.profiles.filter((profile) => profile.id !== args.profileId);
    if (repository.settings.activeProfileId === args.profileId) repository.settings.activeProfileId = remaining[0].id;
    saveSettings(repository.settings);
    return repository.settings.activeProfileId;
  }
  if (command === 'set_active_profile') { repository.settings.activeProfileId = args.profileId; saveSettings(repository.settings); return null; }
  if (command === 'set_profile_order') {
    const ids = Array.isArray(args.profileIds) ? args.profileIds.map(String) : [];
    const known = new Set(repository.profiles.map((profile) => profile.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id)) || new Set(ids).size !== ids.length) throw new Error('Orden de perfiles inválido.');
    repository.settings.profileOrder = ids;
    saveSettings(repository.settings);
    return null;
  }
  if (command === 'save_macro') return saveMacro(structuredClone(args.macroDefinition));
  if (command === 'delete_macro') {
    const source = path.join(dataRoot, 'macros', `${args.macroId}.json`);
    if (fs.existsSync(source)) { fs.copyFileSync(source, path.join(dataRoot, 'backups', `deleted-macro-${args.macroId}-${Date.now()}.json`)); fs.unlinkSync(source); }
    return null;
  }
  if (command === 'set_device_mode') {
    repository.settings.deviceMode = args.mode;
    saveSettings(repository.settings);
    if (args.mode === 'simulation') {
      if (initialRestoreTimer) clearTimeout(initialRestoreTimer);
      if (screensaverTimer) clearTimeout(screensaverTimer);
      initialRestoreTimer = null;
      screensaverTimer = null;
      screensaverActive = false;
    }
    if (args.mode === 'hardware') {
      await serialWorkerRequest('connect');
      await syncInitialOrPage(repository);
    }
    return args.mode === 'simulation'
      ? { connected: true, mode: 'simulation', name: 'DisplayPad simulado' }
      : { connected: workerConnected, mode: 'hardware', name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009 };
  }
  if (command === 'refresh_device_status') {
    const result = await serialWorkerRequest('connect');
    if (result.ok) await syncInitialOrPage(repository);
    return { connected: Boolean(result.connected || workerConnected), mode: 'hardware', name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009, lastError: result.ok ? undefined : result.error };
  }
  if (command === 'listen_for_button_events') {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, Math.max(1000, Number(args.durationMs || 15_000)))));
    return buttonEvents.filter((event) => event.timestampMs >= started);
  }
  if (command === 'pick_file') {
    const result = await dialog.showOpenDialog(window || undefined, { properties: ['openFile'], title: 'Seleccionar aplicación o archivo' });
    return result.canceled ? null : result.filePaths[0] || null;
  }
  if (command === 'update_get_status') return updateService.getStatus();
  if (command === 'update_check') return updateService.check();
  if (command === 'update_install') return updateService.install();
  if (command === 'voxora_get_catalog') return voxoraService.catalog();
  if (command === 'voxora_action') return voxoraService.action(String(args.action || ''), args.settings || {});
  if (command === 'execute_key_action') { await executeKeyAction(structuredClone(args.key), Number(args.keyIndex || 0)); return 'Acción ejecutada.'; }
  if (command === 'import_visual_asset') {
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
    const extension = extensions[args.mimeType];
    if (!extension) throw new Error('Formato no admitido.');
    const bytes = Buffer.from(args.base64Data, 'base64');
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('El recurso debe pesar entre 1 byte y 12 MB.');
    if (extension === 'svg' && /<(script|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(bytes.toString('utf8'))) throw new Error('El SVG contiene código o recursos externos no permitidos.');
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const existing = repository.assets.find((asset) => asset.id === id);
    if (existing) return existing;
    const fileName = `${id}.${extension}`;
    fs.writeFileSync(path.join(dataRoot, 'assets', fileName), bytes);
    const asset = { id, name: String(args.name || fileName).slice(0, 120), mimeType: args.mimeType, fileName, sizeBytes: bytes.length, animated: extension === 'gif', importedAt: new Date().toISOString(), source: 'user' };
    repository.assets.push(asset);
    writeJson(path.join(dataRoot, 'assets', 'index.json'), repository.assets);
    return asset;
  }
  if (command === 'import_basecamp_assets') {
    let root = detectedBaseCampImageRoot();
    if (!root) {
      const choice = await dialog.showOpenDialog(window || undefined, {
        title: 'Selecciona la carpeta “Mountain Base Camp” o su carpeta de imágenes',
        properties: ['openDirectory'],
      });
      if (choice.canceled || !choice.filePaths[0]) throw new Error('No se seleccionó ninguna carpeta de Base Camp.');
      root = baseCampImageRoot(choice.filePaths[0]);
    }
    if (!root) throw new Error('La carpeta seleccionada no contiene recursos de Base Camp.');
    const files = collectVisualFiles(root);
    if (!files.length) throw new Error('La carpeta seleccionada no contiene imágenes compatibles.');
    const result = importVisualFiles(files, repository.assets, 'basecamp', root);
    repository.settings.baseCampAssetsImportedFrom = root;
    saveSettings(repository.settings);
    return { imported: result.imported, total: result.assets.filter((asset) => asset.source === 'basecamp').length, source: root };
  }
  if (command === 'delete_visual_asset') {
    const asset = repository.assets.find((item) => item.id === args.assetId);
    if (!asset) return null;
    if (asset.source === 'nexora') throw new Error('Las imágenes incluidas con NEXORA no se pueden eliminar.');
    const removeFromKeys = (keys) => (keys || []).map((key) => key.iconPath === asset.id ? { ...key, iconPath: undefined, animated: false } : key);
    const removeFromFolders = (folders) => (folders || []).map((folder) => ({ ...folder, keys: removeFromKeys(folder.keys), children: removeFromFolders(folder.children) }));
    for (const profile of repository.profiles) {
      const next = { ...profile, keys: removeFromKeys(profile.keys), folders: removeFromFolders(profile.folders) };
      saveProfile(next);
    }
    if (activeKeys) activeKeys = removeFromKeys(activeKeys);
    const visual = repository.settings.visualSettings;
    if (visual.initialAssetId === asset.id) delete visual.initialAssetId;
    if (visual.screensaverAssetId === asset.id) delete visual.screensaverAssetId;
    saveSettings(repository.settings);
    writeJson(path.join(dataRoot, 'assets', 'index.json'), repository.assets.filter((item) => item.id !== asset.id));
    const file = path.join(dataRoot, 'assets', asset.fileName);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    if (workerConnected) await syncDesiredPage(loadRepository());
    return null;
  }
  if (command === 'read_visual_asset') {
    const asset = repository.assets.find((item) => item.id === args.assetId);
    if (!asset) throw new Error('Recurso no encontrado.');
    return `data:${asset.mimeType};base64,${fs.readFileSync(path.join(dataRoot, 'assets', asset.fileName)).toString('base64')}`;
  }
  if (command === 'read_builtin_initial_screen') {
    return `data:image/png;base64,${fs.readFileSync(builtinInitialScreenPath()).toString('base64')}`;
  }
  if (command === 'save_visual_settings') {
    repository.settings.visualSettings = structuredClone(args.visualSettings);
    saveSettings(repository.settings);
    scheduleScreensaver(repository);
    return repository.settings.visualSettings;
  }
  if (command === 'plugin_install_package') {
    if (!args.approvedInstall) throw new Error('Confirma la instalación desde Plugin Hub.');
    const bytes = Buffer.from(args.base64Data || '', 'base64');
    return pluginService.install(bytes, {
      approvedInstall: true,
      expectedSha256: args.expectedSha256,
      declaredLicense: args.declaredLicense,
      sourceUrl: args.sourceUrl,
      free: args.free !== false,
    });
  }
  if (command === 'plugin_install_catalog') {
    if (!args.approvedInstall) throw new Error('Confirma la instalación desde Plugin Hub.');
    const entry = pluginService.catalog().find((item) => item.id === args.catalogId);
    if (!entry || !entry.free) throw new Error('Entrada de catálogo no permitida.');
    const response = await net.fetch(entry.packageUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`No se pudo descargar el paquete (${response.status}).`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > 80 * 1024 * 1024) throw new Error('El paquete remoto supera el límite de 80 MB.');
    const bytes = Buffer.from(await response.arrayBuffer());
    return pluginService.install(bytes, { approvedInstall: true, expectedSha256: entry.sha256, declaredLicense: entry.license, sourceUrl: entry.sourceUrl, free: true });
  }
  if (command === 'plugin_set_execution_approval') return pluginService.approve(args.pluginId, args.approved);
  if (command === 'plugin_execute_action') {
    const result = await pluginService.execute(args.pluginId, args.actionId, args.settings || {}, args.contextId, args.keyIndex || 0);
    return result.ok ? 'Acción enviada al runtime compatible.' : 'La acción no pudo ejecutarse.';
  }
  if (command === 'plugin_open_property_inspector') {
    const descriptor = await pluginService.openInspector(args.pluginId, args.actionId, args.settings || {}, args.contextId, args.keyIndex || 0);
    propertyInspectorWindows.get(descriptor.context)?.close();
    const inspector = new BrowserWindow({
      width: 430, height: 720, minWidth: 360, minHeight: 480,
      title: `NEXORA · ${args.pluginId}`,
      parent: window || undefined, show: false, backgroundColor: '#1c1c1c',
      webPreferences: {
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        partition: `nexora-pi-${String(args.pluginId).replace(/[^a-z0-9._-]/gi, '-').slice(0, 80)}`,
      },
    });
    propertyInspectorWindows.set(descriptor.context, inspector);
    inspector.removeMenu();
    inspector.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    inspector.webContents.on('will-navigate', (event, url) => {
      if (/^https?:\/\//i.test(url)) { event.preventDefault(); void shell.openExternal(url); }
    });
    inspector.once('closed', () => {
      propertyInspectorWindows.delete(descriptor.context);
      pluginService.closeInspector(args.pluginId, descriptor.context);
    });
    inspector.webContents.once('did-finish-load', () => {
      const call = `window.connectElgatoStreamDeckSocket?.(${JSON.stringify(String(descriptor.port))},${JSON.stringify(descriptor.context)},"registerPropertyInspector",${JSON.stringify(JSON.stringify(descriptor.info))},${JSON.stringify(JSON.stringify(descriptor.actionInfo))})`;
      void inspector.webContents.executeJavaScript(call).catch((error) => appendLog('property-inspector', error.message));
      inspector.show();
    });
    await inspector.loadFile(descriptor.file);
    return 'Property Inspector abierto en una ventana aislada.';
  }
  if (command === 'plugin_uninstall') return pluginService.uninstall(args.pluginId, args.confirmed);
  if (command === 'plugin_read_icon') return pluginService.icon(args.pluginId);
  if (command === 'hardware_apply_page') {
    activeKeys = structuredClone(args.keys || []);
    cancelPendingKeySync();
    if (!workerConnected) return 'Página guardada; se enviará al reconectar el DisplayPad.';
    const result = await serialWorkerRequest('page', { keys: mapHardwareKeys(activeKeys, repository) });
    if (!result.ok) throw new Error(result.error);
    screensaverActive = false;
    scheduleScreensaver(repository);
    return 'Página enviada a las doce teclas.';
  }
  if (command === 'hardware_apply_key') {
    const key = args.key;
    const result = await queueHardwareKey(key);
    if (!result.ok) throw new Error(result.error);
    if (result.deferred) return `Tecla ${key.index + 1} guardada; se enviará al reconectar.`;
    return key.animated ? `GIF activo en tecla ${key.index + 1}.` : `Imagen enviada a tecla ${key.index + 1}.`;
  }
  if (command === 'hardware_apply_initial') {
    const assetId = repository.settings.visualSettings.initialAssetId;
    const file = assetId ? assetPath(assetId, repository) : builtinInitialScreenPath();
    if (screensaverTimer) clearTimeout(screensaverTimer);
    screensaverTimer = null;
    screensaverActive = false;
    const result = await serialWorkerRequest('startupImage', { file, fit: repository.settings.visualSettings.fit });
    if (!result.ok) throw new Error(result.error);
    if (initialRestoreTimer) clearTimeout(initialRestoreTimer);
    initialRestoreTimer = setTimeout(() => { initialRestoreTimer = null; void syncDesiredPage(); }, Math.max(1, Number(repository.settings.visualSettings.initialDurationSeconds || 5)) * 1000);
    initialRestoreTimer.unref();
    return `Initial Screen enviada; la página activa volverá en ${repository.settings.visualSettings.initialDurationSeconds || 5} segundos.`;
  }
  if (command === 'test_obs_connection' || command === 'obs_connect') return obsService.connect(args.url, args.password || '');
  if (command === 'obs_action') { await obsService.action(args.action, args.settings || {}); return 'Acción enviada a OBS.'; }
  if (command === 'obs_get_scenes') return obsService.getScenes();
  if (command === 'obs_get_catalog') return obsService.getCatalog();
  if (command === 'apply_key_config') return null;
  throw new Error(`Comando no implementado en Electron: ${command}`);
}

function showMainWindow() {
  if (!window || window.isDestroyed()) {
    createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createTray() {
  if (tray || isolatedTestRun) return;
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'assets', 'noxoralogo.png'),
    path.join(app.getAppPath(), 'public', 'assets', 'noxoralogo.png'),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  const image = source ? nativeImage.createFromPath(source).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('NEXORA · DisplayPad activo');
  const rebuildMenu = () => {
    const openAtLogin = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir NEXORA', click: showMainWindow },
      { label: 'DisplayPad activo en segundo plano', enabled: false },
      { type: 'separator' },
      {
        label: 'Iniciar con Windows', type: 'checkbox', checked: openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });
          rebuildMenu();
        },
      },
      { type: 'separator' },
      { label: 'Salir completamente', click: () => { shuttingDown = true; app.quit(); } },
    ]));
  };
  rebuildMenu();
  tray.on('double-click', showMainWindow);
}

function createWindow(showWhenReady = true) {
  rendererReady = false;
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1120, minHeight: 720,
    title: 'NEXORA', backgroundColor: '#09070f', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.removeMenu();
  window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'), captureUiPath ? { query: { capture: '1', ...(captureSection ? { section: captureSection } : {}), ...(captureOnboarding ? { onboarding: '1' } : {}) } } : undefined);
  if (showWhenReady) window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (shuttingDown || isolatedTestRun) return;
    event.preventDefault();
    window.hide();
    if (!backgroundNoticeShown && tray) {
      backgroundNoticeShown = true;
      tray.displayBalloon({
        title: 'NEXORA sigue activa',
        content: 'El DisplayPad continúa funcionando. Usa el icono de la bandeja para volver o salir completamente.',
        noSound: true,
      });
    }
  });
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('render-process-gone', (_event, details) => appendLog('renderer-gone', JSON.stringify(details)));
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    appendLog('renderer-load-failed', `${code} ${description} ${url} main=${isMainFrame}`);
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => appendLog('preload-error', `${preloadPath}: ${error?.stack || error}`));
  window.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (!rendererReady) appendLog('renderer-timeout', 'La interfaz no confirmó el arranque en 10 segundos.');
    }, 10_000).unref();
  });
}

app.whenReady().then(() => {
  ensureDirectories();
  pluginService = createPluginService({
    dataRoot,
    log: appendLog,
    feedback: (value) => { sendEvent({ type: 'plugin-feedback', ...value }); void applyPluginFeedback(value); },
    settingsChanged: (value) => sendEvent({ type: 'plugin-settings', ...value }),
    runtimeStatus: (value) => sendEvent({ type: 'plugin-runtime-status', ...value }),
    openExternal: (url) => shell.openExternal(url),
  });
  obsService = new ObsService({ onEvent: sendEvent, log: appendLog });
  voxoraService = new VoxoraService({ localAppData: windowsLocalData, onEvent: sendEvent, log: appendLog });
  voxoraService.start();
  updateService = createUpdateService({ sendEvent, log: appendLog });
  if (smokeTest) {
    appendLog('smoke-test', `Arranque empaquetado correcto en ${dataRoot}`);
    app.exit(0);
    return;
  }
  ipcMain.on('nexora:renderer-ready', () => {
    rendererReady = true;
    appendLog('renderer-ready', 'Interfaz React cargada correctamente.');
    if (rendererSmokeTest) app.exit(0);
    if (captureUiPath && window) {
      window.showInactive();
      setTimeout(() => {
        const capture = async () => {
          const diagnostics = await window.webContents.executeJavaScript(`({
            text: document.body.innerText.slice(0, 500),
            root: document.getElementById('root')?.innerHTML.slice(0, 500),
            bodyRect: document.body.getBoundingClientRect().toJSON(),
            visibilityState: document.visibilityState,
            layers: ['body', '#root', '.app-shell', '.main-area', '.content', '.editor-workspace'].map((selector) => {
              const element = document.querySelector(selector);
              if (!element) return { selector, missing: true };
              const style = getComputedStyle(element);
              return { selector, rect: element.getBoundingClientRect().toJSON(), display: style.display, visibility: style.visibility, opacity: style.opacity, color: style.color, background: style.backgroundColor };
            }),
            centerStack: document.elementsFromPoint(innerWidth / 2, innerHeight / 2).map((element) => ({ tag: element.tagName, className: String(element.className || '') })).slice(0, 8),
          })`);
          appendLog('capture-ui-dom', JSON.stringify(diagnostics));
          window.webContents.debugger.attach('1.3');
          await window.webContents.debugger.sendCommand('Page.enable');
          const result = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
            fromSurface: true,
          });
          window.webContents.debugger.detach();
          fs.mkdirSync(path.dirname(captureUiPath), { recursive: true });
          fs.writeFileSync(captureUiPath, Buffer.from(result.data, 'base64'));
          app.exit(0);
        };
        void capture().catch((error) => { appendLog('capture-ui', error?.stack || error); app.exit(3); });
      }, 1_500);
    }
  });
  ipcMain.handle('nexora:invoke', (_event, command, args) => invoke(command, args || {}));
  if (rendererSmokeTest || captureUiPath) {
    createWindow(false);
    setTimeout(() => app.exit(rendererReady ? 0 : 2), 15_000).unref();
    return;
  }
  createTray();
  createWindow();
  if (!uiSmokeTest && !captureUiPath) startWorker();
  if (app.isPackaged && !uiSmokeTest && !captureUiPath) {
    setTimeout(() => { void updateService.check().catch((error) => appendLog('updater-auto-check', error?.stack || error)); }, 5_000).unref();
  }
});

app.on('second-instance', () => {
  showMainWindow();
});
app.on('activate', showMainWindow);
app.on('before-quit', () => { shuttingDown = true; if (reconnectTimer) clearTimeout(reconnectTimer); for (const timer of longPressTimers.values()) clearTimeout(timer); longPressTimers.clear(); multiSwitchStates.clear(); for (const inspector of propertyInspectorWindows.values()) inspector.destroy(); propertyInspectorWindows.clear(); pluginService?.stopAll(); obsService?.disconnect(); voxoraService?.stop(); if (worker?.pid) { void workerRequest('shutdown', {}, 1000); setTimeout(() => worker?.kill(), 1100).unref(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && (shuttingDown || !tray)) app.quit(); });
