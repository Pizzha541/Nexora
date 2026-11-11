'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const AdmZip = require('adm-zip');
const { WebSocketServer } = require('ws');

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const CATALOG = [
  {
    id: 'elgato-hello-world',
    pluginId: 'com.elgato.hello-world',
    name: 'Hello World (muestra oficial)',
    version: '0.1.0.0',
    description: 'Plugin oficial de ejemplo con una acción Counter. Se usa como prueba de compatibilidad del runtime Stream Deck.',
    developer: 'Elgato',
    ecosystem: 'streamdeck',
    category: 'Desarrollo',
    license: 'MIT',
    free: true,
    sourceUrl: 'https://github.com/elgatosf/streamdeck-plugin-samples/tree/main/hello-world',
    packageUrl: 'https://raw.githubusercontent.com/elgatosf/streamdeck-plugin-samples/main/hello-world/com.elgato.hello-world.streamDeckPlugin',
    sha256: 'DCECECC703C98FE60823329750B2D61D095B6E22B222B46E918C690F59A8790B',
  },
  {
    id: 'macrodeck-system-media',
    pluginId: 'com.pyflat.system-media',
    name: 'System Media',
    version: '1.2.0',
    description: 'Plugin gratuito del Store oficial de Macro Deck 3. NEXORA verifica e inspecciona el paquete; la ejecución queda bloqueada hasta implementar el protocolo completo.',
    developer: 'PyFlat',
    ecosystem: 'macrodeck',
    category: 'Multimedia',
    license: 'MIT',
    free: true,
    sourceUrl: 'https://github.com/PyFlat/System-Media',
    packageUrl: 'https://store-assets.macro-deck.app/plugins/com.pyflat.system-media/1.2.0/com.pyflat.system-media-v1.2.0.macroDeckPlugin',
    sha256: '9C286454A62946612FE8ACD5402474218AB9D423072E30974F6F71749EE877AB',
  },
];

function normalizeArchivePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) throw new Error('Ruta insegura en el paquete.');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) throw new Error('El paquete intenta salir de su directorio.');
  return segments.join('/');
}

function safeSegment(value) {
  const safe = String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe || safe === '.' || safe === '..') throw new Error('Identificador de plugin inválido.');
  return safe.slice(0, 140);
}

function inside(root, relative) {
  const target = path.resolve(root, relative);
  const base = `${path.resolve(root)}${path.sep}`;
  if (target !== path.resolve(root) && !target.startsWith(base)) throw new Error('Ruta del plugin fuera del directorio permitido.');
  return target;
}

function readRegistry(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function imageCandidate(root, icon) {
  if (!icon) return undefined;
  const candidates = path.extname(icon) ? [icon] : [`${icon}.png`, `${icon}.svg`, `${icon}.jpg`, `${icon}.jpeg`];
  return candidates.map((candidate) => inside(root, candidate)).find((candidate) => fs.existsSync(candidate));
}

class StreamDeckRuntime {
  constructor(plugin, callbacks) {
    this.plugin = plugin;
    this.callbacks = callbacks;
    this.server = null;
    this.socket = null;
    this.child = null;
    this.contexts = new Map();
    this.registration = null;
  }

  async start() {
    if (this.socket?.readyState === 1) return;
    if (this.registration) return this.registration;
    if (this.server || this.child) this.stop();
    this.registration = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('El plugin no se registró por WebSocket en 12 segundos.')), 12_000);
      this.server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 12 * 1024 * 1024 });
      this.server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      this.server.once('listening', () => {
        const port = this.server.address().port;
        this.callbacks.log('plugin-runtime', `${this.plugin.id}: host WebSocket en 127.0.0.1:${port}`);
        try { this.launch(port); }
        catch (error) { clearTimeout(timeout); reject(error); }
      });
      this.server.on('connection', (socket) => {
        this.callbacks.log('plugin-runtime', `${this.plugin.id}: conexión WebSocket recibida`);
        socket.on('message', (data) => this.onMessage(socket, data));
        socket.on('error', (error) => this.callbacks.log('plugin-runtime', `${this.plugin.id}: ${error.message}`));
        socket.on('close', () => { if (this.socket === socket) this.socket = null; });
        const registered = (data) => {
          try {
            const message = JSON.parse(String(data));
            if (message.event !== 'registerPlugin' || message.uuid !== this.plugin.id) return;
            socket.off('message', registered);
            this.socket = socket;
            this.callbacks.log('plugin-runtime', `${this.plugin.id}: registro confirmado`);
            clearTimeout(timeout);
            this.send({ event: 'deviceDidConnect', device: 'nexora-displaypad', deviceInfo: { name: 'Mountain DisplayPad', size: { columns: 6, rows: 2 }, type: 0 } });
            resolve();
          } catch {}
        };
        socket.on('message', registered);
      });
    }).catch((error) => {
      this.stop();
      throw error;
    }).finally(() => { this.registration = null; });
    return this.registration;
  }

  launch(port) {
    const root = inside(this.callbacks.pluginsRoot, this.plugin.installRelativePath);
    const entry = inside(root, this.plugin.entrypoint);
    if (!fs.existsSync(entry)) throw new Error('No se encuentra el ejecutable del plugin.');
    const info = JSON.stringify({
      application: { font: 'Segoe UI', language: 'es', platform: 'windows', platformVersion: '10', version: '7.1' },
      colors: { buttonMouseOverBackgroundColor: '#24202d', buttonPressedBackgroundColor: '#312542', buttonPressedBorderColor: '#8b5cf6', buttonPressedTextColor: '#ffffff', highlightColor: '#8b5cf6' },
      devicePixelRatio: 1,
      devices: [{ id: 'nexora-displaypad', name: 'Mountain DisplayPad', size: { columns: 6, rows: 2 }, type: 0 }],
      plugin: { uuid: this.plugin.id, version: this.plugin.version },
    });
    const args = ['-port', String(port), '-pluginUUID', this.plugin.id, '-registerEvent', 'registerPlugin', '-info', info];
    const extension = path.extname(entry).toLowerCase();
    if (!['.js', '.cjs', '.mjs'].includes(extension)) throw new Error('Esta prueba de concepto solo ejecuta plugins Stream Deck basados en JavaScript.');
    this.child = spawn(this.callbacks.runtimeExecutable || process.execPath, [entry, ...args], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    this.child.stdout?.on('data', (value) => this.callbacks.log('plugin-stdout', `${this.plugin.id}: ${String(value).trim()}`));
    this.child.stderr?.on('data', (value) => this.callbacks.log('plugin-stderr', `${this.plugin.id}: ${String(value).trim()}`));
    this.child.on('error', (error) => this.callbacks.log('plugin-process-error', `${this.plugin.id}: ${error.message}`));
    this.child.on('exit', (code) => { this.callbacks.log('plugin-process-exit', `${this.plugin.id}: ${code}`); this.child = null; });
  }

  send(message) {
    if (this.socket?.readyState !== 1) throw new Error('El plugin no está conectado al runtime NEXORA.');
    this.socket.send(JSON.stringify(message));
  }

  onMessage(socket, data) {
    let message;
    try { message = JSON.parse(String(data)); } catch { return; }
    const context = message.context;
    if (message.event === 'getSettings' && context) {
      const current = this.contexts.get(context);
      socket.send(JSON.stringify({ action: current?.actionId || '', event: 'didReceiveSettings', context, device: 'nexora-displaypad', payload: { settings: current?.settings || {}, coordinates: current?.coordinates || { column: 0, row: 0 }, isInMultiAction: false } }));
    } else if (message.event === 'setSettings' && context) {
      const current = this.contexts.get(context);
      if (current) current.settings = message.payload || {};
    } else if (message.event === 'setTitle' || message.event === 'setImage' || message.event === 'setState' || message.event === 'showOk' || message.event === 'showAlert') {
      this.callbacks.feedback({ pluginId: this.plugin.id, keyIndex: this.contexts.get(context)?.keyIndex, ...message });
    } else if (message.event === 'openUrl' && /^https?:\/\//i.test(message.payload?.url || '')) {
      void this.callbacks.openExternal(message.payload.url);
    } else if (message.event === 'logMessage') {
      this.callbacks.log('plugin-message', `${this.plugin.id}: ${message.payload?.message || ''}`);
    }
  }

  async execute(actionId, settings = {}, contextId, keyIndex = 0) {
    await this.start();
    const action = this.plugin.actions.find((item) => item.id === actionId);
    if (!action) throw new Error('Acción de plugin no encontrada.');
    const context = contextId || crypto.randomUUID();
    const coordinates = { column: keyIndex % 6, row: Math.floor(keyIndex / 6) };
    this.contexts.set(context, { actionId, settings: structuredClone(settings), coordinates, keyIndex });
    const common = { action: actionId, context, device: 'nexora-displaypad', payload: { settings, coordinates, state: 0, isInMultiAction: false, controller: 'Keypad' } };
    this.send({ ...common, event: 'willAppear' });
    this.send({ ...common, event: 'keyDown' });
    await new Promise((resolve) => setTimeout(resolve, 70));
    this.send({ ...common, event: 'keyUp' });
    return { ok: true, context };
  }

  stop() {
    try { this.socket?.close(); } catch {}
    try { this.server?.close(); } catch {}
    try { this.child?.kill(); } catch {}
    this.socket = null;
    this.server = null;
    this.child = null;
  }
}

function createPluginService({ dataRoot, log, feedback, openExternal, runtimeExecutable }) {
  const pluginsRoot = path.join(dataRoot, 'plugins');
  const installsRoot = path.join(pluginsRoot, 'installed');
  const registryFile = path.join(pluginsRoot, 'registry.json');
  const runtimes = new Map();
  fs.mkdirSync(installsRoot, { recursive: true });

  const list = () => readRegistry(registryFile);
  const save = (plugins) => writeAtomic(registryFile, plugins);
  const find = (id) => list().find((plugin) => plugin.id === id);

  function inspectPackage(bytes, options = {}) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_PACKAGE_BYTES) throw new Error('El paquete debe pesar entre 1 byte y 80 MB.');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
    if (options.expectedSha256 && sha256 !== String(options.expectedSha256).toUpperCase()) throw new Error('La integridad SHA-256 del paquete no coincide.');
    let archive;
    try { archive = new AdmZip(bytes); } catch { throw new Error('El archivo no es un paquete ZIP compatible.'); }
    const entries = archive.getEntries();
    if (!entries.length || entries.length > MAX_ENTRIES) throw new Error('Cantidad de archivos del paquete fuera de límite.');
    let expanded = 0;
    for (const entry of entries) {
      normalizeArchivePath(entry.entryName);
      expanded += Number(entry.header?.size || 0);
      if (expanded > MAX_EXPANDED_BYTES) throw new Error('El paquete expandido supera 250 MB.');
    }
    const manifestEntry = entries.find((entry) => !entry.isDirectory && normalizeArchivePath(entry.entryName).toLowerCase().endsWith('/manifest.json'))
      || entries.find((entry) => !entry.isDirectory && normalizeArchivePath(entry.entryName).toLowerCase() === 'manifest.json');
    if (!manifestEntry) throw new Error('No se encontró manifest.json.');
    let manifest;
    try { manifest = JSON.parse(manifestEntry.getData().toString('utf8')); } catch { throw new Error('El manifiesto no contiene JSON válido.'); }
    const ecosystem = Array.isArray(manifest.Actions) && manifest.UUID ? 'streamdeck' : manifest.manifestVersion === 1 && manifest.id ? 'macrodeck' : null;
    if (!ecosystem) throw new Error('El manifiesto no corresponde a Stream Deck ni Macro Deck 3.');
    const id = safeSegment(ecosystem === 'streamdeck' ? manifest.UUID : manifest.id);
    const version = safeSegment(manifest.Version || manifest.version || '0.0.0');
    const prefix = path.posix.dirname(normalizeArchivePath(manifestEntry.entryName));
    const entrypoint = ecosystem === 'streamdeck'
      ? (manifest.CodePathWin || manifest.CodePath || '')
      : (manifest.entrypoints?.['win-x64']?.executable || '');
    const actions = ecosystem === 'streamdeck' ? (manifest.Actions || [])
      .filter((action) => !action.Controllers || action.Controllers.includes('Keypad'))
      .map((action) => ({ id: String(action.UUID || ''), name: String(action.Name || action.UUID || 'Acción'), description: String(action.Tooltip || ''), icon: action.States?.[0]?.Image || action.Icon, configurable: Boolean(action.PropertyInspectorPath || manifest.PropertyInspectorPath) }))
      .filter((action) => action.id) : [];
    const runnable = ecosystem === 'streamdeck' && ['.js', '.cjs', '.mjs'].includes(path.extname(entrypoint).toLowerCase());
    const permissions = ecosystem === 'streamdeck'
      ? ['Ejecutar código local', 'Acceso de red según el plugin', 'Abrir enlaces externos', 'Actualizar estado visual de botones']
      : Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [];
    return { archive, entries, manifest, manifestEntry, prefix: prefix === '.' ? '' : prefix, sha256, ecosystem, id, version, entrypoint: entrypoint ? normalizeArchivePath(entrypoint) : '', actions, runnable, permissions };
  }

  function install(bytes, options = {}) {
    if (!options.approvedInstall) throw new Error('La instalación requiere confirmación explícita.');
    const inspected = inspectPackage(bytes, options);
    const target = path.join(installsRoot, inspected.ecosystem, inspected.id, inspected.version);
    const parent = path.dirname(target);
    const staging = path.join(parent, `.staging-${crypto.randomUUID()}`);
    let previous = null;
    fs.mkdirSync(staging, { recursive: true });
    try {
      for (const entry of inspected.entries) {
        if (entry.isDirectory) continue;
        const archiveName = normalizeArchivePath(entry.entryName);
        if (inspected.prefix && archiveName !== inspected.prefix && !archiveName.startsWith(`${inspected.prefix}/`)) continue;
        const relative = inspected.prefix ? archiveName.slice(inspected.prefix.length + 1) : archiveName;
        if (!relative) continue;
        const output = inside(staging, relative);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, entry.getData());
      }
      if (fs.existsSync(target)) {
        previous = path.join(parent, `.previous-${inspected.version}-${Date.now()}`);
        fs.renameSync(target, previous);
      }
      fs.renameSync(staging, target);
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      if (previous && !fs.existsSync(target) && fs.existsSync(previous)) fs.renameSync(previous, target);
      throw error;
    }
    const manifest = inspected.manifest;
    const plugin = {
      id: inspected.id,
      name: String(manifest.Name || manifest.name || inspected.id).slice(0, 160),
      description: String(manifest.Description || manifest.description || '').slice(0, 1000),
      developer: String(manifest.Author || manifest.publisher?.name || 'No identificado').slice(0, 160),
      ecosystem: inspected.ecosystem,
      category: String(manifest.Category || 'Otros').slice(0, 80),
      version: inspected.version,
      license: String(options.declaredLicense || manifest.license || 'No declarada').slice(0, 80),
      sourceUrl: String(options.sourceUrl || manifest.repository || manifest.URL || '').slice(0, 1000),
      sha256: inspected.sha256,
      installedAt: new Date().toISOString(),
      installRelativePath: path.relative(pluginsRoot, target),
      entrypoint: inspected.entrypoint,
      iconRelativePath: undefined,
      actions: inspected.actions,
      permissions: inspected.permissions,
      compatibility: inspected.ecosystem === 'streamdeck'
        ? (inspected.runnable ? 'experimental-runtime' : 'manifest-only')
        : 'inspection-only',
      executionApproved: false,
      free: options.free !== false,
    };
    const icon = imageCandidate(target, manifest.Icon || manifest.icon);
    if (icon) plugin.iconRelativePath = path.relative(pluginsRoot, icon);
    const registry = list().filter((item) => item.id !== plugin.id);
    registry.push(plugin);
    save(registry);
    log('plugin-install', `${plugin.id} ${plugin.version} ${plugin.sha256}`);
    return plugin;
  }

  function approve(id, approved) {
    const registry = list();
    const plugin = registry.find((item) => item.id === id);
    if (!plugin) throw new Error('Plugin no encontrado.');
    plugin.executionApproved = Boolean(approved);
    save(registry);
    if (!plugin.executionApproved) runtimes.get(id)?.stop();
    return plugin;
  }

  async function execute(id, actionId, settings, contextId, keyIndex) {
    const plugin = find(id);
    if (!plugin) throw new Error('Plugin no instalado.');
    if (!plugin.executionApproved) throw new Error('Autoriza la primera ejecución desde Plugin Hub.');
    if (plugin.compatibility !== 'experimental-runtime') throw new Error('Este plugin solo puede inspeccionarse; su runtime todavía no es compatible.');
    let runtime = runtimes.get(id);
    if (!runtime) {
      runtime = new StreamDeckRuntime(plugin, { pluginsRoot, log, feedback, openExternal, runtimeExecutable });
      runtimes.set(id, runtime);
    }
    return runtime.execute(actionId, settings || {}, contextId, Number(keyIndex || 0));
  }

  function uninstall(id, confirmed) {
    if (!confirmed) throw new Error('La desinstalación requiere confirmación explícita.');
    const plugin = find(id);
    if (!plugin) return null;
    runtimes.get(id)?.stop();
    runtimes.delete(id);
    const target = inside(pluginsRoot, plugin.installRelativePath);
    fs.rmSync(target, { recursive: true, force: true });
    save(list().filter((item) => item.id !== id));
    log('plugin-uninstall', id);
    return id;
  }

  function icon(id) {
    const plugin = find(id);
    if (!plugin?.iconRelativePath) return null;
    const file = inside(pluginsRoot, plugin.iconRelativePath);
    const extension = path.extname(file).toLowerCase();
    const mime = extension === '.svg' ? 'image/svg+xml' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }

  function stopAll() { for (const runtime of runtimes.values()) runtime.stop(); runtimes.clear(); }

  return { catalog: () => structuredClone(CATALOG), list, install, approve, execute, uninstall, icon, stopAll };
}

module.exports = { createPluginService };
