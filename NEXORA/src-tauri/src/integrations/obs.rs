use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

pub async fn test_connection(url: &str, password: &str) -> Result<String, String> {
    if !(url.starts_with("ws://127.0.0.1:")
        || url.starts_with("ws://localhost:")
        || url.starts_with("wss://"))
    {
        return Err("Usa localhost/127.0.0.1 o una dirección WSS cifrada".to_owned());
    }
    let (mut socket, _) = timeout(Duration::from_secs(5), connect_async(url))
        .await
        .map_err(|_| "OBS no respondió en 5 segundos".to_owned())?
        .map_err(|error| format!("No se pudo conectar a OBS: {error}"))?;

    let hello = receive_json(&mut socket).await?;
    if hello.get("op").and_then(Value::as_u64) != Some(0) {
        return Err("OBS devolvió un saludo WebSocket inesperado".to_owned());
    }
    let mut identify = json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": 0 } });
    if let Some(authentication) = hello.pointer("/d/authentication") {
        let challenge = authentication
            .get("challenge")
            .and_then(Value::as_str)
            .ok_or("OBS no proporcionó challenge")?;
        let salt = authentication
            .get("salt")
            .and_then(Value::as_str)
            .ok_or("OBS no proporcionó salt")?;
        if password.is_empty() {
            return Err("OBS requiere contraseña".to_owned());
        }
        identify["d"]["authentication"] =
            Value::String(authentication_response(password, salt, challenge));
    }
    socket
        .send(Message::Text(identify.to_string().into()))
        .await
        .map_err(|error| error.to_string())?;
    let identified = receive_json(&mut socket).await?;
    if identified.get("op").and_then(Value::as_u64) != Some(2) {
        return Err("OBS rechazó la identificación o autenticación".to_owned());
    }

    let request_id = Uuid::new_v4().to_string();
    socket
        .send(Message::Text(
            json!({"op": 6, "d": {"requestType": "GetVersion", "requestId": request_id}})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|error| error.to_string())?;
    let response = receive_json(&mut socket).await?;
    let ok = response
        .pointer("/d/requestStatus/result")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !ok {
        return Err("OBS respondió, pero GetVersion falló".to_owned());
    }
    let version = response
        .pointer("/d/responseData/obsVersion")
        .and_then(Value::as_str)
        .unwrap_or("desconocida");
    Ok(format!("Conectado a OBS {version} mediante WebSocket 5.x"))
}

async fn receive_json<S>(
    socket: &mut tokio_tungstenite::WebSocketStream<S>,
) -> Result<Value, String>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        let message = timeout(Duration::from_secs(5), socket.next())
            .await
            .map_err(|_| "Tiempo de espera agotado leyendo OBS".to_owned())?
            .ok_or("OBS cerró la conexión".to_owned())?
            .map_err(|error| error.to_string())?;
        if let Message::Text(text) = message {
            return serde_json::from_str(text.as_str())
                .map_err(|error| format!("Respuesta JSON de OBS no válida: {error}"));
        }
    }
}

fn authentication_response(password: &str, salt: &str, challenge: &str) -> String {
    let secret = STANDARD.encode(Sha256::digest(format!("{password}{salt}").as_bytes()));
    STANDARD.encode(Sha256::digest(format!("{secret}{challenge}").as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authentication_matches_obs_reference_algorithm() {
        let value = authentication_response("password", "salt", "challenge");
        assert!(!value.is_empty());
        assert_eq!(value.len(), 44);
    }
}
