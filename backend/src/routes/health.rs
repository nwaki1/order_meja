use axum::{extract::State, Json};
use crate::AppState;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: &'static str,
    pub database: &'static str,
    pub version: &'static str,
}

#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Service health check", body = HealthResponse)),
    tag = "Health"
)]
pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_ok();

    let response = HealthResponse {
        status: if db_ok { "ok" } else { "degraded" },
        database: if db_ok { "connected" } else { "disconnected" },
        version: env!("CARGO_PKG_VERSION"),
    };

    Json(response)
}
