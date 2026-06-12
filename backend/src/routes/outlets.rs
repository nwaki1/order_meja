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
pub struct OutletResponse {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub is_active: bool,
    pub current_tenant_id: Uuid,
    pub current_tenant_code: String,
    pub current_tenant_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<OutletResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OutletOwnershipResponse {
    pub id: Uuid,
    pub outlet_id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
    pub valid_from: chrono::DateTime<chrono::Utc>,
    pub valid_until: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct OutletOwnershipsResponse {
    pub value: Vec<OutletOwnershipResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OutletUserResponse {
    pub outlet_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct OutletUsersResponse {
    pub value: Vec<OutletUserResponse>,
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
pub struct CreateOutletRequest {
    pub tenant_id: Uuid,
    pub code: String,
    pub name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateOutletRequest {
    pub code: Option<String>,
    pub name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TransferOutletRequest {
    pub tenant_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct AssignUserOutletRequest {
    pub user_id: Uuid,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_outlets).post(create_outlet))
        .route("/:id/ownerships", get(list_outlet_ownerships))
        .route("/:id/transfer", axum::routing::post(transfer_outlet))
        .route("/:id/users", get(list_outlet_users).post(assign_outlet_user))
        .route(
            "/:id/users/:user_id",
            axum::routing::delete(revoke_outlet_user),
        )
        .route("/:id", get(get_outlet).put(update_outlet).delete(deactivate_outlet))
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
        qb.push(" AND o.code ILIKE ")
            .push_bind(format!("%{code}%"));
    }
    if let Some(name) = &f.name_contains {
        qb.push(" AND o.name ILIKE ")
            .push_bind(format!("%{name}%"));
    }
    if let Some(is_active) = f.is_active_eq {
        qb.push(" AND o.is_active = ").push_bind(is_active);
    }
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("o.created_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "code" => "o.code",
        "name" => "o.name",
        "is_active" => "o.is_active",
        "updated_at" => "o.updated_at",
        _ => "o.created_at",
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

fn validate_outlet_code(code: &str) -> Result<&str> {
    validate_required_text(code, "code", "Kode outlet wajib diisi")
}

fn validate_outlet_name(name: &str) -> Result<&str> {
    validate_required_text(name, "name", "Nama outlet wajib diisi")
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn map_outlet_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_outlets_code_unique")
            || db_err.code().as_deref() == Some("23505")
        {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "code",
                "Kode outlet sudah ada",
            );
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

async fn ensure_active_outlet(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM outlets
            WHERE id = $1 AND is_active = TRUE
        )
        "#,
    )
    .bind(outlet_id)
    .fetch_one(db)
    .await?;

    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound("Outlet tidak ditemukan atau tidak aktif".into()))
    }
}

async fn fetch_outlet(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<OutletResponse> {
    sqlx::query_as::<_, OutletResponse>(
        r#"
        SELECT
            o.id,
            o.code,
            o.name,
            o.address,
            o.phone,
            o.is_active,
            oo.tenant_id AS current_tenant_id,
            t.code AS current_tenant_code,
            t.name AS current_tenant_name,
            o.created_at,
            o.updated_at
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        JOIN tenants t ON t.id = oo.tenant_id
        WHERE o.id = $1
        "#,
    )
    .bind(outlet_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Outlet tidak ditemukan".into()))
}

async fn active_owner_tenant_id(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT tenant_id
        FROM outlet_ownerships
        WHERE outlet_id = $1 AND valid_until IS NULL
        "#,
    )
    .bind(outlet_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Ownership aktif outlet tidak ditemukan".into()))
}

async fn ensure_user_has_active_tenant_access(
    db: &sqlx::PgPool,
    user_id: Uuid,
    tenant_id: Uuid,
) -> Result<()> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM user_tenants ut
            JOIN tenants t ON t.id = ut.tenant_id
            WHERE ut.user_id = $1
              AND ut.tenant_id = $2
              AND ut.is_active = TRUE
              AND t.is_active = TRUE
        )
        "#,
    )
    .bind(user_id)
    .bind(tenant_id)
    .fetch_one(db)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "User tidak memiliki akses aktif ke tenant pemilik outlet".into(),
        ))
    }
}

async fn list_outlets(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ODataQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let filter = params.filter.as_deref().map(parse_filter).unwrap_or_default();
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let can_read_all_outlets = user.permissions.contains("outlets:read");

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            r#"
            SELECT COUNT(*)
            FROM outlets o
            JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
            JOIN tenants t ON t.id = oo.tenant_id
            "#,
        );
        if !can_read_all_outlets {
            cq.push(
                r#"
                JOIN user_outlets uo ON uo.outlet_id = o.id
                JOIN user_tenants ut ON ut.tenant_id = oo.tenant_id
                "#,
            );
        }
        cq.push(" WHERE TRUE");
        if !can_read_all_outlets {
            cq.push(" AND o.is_active = TRUE")
                .push(" AND t.is_active = TRUE")
                .push(" AND uo.user_id = ")
                .push_bind(user.id)
                .push(" AND uo.is_active = TRUE")
                .push(" AND ut.user_id = ")
                .push_bind(user.id)
                .push(" AND ut.is_active = TRUE");
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
        SELECT
            o.id,
            o.code,
            o.name,
            o.address,
            o.phone,
            o.is_active,
            oo.tenant_id AS current_tenant_id,
            t.code AS current_tenant_code,
            t.name AS current_tenant_name,
            o.created_at,
            o.updated_at
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        JOIN tenants t ON t.id = oo.tenant_id
        "#,
    );
    if !can_read_all_outlets {
        dq.push(
            r#"
            JOIN user_outlets uo ON uo.outlet_id = o.id
            JOIN user_tenants ut ON ut.tenant_id = oo.tenant_id
            "#,
        );
    }
    dq.push(" WHERE TRUE");
    if !can_read_all_outlets {
        dq.push(" AND o.is_active = TRUE")
            .push(" AND t.is_active = TRUE")
            .push(" AND uo.user_id = ")
            .push_bind(user.id)
            .push(" AND uo.is_active = TRUE")
            .push(" AND ut.user_id = ")
            .push_bind(user.id)
            .push(" AND ut.is_active = TRUE");
    }
    apply_filter(&mut dq, &filter);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let outlets = dq
        .build_query_as::<OutletResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: outlets,
    }))
}

async fn create_outlet(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateOutletRequest>,
) -> Result<(StatusCode, Json<OutletResponse>)> {
    auth::require_permission(&user, "outlets:create")?;
    ensure_active_tenant(&state.db, body.tenant_id).await?;

    let code = validate_outlet_code(&body.code)?;
    let name = validate_outlet_name(&body.name)?;
    let address = normalize_optional_text(body.address.as_deref());
    let phone = normalize_optional_text(body.phone.as_deref());

    let mut tx = state.db.begin().await?;
    let outlet_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO outlets (code, name, address, phone)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(code)
    .bind(name)
    .bind(address.as_deref())
    .bind(phone.as_deref())
    .fetch_one(&mut *tx)
    .await
    .map_err(map_outlet_db_error)?;

    sqlx::query(
        r#"
        INSERT INTO outlet_ownerships (outlet_id, tenant_id)
        VALUES ($1, $2)
        "#,
    )
    .bind(outlet_id)
    .bind(body.tenant_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let outlet = fetch_outlet(&state.db, outlet_id).await?;
    Ok((StatusCode::CREATED, Json(outlet)))
}

async fn get_outlet(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OutletResponse>> {
    auth::require_outlet_access(&state.db, &user, id).await?;
    Ok(Json(fetch_outlet(&state.db, id).await?))
}

async fn update_outlet(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateOutletRequest>,
) -> Result<Json<OutletResponse>> {
    auth::require_permission(&user, "outlets:update")?;

    let code = match &body.code {
        Some(code) => Some(validate_outlet_code(code)?),
        None => None,
    };
    let name = match &body.name {
        Some(name) => Some(validate_outlet_name(name)?),
        None => None,
    };
    let address = normalize_optional_text(body.address.as_deref());
    let phone = normalize_optional_text(body.phone.as_deref());

    let result = sqlx::query(
        r#"
        UPDATE outlets SET
            code = COALESCE($2, code),
            name = COALESCE($3, name),
            address = COALESCE($4, address),
            phone = COALESCE($5, phone),
            is_active = COALESCE($6, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(code)
    .bind(name)
    .bind(address.as_deref())
    .bind(phone.as_deref())
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_outlet_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Outlet tidak ditemukan".into()));
    }

    Ok(Json(fetch_outlet(&state.db, id).await?))
}

async fn deactivate_outlet(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "outlets:delete")?;

    let result = sqlx::query(
        r#"
        UPDATE outlets
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Outlet tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn list_outlet_ownerships(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OutletOwnershipsResponse>> {
    auth::require_permission(&user, "outlet_ownerships:read")?;

    let ownerships = sqlx::query_as::<_, OutletOwnershipResponse>(
        r#"
        SELECT
            oo.id,
            oo.outlet_id,
            oo.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name,
            oo.valid_from,
            oo.valid_until,
            oo.created_at,
            oo.updated_at
        FROM outlet_ownerships oo
        JOIN tenants t ON t.id = oo.tenant_id
        WHERE oo.outlet_id = $1
        ORDER BY oo.valid_from DESC, oo.created_at DESC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(OutletOwnershipsResponse { value: ownerships }))
}

async fn transfer_outlet(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<TransferOutletRequest>,
) -> Result<Json<OutletOwnershipResponse>> {
    auth::require_permission(&user, "outlet_ownerships:transfer")?;

    let mut tx = state.db.begin().await?;

    let outlet_is_active = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT is_active
        FROM outlets
        WHERE id = $1
        FOR UPDATE
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Outlet tidak ditemukan".into()))?;

    if !outlet_is_active {
        return Err(AppError::BadRequest("Outlet tidak aktif".into()));
    }

    let target_tenant_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
        FROM tenants
        WHERE id = $1 AND is_active = TRUE
        FOR SHARE
        "#,
    )
    .bind(body.tenant_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Tenant tujuan tidak ditemukan atau tidak aktif".into()))?;

    let current_tenant_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT tenant_id
        FROM outlet_ownerships
        WHERE outlet_id = $1 AND valid_until IS NULL
        FOR UPDATE
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Ownership aktif outlet tidak ditemukan".into()))?;

    if current_tenant_id == target_tenant_id {
        return Err(AppError::BadRequest(
            "Target tenant sama dengan owner aktif outlet".into(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE outlet_ownerships
        SET valid_until = NOW(), updated_at = NOW()
        WHERE outlet_id = $1 AND valid_until IS NULL
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    let ownership = sqlx::query_as::<_, OutletOwnershipResponse>(
        r#"
        WITH new_ownership AS (
            INSERT INTO outlet_ownerships (outlet_id, tenant_id, valid_from)
            VALUES ($1, $2, NOW())
            RETURNING id, outlet_id, tenant_id, valid_from, valid_until, created_at, updated_at
        )
        SELECT
            no.id,
            no.outlet_id,
            no.tenant_id,
            t.code AS tenant_code,
            t.name AS tenant_name,
            no.valid_from,
            no.valid_until,
            no.created_at,
            no.updated_at
        FROM new_ownership no
        JOIN tenants t ON t.id = no.tenant_id
        "#,
    )
    .bind(id)
    .bind(target_tenant_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE user_outlets
        SET is_active = FALSE, updated_at = NOW()
        WHERE outlet_id = $1 AND is_active = TRUE
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(ownership))
}

async fn list_outlet_users(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OutletUsersResponse>> {
    auth::require_permission(&user, "outlet_users:read")?;

    let outlet_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM outlets WHERE id = $1)",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if !outlet_exists {
        return Err(AppError::NotFound("Outlet tidak ditemukan".into()));
    }

    let users = sqlx::query_as::<_, OutletUserResponse>(
        r#"
        SELECT
            uo.outlet_id,
            uo.user_id,
            u.email,
            u.name,
            uo.is_active,
            uo.created_at,
            uo.updated_at
        FROM user_outlets uo
        JOIN users u ON u.id = uo.user_id
        WHERE uo.outlet_id = $1
        ORDER BY uo.is_active DESC, u.name ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(OutletUsersResponse { value: users }))
}

async fn assign_outlet_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<AssignUserOutletRequest>,
) -> Result<(StatusCode, Json<OutletUserResponse>)> {
    auth::require_permission(&user, "outlet_users:assign")?;
    ensure_active_outlet(&state.db, id).await?;
    ensure_user_exists(&state.db, body.user_id).await?;
    let tenant_id = active_owner_tenant_id(&state.db, id).await?;
    ensure_user_has_active_tenant_access(&state.db, body.user_id, tenant_id).await?;

    let assignment = sqlx::query_as::<_, OutletUserResponse>(
        r#"
        WITH upsert AS (
            INSERT INTO user_outlets (outlet_id, user_id, is_active)
            VALUES ($1, $2, TRUE)
            ON CONFLICT (user_id, outlet_id)
            DO UPDATE SET
                is_active = TRUE,
                updated_at = CASE
                    WHEN user_outlets.is_active = FALSE THEN NOW()
                    ELSE user_outlets.updated_at
                END
            RETURNING outlet_id, user_id, is_active, created_at, updated_at
        )
        SELECT
            upsert.outlet_id,
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

async fn revoke_outlet_user(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "outlet_users:revoke")?;

    let result = sqlx::query(
        r#"
        UPDATE user_outlets
        SET is_active = FALSE, updated_at = NOW()
        WHERE outlet_id = $1 AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Akses user ke outlet tidak ditemukan".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
