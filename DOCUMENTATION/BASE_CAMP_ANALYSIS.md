# Análisis de Mountain Base Camp

Fecha de análisis inicial: 2026-11-08. Fuente local aportada: Base Camp 1.9.10, manuales y recursos instalados. No se modificó la copia original.

## Observaciones

- El usuario informa que esta copia es inestable y en ocasiones ni siquiera inicia correctamente. La inspección visual se considera incompleta.
- El paquete usa Electron para la carcasa y un backend .NET/SQLite; NEXORA no reutiliza su código ni depende de esos procesos.
- Se observan componentes separados `MountainDisplayPadWorker.exe` y `DisplayPadSDK.dll`, coherente con un trabajador de dispositivo independiente.
- El manual general describe Dashboard, selector de producto, configuración, inicio con Windows, minimizar a bandeja, telemetría opcional, actualizaciones beta, idioma e integraciones.
- El producto oficial anuncia macro wizard/editor, key bindings, Twitch, OBS, Adobe, DaVinci Resolve, carpetas, drag-and-drop y actualizador.
- Las notas aportadas de 1.9.10 advierten que perfiles y macros pueden eliminarse al actualizar y recomiendan exportarlos antes. NEXORA exige copia automática y datos fuera del instalador.
- El archivo de notas aportado muestra una fecha futura respecto al análisis; se trata como metadata del artefacto, no como una publicación verificada en vivo.

## Tabla de funcionalidades

| Funcionalidad | Base Camp | NEXORA |
|---|---|---|
| Detección del dispositivo | Worker/SDK presentes; comportamiento visual incompleto | VID/PID e interfaces HID detectables; prueba física pendiente |
| Perfiles | Perfiles infinitos anunciados; riesgo de pérdida al actualizar | Persistencia separada, copia `.bak`, crear/activar/guardar/duplicar/eliminar implementado; eliminación recuperable |
| Carpetas | Carpetas anunciadas para funciones ilimitadas | Árbol persistente, subcarpetas y 12 teclas por nivel implementados |
| Macros | Wizard/editor y reproducción descritos | Editor y persistencia con límites implementados; ejecutor pendiente |
| GIF | Formato anunciado para teclas | Pipeline y cadencia pendientes de prueba física |
| Personalización | Bindings, imágenes e integraciones | Editor de nombre, texto, color y acción inicial implementado |
| Pantalla IPS | Pantalla 4.5" 800×240; control no confirmado | Componente separado; protocolo sin confirmar |
| Integraciones | OBS/Twitch/Adobe/DaVinci observados | OBS WebSocket 5.x primero; módulos aislados |

## Limitaciones observadas

- Base Camp debe permanecer ejecutándose para que DisplayPad funcione; el dispositivo no tiene almacenamiento de perfiles según el FAQ oficial.
- DisplayPad debe conectarse directamente al PC; el FAQ recomienda USB 3.x para problemas de reconocimiento.
- No se han copiado iconos, código, bases de datos ni otros recursos propietarios de Base Camp.

## Referencias públicas

- https://mountain.gg/keypads/displaypad/
- https://mountain.gg/support/keypads

