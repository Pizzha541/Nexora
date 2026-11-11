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

