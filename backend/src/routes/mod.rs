pub mod health;
pub mod auth;
pub mod admin;
pub mod users;
pub mod roles;
pub mod permissions;
pub mod tenants;
pub mod outlets;
pub mod product_categories;
pub mod products;
pub mod product_prices;
pub mod catalog;
pub mod stocks;
pub mod pos;
pub mod transactions;

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
        // stock routes are outlet-scoped and merged into the outlets nest
        .nest("/outlets", outlets::router().merge(stocks::router()))
        .nest("/product-categories", product_categories::router())
        .nest("/products", products::router())
        .nest("/product-prices", product_prices::router())
        .nest("/catalog", catalog::router())
        .nest("/pos", pos::router())
        .nest("/transactions", transactions::router())
}
