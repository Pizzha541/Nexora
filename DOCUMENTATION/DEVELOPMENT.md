# Desarrollo

## Requisitos del equipo de compilación

- Windows 10/11 x64.
- Node.js 20 o posterior.
- Rust estable 1.90 o posterior.
- Visual Studio Build Tools 2022: Desktop development with C++ y Windows SDK.
- WebView2 Runtime.

## Comandos

```powershell
cd D:\Escritorio\Noxora\NEXORA
npm install
npm run test
npm run tauri dev
```

`npm run dev` permite revisar solo la UI; en ese caso se usa un estado simulado local. La UI nunca presenta ese estado como hardware real.

## Reglas

- No añadir secretos a `.env` versionados.
- No estudiar firmware ni ejecutar actualizaciones de firmware.
- No probar escritura HID con Base Camp abierto.
- Añadir tests a las validaciones y migraciones antes de cambiar el formato de datos.

