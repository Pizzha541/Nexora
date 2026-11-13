# Prompt para preparar VOXORA para NEXORA

Copia todo el texto siguiente en el chat que tenga acceso al proyecto de VOXORA:

---

Quiero preparar VOXORA para una integración local, segura y completamente funcional con NEXORA Control Studio, una aplicación Electron para controlar un Mountain DisplayPad. Trabaja directamente sobre el proyecto actual de VOXORA: inspecciona primero su arquitectura y reutiliza sus servicios de TTS existentes; no crees un segundo motor de voz ni una maqueta aislada.

Objetivo: NEXORA debe poder descubrir VOXORA, consultar sus capacidades y ejecutar acciones configurables desde botones físicos y Multi Actions, sin depender de servicios en la nube y sin exponer VOXORA a Internet.

Implementa una API local versionada enlazada exclusivamente a `127.0.0.1`. Usa HTTP para comandos/consultas y WebSocket para estado en tiempo real. Si el proyecto ya dispone de IPC, HTTP o WebSocket, amplía lo existente en vez de duplicarlo.

Contrato mínimo solicitado:

- `GET /api/v1/health`: versión de VOXORA, versión del protocolo, estado del motor y capacidades.
- `GET /api/v1/voices`: voces disponibles con identificador estable, nombre, idioma y motor.
- `GET /api/v1/settings`: voz activa, velocidad, tono, volumen y dispositivo de salida cuando sea compatible.
- `POST /api/v1/speak`: texto, `voiceId` opcional, velocidad, tono, volumen, prioridad y comportamiento de cola (`append`, `replace` o `interrupt`).
- `POST /api/v1/control`: operaciones `pause`, `resume`, `stop`, `skip` y `clearQueue`.
- `GET /api/v1/status`: estado `idle`, `speaking`, `paused` o `error`, elemento actual y longitud de cola.
- WebSocket `/api/v1/events`: eventos `ready`, `speechStarted`, `speechProgress`, `speechFinished`, `queueChanged`, `settingsChanged` y `error`.

Todas las respuestas deben ser JSON y los errores deben usar códigos estables, por ejemplo `{ "ok": false, "code": "VOICE_NOT_FOUND", "message": "..." }`. Los comandos exitosos deben devolver `{ "ok": true, ... }`. Incluye un `requestId` opcional que se conserve en respuestas y eventos para correlacionar una pulsación de NEXORA.

Descubrimiento y seguridad:

- Escucha solo en localhost; nunca en `0.0.0.0` por defecto.
- Permite configurar el puerto, con un valor predeterminado documentado.
- Genera un token local aleatorio y exige `Authorization: Bearer <token>` tanto en HTTP como durante la conexión WebSocket.
- Crea o actualiza `%LOCALAPPDATA%\Voxora\nexora-integration.json` con este formato: `protocolVersion`, `httpBaseUrl`, `webSocketUrl`, `token`, `voxoraVersion`, `pid` y `updatedAt`.
- Escribe el archivo de forma atómica y elimínalo o márcalo como inactivo al cerrar VOXORA.
- No registres el token ni el texto completo hablado en logs de producción.
- Añade límites razonables de longitud de texto, tamaño de cola y frecuencia de solicitudes.

Funciones que NEXORA debe poder convertir en botones:

- Hablar texto configurable.
- Hablar el contenido del portapapeles, si VOXORA ya tiene acceso seguro a él.
- Detener, pausar, continuar y saltar.
- Vaciar la cola.
- Elegir voz.
- Subir/bajar velocidad y volumen.
- Alternar entre dos voces o presets.
- Mostrar en el botón el estado actual y el nombre abreviado de la voz mediante eventos.

Requisitos de calidad:

- La API no debe bloquear la interfaz de VOXORA.
- Reutiliza su cola, configuración y ciclo de vida reales.
- Añade pruebas automatizadas para autenticación, validación, cola, cancelación, reconexión WebSocket y cierre limpio.
- Incluye un pequeño cliente de ejemplo que pruebe health, liste voces, hable una frase y detenga la reproducción.
- Mantén compatibilidad con el funcionamiento normal de VOXORA cuando NEXORA no esté instalado.

Entrega al finalizar:

1. Implementación completa y pruebas ejecutadas.
2. Un documento `NEXORA_INTEGRATION.md` con el contrato exacto, ejemplos JSON y pasos de conexión.
3. La ruta exacta del archivo de descubrimiento y el puerto predeterminado.
4. La lista de archivos modificados.
5. Un bloque de información para pegar en el chat de NEXORA que contenga: versión del protocolo, endpoints definitivos, autenticación, esquemas de solicitud/respuesta, eventos WebSocket y cualquier limitación real.

No afirmes que algo funciona si solo está simulado. Si una función depende del motor TTS o del sistema operativo, indícalo claramente y proporciona una degradación segura.

---
