# Arquitectura

## Capas

1. `src/`: React/TypeScript; presentación, navegación y edición visual.
2. `src-tauri/src/models.rs`: contratos serializables de perfiles, teclas, macros y estado.
3. `src-tauri/src/storage.rs`: repositorio JSON local, escritura temporal y copia `.bak`.
4. `src-tauri/src/device/`: abstracción del DisplayPad, simulador y detección Mountain HID.
5. `src-tauri/src/integrations/`: conectores aislados; OBS es el primero.
6. Comandos Tauri: frontera estrecha y validada entre la UI y el núcleo.

## Decisiones clave

- El modo hardware no escribe al dispositivo hasta superar las pruebas físicas progresivas.
- Los datos viven en `%LOCALAPPDATA%\Nexora\NEXORA`; la aplicación puede actualizarse sin tocarlos.
- Cada perfil contiene exactamente 12 teclas, pero carpetas y perfiles son entidades de nivel superior.
- Las integraciones no comparten credenciales. La prueba OBS no persiste la contraseña.
- El actualizador se habilitará solo cuando existan repositorio, endpoint y clave pública válidos.

## Flujo de eventos previsto

`HID -> DeviceBackend -> eventos Tauri -> estado Rust -> React`

Las pulsaciones no dependerán de que el Dashboard esté visible. Los estados de OBS y otras integraciones seguirán el mismo patrón sin renderizado continuo.

# Arquitectura de transición

La aplicación principal pasa a Electron para adoptar sin reinterpretaciones el controlador USB que ya fue probado con el Mountain DisplayPad. La interfaz React/Vite se conserva. `electron/main.cjs` limita IPC y persistencia; `electron/usb-worker.cjs` se ejecuta como `utilityProcess`, contiene `mountain-displaypad`/Sharp y aísla bloqueos nativos del proceso principal.

El árbol `src-tauri` se conserva durante la migración para no perder la implementación OBS, pruebas de almacenamiento ni el instalador de contingencia. No es el controlador físico preferido mientras se completa la paridad.

## Motor reactivo de Electron

La interfaz aplica cada mutación primero sobre el estado React y usa una única función de commit para perfiles y teclas. El perfil modificado se persiste tras 350 ms sin cambios; las escrituras son atómicas, hacen `fsync` y conservan una copia `.bak`. Las configuraciones de Initial Screen usan el mismo patrón con 400 ms de debounce.

El flujo activo es:

`React → commitProfile → autosave Electron + cola USB → evento de runtime → React`

Las actualizaciones USB por tecla se agrupan durante 90 ms y se serializan. Si llegan varias modificaciones de una misma tecla solo se transfiere el estado final. La página deseada permanece en memoria durante una desconexión y se envía completa después de reconectar. El botón «Aplicar al DisplayPad» permanece como resincronización manual y recuperación, no como requisito habitual.

`src/lib/realtime.ts` contiene las mutaciones puras que comparten la UI y las pruebas: reemplazo, intercambio/copia de teclas, movimiento seguro de carpetas, reordenación de perfiles, actualización de settings de plugins y validación de recursos visuales.

