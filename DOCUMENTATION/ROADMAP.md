# Roadmap

## Fase actual - Fundaciones

- [x] Inventario de recursos y entorno.
- [x] Arquitectura Rust/Tauri/React.
- [x] Persistencia y perfiles iniciales.
- [x] Crear, activar, duplicar y eliminar perfiles con archivo de recuperación.
- [x] Simulador y detección HID segura.
- [ ] Compilación completa de desarrollo.

## Hardware

- [x] Detectar el DisplayPad conectado.
- [x] Capturar pulsaciones y ejecutar acciones asignadas.
- [ ] Validar una tecla 102/104 px.
- [x] Implementar cola incremental, timeouts, agrupación y reconexión.
- [x] GIF host-side con scheduler compartido.
- [ ] Investigar IPS 800×240 por separado.

## Producto

- [x] Carpetas/subcarpetas con doce teclas por nivel.
- [ ] Importación/exportación de perfiles, carpetas y macros.
- [ ] Motor de acciones con consentimiento y allowlists.
- [x] Editor y persistencia de macros con límites.
- [ ] Ejecutor de macros con cancelación y consentimiento.
- [ ] OBS completo; VOXORA cuando exista contrato; Discord oficial.
- [x] Plugin Hub base con manifiesto, integridad, permisos, instalación y desinstalación.
- [x] Runtime Stream Deck JavaScript experimental con prueba oficial reproducible.
- [x] Host inicial de Property Inspector con settings independientes y ventana aislada.
- [ ] Ampliar la matriz real de Property Inspector y más eventos del SDK de Stream Deck.
- [ ] Implementar host del protocolo Macro Deck 3; la inspección de paquetes ya está operativa.
- [ ] Updater firmado y canal GitHub.
- [ ] Instalador NSIS probado en otro equipo.

## Interacción dinámica

- [x] Estado inmediato y autosave debounced de perfiles y Initial Screen.
- [x] Sincronización automática de tecla, página, perfil y carpeta con el hardware.
- [x] Drag & Drop de plugins, biblioteca y archivos externos hacia las 12 teclas.
- [x] Intercambio de teclas y copia explícita con Ctrl+arrastrar.
- [x] Movimiento de carpetas con prevención de ciclos y reordenación persistente de perfiles.
- [ ] Alternativas completas de teclado para todas las operaciones de Drag & Drop.

