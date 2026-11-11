'use strict';

const fs = require('node:fs');
const { parentPort } = require('node:process');
const Displaypad = require('mountain-displaypad');
const sharp = require('sharp');

let pad = null;
let connecting = false;
let ready = false;
let closing = false;
let gifTimer = null;
let gifBusy = false;
const gifs = new Map();

function emit(message) { parentPort?.postMessage(message); }
function reply(id, ok, extra = {}) { emit({ type: 'response', id, ok, ...extra }); }
function log(level, message) { emit({ type: 'log', level, message }); }
function status(message = '') { emit({ type: 'status', connected: Boolean(pad && ready), ready, message }); }

function keyIndex(key) {
  const value = Number(key);
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error('Botón fuera de rango (1–12).');
  return value - 1;
}

function waitIdle(timeout = 25_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (!pad) return reject(new Error('DisplayPad desconectado.'));
      if (!pad.initializing && Array.isArray(pad.queue) && pad.queue.length === 0) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('Timeout esperando la transferencia USB.'));
      setTimeout(poll, 35);
    };
    poll();
  });
}

async function writePixels(index, pixels) {
  if (!pad) throw new Error('DisplayPad desconectado.');
  pad.fillImage(index, pixels);
  await waitIdle();
}

function stopGif(key) {
  gifs.delete(Number(key));
  if (!gifs.size && gifTimer) clearTimeout(gifTimer);
  if (!gifs.size) gifTimer = null;
}

function stopGifs() {
  gifs.clear();
  if (gifTimer) clearTimeout(gifTimer);
  gifTimer = null;
}

async function readGif(file) {
  if (!fs.existsSync(file)) throw new Error('No se encuentra el GIF.');
  const metadata = await sharp(file, { animated: true }).metadata();
  const count = Math.min(Number(metadata.pages || 1), 100);
  if (count < 2) throw new Error('El archivo no contiene varios fotogramas.');
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const pixels = await sharp(file, { page: index, pages: 1 })
      .rotate()
      .resize(102, 102, { fit: 'cover' })
      .flatten({ background: '#000000' })
      .removeAlpha()
      .raw()
      .toBuffer();
    frames.push({ pixels, delay: Math.max(100, Math.min(1500, Number(metadata.delay?.[index] || 120))) });
  }
  return frames;
}

function scheduleGif() {
  if (gifTimer || !gifs.size || closing) return;
  gifTimer = setTimeout(runGifFrame, 25);
}

async function runGifFrame() {
  gifTimer = null;
  if (!pad || gifBusy || !gifs.size || closing) return;
  const now = Date.now();
  const entry = [...gifs.entries()].find(([, gif]) => gif.nextAt <= now);
  if (!entry) {
    const next = Math.min(...[...gifs.values()].map((gif) => gif.nextAt));
    gifTimer = setTimeout(runGifFrame, Math.max(25, next - Date.now()));
    return;
  }
  const [key, gif] = entry;
  gifBusy = true;
  try {
    await writePixels(keyIndex(key), gif.frames[gif.frame].pixels);
    gif.frame = (gif.frame + 1) % gif.frames.length;
    gif.nextAt = Date.now() + gif.frames[gif.frame].delay;
  } catch (error) {
    log('error', `GIF botón ${key}: ${error.message}`);
    stopGif(key);
  } finally {
    gifBusy = false;
    scheduleGif();
  }
}

async function writeImage(key, file) {
  if (!fs.existsSync(file)) throw new Error('Imagen no encontrada.');
  stopGif(key);
  const pixels = await sharp(file)
    .rotate()
    .resize(102, 102, { fit: 'cover' })
    .flatten({ background: '#000000' })
    .removeAlpha()
    .raw()
    .toBuffer();
  await writePixels(keyIndex(key), pixels);
}

async function startGif(key, file, schedule = true) {
  keyIndex(key);
  const frames = await readGif(file);
  gifs.set(Number(key), { frames, frame: 0, nextAt: Date.now() });
  if (schedule) scheduleGif();
  return frames.length;
}

async function startup(file) {
  if (!fs.existsSync(file)) throw new Error('No se encuentra la imagen de inicio.');
  const resized = await sharp(file)
    .rotate()
    .resize(612, 204, { fit: 'contain', background: '#000000', position: 'centre' })
    .flatten({ background: '#000000' })
    .removeAlpha()
    .raw()
    .toBuffer();
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const tile = await sharp(resized, { raw: { width: 612, height: 204, channels: 3 } })
        .extract({ left: column * 102, top: row * 102, width: 102, height: 102 })
        .raw()
        .toBuffer();
      const index = row * 6 + column;
      await writePixels(index, tile);
      emit({ type: 'event', name: 'startupProgress', current: index + 1, total: 12 });
    }
  }
}

async function applyPage(keys) {
  stopGifs();
  const animatedKeys = [];
  for (let index = 0; index < 12; index += 1) {
    const key = keys[index] || {};
    if (key.file && key.animated) animatedKeys.push({ key: index + 1, file: key.file });
    else if (key.file) await writeImage(index + 1, key.file);
    else {
      pad.clearKey(index);
      await waitIdle();
    }
    emit({ type: 'event', name: 'pageProgress', current: index + 1, total: 12 });
  }
  for (const item of animatedKeys) await startGif(item.key, item.file, false);
  scheduleGif();
}

async function connect() {
  if (pad || connecting) return;
  connecting = true;
  status('Buscando Mountain DisplayPad…');
  try {
    pad = await Displaypad.openAsync();
    pad.on('down', (key) => emit({ type: 'event', name: 'buttonDown', key }));
    pad.on('up', (key) => emit({ type: 'event', name: 'buttonUp', key }));
    pad.on('error', (error) => {
      log('error', `USB: ${error.message}`);
      ready = false;
      try { pad?.close(); } catch {}
      pad = null;
      status(error.message);
    });
    ready = true;
    status('Mountain DisplayPad conectado.');
    log('success', 'Conexión USB establecida con mountain-displaypad.');
  } catch (error) {
    pad = null;
    ready = false;
    status(error.message);
    log('error', `Conexión: ${error.message}`);
  } finally {
    connecting = false;
  }
}

async function handle(message) {
  const { id, command, ...payload } = message;
  try {
    if (command === 'shutdown') {
      closing = true;
      stopGifs();
      try { pad?.close(); } catch {}
      pad = null;
      reply(id, true);
      return;
    }
    if (command === 'connect') {
      await connect();
      reply(id, Boolean(pad), { connected: Boolean(pad) });
      return;
    }
    if (!pad) throw new Error('DisplayPad no conectado.');
    if (command === 'image') await writeImage(payload.key, payload.file);
    else if (command === 'gifStart') reply(id, true, { frames: await startGif(payload.key, payload.file) });
    else if (command === 'gifStop') stopGif(payload.key);
    else if (command === 'stopGifs') stopGifs();
    else if (command === 'startupImage') { stopGifs(); await startup(payload.file); }
    else if (command === 'page') await applyPage(payload.keys || []);
    else if (command === 'clear') { stopGif(payload.key); pad.clearKey(keyIndex(payload.key)); await waitIdle(); }
    else throw new Error(`Comando desconocido: ${command}`);
    if (command !== 'gifStart') reply(id, true);
  } catch (error) {
    reply(id, false, { error: error.message });
  }
}

parentPort?.on('message', (event) => { void handle(event.data); });
void connect();
