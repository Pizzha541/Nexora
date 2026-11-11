# Protocolo Mountain DisplayPad

## Evidencia confirmada por fuentes

| Dato | Valor | Nivel |
|---|---:|---|
| USB vendor ID | `0x3282` | Biblioteca abierta aportada |
| USB product ID | `0x0009` | Biblioteca abierta aportada |
| Disposición | 6×2, 12 teclas | Biblioteca y fabricante |
| Resolución anunciada de tecla | 104×104 px | Fabricante |
| Área cruda usada por biblioteca | 102×102×3 bytes | Código abierto, no validado físicamente |
| Interfaz HID de imagen | 1 | Código abierto |
| Interfaz HID de control | 3 | Código abierto |
| Pantalla IPS | 4.5", 800×240 | Fabricante |
| USB | 2.0, Type-C | Fabricante |

## Secuencia observada en `mountain-displaypad` 1.1.1

1. Enumerar VID `0x3282` / PID `0x0009`.
2. Abrir interfaz 1 para píxeles e interfaz 3 para control/eventos.
3. Enviar un mensaje de inicialización cuyo primer byte es `0x00` y segundo `0x11`.
4. Para una tecla, solicitar transferencia con mensaje `0x21` y número de tecla en byte 5.
5. Tras el eco `0x21 0x00 0x00`, enviar cabecera de 306 bytes y píxeles BGR en fragmentos.
6. `0x21 0x00 0xff` indica finalización según esa implementación.
7. Los eventos con primer byte `0x01` contienen bits de pulsación en offsets 42 y 47.

NEXORA ya puede enumerar el dispositivo y abrir durante un máximo de 30 segundos la interfaz HID 3 para leer reportes `0x01`. La UI expone una prueba de 15 segundos con tecla, flanco, tiempo y bytes crudos 42/47. Esta prueba no llama a `write`. La secuencia de escritura de imágenes continúa bloqueada para evitar ensayos destructivos o inestables.

## Discrepancias y preguntas abiertas

- 104×104 anunciado frente a 102×102 transferido. Es posible que exista un borde no direccionable, pero no se afirmará sin prueba.
- La biblioteca emite teclas 1–12 mientras la API de imágenes usa 0–11; se normalizará tras capturar pulsaciones reales.
- GIF parece requerir animación host-side por cuadros; no hay evidencia de decodificación GIF en firmware.
- No existe evidencia de que las 12 teclas y la pantalla IPS compartan protocolo. Se mantienen como dispositivos lógicos distintos.
- No hay protocolo IPS verificado.

## Plan de prueba física seguro

1. Cerrar Base Camp/worker para evitar acceso HID concurrente, sin desinstalarlo.
2. Enumerar solamente y registrar interfaces.
3. Abrir/cerrar handles sin escribir.
4. Escuchar pulsaciones durante 30 segundos.
5. Enviar negro a una sola tecla y restaurar un color simple.
6. Probar 12 teclas estáticas antes de cualquier animación.
7. Medir cadencia y errores antes de GIF.
8. Reconectar cable y recuperar estado.
9. Investigar IPS únicamente con tráfico observado y reversible.

## Referencias

- https://github.com/JeLuF/mountain-displaypad
- https://mountain.gg/keypads/displaypad/
- https://mountain.gg/support/keypads

