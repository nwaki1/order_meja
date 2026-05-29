pub mod health;
pub mod auth;
pub mod admin;

use axum::Router;
use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/admin", admin::router())
    // tambahkan route domain di sini, contoh:
    // .nest("/users", users::router())
}
