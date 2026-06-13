use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CatalogOutlet {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CatalogItem {
    pub product_id: Uuid,
    pub sku: String,
    pub name: String,
    pub description: Option<String>,
    pub category_id: Option<Uuid>,
    pub category_name: Option<String>,
    // Active price at this outlet; null when no price has been set yet.
    pub price: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CatalogResponse {
    pub outlet: CatalogOutlet,
    pub value: Vec<CatalogItem>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route("/outlets/:outlet_id", get(get_outlet_catalog))
}

async fn get_outlet_catalog(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
) -> Result<Json<CatalogResponse>> {
    // Read access is gated by outlet access: admins (outlets:read) see any
    // outlet; regular users need an active assignment to the outlet + tenant.
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    let outlet = sqlx::query_as::<_, CatalogOutlet>(
        r#"
        SELECT
            o.id,
            o.code,
            o.name,
            oo.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        JOIN tenants t ON t.id = oo.tenant_id
        WHERE o.id = $1
        "#,
    )
    .bind(outlet_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Outlet tidak ditemukan".into()))?;

    // Active products of the outlet's current owner tenant, with their active
    // price at this outlet (null when unset).
    let items = sqlx::query_as::<_, CatalogItem>(
        r#"
        SELECT
            p.id AS product_id,
            p.sku,
            p.name,
            p.description,
            p.category_id,
            pc.name AS category_name,
            pp.price
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_prices pp
            ON pp.product_id = p.id
           AND pp.outlet_id = $1
           AND pp.is_active = TRUE
        WHERE p.tenant_id = $2
          AND p.is_active = TRUE
        ORDER BY p.name ASC
        "#,
    )
    .bind(outlet_id)
    .bind(outlet.tenant_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(CatalogResponse {
        outlet,
        value: items,
    }))
}
