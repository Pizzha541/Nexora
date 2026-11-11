# Requisitos

## Objetivo

Crear una alternativa independiente a Mountain Base Camp para Windows 10/11 con instalación NSIS, consumo contenido y funcionamiento offline-first.

## Requisitos funcionales trazables

| Área | Requisito | Estado | Evidencia prevista |
|---|---|---|---|
| Inicio | Reproducir la intro MP4 una vez y esperar inicialización | Implementado, sin prueba Tauri | Prueba visual en build |
| Dispositivo | Detectar VID/PID e interfaces HID | Implementado, sin hardware detectado | Log + prueba física |
| Teclas | Leer pulsaciones y escribir 12 imágenes | Investigación parcial | Prueba física incremental |
| IPS | Control separado de las teclas | Pendiente de protocolo | Captura USB/documentación fiable |
| Perfiles | Crear, guardar, activar e importar/exportar | Crear/guardar/activar implementado | Tests Rust + UI |
| Carpetas | Árbol navegable y subcarpetas | Implementado con 12 teclas por nivel y profundidad máxima 8 | Test Rust + prueba UI |
| Macros | Editor con límites y ejecución segura | Editor/persistencia/validación implementados; ejecución pendiente | Tests Rust + prueba UI |
| OBS | WebSocket 5.x autenticado | Prueba de conexión implementada | OBS real en puerto 4455 |
| VOXORA | Integración sin inventar API | Bloqueada por interfaz no aportada | Contrato de VOXORA |
| Discord | Funciones oficiales/autorizadas | Investigación pendiente | Matriz de API y permisos |
| Actualización | GitHub Releases firmado | Arquitectura/documentación | Release firmada de prueba |
| Instalador | NSIS `.exe` compartible | Configurado, no compilado todavía | Instalación/desinstalación en Windows limpio |

## Requisitos no funcionales

- Ninguna dependencia de Base Camp en ejecución.
- Persistencia separada del instalador, copia previa y migraciones versionadas.
- Sin secretos o claves privadas en el repositorio.
- Simulación siempre identificada como simulación.
- Escrituras HID y acciones sensibles protegidas por validaciones.
- Nada se declara probado sin evidencia reproducible.

