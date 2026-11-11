# Auditoría de los paquetes Stream Deck proporcionados

Fecha: 11 de noviembre de 2026.

| Paquete | SHA-256 |
|---|---|
| Twitch 1.11.6.15 | `01E0ADBFED0BC13BC18934D211DB92CDC130045778A5E7FA77DE4831D5D2987F` |
| Discord 2.4.0.123 | `9D063E9B3616693093E565F762CDC65BD5638BDBB9F42E535E1C738B429302CD` |
| OBS Studio 3.0.3.31 | `A42DE2895AF5DFB7CB666D7821317219D207717C78CF1467C695E276625D4FBB` |
| Camo Studio 1.2.10 | `C8B1854464D6446C6C036C5A88F8E7DB1ECC9C247EEF821CF3C7C25E40D7CE97` |
| Spotify 2.5.0.86 | `F641798B626405821C278DEA29482FFBB65166F656172BD44593297F95A7266C` |

## Resultado técnico

Los cinco archivos son contenedores ZIP válidos, pero sus manifiestos y ejecutables están protegidos con el formato DRM de Marketplace y empiezan con la cabecera binaria `ELGATO`. La copia instalada por la aplicación oficial conserva la misma protección. El runtime de NEXORA no puede leer el manifiesto ni ejecutar el código sin el descifrado autorizado del host oficial.

El importador de NEXORA ahora detecta expresamente esta cabecera y muestra un mensaje claro, en vez de reportar un JSON corrupto o instalar un plugin inservible.

No se copiaron estos binarios propietarios al repositorio público ni se intentó romper su protección. Según la documentación de Elgato, el DRM existe precisamente para impedir que proveedores no autorizados ejecuten el plugin.

## Alternativas funcionales

- OBS Studio: NEXORA ya incluye integración nativa mediante OBS WebSocket, escenas y controles de grabación/transmisión.
- Spotify: los controles multimedia globales ya funcionan; una integración de cuenta completa necesitaría OAuth y una aplicación registrada.
- Twitch, Discord y Camo Studio: necesitan una API pública/autorización propia o plugins distribuidos sin DRM por sus autores.
- Paquetes Stream Deck sin DRM: continúan siendo importables por NEXORA cuando su manifiesto y runtime JavaScript son compatibles.

Referencias oficiales:

- https://docs.elgato.com/streamdeck/sdk/introduction/distribution/
- https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment/
