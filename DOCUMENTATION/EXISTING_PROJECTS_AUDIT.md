# Auditoría de proyectos y prototipos existentes

Fecha: 11 de noviembre de 2026.

## Alcance

Se inspeccionaron `NEXORA`, `USER_FILES/device`, `USER_FILES/Programs`, los recursos visuales y el `app.asar` de Mountain Base Camp. Se excluyeron de la comparación las dependencias vendorizadas, builds e instaladores.

## Componentes encontrados

### NEXORA actual

- React/Vite contiene `KeyGrid`, la cuadrícula interactiva 6 × 2, previsualización de imágenes/GIF, selección, Drag & Drop, intercambio y copia de teclas.
- Electron contiene el worker USB aislado, eventos `buttonDown`/`buttonUp`, cola incremental, GIF, páginas y reconexión.
- Decisión: este es el visualizador funcional que se ampliará. Se conservarán sus índices 0–11, sus MIME internos de Drag & Drop y la única fuente de verdad del motor en tiempo real.

### Prototipo Node `Programs/mountain-displaypad`

- `nexora-control.js` abre el dispositivo, serializa comandos, recibe `down`/`up`, escribe colores e imágenes 102 × 102 y valida índices 1–12.
- `test.js` realiza una prueba física mínima de conexión, eventos y tres colores.
- Sus tres copias de `index.js` —prototipo, fuente guardada y dependencia instalada de NEXORA— tienen el mismo SHA-256: `EA923AB2BDA5A5D863C09382F4F994B8235E126BDD082657670C42DCFA85CAFE`.
- Verificación realizada: sintaxis Node correcta. No se ejecutó la escritura física durante esta auditoría.
- Decisión: reutilizado indirectamente mediante la dependencia idéntica `mountain-displaypad@1.1.1`; no se copiará código duplicado.

### `oss-mountain-displaypad-2.0.0`

- Driver y biblioteca Python con páginas, contexto gráfico por tecla, pulsación/liberación, doble pulsación, pulsación larga, cola asíncrona y actualizaciones incrementales.
- Sus conceptos de tecla presionada, página activa, dirty tiles y estado desconectado son aplicables al visualizador React.
- La suite incluida no se pudo ejecutar porque el equipo no tiene una instalación de Python accesible. No se incorpora el runtime Python ni se mezcla con el worker Node de Windows.
- Decisión: reutilización conceptual y como referencia de pruebas; no se añade una segunda pila USB.

### Demo oficial C# `DisplayPad.SDK.Demo`

- Proyecto `net6.0-windows` que depende de `DisplayPad.SDK 1.0.6`.
- Expone callbacks de conexión, pulsación y progreso, pero no contiene interfaz ni visualizador.
- Decisión: referencia para semántica de eventos; no se integra porque duplicaría el controlador y requeriría otro proceso/runtime.

### Mountain Base Camp original

- Aplicación Electron que lanza un backend ASP.NET compilado y se comunica por Socket.IO local.
- `app.asar` contiene un puente Electron genérico y una pantalla de inicio; la interfaz del producto está compilada dentro del backend/binario y no existe como componentes React reutilizables.
- Incluye DLL de DisplayPad, OBS, Twitch y otros servicios, pero reutilizarlas sin contrato ni código fuente introduciría dependencias opacas y los fallos de arranque que NEXORA busca evitar.
- Decisión: no reutilizar binarios ni el puente; conservar solamente los recursos que ya fueron importados legalmente por el usuario.

### Recursos NEXORA

- Logo, banner, Initial Screen y animación HTML existentes.
- Decisión: mantener la identidad grafito/violeta y los recursos actuales; el rediseño no copiará la marca de Elgato.

## Integración elegida

1. Evolucionar `KeyGrid` para reflejar pulsación física, liberación, simulación y estado de conexión.
2. Mantener el worker `mountain-displaypad` ya probado en lugar de incorporar Python, C# o DLL de Base Camp.
3. Reutilizar el motor de Drag & Drop y autosave existente dentro de un editor de tres paneles.
4. Reutilizar las acciones reales de OBS, plugins, perfiles, carpetas y sistema; no mostrar acciones decorativas sin ejecutor.
5. Mantener los proyectos auditados intactos dentro de `USER_FILES`.

## Limitaciones de la auditoría

- No se declara prueba física nueva: no se escribió al DisplayPad durante esta revisión.
- El proyecto Python no pudo ejecutar su suite por ausencia de Python.
- Base Camp y el demo C# solo se inspeccionaron; no se ejecutaron ni modificaron.
