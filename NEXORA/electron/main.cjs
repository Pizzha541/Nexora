'use strict';

const { app, BrowserWindow, ipcMain, net, shell, utilityProcess } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createPluginService } = require('./plugin-service.cjs');

const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) app.quit();

let window = null;
let worker = null;
let workerConnected = false;
let requestId = 0;
let activeKeys = null;
let rendererReady = false;
let pluginService = null;
const pending = new Map();
const buttonEvents = [];

const windowsLocalData = process.platform === 'win32'
  ? path.resolve(app.getPath('appData'), '..', 'Local')
  : app.getPath('appData');
const dataRoot = path.join(windowsLocalData, 'Nexora', 'NEXORA', 'data');
app.setPath('userData', dataRoot);
const smokeTest = process.argv.includes('--smoke-test');
const rendererSmokeTest = process.argv.includes('--renderer-smoke-test');

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
  const temporary = `${file}.tmp`;
  if (fs.existsSync(file)) {
    const backup = path.join(dataRoot, 'backups', `${path.basename(file)}.bak`);
    fs.copyFileSync(file, backup);
  }
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function createKey(index) {
  const colors = ['#8b5cf6', '#6d28d9', '#4c1d95', '#7c3aed'];
  return { index, name: `Tecla ${index + 1}`, color: colors[index % colors.length], text: String(index + 1), animated: false, actions: [{ kind: 'none' }] };
}

function createProfile(name = 'Perfil principal') {
  return {
    id: crypto.randomUUID(),
    name,
    description: 'Perfil local de NEXORA',
    keys: Array.from({ length: 12 }, (_, index) => createKey(index)),
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
    visualSettings: defaultVisualSettings(),
  });
  let settingsChanged = !settingsExisted;
  if (!settings.visualSettings) settingsChanged = true;
  settings.visualSettings = { ...defaultVisualSettings(), ...(settings.visualSettings || {}) };
  if (!profiles.some((profile) => profile.id === settings.activeProfileId)) {
    settings.activeProfileId = profiles[0].id;
    settingsChanged = true;
  }
  if (settingsChanged) writeJson(settingsFile, settings);
  const assets = readJson(path.join(dataRoot, 'assets', 'index.json'), [])
    .filter((asset) => fs.existsSync(path.join(dataRoot, 'assets', asset.fileName)));
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
    const result = await workerRequest('image', { key: keyIndex + 1, file });
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
  if (message.type === 'status') workerConnected = Boolean(message.connected);
  if (message.type === 'event' && (message.name === 'buttonDown' || message.name === 'buttonUp')) {
    const event = { key: message.key, pressed: message.name === 'buttonDown', timestampMs: Date.now(), rawOffset42: 0, rawOffset47: 0 };
    buttonEvents.push(event);
    if (buttonEvents.length > 512) buttonEvents.shift();
    if (event.pressed) void runKeyAction(event.key);
  }
  sendEvent(message);
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

function mapHardwareKeys(keys, repository = loadRepository()) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = keys[index] || {};
    return { file: key.iconPath ? assetPath(key.iconPath, repository) : null, animated: Boolean(key.animated) };
  });
}

async function runKeyAction(keyNumber) {
  const key = activeKeys?.[keyNumber - 1];
  const action = key?.actions?.[0];
  if (!action || action.kind === 'none') return;
  try {
    if (action.kind === 'openUrl') {
      const target = new URL(action.value);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('URL no permitida.');
      await shell.openExternal(target.href);
    } else if (action.kind === 'launchPath') {
      if (!path.isAbsolute(action.value || '')) throw new Error('La ruta debe ser absoluta.');
      const error = await shell.openPath(action.value);
      if (error) throw new Error(error);
    } else if (action.kind === 'plugin') {
      await pluginService.execute(action.pluginId, action.actionId, action.settings || {}, action.contextId, keyNumber - 1);
    }
  } catch (error) {
    sendEvent({ type: 'log', level: 'error', message: `Tecla ${keyNumber}: ${error.message}` });
  }
}

async function invoke(command, args) {
  const repository = loadRepository();
  if (command === 'get_bootstrap_state') {
    const mode = repository.settings.deviceMode || 'simulation';
    return {
      version: app.getVersion(), activeProfileId: repository.settings.activeProfileId,
      profiles: repository.profiles, macros: repository.macros, assets: repository.assets,
      plugins: pluginService?.list() || [], pluginCatalog: pluginService?.catalog() || [],
      visualSettings: repository.settings.visualSettings, startupWarning: undefined,
      device: mode === 'simulation'
        ? { connected: true, mode, name: 'DisplayPad simulado' }
        : { connected: workerConnected, mode, name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009, lastError: workerConnected ? undefined : 'Pulsa «Volver a detectar».' },
      integrations: [
        { id: 'obs', name: 'OBS Studio', status: 'unconfigured', detail: 'WebSocket 5.x · puerto 4455', priority: 1 },
        { id: 'voxora', name: 'VOXORA TTS', status: 'unconfigured', detail: 'Esperando interfaz de comunicación', priority: 2 },
        { id: 'discord', name: 'Discord', status: 'unconfigured', detail: 'Módulo oficial/autorizado por definir', priority: 3 },
        { id: 'twitch', name: 'Twitch', status: 'unconfigured', detail: 'Módulo preparado', priority: 4 },
      ],
      updaterConfigured: false,
    };
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
  if (command === 'save_macro') return saveMacro(structuredClone(args.macroDefinition));
  if (command === 'delete_macro') {
    const source = path.join(dataRoot, 'macros', `${args.macroId}.json`);
    if (fs.existsSync(source)) { fs.copyFileSync(source, path.join(dataRoot, 'backups', `deleted-macro-${args.macroId}-${Date.now()}.json`)); fs.unlinkSync(source); }
    return null;
  }
  if (command === 'set_device_mode') {
    repository.settings.deviceMode = args.mode;
    saveSettings(repository.settings);
    if (args.mode === 'hardware') await workerRequest('connect');
    return args.mode === 'simulation'
      ? { connected: true, mode: 'simulation', name: 'DisplayPad simulado' }
      : { connected: workerConnected, mode: 'hardware', name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009 };
  }
  if (command === 'refresh_device_status') {
    const result = await workerRequest('connect');
    return { connected: Boolean(result.connected || workerConnected), mode: 'hardware', name: 'Mountain DisplayPad', vendorId: 0x3282, productId: 0x0009, lastError: result.ok ? undefined : result.error };
  }
  if (command === 'listen_for_button_events') {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, Math.max(1000, Number(args.durationMs || 15_000)))));
    return buttonEvents.filter((event) => event.timestampMs >= started);
  }
  if (command === 'import_visual_asset') {
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
    const extension = extensions[args.mimeType];
    if (!extension) throw new Error('Formato no admitido.');
    const bytes = Buffer.from(args.base64Data, 'base64');
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('El recurso debe pesar entre 1 byte y 12 MB.');
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const existing = repository.assets.find((asset) => asset.id === id);
    if (existing) return existing;
    const fileName = `${id}.${extension}`;
    fs.writeFileSync(path.join(dataRoot, 'assets', fileName), bytes);
    const asset = { id, name: String(args.name || fileName).slice(0, 120), mimeType: args.mimeType, fileName, sizeBytes: bytes.length, animated: extension === 'gif', importedAt: new Date().toISOString() };
    repository.assets.push(asset);
    writeJson(path.join(dataRoot, 'assets', 'index.json'), repository.assets);
    return asset;
  }
  if (command === 'read_visual_asset') {
    const asset = repository.assets.find((item) => item.id === args.assetId);
    if (!asset) throw new Error('Recurso no encontrado.');
    return `data:${asset.mimeType};base64,${fs.readFileSync(path.join(dataRoot, 'assets', asset.fileName)).toString('base64')}`;
  }
  if (command === 'save_visual_settings') {
    repository.settings.visualSettings = structuredClone(args.visualSettings);
    saveSettings(repository.settings);
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
  if (command === 'plugin_uninstall') return pluginService.uninstall(args.pluginId, args.confirmed);
  if (command === 'plugin_read_icon') return pluginService.icon(args.pluginId);
  if (command === 'hardware_apply_page') {
    activeKeys = structuredClone(args.keys || []);
    const result = await workerRequest('page', { keys: mapHardwareKeys(activeKeys, repository) });
    if (!result.ok) throw new Error(result.error);
    return 'Página enviada a las doce teclas.';
  }
  if (command === 'hardware_apply_key') {
    const key = args.key;
    if (!activeKeys) activeKeys = Array.from({ length: 12 }, (_, index) => ({ index, actions: [{ kind: 'none' }] }));
    activeKeys[key.index] = structuredClone(key);
    const file = key?.iconPath ? assetPath(key.iconPath, repository) : null;
    const result = file
      ? await workerRequest(key.animated ? 'gifStart' : 'image', { key: key.index + 1, file })
      : await workerRequest('clear', { key: key.index + 1 });
    if (!result.ok) throw new Error(result.error);
    return key.animated ? `GIF activo en tecla ${key.index + 1}.` : `Imagen enviada a tecla ${key.index + 1}.`;
  }
  if (command === 'hardware_apply_initial') {
    const assetId = repository.settings.visualSettings.initialAssetId;
    const file = assetId ? assetPath(assetId, repository) : builtinBannerPath();
    const result = await workerRequest('startupImage', { file });
    if (!result.ok) throw new Error(result.error);
    return 'Initial Screen enviada a las doce teclas.';
  }
  if (command === 'test_obs_connection') throw new Error('La prueba OBS continúa disponible en la edición Tauri durante la migración.');
  if (command === 'apply_key_config') return null;
  throw new Error(`Comando no implementado en Electron: ${command}`);
}

function createWindow(showWhenReady = true) {
  rendererReady = false;
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1120, minHeight: 720,
    title: 'NEXORA', backgroundColor: '#09070f', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.removeMenu();
  window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  if (showWhenReady) window.once('ready-to-show', () => window.show());
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
    openExternal: (url) => shell.openExternal(url),
  });
  if (smokeTest) {
    appendLog('smoke-test', `Arranque empaquetado correcto en ${dataRoot}`);
    app.exit(0);
    return;
  }
  ipcMain.on('nexora:renderer-ready', () => {
    rendererReady = true;
    appendLog('renderer-ready', 'Interfaz React cargada correctamente.');
    if (rendererSmokeTest) app.exit(0);
  });
  ipcMain.handle('nexora:invoke', (_event, command, args) => invoke(command, args || {}));
  if (rendererSmokeTest) {
    createWindow(false);
    setTimeout(() => app.exit(rendererReady ? 0 : 2), 15_000).unref();
    return;
  }
  createWindow();
  startWorker();
});

app.on('second-instance', () => {
  if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
});
app.on('before-quit', () => { pluginService?.stopAll(); if (worker?.pid) { void workerRequest('shutdown', {}, 1000); setTimeout(() => worker?.kill(), 1100).unref(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
