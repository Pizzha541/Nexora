# Actualizador

NEXORA usará el plugin oficial de Tauri 2 con GitHub Releases y un `latest.json` estático.

## Seguridad

- El bundle local mantiene `createUpdaterArtifacts: false` hasta que exista una clave pública real; no se usa una clave ficticia para hacer pasar la compilación.
- Tauri exige firmas; esa verificación no se deshabilitará.
- Solo la clave pública pertenece a la configuración de la aplicación.
- `TAURI_SIGNING_PRIVATE_KEY` y su contraseña existirán únicamente en el entorno seguro de publicación.
- Antes de salir en Windows, el núcleo debe vaciar escrituras y crear copia de configuración.

## Pendiente de configuración

Faltan propietario, repositorio definitivo y clave pública. Al configurarlos se añadirá el plugin oficial, se cambiará `createUpdaterArtifacts` a `true` y se generarán las firmas. Hasta entonces la UI mostrará el actualizador como no configurado y no descargará nada.

Referencia: https://v2.tauri.app/plugin/updater/

