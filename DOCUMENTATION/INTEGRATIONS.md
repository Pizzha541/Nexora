# Integraciones

## OBS Studio

Implementado en Electron: conexión WebSocket 5.x persistente durante la sesión, autenticación challenge/salt, `GetVersion`, eventos, timeout de cinco segundos y cierre controlado. Solo se aceptan hosts locales o `wss://` para reducir transmisiones accidentales. La contraseña no se persiste.

Acciones reales disponibles para Drag & Drop: cambiar escena, iniciar/detener streaming, iniciar/detener grabación y pausar/reanudar grabación. Las teclas físicas ejecutan estas solicitudes contra la sesión conectada. También existe soporte de backend para `SetSceneItemEnabled`; falta exponer un selector que obtenga identificadores desde OBS.

Pendiente: reconexión autenticada entre reinicios, selectores dinámicos de escenas/fuentes y representación visual completa de estados de stream/grabación.

Referencia: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md

## VOXORA TTS

Módulo reservado, sin endpoints inventados. Requiere los archivos o contrato de comunicación del proyecto.

## Discord

Se documentarán por separado las capacidades permitidas por RPC local, SDK y OAuth. No se automatizarán cuentas ni se usarán APIs no autorizadas.

## Twitch, Kick y YouTube

Serán módulos independientes con credenciales, scopes, rate limits y estados propios. No se asumirá paridad funcional entre plataformas.

## Ecosistemas Stream Deck y Macro Deck

Los paquetes no son binariamente intercambiables. Stream Deck ejecuta el `CodePath` de cada plugin dentro de su host y le entrega eventos del SDK; Macro Deck 3 usa plugins fuera de proceso supervisados, sesión autenticada y capacidades negociadas. NEXORA no presentará un botón «instalar» que finja compatibilidad.

La estrategia es: plugins nativos NEXORA con manifiesto y permisos; adaptadores por API/deep link cuando el servicio lo permita; y enlaces al catálogo oficial para instalar el plugin en su aplicación original. Las integraciones de Twitch, OBS o Spotify se implementarán contra sus APIs oficiales o mediante un adaptador documentado, nunca cargando código de terceros sin aislamiento.

Referencias oficiales:

- https://docs.elgato.com/streamdeck/sdk/references/manifest/
- https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/
- https://docs.macro-deck.app/reference/plugin-hosting/
- https://docs.macro-deck.app/guide/concepts/

