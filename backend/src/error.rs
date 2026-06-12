use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Validation error: {message}")]
    Validation {
        message: String,
        fields: BTreeMap<String, String>,
    },

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, AppError>;

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Validation { message, .. } => {
                (StatusCode::UNPROCESSABLE_ENTITY, message.clone())
            }
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "Forbidden".to_string()),
            AppError::Internal(e) => {
                tracing::error!("Internal error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let mut payload = serde_json::Map::from_iter([
            ("error".to_string(), Value::String(message.clone())),
            ("message".to_string(), Value::String(message)),
        ]);

        if let AppError::Validation { fields, .. } = &self {
            payload.insert("fields".to_string(), json!(fields));
        }

        (status, Json(Value::Object(payload))).into_response()
    }
}

impl AppError {
    pub fn validation(message: impl Into<String>, field: &str, error: impl Into<String>) -> Self {
        let mut fields = BTreeMap::new();
        fields.insert(field.to_string(), error.into());
        Self::Validation {
            message: message.into(),
            fields,
        }
    }
}
