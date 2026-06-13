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
pub struct WorkerResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
    pub user_id: Option<Uuid>,
    pub user_email: Option<String>,
    pub code: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<WorkerResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct WorkerOutletResponse {
    pub worker_id: Uuid,
    pub outlet_id: Uuid,
    pub code: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct WorkerOutletsResponse {
    pub value: Vec<WorkerOutletResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
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
pub struct CreateWorkerRequest {
    pub tenant_id: Uuid,
    pub user_id: Option<Uuid>,
    pub code: String,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateWorkerRequest {
    pub user_id: Option<Uuid>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssignWorkerOutletRequest {
    pub worker_id: Uuid,
}

// /workers
pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_workers).post(create_worker))
        .route(
            "/:id",
            get(get_worker).put(update_worker).delete(deactivate_worker),
        )
}

// Outlet-scoped worker assignment routes, merged into the /outlets nest.
pub fn outlet_router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/:id/workers", get(list_outlet_workers).post(assign_outlet_worker))
        .route("/:id/workers/:worker_id", axum::routing::delete(revoke_outlet_worker))
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

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

fn map_worker_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_workers_tenant_code_unique") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "code",
                "Kode worker sudah ada pada tenant ini",
            );
        }
    }
    AppError::Database(e)
}

async fn ensure_active_tenant(db: &sqlx::PgPool, tenant_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1 AND is_active = TRUE)",
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

async fn ensure_user_exists(db: &sqlx::PgPool, user_id: Uuid) -> Result<()> {
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(user_id)
            .fetch_one(db)
            .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "user_id",
            "User tidak ditemukan",
        ))
    }
}

async fn require_worker_tenant_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    worker_id: Uuid,
) -> Result<()> {
    if user.permissions.contains("workers:read") {
        return Ok(());
    }
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM workers w
            JOIN tenants t ON t.id = w.tenant_id
            JOIN user_tenants ut ON ut.tenant_id = w.tenant_id
            WHERE w.id = $1
              AND w.is_active = TRUE
              AND t.is_active = TRUE
              AND ut.user_id = $2
              AND ut.is_active = TRUE
        )
        "#,
    )
    .bind(worker_id)
    .bind(user.id)
    .fetch_one(db)
    .await?;
    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn fetch_worker(db: &sqlx::PgPool, worker_id: Uuid) -> Result<WorkerResponse> {
    sqlx::query_as::<_, WorkerResponse>(
        r#"
        SELECT
            w.id,
            w.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name,
            w.user_id,
            u.email AS user_email,
            w.code,
            w.name,
            w.phone,
            w.email,
            w.is_active,
            w.created_at,
            w.updated_at
        FROM workers w
        JOIN tenants t ON t.id = w.tenant_id
        LEFT JOIN users u ON u.id = w.user_id
        WHERE w.id = $1
        "#,
    )
    .bind(worker_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Worker tidak ditemukan".into()))
}

async fn worker_tenant_id(db: &sqlx::PgPool, worker_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT tenant_id FROM workers WHERE id = $1")
        .bind(worker_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Worker tidak ditemukan".into()))
}

// Resolves the outlet's active owner tenant (active outlet + ownership + tenant).
async fn active_outlet_tenant(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT oo.tenant_id
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        JOIN tenants t ON t.id = oo.tenant_id
        WHERE o.id = $1 AND o.is_active = TRUE AND t.is_active = TRUE
        "#,
    )
    .bind(outlet_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Outlet tidak ditemukan atau tidak aktif".into()))
}

async fn list_workers(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let can_read_all = user.permissions.contains("workers:read");

    let push_where = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        qb.push(" WHERE TRUE");
        if !can_read_all {
            qb.push(" AND w.is_active = TRUE")
                .push(" AND t.is_active = TRUE")
                .push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE");
        }
        if let Some(tid) = params.tenant_id {
            qb.push(" AND w.tenant_id = ").push_bind(tid);
        }
        if let Some(ref search) = params.search {
            let like = format!("%{search}%");
            qb.push(" AND (w.name ILIKE ")
                .push_bind(like.clone())
                .push(" OR w.code ILIKE ")
                .push_bind(like.clone())
                .push(" OR w.phone ILIKE ")
                .push_bind(like.clone())
                .push(" OR w.email ILIKE ")
                .push_bind(like)
                .push(")");
        }
        if can_read_all {
            if let Some(is_active) = params.is_active {
                qb.push(" AND w.is_active = ").push_bind(is_active);
            }
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM workers w JOIN tenants t ON t.id = w.tenant_id");
        if !can_read_all {
            cq.push(" JOIN user_tenants ut ON ut.tenant_id = w.tenant_id");
        }
        push_where(&mut cq);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            w.id, w.tenant_id, t.code AS tenant_code, t.name AS tenant_name,
            w.user_id, u.email AS user_email,
            w.code, w.name, w.phone, w.email, w.is_active, w.created_at, w.updated_at
        FROM workers w
        JOIN tenants t ON t.id = w.tenant_id
        LEFT JOIN users u ON u.id = w.user_id
        "#,
    );
    if !can_read_all {
        dq.push(" JOIN user_tenants ut ON ut.tenant_id = w.tenant_id");
    }
    push_where(&mut dq);
    dq.push(" ORDER BY w.created_at DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let workers = dq
        .build_query_as::<WorkerResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: workers,
    }))
}

async fn create_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateWorkerRequest>,
) -> Result<(StatusCode, Json<WorkerResponse>)> {
    auth::require_permission(&user, "workers:create")?;
    ensure_active_tenant(&state.db, body.tenant_id).await?;

    let code = validate_required_text(&body.code, "code", "Kode worker wajib diisi")?;
    let name = validate_required_text(&body.name, "name", "Nama worker wajib diisi")?;
    let phone = normalize_optional_text(body.phone.as_deref());
    let email = normalize_optional_text(body.email.as_deref());

    if let Some(user_id) = body.user_id {
        ensure_user_exists(&state.db, user_id).await?;
    }

    let worker_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO workers (tenant_id, user_id, code, name, phone, email)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(body.tenant_id)
    .bind(body.user_id)
    .bind(code)
    .bind(name)
    .bind(phone.as_deref())
    .bind(email.as_deref())
    .fetch_one(&state.db)
    .await
    .map_err(map_worker_db_error)?;

    let worker = fetch_worker(&state.db, worker_id).await?;
    Ok((StatusCode::CREATED, Json(worker)))
}

async fn get_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<WorkerResponse>> {
    require_worker_tenant_access(&state.db, &user, id).await?;
    Ok(Json(fetch_worker(&state.db, id).await?))
}

async fn update_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateWorkerRequest>,
) -> Result<Json<WorkerResponse>> {
    auth::require_permission(&user, "workers:update")?;
    // ensure worker exists (tenant cannot be changed via update)
    worker_tenant_id(&state.db, id).await?;

    let code = match &body.code {
        Some(code) => Some(validate_required_text(code, "code", "Kode worker wajib diisi")?),
        None => None,
    };
    let name = match &body.name {
        Some(name) => Some(validate_required_text(name, "name", "Nama worker wajib diisi")?),
        None => None,
    };
    let phone = normalize_optional_text(body.phone.as_deref());
    let email = normalize_optional_text(body.email.as_deref());

    if let Some(user_id) = body.user_id {
        ensure_user_exists(&state.db, user_id).await?;
    }

    let result = sqlx::query(
        r#"
        UPDATE workers SET
            user_id   = COALESCE($2, user_id),
            code      = COALESCE($3, code),
            name      = COALESCE($4, name),
            phone     = COALESCE($5, phone),
            email     = COALESCE($6, email),
            is_active = COALESCE($7, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.user_id)
    .bind(code)
    .bind(name)
    .bind(phone.as_deref())
    .bind(email.as_deref())
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_worker_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Worker tidak ditemukan".into()));
    }

    Ok(Json(fetch_worker(&state.db, id).await?))
}

async fn deactivate_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "workers:delete")?;
    let result = sqlx::query(
        "UPDATE workers SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Worker tidak ditemukan".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn list_outlet_workers(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
) -> Result<Json<WorkerOutletsResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    let workers = sqlx::query_as::<_, WorkerOutletResponse>(
        r#"
        SELECT
            wo.worker_id,
            wo.outlet_id,
            w.code,
            w.name,
            wo.is_active,
            wo.created_at,
            wo.updated_at
        FROM worker_outlets wo
        JOIN workers w ON w.id = wo.worker_id
        WHERE wo.outlet_id = $1
        ORDER BY wo.is_active DESC, w.name ASC
        "#,
    )
    .bind(outlet_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(WorkerOutletsResponse { value: workers }))
}

async fn assign_outlet_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
    Json(body): Json<AssignWorkerOutletRequest>,
) -> Result<(StatusCode, Json<WorkerOutletResponse>)> {
    auth::require_permission(&user, "worker_outlets:manage")?;
    let outlet_tenant = active_outlet_tenant(&state.db, outlet_id).await?;

    // Worker must exist, be active, and belong to the same tenant as the outlet.
    let worker_tenant = sqlx::query_scalar::<_, Uuid>(
        "SELECT tenant_id FROM workers WHERE id = $1 AND is_active = TRUE",
    )
    .bind(body.worker_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "worker_id",
            "Worker tidak ditemukan atau tidak aktif",
        )
    })?;

    if worker_tenant != outlet_tenant {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "worker_id",
            "Worker bukan milik tenant outlet ini",
        ));
    }

    let assignment = sqlx::query_as::<_, WorkerOutletResponse>(
        r#"
        WITH upsert AS (
            INSERT INTO worker_outlets (worker_id, outlet_id, is_active)
            VALUES ($1, $2, TRUE)
            ON CONFLICT (worker_id, outlet_id)
            DO UPDATE SET
                is_active = TRUE,
                updated_at = CASE
                    WHEN worker_outlets.is_active = FALSE THEN NOW()
                    ELSE worker_outlets.updated_at
                END
            RETURNING worker_id, outlet_id, is_active, created_at, updated_at
        )
        SELECT
            upsert.worker_id,
            upsert.outlet_id,
            w.code,
            w.name,
            upsert.is_active,
            upsert.created_at,
            upsert.updated_at
        FROM upsert
        JOIN workers w ON w.id = upsert.worker_id
        "#,
    )
    .bind(body.worker_id)
    .bind(outlet_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(assignment)))
}

async fn revoke_outlet_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((outlet_id, worker_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "worker_outlets:manage")?;

    let result = sqlx::query(
        r#"
        UPDATE worker_outlets
        SET is_active = FALSE, updated_at = NOW()
        WHERE outlet_id = $1 AND worker_id = $2
        "#,
    )
    .bind(outlet_id)
    .bind(worker_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Assignment worker ke outlet tidak ditemukan".into(),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}
