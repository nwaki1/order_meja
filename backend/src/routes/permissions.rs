use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PermissionResponse {
    pub name: String,
    pub description: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<PermissionResponse>,
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
pub struct CreatePermissionRequest {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePermissionRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_permissions).post(create_permission))
        .route("/:name", get(get_permission).put(update_permission).delete(delete_permission))
}

#[derive(Default)]
struct FilterClause {
    name_contains: Option<String>,
    description_contains: Option<String>,
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

fn parse_filter(filter: &str) -> FilterClause {
    FilterClause {
        name_contains: extract_contains(filter, "name"),
        description_contains: extract_contains(filter, "description"),
    }
}

fn apply_filter(qb: &mut QueryBuilder<sqlx::Postgres>, f: &FilterClause) {
    match (&f.name_contains, &f.description_contains) {
        (Some(name), Some(description)) => {
            qb.push(" AND (name ILIKE ")
                .push_bind(format!("%{name}%"))
                .push(" OR description ILIKE ")
                .push_bind(format!("%{description}%"))
                .push(")");
        }
        (Some(name), None) => {
            qb.push(" AND name ILIKE ")
                .push_bind(format!("%{name}%"));
        }
        (None, Some(description)) => {
            qb.push(" AND description ILIKE ")
                .push_bind(format!("%{description}%"));
        }
        (None, None) => {}
    }
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "name" => "name",
        "description" => "description",
        "updated_at" => "updated_at",
        _ => "created_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

fn map_permission_db_error(
    e: sqlx::Error,
    duplicate_message: &str,
    in_use_message: &str,
) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("permissions_pkey")
            || db_err.code().as_deref() == Some("23505")
        {
            return AppError::BadRequest(duplicate_message.into());
        }
        if db_err.code().as_deref() == Some("23503") {
            return AppError::BadRequest(in_use_message.into());
        }
    }
    AppError::Database(e)
}

async fn list_permissions(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ODataQuery>,
) -> Result<Json<ODataListResponse>> {
    auth::require_permission(&user, "permissions:read")?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let filter = params.filter.as_deref().map(parse_filter).unwrap_or_default();
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM permissions WHERE TRUE");
        apply_filter(&mut cq, &filter);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT name, description, created_at, updated_at FROM permissions WHERE TRUE",
    );
    apply_filter(&mut dq, &filter);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(format!(" LIMIT {top} OFFSET {skip}"));

    let permissions = dq
        .build_query_as::<PermissionResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: permissions,
    }))
}

async fn create_permission(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreatePermissionRequest>,
) -> Result<(StatusCode, Json<PermissionResponse>)> {
    auth::require_permission(&user, "permissions:create")?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name wajib diisi".into()));
    }

    let new_permission = sqlx::query_as::<_, PermissionResponse>(
        r#"
        INSERT INTO permissions (name, description)
        VALUES ($1, $2)
        RETURNING name, description, created_at, updated_at
        "#,
    )
    .bind(name)
    .bind(body.description.trim())
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        map_permission_db_error(e, "Permission sudah ada", "Permission sedang digunakan")
    })?;

    Ok((StatusCode::CREATED, Json(new_permission)))
}

async fn get_permission(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<PermissionResponse>> {
    auth::require_permission(&user, "permissions:read")?;

    let found = sqlx::query_as::<_, PermissionResponse>(
        "SELECT name, description, created_at, updated_at FROM permissions WHERE name = $1",
    )
    .bind(name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Permission tidak ditemukan".into()))?;

    Ok(Json(found))
}

async fn update_permission(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<UpdatePermissionRequest>,
) -> Result<Json<PermissionResponse>> {
    auth::require_permission(&user, "permissions:update")?;

    if let Some(ref next_name) = body.name {
        if next_name.trim().is_empty() {
            return Err(AppError::BadRequest("name wajib diisi".into()));
        }
    }

    let updated = sqlx::query_as::<_, PermissionResponse>(
        r#"
        UPDATE permissions SET
            name        = COALESCE($2, name),
            description = COALESCE($3, description),
            updated_at  = NOW()
        WHERE name = $1
        RETURNING name, description, created_at, updated_at
        "#,
    )
    .bind(name)
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.description.as_deref().map(str::trim))
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        map_permission_db_error(
            e,
            "Permission sudah ada",
            "Permission sedang digunakan dan tidak bisa diubah",
        )
    })?
    .ok_or_else(|| AppError::NotFound("Permission tidak ditemukan".into()))?;

    Ok(Json(updated))
}

async fn delete_permission(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "permissions:delete")?;

    let result = sqlx::query("DELETE FROM permissions WHERE name = $1")
        .bind(name)
        .execute(&state.db)
        .await
        .map_err(|e| {
            map_permission_db_error(
                e,
                "Permission sudah ada",
                "Permission sedang digunakan dan tidak bisa dihapus",
            )
        })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Permission tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
