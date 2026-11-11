# Instalación

El entregable final será `NEXORA_<versión>_x64-setup.exe` en `BUILD/installers/`.

El instalador NSIS se configura por usuario para evitar permisos administrativos innecesarios. El equipo destino no necesita Node, Rust ni Visual Studio; sí necesita WebView2, que Tauri puede resolver durante el empaquetado.

Estado actual: instalador NSIS generado y la aplicación portable compilada inicia correctamente. El instalador todavía no tiene firma Authenticode y no se ha probado el ciclo instalación/desinstalación en un usuario limpio.

