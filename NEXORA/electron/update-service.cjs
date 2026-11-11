'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

function createUpdateService({ sendEvent, log }) {
  let installWhenReady = false;
  let status = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: 0,
    message: app.isPackaged ? 'Listo para buscar actualizaciones.' : 'Las actualizaciones solo se comprueban desde la versión instalada.',
    configured: true,
  };

  const publish = (patch = {}) => {
    status = { ...status, ...patch };
    sendEvent({ type: 'update-status', status: structuredClone(status) });
    return structuredClone(status);
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => publish({ phase: 'checking', progress: 0, message: 'Buscando una versión nueva…' }));
  autoUpdater.on('update-available', (info) => publish({ phase: 'available', availableVersion: info.version, message: `NEXORA ${info.version} está disponible.` }));
  autoUpdater.on('update-not-available', () => publish({ phase: 'current', availableVersion: null, progress: 0, message: `NEXORA ${app.getVersion()} está al día.` }));
  autoUpdater.on('download-progress', (progress) => publish({ phase: 'downloading', progress: Math.max(0, Math.min(100, Number(progress.percent || 0))), message: `Descargando actualización · ${Math.round(progress.percent || 0)} %` }));
  autoUpdater.on('update-downloaded', (info) => {
    publish({ phase: 'downloaded', availableVersion: info.version, progress: 100, message: `NEXORA ${info.version} está lista para instalar.` });
    if (installWhenReady) {
      installWhenReady = false;
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 350);
    }
  });
  autoUpdater.on('error', (error) => {
    log('updater', error?.stack || error);
    installWhenReady = false;
    publish({ phase: 'error', message: `No se pudo actualizar: ${error?.message || error}` });
  });

  async function check() {
    if (!app.isPackaged) return publish({ phase: 'development', message: 'Instala una versión empaquetada para usar el actualizador.' });
    await autoUpdater.checkForUpdates();
    return structuredClone(status);
  }

  async function install() {
    if (!app.isPackaged) return publish({ phase: 'development', message: 'La instalación automática solo funciona desde NEXORA instalado.' });
    if (status.phase === 'downloaded') {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 350);
      return publish({ phase: 'installing', message: 'Cerrando NEXORA para instalar y reiniciar…' });
    }
    installWhenReady = true;
    if (status.phase !== 'available') await autoUpdater.checkForUpdates();
    if (status.phase !== 'available') {
      installWhenReady = false;
      return structuredClone(status);
    }
    publish({ phase: 'downloading', progress: 0, message: 'Preparando la descarga verificada…' });
    await autoUpdater.downloadUpdate();
    return structuredClone(status);
  }

  return { getStatus: () => structuredClone(status), check, install };
}

module.exports = { createUpdateService };
