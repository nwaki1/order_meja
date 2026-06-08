pub mod health;
pub mod auth;
pub mod admin;
pub mod users;

use axum::Router;
use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/admin", admin::router())
        .nest("/users", users::router())
}
