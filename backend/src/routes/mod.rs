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
pub mod workers;
pub mod shift_templates;
pub mod shifts;
pub mod shift_targets;
pub mod payroll;
pub mod reports;
pub mod files;

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
        // outlet-scoped routes (stocks, worker assignment, shift templates,
        // open-shifts) are merged into the outlets nest.
        .nest(
            "/outlets",
            outlets::router()
                .merge(stocks::router())
                .merge(workers::outlet_router())
                .merge(shift_templates::outlet_router())
                .merge(shifts::outlet_router()),
        )
        .nest("/product-categories", product_categories::router())
        .nest("/products", products::router())
        .nest("/product-prices", product_prices::router())
        .nest("/catalog", catalog::router())
        .nest("/pos", pos::router())
        .nest("/transactions", transactions::router())
        .nest(
            "/workers",
            workers::router()
                .merge(shift_targets::worker_router())
                .merge(payroll::worker_router()),
        )
        .nest("/shift-templates", shift_templates::router())
        .nest("/shifts", shifts::router().merge(shift_targets::shift_router()))
        .nest("/shift-targets", shift_targets::router())
        .nest("/payroll-periods", payroll::router())
        .nest("/payrolls", payroll::payroll_router())
        .nest("/reports", reports::router())
        .nest("/files", files::router())
}
