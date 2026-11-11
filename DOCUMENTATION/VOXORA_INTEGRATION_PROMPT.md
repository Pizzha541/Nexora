# Prompt para el chat de VOXORA

Copia y pega todo el bloque siguiente en el chat que tenga acceso al código de VOXORA:

---

Estoy integrando VOXORA con NEXORA, una aplicación Electron + React + TypeScript para controlar un Mountain DisplayPad de 12 teclas (6 × 2). No quiero una descripción general: necesito que inspecciones el proyecto real de VOXORA y entregues un contrato de integración implementable y probado.

## Objetivo

NEXORA debe poder descubrir VOXORA en el mismo equipo, comprobar su versión/capacidades, mostrar sus voces y ejecutar acciones TTS desde botones físicos. La integración debe funcionar sin incluir contraseñas, tokens privados ni secretos dentro de NEXORA.

## Lo que debes entregar

1. Identifica el stack, proceso principal, punto de entrada y modelo de ejecución actual de VOXORA.
2. Indica si ya existe una API HTTP local, WebSocket, named pipe, IPC, CLI o deep link. No inventes nada: cita archivos y líneas del proyecto.
3. Si no existe un contrato estable, impleméntalo en VOXORA. Preferencia:
   - HTTP solo en `127.0.0.1` para comandos y consultas.
   - WebSocket local para estados y progreso.
   - Puerto configurable, con descubrimiento seguro mediante un archivo de estado en LocalAppData o un puerto documentado.
4. Añade un handshake versionado y un endpoint de capacidades.
5. Define y documenta, como mínimo:
   - `GET /health`
   - `GET /v1/capabilities`
   - `GET /v1/voices`
   - `GET /v1/settings`
   - `POST /v1/speech` para sintetizar/reproducir texto
   - `POST /v1/speech/stop`
   - `POST /v1/speech/pause`
   - `POST /v1/speech/resume`
   - `GET /v1/queue`
   - WebSocket/eventos para `ready`, `speaking`, `paused`, `completed`, `cancelled`, `error`, progreso y cola.
6. Para cada operación entrega esquemas JSON exactos, ejemplos de petición/respuesta, códigos HTTP y errores estables.
7. Define IDs estables y nombres visibles para estas acciones de NEXORA:
   - Leer texto fijo.
   - Leer texto del portapapeles, únicamente tras una pulsación explícita.
   - Detener voz.
   - Pausar/reanudar.
   - Vaciar cola.
   - Cambiar o recorrer voz.
   - Subir/bajar volumen o velocidad, solo si VOXORA realmente lo permite.
8. Define el esquema de configuración de cada acción: voz, idioma, velocidad, tono, volumen, dispositivo de salida y comportamiento de cola. Marca qué campos son opcionales y proporciona valores por defecto.
9. Incluye un endpoint o descriptor que NEXORA pueda convertir en su inspector visual sin pedir JSON ni IDs al usuario.
10. Seguridad obligatoria:
    - Escuchar únicamente en loopback.
    - Validar tamaño y tipo de entradas.
    - Rechazar rutas o comandos arbitrarios.
    - No exponer secretos ni credenciales.
    - Explicar autenticación local o token de sesión si se necesita.
    - CORS desactivado o restringido al origen necesario.
11. Añade control de compatibilidad con `apiVersion`, `appVersion`, `minimumClientVersion` y lista de capacidades.
12. Incluye reconexión, timeouts, cancelación y comportamiento si VOXORA se cierra mientras habla.
13. Escribe pruebas automatizadas para health, voces, síntesis, cancelación, errores, eventos y una reconexión.
14. Entrega un pequeño cliente de referencia TypeScript/Node que NEXORA pueda reutilizar, con tipos y sin dependencias innecesarias.
15. Devuelve una lista de archivos modificados, comandos de prueba ejecutados y resultados reales. Distingue claramente lo implementado de lo pendiente.

## Formato final requerido

- Resumen del contrato elegido.
- Tabla de endpoints/eventos.
- Esquemas y tipos TypeScript.
- Código del cliente de referencia.
- Instrucciones de descubrimiento/conexión.
- Seguridad y límites.
- Pruebas ejecutadas.
- Versión mínima de VOXORA que soportará NEXORA.
- Ruta del commit o diff con la implementación.

No respondas solo con recomendaciones. Implementa el lado de VOXORA y entrega evidencia verificable para que el chat de NEXORA pueda integrar el cliente.

---

