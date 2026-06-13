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
pub struct ShiftTargetResponse {
    pub id: Uuid,
    pub shift_id: Uuid,
    pub target_type: String,
    pub target_value: i64,
    pub bonus_amount: i64,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ShiftTargetsResponse {
    pub value: Vec<ShiftTargetResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftTargetResultResponse {
    pub id: Uuid,
    pub shift_target_id: Uuid,
    pub target_type: String,
    pub target_value: i64,
    pub bonus_amount: i64,
    pub actual_value: i64,
    pub achievement_percentage: f64,
    pub is_achieved: bool,
    pub calculated_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ShiftTargetResultsResponse {
    pub value: Vec<ShiftTargetResultResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct WorkerIncentiveResponse {
    pub id: Uuid,
    pub worker_id: Uuid,
    pub worker_code: String,
    pub worker_name: String,
    pub shift_id: Uuid,
    pub shift_name: String,
    pub work_date: chrono::NaiveDate,
    pub outlet_id: Uuid,
    pub outlet_name: String,
    pub shift_target_id: Uuid,
    pub target_type: String,
    pub target_value: i64,
    pub amount: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataIncentiveListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<WorkerIncentiveResponse>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateShiftTargetRequest {
    pub target_type: String,
    pub target_value: i64,
    pub bonus_amount: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateShiftTargetRequest {
    pub target_value: Option<i64>,
    pub bonus_amount: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct IncentiveListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

fn default_top() -> u32 {
    20
}

// Shift-scoped routes, merged into the /shifts nest.
pub fn shift_router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/:id/targets", get(list_shift_targets).post(create_shift_target))
        .route("/:id/target-results", get(list_shift_target_results))
        .route("/:id/incentives", get(list_shift_incentives))
}

// /shift-targets
pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route(
        "/:id",
        axum::routing::put(update_shift_target).delete(deactivate_shift_target),
    )
}

// Worker-scoped routes, merged into the /workers nest.
pub fn worker_router() -> Router<AppState> {
    Router::<AppState>::new().route("/:id/incentives", get(list_worker_incentives))
}

// Splits a bonus evenly across n workers in integer rupiah; the remainder goes to
// the first `bonus % n` recipients so the parts sum back to exactly `bonus`.
pub fn split_bonus_even(bonus: i64, n: usize) -> Vec<i64> {
    if n == 0 {
        return Vec::new();
    }
    let n_i64 = n as i64;
    let base = bonus / n_i64;
    let remainder = bonus % n_i64;
    (0..n)
        .map(|i| if (i as i64) < remainder { base + 1 } else { base })
        .collect()
}

async fn shift_outlet_status(db: &sqlx::PgPool, shift_id: Uuid) -> Result<(Uuid, String)> {
    sqlx::query_as::<_, (Uuid, String)>("SELECT outlet_id, status FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Shift tidak ditemukan".into()))
}

// Read access: admins (outlets:read) pass; otherwise the user needs active
// access to the shift's outlet.
async fn require_shift_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    shift_id: Uuid,
) -> Result<(Uuid, String)> {
    let (outlet_id, status) = shift_outlet_status(db, shift_id).await?;
    auth::require_outlet_access(db, user, outlet_id).await?;
    Ok((outlet_id, status))
}

async fn target_shift(db: &sqlx::PgPool, target_id: Uuid) -> Result<(Uuid, String)> {
    sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT s.id, s.status
        FROM shift_targets st
        JOIN shifts s ON s.id = st.shift_id
        WHERE st.id = $1
        "#,
    )
    .bind(target_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Target shift tidak ditemukan".into()))
}

fn map_target_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_shift_targets_active_unique") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "target_type",
                "Target aktif untuk tipe ini sudah ada pada shift",
            );
        }
    }
    AppError::Database(e)
}

fn validate_target_type(target_type: &str) -> Result<()> {
    if target_type != "revenue" {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "target_type",
            "target_type hanya boleh 'revenue'",
        ));
    }
    Ok(())
}

async fn fetch_target(db: &sqlx::PgPool, id: Uuid) -> Result<ShiftTargetResponse> {
    sqlx::query_as::<_, ShiftTargetResponse>(
        r#"
        SELECT id, shift_id, target_type, target_value, bonus_amount,
               is_active, created_at, updated_at
        FROM shift_targets WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Target shift tidak ditemukan".into()))
}

async fn list_shift_targets(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(shift_id): Path<Uuid>,
) -> Result<Json<ShiftTargetsResponse>> {
    require_shift_access(&state.db, &user, shift_id).await?;

    let targets = sqlx::query_as::<_, ShiftTargetResponse>(
        r#"
        SELECT id, shift_id, target_type, target_value, bonus_amount,
               is_active, created_at, updated_at
        FROM shift_targets
        WHERE shift_id = $1
        ORDER BY is_active DESC, created_at DESC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ShiftTargetsResponse { value: targets }))
}

async fn create_shift_target(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(shift_id): Path<Uuid>,
    Json(body): Json<CreateShiftTargetRequest>,
) -> Result<(StatusCode, Json<ShiftTargetResponse>)> {
    auth::require_permission(&user, "shift_targets:create")?;
    let (_, status) = shift_outlet_status(&state.db, shift_id).await?;
    if status != "draft" {
        return Err(AppError::BadRequest(
            "Target hanya bisa dibuat saat shift draft".into(),
        ));
    }

    validate_target_type(&body.target_type)?;
    if body.target_value <= 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "target_value",
            "target_value harus lebih dari 0",
        ));
    }
    if body.bonus_amount < 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "bonus_amount",
            "bonus_amount tidak boleh negatif",
        ));
    }

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO shift_targets (shift_id, target_type, target_value, bonus_amount)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(shift_id)
    .bind(&body.target_type)
    .bind(body.target_value)
    .bind(body.bonus_amount)
    .fetch_one(&state.db)
    .await
    .map_err(map_target_db_error)?;

    Ok((StatusCode::CREATED, Json(fetch_target(&state.db, id).await?)))
}

async fn update_shift_target(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateShiftTargetRequest>,
) -> Result<Json<ShiftTargetResponse>> {
    auth::require_permission(&user, "shift_targets:update")?;
    let (_, status) = target_shift(&state.db, id).await?;
    if status != "draft" {
        return Err(AppError::BadRequest(
            "Target hanya bisa diubah saat shift draft".into(),
        ));
    }

    if let Some(value) = body.target_value {
        if value <= 0 {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "target_value",
                "target_value harus lebih dari 0",
            ));
        }
    }
    if let Some(bonus) = body.bonus_amount {
        if bonus < 0 {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "bonus_amount",
                "bonus_amount tidak boleh negatif",
            ));
        }
    }

    let result = sqlx::query(
        r#"
        UPDATE shift_targets SET
            target_value = COALESCE($2, target_value),
            bonus_amount = COALESCE($3, bonus_amount),
            is_active    = COALESCE($4, is_active),
            updated_at   = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(body.target_value)
    .bind(body.bonus_amount)
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_target_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Target shift tidak ditemukan".into()));
    }

    Ok(Json(fetch_target(&state.db, id).await?))
}

async fn deactivate_shift_target(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "shift_targets:delete")?;
    let (_, status) = target_shift(&state.db, id).await?;
    if status != "draft" {
        return Err(AppError::BadRequest(
            "Target hanya bisa dinonaktifkan saat shift draft".into(),
        ));
    }

    let result = sqlx::query(
        "UPDATE shift_targets SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Target shift tidak ditemukan".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn list_shift_target_results(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(shift_id): Path<Uuid>,
) -> Result<Json<ShiftTargetResultsResponse>> {
    require_shift_access(&state.db, &user, shift_id).await?;

    let results = sqlx::query_as::<_, ShiftTargetResultResponse>(
        r#"
        SELECT
            r.id, r.shift_target_id, st.target_type, st.target_value, st.bonus_amount,
            r.actual_value, r.achievement_percentage, r.is_achieved,
            r.calculated_at, r.created_at
        FROM shift_target_results r
        JOIN shift_targets st ON st.id = r.shift_target_id
        WHERE st.shift_id = $1
        ORDER BY r.created_at DESC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ShiftTargetResultsResponse { value: results }))
}

async fn list_shift_incentives(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(shift_id): Path<Uuid>,
) -> Result<Json<ODataIncentiveListResponse>> {
    require_shift_access(&state.db, &user, shift_id).await?;

    let incentives = sqlx::query_as::<_, WorkerIncentiveResponse>(
        r#"
        SELECT
            wi.id, wi.worker_id, w.code AS worker_code, w.name AS worker_name,
            wi.shift_id, s.name_snapshot AS shift_name, s.work_date,
            s.outlet_id, o.name AS outlet_name,
            wi.shift_target_id, st.target_type, st.target_value,
            wi.amount, wi.created_at
        FROM worker_incentives wi
        JOIN workers w ON w.id = wi.worker_id
        JOIN shifts s ON s.id = wi.shift_id
        JOIN outlets o ON o.id = s.outlet_id
        JOIN shift_targets st ON st.id = wi.shift_target_id
        WHERE wi.shift_id = $1
        ORDER BY w.name ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ODataIncentiveListResponse {
        odata_count: None,
        value: incentives,
    }))
}

async fn list_worker_incentives(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(worker_id): Path<Uuid>,
    Query(params): Query<IncentiveListQuery>,
) -> Result<Json<ODataIncentiveListResponse>> {
    // Worker incentive read follows tenant access: admins (workers:read) pass;
    // otherwise the user needs active access to the worker's tenant.
    let tenant_id =
        sqlx::query_scalar::<_, Uuid>("SELECT tenant_id FROM workers WHERE id = $1")
            .bind(worker_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Worker tidak ditemukan".into()))?;

    if !user.permissions.contains("workers:read")
        && !user.permissions.contains("worker_incentives:read")
    {
        let has_access = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM user_tenants ut
                WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.is_active = TRUE
            )
            "#,
        )
        .bind(user.id)
        .bind(tenant_id)
        .fetch_one(&state.db)
        .await?;
        if !has_access {
            return Err(AppError::Forbidden);
        }
    }

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;

    let push_filters = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        qb.push(" WHERE wi.worker_id = ").push_bind(worker_id);
        if let Some(ref from) = params.date_from {
            qb.push(" AND s.work_date >= ")
                .push_bind(from.clone())
                .push("::date");
        }
        if let Some(ref to) = params.date_to {
            qb.push(" AND s.work_date <= ")
                .push_bind(to.clone())
                .push("::date");
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            "SELECT COUNT(*) FROM worker_incentives wi JOIN shifts s ON s.id = wi.shift_id",
        );
        push_filters(&mut cq);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            wi.id, wi.worker_id, w.code AS worker_code, w.name AS worker_name,
            wi.shift_id, s.name_snapshot AS shift_name, s.work_date,
            s.outlet_id, o.name AS outlet_name,
            wi.shift_target_id, st.target_type, st.target_value,
            wi.amount, wi.created_at
        FROM worker_incentives wi
        JOIN workers w ON w.id = wi.worker_id
        JOIN shifts s ON s.id = wi.shift_id
        JOIN outlets o ON o.id = s.outlet_id
        JOIN shift_targets st ON st.id = wi.shift_target_id
        "#,
    );
    push_filters(&mut dq);
    dq.push(" ORDER BY s.work_date DESC, wi.created_at DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let incentives = dq
        .build_query_as::<WorkerIncentiveResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataIncentiveListResponse {
        odata_count,
        value: incentives,
    }))
}
