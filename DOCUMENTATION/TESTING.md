# Pruebas

## Automatizadas

- Rust: creación/recuperación de almacenamiento, dimensiones de protocolo, validación de perfiles y algoritmo de autenticación OBS.
- Frontend: se añadirán tests de editor, navegación y estados antes del primer beta.
- Frontend actual: 2 tests unitarios aprobados; build Vite de producción aprobado.
- Rust actual: 8 tests aprobados y Clippy sin advertencias de código.
- Smoke test: la aplicación release inició, reprodujo la intro completa, mostró Dashboard/editor y persistió una edición con copia `.bak`.

## Matriz física

| Prueba | Estado |
|---|---|
| Enumeración USB | Pendiente; el dispositivo no apareció en el inventario actual |
| Identificación VID/PID | Implementada, no ejecutada con hardware |
| Redetección manual | Implementada en Configuración; esperando resultado del usuario |
| Abrir interfaz HID de control | Implementado con ventana limitada; prueba física pendiente |
| Una tecla estática | Pendiente |
| Doce teclas | Pendiente |
| Pulsaciones | Decodificador y UI implementados; prueba física pendiente |
| GIF | Pendiente |
| Biblioteca visual | Importación/deduplicación/lectura automatizada aprobada; selección manual pendiente |
| Initial Screen/salvapantallas | Configuración y previsualización implementadas; envío físico pendiente |
| Reconexión | Pendiente |
| Perfiles/carpetas | Pendiente |
| Pantalla IPS | Pendiente |
| OBS real | Pendiente |
| Instalador NSIS | Generado; instalación/desinstalación limpia pendiente |
| Actualización firmada | Pendiente de repositorio y claves |
| Plugin Stream Deck oficial | Hello World MIT: instalación, registro WebSocket, `keyDown` y respuesta `setTitle` aprobados sin Stream Deck |
| Plugin Macro Deck oficial | System Media MIT 1.2.0: SHA-256, instalación, manifiesto y 5 permisos aprobados; runtime pendiente |

Ninguna fila pendiente debe describirse como superada en README, changelog o UI.

El proyecto Electron aportado por el usuario sí fue validado por él cambiando botones, imágenes e Initial Screen. Su servicio USB se integró sin reescribir el protocolo. El instalador integrado todavía requiere una prueba física corta del usuario para confirmar que el empaquetado conserva ese comportamiento.

