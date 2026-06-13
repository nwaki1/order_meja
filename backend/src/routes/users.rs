use crate::{auth, auth::hash_password, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

// ── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<UserResponse>,
}

// ── Request types ────────────────────────────────────────────────────────────

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
pub struct CreateUserRequest {
    pub email: String,
    pub name: String,
    pub password: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_users).post(create_user))
        .route("/:id", get(get_user).put(update_user).delete(delete_user))
}

// ── OData helpers ─────────────────────────────────────────────────────────────

#[derive(Default)]
struct FilterClause {
    name_contains: Option<String>,
    email_contains: Option<String>,
    role_eq: Option<String>,
}

/// Extract value from `contains(field,'value')` in OData $filter.
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

/// Extract value from `field eq 'value'` in OData $filter.
fn extract_eq(filter: &str, field: &str) -> Option<String> {
    let pattern = format!("{} eq ", field);
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

fn parse_filter(filter: &str) -> FilterClause {
    FilterClause {
        name_contains: extract_contains(filter, "name"),
        email_contains: extract_contains(filter, "email"),
        role_eq: extract_eq(filter, "role"),
    }
}

fn apply_filter(qb: &mut QueryBuilder<sqlx::Postgres>, f: &FilterClause) {
    match (&f.name_contains, &f.email_contains) {
        (Some(n), Some(e)) => {
            qb.push(" AND (name ILIKE ")
                .push_bind(format!("%{n}%"))
                .push(" OR email ILIKE ")
                .push_bind(format!("%{e}%"))
                .push(")");
        }
        (Some(n), None) => {
            qb.push(" AND name ILIKE ").push_bind(format!("%{n}%"));
        }
        (None, Some(e)) => {
            qb.push(" AND email ILIKE ").push_bind(format!("%{e}%"));
        }
        (None, None) => {}
    }
    if let Some(role) = &f.role_eq {
        qb.push(" AND role = ").push_bind(role.clone());
    }
}

/// Parse `$orderby` into a whitelisted (column, direction) pair.
fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "name" => "name",
        "email" => "email",
        "role" => "role",
        "updated_at" => "updated_at",
        _ => "created_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn list_users(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ODataQuery>,
) -> Result<Json<ODataListResponse>> {
    auth::require_permission(&user, "users:read")?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let filter = params.filter.as_deref().map(parse_filter).unwrap_or_default();
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());

    // $count=true → run a separate COUNT query with the same WHERE
    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM users WHERE TRUE");
        apply_filter(&mut cq, &filter);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    // Data query with ORDER BY + LIMIT/OFFSET
    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT id, email, name, role, created_at, updated_at FROM users WHERE TRUE",
    );
    apply_filter(&mut dq, &filter);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(format!(" LIMIT {top} OFFSET {skip}"));

    let users = dq
        .build_query_as::<UserResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse { odata_count, value: users }))
}

// Role must exist in the roles table (managed via /roles), not a hardcoded set.
async fn ensure_role_exists(db: &sqlx::PgPool, role: &str) -> Result<()> {
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM roles WHERE name = $1)")
            .bind(role)
            .fetch_one(db)
            .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "role",
            "Role tidak ditemukan",
        ))
    }
}

async fn create_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>)> {
    auth::require_permission(&user, "users:create")?;

    if body.email.trim().is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "email",
            "Email wajib diisi",
        ));
    }
    if body.name.trim().is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "name",
            "Nama wajib diisi",
        ));
    }
    if body.password.len() < 8 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "password",
            "Password minimal 8 karakter",
        ));
    }
    ensure_role_exists(&state.db, &body.role).await?;

    let password_hash = hash_password(&body.password)?;

    let new_user = sqlx::query_as::<_, UserResponse>(
        r#"
        INSERT INTO users (email, name, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, role, created_at, updated_at
        "#,
    )
    .bind(body.email.trim())
    .bind(body.name.trim())
    .bind(password_hash)
    .bind(&body.role)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("users_email_key") {
                return AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "email",
                    "Email sudah digunakan",
                );
            }
        }
        AppError::Database(e)
    })?;

    crate::auth::ensure_user_settings(&state.db, new_user.id).await?;

    Ok((StatusCode::CREATED, Json(new_user)))
}

async fn get_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<UserResponse>> {
    auth::require_permission(&user, "users:read")?;

    let found = sqlx::query_as::<_, UserResponse>(
        "SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User tidak ditemukan".into()))?;

    Ok(Json(found))
}

async fn update_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>> {
    auth::require_permission(&user, "users:update")?;

    if let Some(ref email) = body.email {
        if email.trim().is_empty() {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "email",
                "Email wajib diisi",
            ));
        }
    }
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "name",
                "Nama wajib diisi",
            ));
        }
    }
    if let Some(ref role) = body.role {
        ensure_role_exists(&state.db, role).await?;
    }
    if let Some(ref password) = body.password {
        if !password.is_empty() && password.len() < 8 {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "password",
                "Password minimal 8 karakter",
            ));
        }
    }

    let password_hash = match &body.password {
        Some(p) if !p.is_empty() => Some(hash_password(p)?),
        _ => None,
    };

    let updated = sqlx::query_as::<_, UserResponse>(
        r#"
        UPDATE users SET
            email         = COALESCE($2, email),
            name          = COALESCE($3, name),
            role          = COALESCE($4, role),
            password_hash = CASE WHEN $5::TEXT IS NOT NULL THEN $5 ELSE password_hash END,
            updated_at    = NOW()
        WHERE id = $1
        RETURNING id, email, name, role, created_at, updated_at
        "#,
    )
    .bind(id)
    .bind(body.email.as_deref().map(str::trim))
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.role.as_deref())
    .bind(password_hash.as_deref())
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("users_email_key") {
                return AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "email",
                    "Email sudah digunakan",
                );
            }
        }
        AppError::Database(e)
    })?
    .ok_or_else(|| AppError::NotFound("User tidak ditemukan".into()))?;

    Ok(Json(updated))
}

async fn delete_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "users:delete")?;

    if user.id == id {
        return Err(AppError::BadRequest(
            "Tidak bisa menghapus akun sendiri".into(),
        ));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("User tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
