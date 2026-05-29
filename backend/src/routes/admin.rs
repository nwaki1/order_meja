use crate::{auth, AppState, Result};
use axum::{routing::get, Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminPingResponse {
    pub status: &'static str,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route("/ping", get(ping))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/ping",
    responses((status = 200, description = "Admin ping", body = AdminPingResponse)),
    security(("bearer_auth" = [])),
    tag = "Admin"
)]
pub async fn ping(user: auth::AuthUser) -> Result<Json<AdminPingResponse>> {
    auth::require_permission(&user, "admin:ping")?;
    Ok(Json(AdminPingResponse { status: "ok" }))
}
