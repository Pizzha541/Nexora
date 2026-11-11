# NEXORA

NEXORA es una aplicación de escritorio independiente para controlar y personalizar el Mountain DisplayPad en Windows 10/11. La interfaz usa React, TypeScript y Vite. El backend principal es Electron/Node y reutiliza la implementación `mountain-displaypad` aportada por el usuario; el backend Tauri/Rust se conserva como referencia histórica.

## Estado actual

La versión `0.1.0-alpha` incluye interfaz navegable, perfiles y carpetas persistentes, editor de las 12 teclas, biblioteca reutilizable de PNG/JPG/WEBP/GIF, Initial Screen y Plugin Hub. El backend Electron integrado envía imágenes, GIF por fotogramas y composiciones panorámicas 6×2. También incluye estado en tiempo real, guardado automático, cola USB incremental, Drag & Drop global, acciones OBS WebSocket 5.x y un host experimental de Property Inspector. El runtime de Stream Deck ejecutó una muestra oficial; Macro Deck 3 está limitado a instalación e inspección hasta completar su protocolo.

## Desarrollo

```powershell
cd D:\Escritorio\Noxora\NEXORA
npm install
npm run desktop
```

`npm run tauri dev` conserva temporalmente la edición anterior. Consulta [DEVELOPMENT.md](DOCUMENTATION/DEVELOPMENT.md), [TESTING.md](DOCUMENTATION/TESTING.md) y [PLUGIN_COMPATIBILITY.md](DOCUMENTATION/PLUGIN_COMPATIBILITY.md) antes de trabajar con hardware o código externo.

## Datos

Los datos del usuario se guardan en `%LOCALAPPDATA%\Nexora\NEXORA` y no dentro de la instalación. Los recursos originales se conservan en `USER_FILES/`. USB 3.x no es requisito: el DisplayPad usa USB 2.0; se recomienda conexión directa y cerrar Base Camp durante pruebas HID.

