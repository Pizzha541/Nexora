# Rediseño UX del editor DisplayPad

Fecha: 11 de noviembre de 2026.

## Resultado implementado

- NEXORA abre directamente el editor de DisplayPad.
- Panel izquierdo contraíble y redimensionable con búsqueda, categorías desplegables y acciones arrastrables.
- Visualizador central reutiliza `KeyGrid`, los doce índices físicos, imágenes/GIF, feedback de plugins, intercambio, copia con Ctrl y archivos de Windows.
- Panel derecho contraíble y redimensionable con propiedades visuales y controles específicos para web, archivo/aplicación, perfil, carpeta, escena OBS y Property Inspector de plugins.
- Autosave sigue usando el motor con debounce existente; no se añadió un segundo almacén de estado.
- `buttonDown` y `buttonUp` del worker USB animan la tecla correspondiente. El doble clic permite probar una acción de forma explícita.
- El Plugin Hub oculta la edición JSON bajo “Ajustes avanzados”; el editor normal no muestra IDs técnicos.
- OBS consulta `GetSceneList` y actualiza escenas tras `SceneListChanged` y `CurrentProgramSceneChanged`.

## Acciones expuestas en la biblioteca

Solo se muestran acciones con ejecutor disponible:

- Sistema: abrir URL y abrir aplicación/archivo mediante selector nativo.
- Multimedia: reproducir/pausar, pista anterior/siguiente, volumen y silencio en Windows.
- Perfiles y carpetas: navegación real y sincronización de página deseada.
- OBS: escenas obtenidas del WebSocket, grabación y transmisión.
- Plugins instalados: acciones declaradas, conservando autorización y Property Inspector.

Atajos, escritura de texto, macros y VOXORA no aparecen todavía en la biblioteca principal porque no existe un ejecutor completo y seguro para esas acciones. Se conservaron sus pantallas y datos existentes; no se presenta una función decorativa como terminada.

## Correcciones de arranque

- La ruta de datos se configura antes de solicitar el bloqueo de instancia única. Esto evita que el modo de desarrollo compita por el bloqueo genérico de Electron y se cierre inmediatamente.
- La selección de archivo usa `dialog.showOpenDialog` dentro del proceso principal.
- La prueba oculta de renderer confirma la señal `renderer-ready` y termina sin iniciar el worker USB.

## Verificación realizada

- `npm test`: 3 archivos, 10 pruebas superadas.
- `npm run build`: TypeScript y Vite completados.
- `node --check electron/main.cjs`: correcto.
- `node --check electron/obs-service.cjs`: correcto.
- `git diff --check`: sin errores de whitespace.
- Smoke test del renderer Electron: código de salida 0.
- Inspección visual en ventana 1440 × 900: biblioteca, rejilla 6 × 2 e inspector visibles, sin pantalla negra ni solapamientos críticos.
- Pruebas automatizadas añadidas para asignación por clic, payload de Drag & Drop y ocultación de identificadores técnicos.
- Las pruebas existentes verifican intercambio/copia sin perder configuración y conservación de índices 0–11.

## Límites de esta verificación

- No se realizó una secuencia física controlada de pulsar y soltar las doce teclas.
- Durante la inspección visual el servicio informó que detectó el DisplayPad; la aplicación puede sincronizar automáticamente la página deseada al conectarse, que es su comportamiento normal. No se ejecutaron acciones de teclas físicas deliberadamente.
- No había una instancia real de OBS conectada para validar una lista concreta de escenas.
- No se abrió un Property Inspector de un plugin externo real durante esta revisión.
- La compatibilidad Stream Deck continúa siendo experimental y Macro Deck continúa limitada a inspección cuando así lo indique el manifiesto.

Consulta también `EXISTING_PROJECTS_AUDIT.md` para la auditoría previa y las decisiones de reutilización.
