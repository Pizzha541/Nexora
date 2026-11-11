# Compilación y distribución

## Producción

```powershell
cd D:\Escritorio\Noxora\NEXORA
npm ci
npm run test
npm run tauri build
```

Tauri genera el instalador NSIS en `src-tauri\target\release\bundle\nsis`. El script `SCRIPTS\collect-build.ps1` copiará artefactos verificados a `BUILD\installers` cuando exista una compilación correcta.

## Build 0.1.0-alpha

- Instalador generado: `BUILD\installers\NEXORA_0.1.0_x64-setup.exe`
- Tamaño: 15.829.203 bytes.
- SHA-256: `95ED87EF67EF14FE0E9470BC0DCE6E74CCA7FC22350A32C35F6A4F8C7A61D46E`.
- Firma Authenticode: pendiente; no distribuir esta alpha como versión final.

## Build Electron con controlador físico

- Instalador: `BUILD\installers\NEXORA_0.1.0_Electron_x64-setup.exe`.
- Tamaño: 145.453.848 bytes.
- SHA-256: `2A81B999D0DE25E8F9CF40C83A40B60F15E59B0B401FC3E2CCFC1D64DA7C70D5`.
- Incluye Electron 45.3.0, `mountain-displaypad` 1.1.1, `node-hid` y Sharp 0.35.5.
- Los módulos nativos se verificaron dentro de `app.asar.unpacked`; auditoría de dependencias de producción: 0 vulnerabilidades conocidas.
- Smoke test oculto del renderer empaquetado aprobado: React, JavaScript y CSS cargaron desde `file://` con código de salida 0.
- Plugin Hub, `adm-zip` y `ws` comprobados dentro de `app.asar`; prueba real del plugin oficial Hello World aprobada con el runtime Node de Electron.
- Electron actualizado de 35.7.5 a 45.3.0 tras la auditoría: se eliminaron los avisos altos; las dependencias de producción reportan 0 vulnerabilidades conocidas. Permanecen 6 avisos moderados en herramientas de build que no se distribuyen como runtime.
- Firma Authenticode: pendiente.

## Condiciones antes de publicar

- Frontend y tests Rust en verde.
- Instalador firmado y prueba en un usuario limpio de Windows.
- Actualización desde la versión anterior conserva `%LOCALAPPDATA%\Nexora\NEXORA`.
- Desinstalación elimina binarios pero no datos del usuario salvo elección explícita.

