# Registro de decisiones

## 2026-11-08 - Tauri 2 y Rust

Se adopta la arquitectura pedida para reducir consumo frente a Electron y separar el runtime de hardware de React.

## 2026-11-08 - Simulación explícita por defecto

El primer inicio usa simulación porque el hardware no fue detectado. La UI identifica el modo y el usuario cambia a hardware deliberadamente.

## 2026-11-08 - Escritura HID bloqueada

La biblioteca abierta aporta suficiente evidencia para detectar interfaces, pero no para declarar seguras todas las escrituras. Se habilitarán tras pruebas progresivas con recuperación mediante Base Camp.

## 2026-11-08 - Persistencia fuera del instalador

Los datos se guardan en LocalAppData y se copian antes de reemplazarlos. La decisión responde al riesgo documentado de pérdida de perfiles/macros durante actualizaciones de Base Camp.

## 2026-11-08 - Recursos originales preservados

Branding e intro se copian como activos de compilación; sus originales permanecen en `USER_FILES`. No se incorporan recursos de Base Camp.

