pub mod health;
pub mod auth;
pub mod admin;
pub mod users;
pub mod roles;
pub mod permissions;
pub mod tenants;

use axum::Router;
use crate::AppState;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/admin", admin::router())
        .nest("/users", users::router())
        .nest("/roles", roles::router())
        .nest("/permissions", permissions::router())
        .nest("/tenants", tenants::router())
}
