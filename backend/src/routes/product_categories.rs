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
pub struct ProductCategoryResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<ProductCategoryResponse>,
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
    pub search: Option<String>,
    pub is_active: Option<bool>,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProductCategoryRequest {
    pub tenant_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateProductCategoryRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_product_categories).post(create_product_category))
        .route(
            "/:id",
            get(get_product_category)
                .put(update_product_category)
                .delete(deactivate_product_category),
        )
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("pc.created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "name" => "pc.name",
        "is_active" => "pc.is_active",
        "updated_at" => "pc.updated_at",
        _ => "pc.created_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

fn validate_category_name(name: &str) -> Result<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "name",
            "Nama kategori wajib diisi",
        ));
    }
    Ok(trimmed)
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

fn map_category_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_product_categories_tenant_name_unique")
            || db_err.code().as_deref() == Some("23505")
        {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "name",
                "Nama kategori sudah ada pada tenant ini",
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

// Non-admin access check: category must be active, tenant must be active, user must have active assignment.
async fn require_category_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    category_id: Uuid,
) -> Result<()> {
    if user.permissions.contains("product_categories:read") {
        return Ok(());
    }

    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM product_categories pc
            JOIN tenants t ON t.id = pc.tenant_id
            JOIN user_tenants ut ON ut.tenant_id = pc.tenant_id
            WHERE pc.id = $1
              AND pc.is_active = TRUE
              AND t.is_active = TRUE
              AND ut.user_id = $2
              AND ut.is_active = TRUE
        )
        "#,
    )
    .bind(category_id)
    .bind(user.id)
    .fetch_one(db)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn fetch_category(db: &sqlx::PgPool, category_id: Uuid) -> Result<ProductCategoryResponse> {
    sqlx::query_as::<_, ProductCategoryResponse>(
        r#"
        SELECT
            pc.id,
            pc.tenant_id,
            t.code  AS tenant_code,
            t.name  AS tenant_name,
            pc.name,
            pc.description,
            pc.is_active,
            pc.created_at,
            pc.updated_at
        FROM product_categories pc
        JOIN tenants t ON t.id = pc.tenant_id
        WHERE pc.id = $1
        "#,
    )
    .bind(category_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Kategori produk tidak ditemukan".into()))
}

async fn list_product_categories(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let can_read_all = user.permissions.contains("product_categories:read");

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            r#"
            SELECT COUNT(*)
            FROM product_categories pc
            JOIN tenants t ON t.id = pc.tenant_id
            "#,
        );
        if !can_read_all {
            cq.push(" JOIN user_tenants ut ON ut.tenant_id = pc.tenant_id");
        }
        cq.push(" WHERE TRUE");
        if !can_read_all {
            cq.push(" AND pc.is_active = TRUE")
                .push(" AND t.is_active = TRUE")
                .push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE");
        }
        if let Some(tid) = params.tenant_id {
            cq.push(" AND pc.tenant_id = ").push_bind(tid);
        }
        if let Some(ref search) = params.search {
            cq.push(" AND pc.name ILIKE ")
                .push_bind(format!("%{search}%"));
        }
        if can_read_all {
            if let Some(is_active) = params.is_active {
                cq.push(" AND pc.is_active = ").push_bind(is_active);
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
            pc.id,
            pc.tenant_id,
            t.code  AS tenant_code,
            t.name  AS tenant_name,
            pc.name,
            pc.description,
            pc.is_active,
            pc.created_at,
            pc.updated_at
        FROM product_categories pc
        JOIN tenants t ON t.id = pc.tenant_id
        "#,
    );
    if !can_read_all {
        dq.push(" JOIN user_tenants ut ON ut.tenant_id = pc.tenant_id");
    }
    dq.push(" WHERE TRUE");
    if !can_read_all {
        dq.push(" AND pc.is_active = TRUE")
            .push(" AND t.is_active = TRUE")
            .push(" AND ut.user_id = ")
            .push_bind(user.id)
            .push(" AND ut.is_active = TRUE");
    }
    if let Some(tid) = params.tenant_id {
        dq.push(" AND pc.tenant_id = ").push_bind(tid);
    }
    if let Some(ref search) = params.search {
        dq.push(" AND pc.name ILIKE ")
            .push_bind(format!("%{search}%"));
    }
    if can_read_all {
        if let Some(is_active) = params.is_active {
            dq.push(" AND pc.is_active = ").push_bind(is_active);
        }
    }
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let categories = dq
        .build_query_as::<ProductCategoryResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: categories,
    }))
}

async fn create_product_category(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateProductCategoryRequest>,
) -> Result<(StatusCode, Json<ProductCategoryResponse>)> {
    auth::require_permission(&user, "product_categories:create")?;
    ensure_active_tenant(&state.db, body.tenant_id).await?;

    let name = validate_category_name(&body.name)?;
    let description = normalize_optional_text(body.description.as_deref());

    let category_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO product_categories (tenant_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(body.tenant_id)
    .bind(name)
    .bind(description.as_deref())
    .fetch_one(&state.db)
    .await
    .map_err(map_category_db_error)?;

    let category = fetch_category(&state.db, category_id).await?;
    Ok((StatusCode::CREATED, Json(category)))
}

async fn get_product_category(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProductCategoryResponse>> {
    require_category_access(&state.db, &user, id).await?;
    Ok(Json(fetch_category(&state.db, id).await?))
}

async fn update_product_category(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProductCategoryRequest>,
) -> Result<Json<ProductCategoryResponse>> {
    auth::require_permission(&user, "product_categories:update")?;

    let name = match &body.name {
        Some(n) => Some(validate_category_name(n)?),
        None => None,
    };
    let description = normalize_optional_text(body.description.as_deref());

    let result = sqlx::query(
        r#"
        UPDATE product_categories SET
            name        = COALESCE($2, name),
            description = COALESCE($3, description),
            is_active   = COALESCE($4, is_active),
            updated_at  = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(description.as_deref())
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_category_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Kategori produk tidak ditemukan".into()));
    }

    Ok(Json(fetch_category(&state.db, id).await?))
}

async fn deactivate_product_category(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "product_categories:delete")?;

    let result = sqlx::query(
        r#"
        UPDATE product_categories
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Kategori produk tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
