# Plugin Hub y compatibilidad externa

## Estado implementado

NEXORA mantiene adaptadores separados para cada ecosistema. Importar un paquete nunca autoriza su ejecución. Los plugins se guardan en `%LOCALAPPDATA%\Nexora\NEXORA\data\plugins` y el registro conserva versión, procedencia, SHA-256, licencia, permisos y nivel de compatibilidad.

El catálogo inicial contiene exclusivamente artefactos gratuitos con URL y SHA-256 fijados:

- Elgato Hello World 0.1.0.0, MIT: runtime Stream Deck experimental y acción Counter comprobada.
- Macro Deck System Media 1.2.0, MIT: instalación e inspección comprobadas; ejecución bloqueada.

La instalación valida tamaño, cantidad de archivos, tamaño expandido, rutas internas, manifiesto y SHA-256 cuando existe una huella confiable. La extracción convierte todas las entradas en archivos normales y rechaza rutas absolutas o `..`.

## Stream Deck

Los paquetes `.streamDeckPlugin` contienen una carpeta `.sdPlugin` con `manifest.json`, recursos y un punto de entrada. El manifiesto publica las acciones mediante `Actions[].UUID`. El proceso recibe `-port`, `-pluginUUID`, `-registerEvent` e `-info`, y se registra con el host mediante WebSocket.

El runtime experimental de NEXORA admite actualmente plugins JavaScript no cifrados. Implementa este subconjunto:

- Registro `registerPlugin`.
- `deviceDidConnect` para una matriz lógica de 6 × 2.
- `willAppear`, `keyDown` y `keyUp`.
- `getSettings`, `setSettings` y `didReceiveSettings` durante la sesión.
- Recepción de `setTitle`, `setImage`, `setState`, `showOk`, `showAlert`, `openUrl` y `logMessage`.
- Puente de `setTitle` y `setImage` hacia la tecla física correspondiente, con archivos de caché limitados y validación de imágenes `data:`.
- Configuración individual en JSON y contexto estable por botón.
- Host experimental de Property Inspector en una ventana Chromium aislada.
- Registro `registerPropertyInspector`, `getSettings`, `setSettings`, settings globales y mensajería `sendToPlugin`/`sendToPropertyInspector`.
- Persistencia en tiempo real de los settings recibidos, asociada al `contextId` de cada tecla.

No se declara compatibilidad completa con Property Inspector: el host cubre el contrato WebSocket esencial y componentes HTML locales, pero todavía debe probarse con una matriz mayor de plugins reales. Tampoco se declara compatibilidad con plugins nativos, DRM/cifrados, encoders, perfiles ni todas las llamadas del SDK. Un plugin que dependa de esas superficies se marca como solo manifiesto o puede fallar con un error explícito.

El Property Inspector se abre con `sandbox: true`, sin Node.js ni preload. Las navegaciones HTTP externas se redirigen al navegador del sistema. Instalar, autorizar, abrir el inspector y ejecutar una acción siguen siendo operaciones separadas.

Fuentes oficiales:

- https://docs.elgato.com/streamdeck/sdk/references/manifest/
- https://docs.elgato.com/streamdeck/sdk/v1/references/websocket/plugin/
- https://github.com/elgatosf/streamdeck-plugin-samples

## Macro Deck

Macro Deck 3 usa plugins fuera de proceso con un contrato JSON versionado sobre HTTP y WebSocket. El manifiesto describe identidad, entrypoints, permisos, archivos, firma y compatibilidad, pero las acciones se declaran durante el handshake del runtime. Por eso no es correcto inventarlas leyendo solamente el paquete.

NEXORA puede instalar e inspeccionar `.macroDeckPlugin`, mostrar metadatos y permisos, y detectar que el runtime todavía no es compatible. La ejecución permanece bloqueada hasta implementar negociación, sesiones, autenticación, `session.hello`, declaraciones de capacidades e invocaciones. Los plugins DLL de Macro Deck 2 tampoco se cargan dentro de Electron.

Fuentes oficiales:

- https://docs.macro-deck.app/reference/manifest/
- https://docs.macro-deck.app/reference/protocol/
- https://github.com/Macro-Deck-App/Macro-Deck
- https://github.com/Macro-Deck-App/Macro-Deck-Store-Registry

## Seguridad y permisos

- Instalación y primera ejecución tienen confirmaciones separadas.
- Revocar la autorización detiene el proceso del plugin.
- Los runtimes WebSocket escuchan únicamente en `127.0.0.1` y usan un puerto efímero.
- Los plugins se ejecutan fuera del proceso principal de NEXORA.
- No se ejecuta ningún plugin al iniciar Windows.
- La desinstalación requiere confirmación y solo elimina el directorio registrado del plugin.
- Los paquetes externos sin licencia o integridad confiable lo muestran expresamente.

Esta etapa no constituye un sandbox de sistema operativo. Un plugin autorizado se ejecuta con la cuenta del usuario y puede hacer lo que permita Windows. Por ello la UI muestra permisos inferidos y procedencia antes de habilitarlo.

## Pruebas reproducibles

Stream Deck:

```powershell
node .\tests\plugin-poc.cjs <ruta-al-paquete-oficial.streamDeckPlugin>
```

Resultado observado: instalación, registro WebSocket y recepción de `setTitle` tras ejecutar `com.elgato.hello-world.newstring`.

Macro Deck:

```powershell
node .\tests\macrodeck-inspection-poc.cjs <ruta-a-system-media.macroDeckPlugin>
```

Resultado observado: SHA-256 oficial validado, manifiesto 1.2.0 leído, cinco permisos mostrados y ejecución bloqueada como `inspection-only`.
