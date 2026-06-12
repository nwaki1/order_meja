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
pub struct TenantResponse {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<TenantResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TenantUserResponse {
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct TenantUsersResponse {
    pub value: Vec<TenantUserResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ODataQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$orderby")]
    pub orderby: Option<String>,
    #[serde(rename = "$filter")]
    pub filter: Option<String>,
    #[serde(rename = "$count", default)]
    pub count: bool,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
pub struct CreateTenantRequest {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTenantRequest {
    pub code: Option<String>,
    pub name: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct AssignUserTenantRequest {
    pub user_id: Uuid,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_tenants).post(create_tenant))
        .route("/:id/users", get(list_tenant_users).post(assign_tenant_user))
        .route(
            "/:id/users/:user_id",
            axum::routing::delete(revoke_tenant_user),
        )
        .route("/:id", get(get_tenant).put(update_tenant).delete(deactivate_tenant))
}

#[derive(Default)]
struct FilterClause {
    code_contains: Option<String>,
    name_contains: Option<String>,
    is_active_eq: Option<bool>,
}

fn extract_contains(filter: &str, field: &str) -> Option<String> {
    let pattern = format!("contains({},", field);
    let start = filter.to_lowercase().find(&pattern.to_lowercase())?;
    let rest = filter[start + pattern.len()..].trim_start();
    let quote = rest.chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let inner = &rest[1..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

fn extract_bool_eq(filter: &str, field: &str) -> Option<bool> {
    let pattern = format!("{} eq ", field);
    let start = filter.to_lowercase().find(&pattern.to_lowercase())?;
    let rest = filter[start + pattern.len()..].trim_start().to_lowercase();
    if rest.starts_with("true") {
        Some(true)
    } else if rest.starts_with("false") {
        Some(false)
    } else {
        None
    }
}

fn parse_filter(filter: &str) -> FilterClause {
    FilterClause {
        code_contains: extract_contains(filter, "code"),
        name_contains: extract_contains(filter, "name"),
        is_active_eq: extract_bool_eq(filter, "is_active"),
    }
}

fn apply_filter(qb: &mut QueryBuilder<sqlx::Postgres>, f: &FilterClause) {
    if let Some(code) = &f.code_contains {
        qb.push(" AND t.code ILIKE ")
            .push_bind(format!("%{code}%"));
    }
    if let Some(name) = &f.name_contains {
        qb.push(" AND t.name ILIKE ")
            .push_bind(format!("%{name}%"));
    }
    if let Some(is_active) = f.is_active_eq {
        qb.push(" AND t.is_active = ").push_bind(is_active);
    }
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("t.created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "code" => "t.code",
        "name" => "t.name",
        "is_active" => "t.is_active",
        "updated_at" => "t.updated_at",
        _ => "t.created_at",
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

fn validate_tenant_code(code: &str) -> Result<&str> {
    validate_required_text(code, "code", "Kode tenant wajib diisi")
}

fn validate_tenant_name(name: &str) -> Result<&str> {
    validate_required_text(name, "name", "Nama tenant wajib diisi")
}

fn map_tenant_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_tenants_code_unique") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "code",
                "Kode tenant sudah ada",
            );
        }
        if db_err.constraint() == Some("idx_tenants_name_unique")
            || db_err.constraint() == Some("tenants_name_key")
        {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "name",
                "Tenant sudah ada",
            );
        }
        if db_err.code().as_deref() == Some("23505") {
            return AppError::BadRequest("Tenant sudah ada".into());
        }
    }
    AppError::Database(e)
}

async fn ensure_active_tenant(db: &sqlx::PgPool, tenant_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM tenants
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
        Err(AppError::NotFound("Tenant tidak ditemukan atau tidak aktif".into()))
    }
}

async fn ensure_user_exists(db: &sqlx::PgPool, user_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM users
            WHERE id = $1
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound("User tidak ditemukan".into()))
    }
}

async fn list_tenants(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ODataQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let filter = params.filter.as_deref().map(parse_filter).unwrap_or_default();
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let is_admin = user.role == "admin";

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            r#"
            SELECT COUNT(*)
            FROM tenants t
            "#,
        );
        if !is_admin {
            cq.push(
                r#"
                JOIN user_tenants ut ON ut.tenant_id = t.id
                "#,
            );
        }
        cq.push(" WHERE TRUE");
        if !is_admin {
            cq.push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE AND t.is_active = TRUE");
        }
        apply_filter(&mut cq, &filter);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT t.id, t.code, t.name, t.is_active, t.created_at, t.updated_at
        FROM tenants t
        "#,
    );
    if !is_admin {
        dq.push(
            r#"
            JOIN user_tenants ut ON ut.tenant_id = t.id
            "#,
        );
    }
    dq.push(" WHERE TRUE");
    if !is_admin {
        dq.push(" AND ut.user_id = ")
            .push_bind(user.id)
            .push(" AND ut.is_active = TRUE AND t.is_active = TRUE");
    }
    apply_filter(&mut dq, &filter);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let tenants = dq
        .build_query_as::<TenantResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: tenants,
    }))
}

async fn create_tenant(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateTenantRequest>,
) -> Result<(StatusCode, Json<TenantResponse>)> {
    auth::require_role(&user, "admin")?;

    let code = validate_tenant_code(&body.code)?;
    let name = validate_tenant_name(&body.name)?;

    let tenant = sqlx::query_as::<_, TenantResponse>(
        r#"
        INSERT INTO tenants (code, name)
        VALUES ($1, $2)
        RETURNING id, code, name, is_active, created_at, updated_at
        "#,
    )
    .bind(code)
    .bind(name)
    .fetch_one(&state.db)
    .await
    .map_err(map_tenant_db_error)?;

    Ok((StatusCode::CREATED, Json(tenant)))
}

async fn get_tenant(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TenantResponse>> {
    auth::require_tenant_access(&state.db, &user, id).await?;

    let mut query = String::from(
        "SELECT id, code, name, is_active, created_at, updated_at FROM tenants WHERE id = $1",
    );
    if user.role != "admin" {
        query.push_str(" AND is_active = TRUE");
    }

    let tenant = sqlx::query_as::<_, TenantResponse>(&query)
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Tenant tidak ditemukan".into()))?;

    Ok(Json(tenant))
}

async fn update_tenant(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTenantRequest>,
) -> Result<Json<TenantResponse>> {
    auth::require_role(&user, "admin")?;

    let code = match &body.code {
        Some(code) => Some(validate_tenant_code(code)?),
        None => None,
    };
    let name = match &body.name {
        Some(name) => Some(validate_tenant_name(name)?),
        None => None,
    };

    let tenant = sqlx::query_as::<_, TenantResponse>(
        r#"
        UPDATE tenants SET
            code = COALESCE($2, code),
            name = COALESCE($3, name),
            is_active = COALESCE($4, is_active),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, code, name, is_active, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(code)
    .bind(name)
    .bind(body.is_active)
    .fetch_optional(&state.db)
    .await
    .map_err(map_tenant_db_error)?
    .ok_or_else(|| AppError::NotFound("Tenant tidak ditemukan".into()))?;

    Ok(Json(tenant))
}

async fn deactivate_tenant(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_role(&user, "admin")?;

    let result = sqlx::query(
        r#"
        UPDATE tenants
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Tenant tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn list_tenant_users(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TenantUsersResponse>> {
    auth::require_role(&user, "admin")?;

    let tenant_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if !tenant_exists {
        return Err(AppError::NotFound("Tenant tidak ditemukan".into()));
    }

    let users = sqlx::query_as::<_, TenantUserResponse>(
        r#"
        SELECT
            ut.tenant_id,
            ut.user_id,
            u.email,
            u.name,
            ut.is_active,
            ut.created_at,
            ut.updated_at
        FROM user_tenants ut
        JOIN users u ON u.id = ut.user_id
        WHERE ut.tenant_id = $1
        ORDER BY ut.is_active DESC, u.name ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(TenantUsersResponse { value: users }))
}

async fn assign_tenant_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<AssignUserTenantRequest>,
) -> Result<(StatusCode, Json<TenantUserResponse>)> {
    auth::require_role(&user, "admin")?;
    ensure_active_tenant(&state.db, id).await?;
    ensure_user_exists(&state.db, body.user_id).await?;

    let assignment = sqlx::query_as::<_, TenantUserResponse>(
        r#"
        WITH upsert AS (
            INSERT INTO user_tenants (tenant_id, user_id, is_active)
            VALUES ($1, $2, TRUE)
            ON CONFLICT (user_id, tenant_id)
            DO UPDATE SET
                is_active = TRUE,
                updated_at = CASE
                    WHEN user_tenants.is_active = FALSE THEN NOW()
                    ELSE user_tenants.updated_at
                END
            RETURNING tenant_id, user_id, is_active, created_at, updated_at
        )
        SELECT
            upsert.tenant_id,
            upsert.user_id,
            users.email,
            users.name,
            upsert.is_active,
            upsert.created_at,
            upsert.updated_at
        FROM upsert
        JOIN users ON users.id = upsert.user_id
        "#,
    )
    .bind(id)
    .bind(body.user_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(assignment)))
}

async fn revoke_tenant_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    auth::require_role(&user, "admin")?;

    let result = sqlx::query(
        r#"
        UPDATE user_tenants
        SET is_active = FALSE, updated_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Akses user ke tenant tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
