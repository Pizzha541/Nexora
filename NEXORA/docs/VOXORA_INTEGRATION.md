# VOXORA 0.12.0 en NEXORA

NEXORA usa el protocolo local 1.0 y la cola TTS real de VOXORA. No guarda el token ni asume un puerto fijo.

## Uso

1. Instala y abre VOXORA 0.12.0 o posterior.
2. Abre NEXORA y entra en **Integraciones**.
3. Comprueba que **VOXORA TTS** aparezca como `CONNECTED`. Si acabas de abrir VOXORA, pulsa **Detectar VOXORA**.
4. Despliega **Acciones VOXORA** y asigna una acción a una tecla.
5. En DisplayPad, selecciona la tecla y configura texto, voz, cola, velocidad, tono, volumen o prioridad.

Las voces se cargan desde el catálogo real del equipo. NEXORA ofrece acciones para decir texto, hablar el portapapeles, pausar, continuar, detener, saltar, vaciar la cola y aplicar un preset de voz. Los presets se pueden colocar en los dos estados de **Multi Action Switch**.

## Seguridad y conexión

- Discovery: `%LOCALAPPDATA%\Voxora\nexora-integration.json`.
- NEXORA acepta únicamente HTTP/WS en `127.0.0.1`.
- Cada petición y el WebSocket usan `Authorization: Bearer`.
- El token nunca se incluye en URLs, perfiles, mensajes ni logs.
- Al desconectarse, NEXORA vuelve a leer discovery antes de reconectar.
- VOXORA debe permanecer abierto para ejecutar acciones.

Gemini no ofrece control independiente de tono y no publica progreso intermedio; NEXORA no simula esos datos.
