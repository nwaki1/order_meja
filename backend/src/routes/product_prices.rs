use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProductPriceResponse {
    pub id: Uuid,
    pub product_id: Uuid,
    pub product_sku: String,
    pub product_name: String,
    pub outlet_id: Uuid,
    pub outlet_code: String,
    pub outlet_name: String,
    pub price: i64,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<ProductPriceResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$orderby")]
    pub orderby: Option<String>,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub product_id: Option<Uuid>,
    pub outlet_id: Option<Uuid>,
    pub is_active: Option<bool>,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProductPriceRequest {
    pub product_id: Uuid,
    pub outlet_id: Uuid,
    pub price: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateProductPriceRequest {
    pub price: Option<i64>,
    pub is_active: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_product_prices).post(create_product_price))
        .route(
            "/:id",
            get(get_product_price)
                .put(update_product_price)
                .delete(deactivate_product_price),
        )
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("pp.created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "price" => "pp.price",
        "is_active" => "pp.is_active",
        "updated_at" => "pp.updated_at",
        _ => "pp.created_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

fn validate_price(price: i64) -> Result<()> {
    if price < 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "price",
            "Harga tidak boleh negatif",
        ));
    }
    Ok(())
}

fn map_price_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_product_prices_product_outlet_unique") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "outlet_id",
                "Harga produk untuk outlet ini sudah ada",
            );
        }
        if db_err.constraint() == Some("product_prices_price_non_negative") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "price",
                "Harga tidak boleh negatif",
            );
        }
    }
    AppError::Database(e)
}

// The product's tenant must currently own the outlet, and both must be active.
// This enforces tenant isolation across the product+outlet pairing.
async fn ensure_product_outlet_same_tenant(
    db: &sqlx::PgPool,
    product_id: Uuid,
    outlet_id: Uuid,
) -> Result<()> {
    let product_tenant = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT tenant_id FROM products
        WHERE id = $1 AND is_active = TRUE
        "#,
    )
    .bind(product_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "product_id",
            "Produk tidak ditemukan atau tidak aktif",
        )
    })?;

    let outlet_tenant = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT oo.tenant_id
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        WHERE o.id = $1 AND o.is_active = TRUE
        "#,
    )
    .bind(outlet_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "outlet_id",
            "Outlet tidak ditemukan, tidak aktif, atau tanpa ownership aktif",
        )
    })?;

    if product_tenant == outlet_tenant {
        Ok(())
    } else {
        Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "outlet_id",
            "Outlet bukan milik tenant produk ini",
        ))
    }
}

// Non-admin access: price active, product active, owning tenant active, and the
// user has an active assignment to the product's tenant.
async fn require_price_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    price_id: Uuid,
) -> Result<()> {
    if user.permissions.contains("product_prices:read") {
        return Ok(());
    }

    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM product_prices pp
            JOIN products p ON p.id = pp.product_id
            JOIN tenants t ON t.id = p.tenant_id
            JOIN user_tenants ut ON ut.tenant_id = p.tenant_id
            WHERE pp.id = $1
              AND pp.is_active = TRUE
              AND p.is_active = TRUE
              AND t.is_active = TRUE
              AND ut.user_id = $2
              AND ut.is_active = TRUE
        )
        "#,
    )
    .bind(price_id)
    .bind(user.id)
    .fetch_one(db)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn fetch_price(db: &sqlx::PgPool, price_id: Uuid) -> Result<ProductPriceResponse> {
    sqlx::query_as::<_, ProductPriceResponse>(
        r#"
        SELECT
            pp.id,
            pp.product_id,
            p.sku  AS product_sku,
            p.name AS product_name,
            pp.outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            pp.price,
            pp.is_active,
            pp.created_at,
            pp.updated_at
        FROM product_prices pp
        JOIN products p ON p.id = pp.product_id
        JOIN outlets o ON o.id = pp.outlet_id
        WHERE pp.id = $1
        "#,
    )
    .bind(price_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Harga produk tidak ditemukan".into()))
}

async fn list_product_prices(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let can_read_all = user.permissions.contains("product_prices:read");

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            r#"
            SELECT COUNT(*)
            FROM product_prices pp
            JOIN products p ON p.id = pp.product_id
            JOIN tenants t ON t.id = p.tenant_id
            JOIN outlets o ON o.id = pp.outlet_id
            "#,
        );
        if !can_read_all {
            cq.push(" JOIN user_tenants ut ON ut.tenant_id = p.tenant_id");
        }
        cq.push(" WHERE TRUE");
        if !can_read_all {
            cq.push(" AND pp.is_active = TRUE")
                .push(" AND p.is_active = TRUE")
                .push(" AND t.is_active = TRUE")
                .push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE");
        }
        if let Some(pid) = params.product_id {
            cq.push(" AND pp.product_id = ").push_bind(pid);
        }
        if let Some(oid) = params.outlet_id {
            cq.push(" AND pp.outlet_id = ").push_bind(oid);
        }
        if can_read_all {
            if let Some(is_active) = params.is_active {
                cq.push(" AND pp.is_active = ").push_bind(is_active);
            }
        }
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            pp.id,
            pp.product_id,
            p.sku  AS product_sku,
            p.name AS product_name,
            pp.outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            pp.price,
            pp.is_active,
            pp.created_at,
            pp.updated_at
        FROM product_prices pp
        JOIN products p ON p.id = pp.product_id
        JOIN tenants t ON t.id = p.tenant_id
        JOIN outlets o ON o.id = pp.outlet_id
        "#,
    );
    if !can_read_all {
        dq.push(" JOIN user_tenants ut ON ut.tenant_id = p.tenant_id");
    }
    dq.push(" WHERE TRUE");
    if !can_read_all {
        dq.push(" AND pp.is_active = TRUE")
            .push(" AND p.is_active = TRUE")
            .push(" AND t.is_active = TRUE")
            .push(" AND ut.user_id = ")
            .push_bind(user.id)
            .push(" AND ut.is_active = TRUE");
    }
    if let Some(pid) = params.product_id {
        dq.push(" AND pp.product_id = ").push_bind(pid);
    }
    if let Some(oid) = params.outlet_id {
        dq.push(" AND pp.outlet_id = ").push_bind(oid);
    }
    if can_read_all {
        if let Some(is_active) = params.is_active {
            dq.push(" AND pp.is_active = ").push_bind(is_active);
        }
    }
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let prices = dq
        .build_query_as::<ProductPriceResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: prices,
    }))
}

async fn create_product_price(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateProductPriceRequest>,
) -> Result<(StatusCode, Json<ProductPriceResponse>)> {
    auth::require_permission(&user, "product_prices:create")?;
    validate_price(body.price)?;
    ensure_product_outlet_same_tenant(&state.db, body.product_id, body.outlet_id).await?;

    let price_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO product_prices (product_id, outlet_id, price)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(body.product_id)
    .bind(body.outlet_id)
    .bind(body.price)
    .fetch_one(&state.db)
    .await
    .map_err(map_price_db_error)?;

    let price = fetch_price(&state.db, price_id).await?;
    Ok((StatusCode::CREATED, Json(price)))
}

async fn get_product_price(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProductPriceResponse>> {
    require_price_access(&state.db, &user, id).await?;
    Ok(Json(fetch_price(&state.db, id).await?))
}

async fn update_product_price(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProductPriceRequest>,
) -> Result<Json<ProductPriceResponse>> {
    auth::require_permission(&user, "product_prices:update")?;

    if let Some(price) = body.price {
        validate_price(price)?;
    }

    let result = sqlx::query(
        r#"
        UPDATE product_prices SET
            price      = COALESCE($2, price),
            is_active  = COALESCE($3, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.price)
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_price_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Harga produk tidak ditemukan".into()));
    }

    Ok(Json(fetch_price(&state.db, id).await?))
}

async fn deactivate_product_price(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "product_prices:delete")?;

    let result = sqlx::query(
        r#"
        UPDATE product_prices
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Harga produk tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
