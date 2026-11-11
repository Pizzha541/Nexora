# Changelog

## Motor en tiempo real y Drag & Drop

- Estado central con persistencia automática debounced y escritura atómica.
- Cola USB serial, agrupación por tecla, página deseada y resincronización tras reconectar.
- Drag & Drop real de acciones, recursos internos, archivos de Windows, teclas, carpetas y perfiles.
- Actualización visual en vivo para `setTitle`, `setImage` y `setState`.
- Primer host de Property Inspector Stream Deck con settings por contexto.
- Ocho pruebas automatizadas y validación de archivos externos.

## 0.1.0-alpha - 2026-11-08

- Estructura Tauri 2 + React + TypeScript.
- Identidad visual NEXORA e intro MP4 offline.
- Dashboard y editor inicial de 12 teclas.
- Perfiles persistentes con copia de seguridad.
- Simulador explícito y detección HID VID/PID.
- Prueba autenticada de OBS WebSocket 5.x.
- Configuración de empaquetado NSIS; artefactos de updater desactivados hasta disponer de una clave pública real.
- Documentación inicial de Base Camp y protocolo.
- Primer instalador NSIS generado y smoke test de la aplicación release aprobado.
- Redetección manual y escucha HID de pulsaciones durante 15 segundos, sin escrituras al dispositivo.
- Duplicación y eliminación recuperable de perfiles; el último perfil queda protegido.
- Editor persistente de macros con pasos, pausas y repeticiones limitadas; eliminación archivada.
- Carpetas y subcarpetas persistentes con 12 teclas por nivel, navegación visual y profundidad máxima de ocho niveles.
- Arranque endurecido: instancia única, recuperación temporal de almacenamiento, captura de `panic`, logs acotados y límite de tiempo en la intro.
- La detección HID dejó de ejecutarse durante el arranque; ahora solo ocurre al pulsar «Volver a detectar».
- Biblioteca persistente y deduplicada para PNG, JPG, WEBP y GIF de hasta 12 MB, con asignación a botones y previsualización animada.
- Initial Screen panorámica 6×2 y salvapantallas opcional, con banner NEXORA incluido y configuración persistente.
- Sección de plugins con enlaces oficiales y separación explícita entre plugins nativos, adaptadores y paquetes dependientes de Stream Deck/Macro Deck.
- Backend Electron/Node integrado desde el proyecto físicamente validado por el usuario, con `mountain-displaypad` 1.1.1 y proceso USB aislado.
- Envío explícito de una tecla, página completa, GIF animado e Initial Screen panorámica al hardware.
- `sharp` actualizado a 0.35.5 tras auditoría; dependencias de producción sin vulnerabilidades conocidas.
- Instalador Electron autónomo con `node-hid` y Sharp nativos incluidos; no requiere una instalación externa de Node.js.
- Corregido el arranque empaquetado en Windows: Electron no admite `app.getPath("localAppData")`; ahora se deriva la ruta local desde `appData`. Smoke test del ejecutable empaquetado aprobado.
- Corregida la ventana vacía de Electron: Vite ahora genera rutas relativas para JavaScript, CSS, vídeo e imágenes bajo `file://`.
- Añadidos fallback visible de carga, confirmación IPC del renderer y diagnóstico de fallos/preload/timeout en `electron.log`.
- Eliminados source maps del build distribuido y reducido el instalador sin afectar las herramientas de desarrollo.
- Añadida caché de recursos visuales para evitar releer y recodificar imágenes durante los renderizados de React.
- Reducidas las escrituras de configuración al inicio y serializada la cola de GIF para evitar transferencias USB simultáneas.
- Añadido Plugin Hub real con búsqueda, filtros, catálogo gratuito verificado, importación de paquetes, instalación, actualización y desinstalación.
- Añadida extracción segura de `.streamDeckPlugin` y `.macroDeckPlugin`, registro SHA-256, licencia, procedencia, permisos y autorización separada de ejecución.
- Implementado un runtime WebSocket experimental de Stream Deck para plugins JavaScript, con acciones arrastrables y configuración individual por botón.
- Comprobada la acción Counter del paquete oficial MIT Hello World sin instalar Stream Deck, también con el runtime Node incluido en Electron.
- Comprobada la instalación e inspección del plugin oficial MIT System Media de Macro Deck; ejecución bloqueada hasta completar su protocolo HTTP/WebSocket.
- Electron actualizado a 45.3.0 para corregir los avisos de seguridad altos detectados; runtime de plugins, módulos HID, renderer e instalador revalidados.
- El feedback `setTitle` y `setImage` de plugins se muestra en NEXORA y se puede enviar a la tecla física correspondiente cuando el DisplayPad está conectado.
- Añadida cuadrícula 6 × 2 dentro de Plugin Hub para arrastrar acciones directamente a cualquiera de las doce teclas.

