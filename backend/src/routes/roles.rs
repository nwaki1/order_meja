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
pub struct RoleResponse {
    pub name: String,
    pub description: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<RoleResponse>,
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
pub struct CreateRoleRequest {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_roles).post(create_role))
        .route("/:name", get(get_role).put(update_role).delete(delete_role))
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

fn map_role_db_error(e: sqlx::Error, duplicate_message: &str, in_use_message: &str) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("roles_pkey") || db_err.code().as_deref() == Some("23505") {
            return AppError::BadRequest(duplicate_message.into());
        }
        if db_err.code().as_deref() == Some("23503") {
            return AppError::BadRequest(in_use_message.into());
        }
    }
    AppError::Database(e)
}

async fn list_roles(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ODataQuery>,
) -> Result<Json<ODataListResponse>> {
    auth::require_role(&user, "admin")?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let filter = params.filter.as_deref().map(parse_filter).unwrap_or_default();
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM roles WHERE TRUE");
        apply_filter(&mut cq, &filter);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        "SELECT name, description, created_at, updated_at FROM roles WHERE TRUE",
    );
    apply_filter(&mut dq, &filter);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(format!(" LIMIT {top} OFFSET {skip}"));

    let roles = dq
        .build_query_as::<RoleResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: roles,
    }))
}

async fn create_role(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateRoleRequest>,
) -> Result<(StatusCode, Json<RoleResponse>)> {
    auth::require_role(&user, "admin")?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "name",
            "Nama role wajib diisi",
        ));
    }

    let new_role = sqlx::query_as::<_, RoleResponse>(
        r#"
        INSERT INTO roles (name, description)
        VALUES ($1, $2)
        RETURNING name, description, created_at, updated_at
        "#,
    )
    .bind(name)
    .bind(body.description.trim())
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("roles_pkey") || db_err.code().as_deref() == Some("23505")
            {
                return AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "name",
                    "Role sudah ada",
                );
            }
        }
        map_role_db_error(e, "Role sudah ada", "Role sedang digunakan")
    })?;

    Ok((StatusCode::CREATED, Json(new_role)))
}

async fn get_role(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<RoleResponse>> {
    auth::require_role(&user, "admin")?;

    let found = sqlx::query_as::<_, RoleResponse>(
        "SELECT name, description, created_at, updated_at FROM roles WHERE name = $1",
    )
    .bind(name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Role tidak ditemukan".into()))?;

    Ok(Json(found))
}

async fn update_role(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<UpdateRoleRequest>,
) -> Result<Json<RoleResponse>> {
    auth::require_role(&user, "admin")?;

    if let Some(ref next_name) = body.name {
        if next_name.trim().is_empty() {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "name",
                "Nama role wajib diisi",
            ));
        }
    }

    let updated = sqlx::query_as::<_, RoleResponse>(
        r#"
        UPDATE roles SET
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
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("roles_pkey") || db_err.code().as_deref() == Some("23505")
            {
                return AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "name",
                    "Role sudah ada",
                );
            }
        }
        map_role_db_error(e, "Role sudah ada", "Role sedang digunakan dan tidak bisa diubah")
    })?
    .ok_or_else(|| AppError::NotFound("Role tidak ditemukan".into()))?;

    Ok(Json(updated))
}

async fn delete_role(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode> {
    auth::require_role(&user, "admin")?;

    let result = sqlx::query("DELETE FROM roles WHERE name = $1")
        .bind(name)
        .execute(&state.db)
        .await
        .map_err(|e| map_role_db_error(e, "Role sudah ada", "Role sedang digunakan dan tidak bisa dihapus"))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Role tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
