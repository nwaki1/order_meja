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
pub struct ProductResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
    pub category_id: Option<Uuid>,
    pub category_name: Option<String>,
    pub sku: String,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub unit: String,
    pub is_stock_tracked: bool,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<ProductResponse>,
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
    pub tenant_id: Option<Uuid>,
    pub category_id: Option<Uuid>,
    pub search: Option<String>,
    pub is_active: Option<bool>,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProductRequest {
    pub tenant_id: Uuid,
    pub category_id: Option<Uuid>,
    pub sku: String,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub unit: Option<String>,
    pub is_stock_tracked: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateProductRequest {
    pub category_id: Option<Uuid>,
    pub sku: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub unit: Option<String>,
    pub is_stock_tracked: Option<bool>,
    pub is_active: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_products).post(create_product))
        .route(
            "/:id",
            get(get_product)
                .put(update_product)
                .delete(deactivate_product),
        )
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("p.created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "sku" => "p.sku",
        "name" => "p.name",
        "is_active" => "p.is_active",
        "updated_at" => "p.updated_at",
        _ => "p.created_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

fn validate_required_text<'a>(value: &'a str, field: &str, message: &str) -> Result<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            field,
            message,
        ));
    }
    Ok(value)
}

fn validate_product_sku(sku: &str) -> Result<&str> {
    validate_required_text(sku, "sku", "SKU produk wajib diisi")
}

fn validate_product_name(name: &str) -> Result<&str> {
    validate_required_text(name, "name", "Nama produk wajib diisi")
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

fn map_product_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_products_tenant_sku_unique")
            || db_err.code().as_deref() == Some("23505")
        {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "sku",
                "SKU produk sudah ada pada tenant ini",
            );
        }
    }
    AppError::Database(e)
}

async fn ensure_active_tenant(db: &sqlx::PgPool, tenant_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM tenants
            WHERE id = $1 AND is_active = TRUE
        )
        "#,
    )
    .bind(tenant_id)
    .fetch_one(db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound(
            "Tenant tidak ditemukan atau tidak aktif".into(),
        ))
    }
}

// Category (when provided) must belong to the product's tenant and be active.
async fn ensure_category_in_tenant(
    db: &sqlx::PgPool,
    category_id: Uuid,
    tenant_id: Uuid,
) -> Result<()> {
    let ok = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM product_categories
            WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
        )
        "#,
    )
    .bind(category_id)
    .bind(tenant_id)
    .fetch_one(db)
    .await?;

    if ok {
        Ok(())
    } else {
        Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "category_id",
            "Kategori tidak ditemukan, tidak aktif, atau bukan milik tenant ini",
        ))
    }
}

// Non-admin access: product active, tenant active, user has active tenant assignment.
async fn require_product_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    product_id: Uuid,
) -> Result<()> {
    if user.permissions.contains("products:read") {
        return Ok(());
    }

    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM products p
            JOIN tenants t ON t.id = p.tenant_id
            JOIN user_tenants ut ON ut.tenant_id = p.tenant_id
            WHERE p.id = $1
              AND p.is_active = TRUE
              AND t.is_active = TRUE
              AND ut.user_id = $2
              AND ut.is_active = TRUE
        )
        "#,
    )
    .bind(product_id)
    .bind(user.id)
    .fetch_one(db)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn fetch_product(db: &sqlx::PgPool, product_id: Uuid) -> Result<ProductResponse> {
    sqlx::query_as::<_, ProductResponse>(
        r#"
        SELECT
            p.id,
            p.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name,
            p.category_id,
            pc.name AS category_name,
            p.sku,
            p.name,
            p.description,
            p.image_url,
            p.unit,
            p.is_stock_tracked,
            p.is_active,
            p.created_at,
            p.updated_at
        FROM products p
        JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.id = $1
        "#,
    )
    .bind(product_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Produk tidak ditemukan".into()))
}

async fn product_tenant_id(db: &sqlx::PgPool, product_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT tenant_id FROM products WHERE id = $1")
        .bind(product_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Produk tidak ditemukan".into()))
}

async fn list_products(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let can_read_all = user.permissions.contains("products:read");

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            r#"
            SELECT COUNT(*)
            FROM products p
            JOIN tenants t ON t.id = p.tenant_id
            "#,
        );
        if !can_read_all {
            cq.push(" JOIN user_tenants ut ON ut.tenant_id = p.tenant_id");
        }
        cq.push(" WHERE TRUE");
        if !can_read_all {
            cq.push(" AND p.is_active = TRUE")
                .push(" AND t.is_active = TRUE")
                .push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE");
        }
        if let Some(tid) = params.tenant_id {
            cq.push(" AND p.tenant_id = ").push_bind(tid);
        }
        if let Some(cid) = params.category_id {
            cq.push(" AND p.category_id = ").push_bind(cid);
        }
        if let Some(ref search) = params.search {
            let like = format!("%{search}%");
            cq.push(" AND (p.name ILIKE ")
                .push_bind(like.clone())
                .push(" OR p.sku ILIKE ")
                .push_bind(like)
                .push(")");
        }
        if can_read_all {
            if let Some(is_active) = params.is_active {
                cq.push(" AND p.is_active = ").push_bind(is_active);
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
            p.id,
            p.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name,
            p.category_id,
            pc.name AS category_name,
            p.sku,
            p.name,
            p.description,
            p.image_url,
            p.unit,
            p.is_stock_tracked,
            p.is_active,
            p.created_at,
            p.updated_at
        FROM products p
        JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        "#,
    );
    if !can_read_all {
        dq.push(" JOIN user_tenants ut ON ut.tenant_id = p.tenant_id");
    }
    dq.push(" WHERE TRUE");
    if !can_read_all {
        dq.push(" AND p.is_active = TRUE")
            .push(" AND t.is_active = TRUE")
            .push(" AND ut.user_id = ")
            .push_bind(user.id)
            .push(" AND ut.is_active = TRUE");
    }
    if let Some(tid) = params.tenant_id {
        dq.push(" AND p.tenant_id = ").push_bind(tid);
    }
    if let Some(cid) = params.category_id {
        dq.push(" AND p.category_id = ").push_bind(cid);
    }
    if let Some(ref search) = params.search {
        let like = format!("%{search}%");
        dq.push(" AND (p.name ILIKE ")
            .push_bind(like.clone())
            .push(" OR p.sku ILIKE ")
            .push_bind(like)
            .push(")");
    }
    if can_read_all {
        if let Some(is_active) = params.is_active {
            dq.push(" AND p.is_active = ").push_bind(is_active);
        }
    }
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let products = dq
        .build_query_as::<ProductResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: products,
    }))
}

async fn create_product(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateProductRequest>,
) -> Result<(StatusCode, Json<ProductResponse>)> {
    auth::require_permission(&user, "products:create")?;
    ensure_active_tenant(&state.db, body.tenant_id).await?;

    let sku = validate_product_sku(&body.sku)?;
    let name = validate_product_name(&body.name)?;
    let description = normalize_optional_text(body.description.as_deref());
    let image_url = normalize_optional_text(body.image_url.as_deref());
    let unit = normalize_optional_text(body.unit.as_deref()).unwrap_or_else(|| "pcs".to_string());
    let is_stock_tracked = body.is_stock_tracked.unwrap_or(false);

    if let Some(category_id) = body.category_id {
        ensure_category_in_tenant(&state.db, category_id, body.tenant_id).await?;
    }

    let product_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO products (tenant_id, category_id, sku, name, description, image_url, unit, is_stock_tracked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        "#,
    )
    .bind(body.tenant_id)
    .bind(body.category_id)
    .bind(sku)
    .bind(name)
    .bind(description.as_deref())
    .bind(image_url.as_deref())
    .bind(&unit)
    .bind(is_stock_tracked)
    .fetch_one(&state.db)
    .await
    .map_err(map_product_db_error)?;

    let product = fetch_product(&state.db, product_id).await?;
    Ok((StatusCode::CREATED, Json(product)))
}

async fn get_product(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProductResponse>> {
    require_product_access(&state.db, &user, id).await?;
    Ok(Json(fetch_product(&state.db, id).await?))
}

async fn update_product(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProductRequest>,
) -> Result<Json<ProductResponse>> {
    auth::require_permission(&user, "products:update")?;

    let tenant_id = product_tenant_id(&state.db, id).await?;

    let sku = match &body.sku {
        Some(sku) => Some(validate_product_sku(sku)?),
        None => None,
    };
    let name = match &body.name {
        Some(name) => Some(validate_product_name(name)?),
        None => None,
    };
    let description = normalize_optional_text(body.description.as_deref());
    let image_url = normalize_optional_text(body.image_url.as_deref());
    let unit = normalize_optional_text(body.unit.as_deref());

    if let Some(category_id) = body.category_id {
        ensure_category_in_tenant(&state.db, category_id, tenant_id).await?;
    }

    let result = sqlx::query(
        r#"
        UPDATE products SET
            category_id      = COALESCE($2, category_id),
            sku              = COALESCE($3, sku),
            name             = COALESCE($4, name),
            description      = COALESCE($5, description),
            image_url        = COALESCE($6, image_url),
            unit             = COALESCE($7, unit),
            is_stock_tracked = COALESCE($8, is_stock_tracked),
            is_active        = COALESCE($9, is_active),
            updated_at       = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.category_id)
    .bind(sku)
    .bind(name)
    .bind(description.as_deref())
    .bind(image_url.as_deref())
    .bind(unit.as_deref())
    .bind(body.is_stock_tracked)
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_product_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Produk tidak ditemukan".into()));
    }

    Ok(Json(fetch_product(&state.db, id).await?))
}

async fn deactivate_product(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "products:delete")?;

    let result = sqlx::query(
        r#"
        UPDATE products
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Produk tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
