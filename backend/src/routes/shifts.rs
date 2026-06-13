use crate::routes::shift_templates::parse_time;
use crate::routes::shift_targets::split_bonus_even;
use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftResponse {
    pub id: Uuid,
    pub outlet_id: Uuid,
    pub outlet_code: String,
    pub outlet_name: String,
    pub shift_template_id: Option<Uuid>,
    pub work_date: NaiveDate,
    pub name_snapshot: String,
    pub start_time_snapshot: NaiveTime,
    pub end_time_snapshot: NaiveTime,
    pub opened_at: Option<chrono::DateTime<chrono::Utc>>,
    pub closed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
    pub created_by_user_id: Uuid,
    pub closed_by_user_id: Option<Uuid>,
    pub worker_count: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<ShiftResponse>,
}

#[derive(Debug, Serialize)]
pub struct ShiftsResponse {
    pub value: Vec<ShiftResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftWorkerResponse {
    pub shift_id: Uuid,
    pub worker_id: Uuid,
    pub code: String,
    pub name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ShiftWorkersResponse {
    pub value: Vec<ShiftWorkerResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub outlet_id: Option<Uuid>,
    pub work_date: Option<String>,
    pub status: Option<String>,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateShiftRequest {
    pub outlet_id: Uuid,
    pub shift_template_id: Option<Uuid>,
    pub work_date: String,
    pub name: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    #[serde(default)]
    pub worker_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateShiftRequest {
    pub work_date: Option<String>,
    pub name: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddShiftWorkerRequest {
    pub worker_id: Uuid,
}

// /shifts
pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_shifts).post(create_shift))
        .route("/:id", get(get_shift).put(update_shift))
        .route("/:id/open", post(open_shift))
        .route("/:id/close", post(close_shift))
        .route("/:id/cancel", post(cancel_shift))
        .route("/:id/workers", get(list_shift_workers).post(add_shift_worker))
        .route(
            "/:id/workers/:worker_id",
            axum::routing::delete(remove_shift_worker),
        )
}

// Outlet-scoped helper merged into the /outlets nest.
pub fn outlet_router() -> Router<AppState> {
    Router::<AppState>::new().route("/:id/open-shifts", get(list_outlet_open_shifts))
}

const SHIFT_SELECT: &str = r#"
    SELECT
        s.id, s.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
        s.shift_template_id, s.work_date, s.name_snapshot,
        s.start_time_snapshot, s.end_time_snapshot,
        s.opened_at, s.closed_at, s.status,
        s.created_by_user_id, s.closed_by_user_id,
        (SELECT COUNT(*) FROM shift_workers sw WHERE sw.shift_id = s.id) AS worker_count,
        s.created_at, s.updated_at
    FROM shifts s
    JOIN outlets o ON o.id = s.outlet_id
"#;

fn parse_date(value: &str, field: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").map_err(|_| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            field,
            "Format tanggal harus YYYY-MM-DD",
        )
    })
}

async fn ensure_active_outlet(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM outlets WHERE id = $1 AND is_active = TRUE)",
    )
    .bind(outlet_id)
    .fetch_one(db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound(
            "Outlet tidak ditemukan atau tidak aktif".into(),
        ))
    }
}

async fn fetch_shift(db: &sqlx::PgPool, shift_id: Uuid) -> Result<ShiftResponse> {
    let sql = format!("{SHIFT_SELECT} WHERE s.id = $1");
    sqlx::query_as::<_, ShiftResponse>(&sql)
        .bind(shift_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Shift tidak ditemukan".into()))
}

// (outlet_id, status) for a shift, or NotFound.
async fn shift_outlet_status(db: &sqlx::PgPool, shift_id: Uuid) -> Result<(Uuid, String)> {
    sqlx::query_as::<_, (Uuid, String)>(
        "SELECT outlet_id, status FROM shifts WHERE id = $1",
    )
    .bind(shift_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Shift tidak ditemukan".into()))
}

async fn require_shift_read_access(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    shift_id: Uuid,
) -> Result<()> {
    if user.permissions.contains("shifts:read") {
        // still ensure it exists
        shift_outlet_status(db, shift_id).await?;
        return Ok(());
    }
    let (outlet_id, _) = shift_outlet_status(db, shift_id).await?;
    auth::require_outlet_access(db, user, outlet_id).await
}

async fn list_shifts(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let can_read_all = user.permissions.contains("shifts:read");

    let work_date = match &params.work_date {
        Some(d) => Some(parse_date(d, "work_date")?),
        None => None,
    };

    let push_filters = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        qb.push(" WHERE TRUE");
        if !can_read_all {
            qb.push(
                " AND EXISTS (SELECT 1 FROM user_outlets uo WHERE uo.outlet_id = s.outlet_id AND uo.is_active = TRUE AND uo.user_id = ",
            )
            .push_bind(user.id)
            .push(")");
        }
        if let Some(oid) = params.outlet_id {
            qb.push(" AND s.outlet_id = ").push_bind(oid);
        }
        if let Some(d) = work_date {
            qb.push(" AND s.work_date = ").push_bind(d);
        }
        if let Some(ref status) = params.status {
            qb.push(" AND s.status = ").push_bind(status.clone());
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM shifts s");
        push_filters(&mut cq);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(SHIFT_SELECT);
    push_filters(&mut dq);
    dq.push(" ORDER BY s.work_date DESC, s.created_at DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let shifts = dq
        .build_query_as::<ShiftResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: shifts,
    }))
}

async fn create_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateShiftRequest>,
) -> Result<(StatusCode, Json<ShiftResponse>)> {
    auth::require_permission(&user, "shifts:create")?;
    ensure_active_outlet(&state.db, body.outlet_id).await?;

    let work_date = parse_date(&body.work_date, "work_date")?;

    // Build snapshots: from template (must belong to outlet) and/or explicit fields.
    let (mut name, mut start_time, mut end_time): (
        Option<String>,
        Option<NaiveTime>,
        Option<NaiveTime>,
    ) = (None, None, None);

    if let Some(template_id) = body.shift_template_id {
        let template = sqlx::query_as::<_, (Uuid, String, NaiveTime, NaiveTime)>(
            "SELECT outlet_id, name, start_time, end_time FROM shift_templates WHERE id = $1 AND is_active = TRUE",
        )
        .bind(template_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "shift_template_id",
                "Template shift tidak ditemukan atau tidak aktif",
            )
        })?;
        let (tpl_outlet, tpl_name, tpl_start, tpl_end) = template;
        if tpl_outlet != body.outlet_id {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "shift_template_id",
                "Template bukan milik outlet ini",
            ));
        }
        name = Some(tpl_name);
        start_time = Some(tpl_start);
        end_time = Some(tpl_end);
    }

    if let Some(n) = body.name.as_deref() {
        let n = n.trim();
        if !n.is_empty() {
            name = Some(n.to_string());
        }
    }
    if let Some(t) = body.start_time.as_deref() {
        start_time = Some(parse_time(t, "start_time")?);
    }
    if let Some(t) = body.end_time.as_deref() {
        end_time = Some(parse_time(t, "end_time")?);
    }

    let name = name.filter(|n| !n.trim().is_empty()).ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "name",
            "Nama shift wajib diisi (atau pilih template)",
        )
    })?;
    let start_time = start_time.ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "start_time",
            "Jam mulai wajib diisi (atau pilih template)",
        )
    })?;
    let end_time = end_time.ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "end_time",
            "Jam selesai wajib diisi (atau pilih template)",
        )
    })?;

    // Deduplicate worker_ids while preserving order.
    let mut seen = std::collections::HashSet::new();
    let worker_ids: Vec<Uuid> = body
        .worker_ids
        .iter()
        .copied()
        .filter(|id| seen.insert(*id))
        .collect();

    let mut tx = state.db.begin().await?;

    let shift_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO shifts
            (outlet_id, shift_template_id, work_date, name_snapshot,
             start_time_snapshot, end_time_snapshot, status, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
        RETURNING id
        "#,
    )
    .bind(body.outlet_id)
    .bind(body.shift_template_id)
    .bind(work_date)
    .bind(&name)
    .bind(start_time)
    .bind(end_time)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    for worker_id in &worker_ids {
        // Worker must be active and have an active assignment to this outlet.
        let ok = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM workers w
                JOIN worker_outlets wo ON wo.worker_id = w.id
                WHERE w.id = $1
                  AND w.is_active = TRUE
                  AND wo.outlet_id = $2
                  AND wo.is_active = TRUE
            )
            "#,
        )
        .bind(worker_id)
        .bind(body.outlet_id)
        .fetch_one(&mut *tx)
        .await?;
        if !ok {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "worker_ids",
                "Worker harus aktif dan punya assignment aktif di outlet shift",
            ));
        }
        sqlx::query("INSERT INTO shift_workers (shift_id, worker_id) VALUES ($1, $2)")
            .bind(shift_id)
            .bind(worker_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    let shift = fetch_shift(&state.db, shift_id).await?;
    Ok((StatusCode::CREATED, Json(shift)))
}

async fn get_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftResponse>> {
    require_shift_read_access(&state.db, &user, id).await?;
    Ok(Json(fetch_shift(&state.db, id).await?))
}

async fn update_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateShiftRequest>,
) -> Result<Json<ShiftResponse>> {
    auth::require_permission(&user, "shifts:update")?;
    let (_, status) = shift_outlet_status(&state.db, id).await?;
    if status != "draft" {
        return Err(AppError::BadRequest(
            "Hanya shift draft yang dapat diubah".into(),
        ));
    }

    let work_date = match &body.work_date {
        Some(d) => Some(parse_date(d, "work_date")?),
        None => None,
    };
    let name = match &body.name {
        Some(n) => {
            let n = n.trim();
            if n.is_empty() {
                return Err(AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "name",
                    "Nama shift wajib diisi",
                ));
            }
            Some(n.to_string())
        }
        None => None,
    };
    let start_time = match &body.start_time {
        Some(t) => Some(parse_time(t, "start_time")?),
        None => None,
    };
    let end_time = match &body.end_time {
        Some(t) => Some(parse_time(t, "end_time")?),
        None => None,
    };

    sqlx::query(
        r#"
        UPDATE shifts SET
            work_date           = COALESCE($2, work_date),
            name_snapshot       = COALESCE($3, name_snapshot),
            start_time_snapshot = COALESCE($4, start_time_snapshot),
            end_time_snapshot   = COALESCE($5, end_time_snapshot),
            updated_at          = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(work_date)
    .bind(name)
    .bind(start_time)
    .bind(end_time)
    .execute(&state.db)
    .await?;

    Ok(Json(fetch_shift(&state.db, id).await?))
}

async fn open_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftResponse>> {
    auth::require_permission(&user, "shifts:open")?;
    let result = sqlx::query(
        r#"
        UPDATE shifts
        SET status = 'open', opened_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'draft'
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        // Distinguish not-found from wrong-state.
        let (_, status) = shift_outlet_status(&state.db, id).await?;
        return Err(AppError::BadRequest(format!(
            "Shift hanya bisa di-open dari status draft (status saat ini: {status})"
        )));
    }
    Ok(Json(fetch_shift(&state.db, id).await?))
}

// Closing a shift finalizes targets atomically: compute completed revenue,
// record one result per active target, and (if achieved with a bonus) split the
// bonus evenly across the shift's workers. A row lock makes double/concurrent
// close safe; any failure rolls back the whole thing.
async fn close_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftResponse>> {
    auth::require_permission(&user, "shifts:close")?;

    let mut tx = state.db.begin().await?;

    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM shifts WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Shift tidak ditemukan".into()))?;

    if status != "open" {
        return Err(AppError::BadRequest(format!(
            "Shift hanya bisa di-close dari status open (status saat ini: {status})"
        )));
    }

    // Completed revenue for this shift (cancelled transactions excluded).
    let revenue = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(SUM(total_amount), 0)::BIGINT
        FROM transactions
        WHERE shift_id = $1 AND status = 'completed'
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    let targets = sqlx::query_as::<_, (Uuid, i64, i64)>(
        r#"
        SELECT id, target_value, bonus_amount
        FROM shift_targets
        WHERE shift_id = $1 AND is_active = TRUE
        "#,
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;

    for (target_id, target_value, bonus_amount) in &targets {
        let is_achieved = revenue >= *target_value;
        let achievement = if *target_value > 0 {
            revenue as f64 / *target_value as f64 * 100.0
        } else {
            0.0
        };

        sqlx::query(
            r#"
            INSERT INTO shift_target_results
                (shift_target_id, actual_value, achievement_percentage, is_achieved)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(target_id)
        .bind(revenue)
        .bind(achievement)
        .bind(is_achieved)
        .execute(&mut *tx)
        .await?;

        if is_achieved && *bonus_amount > 0 {
            let worker_ids = sqlx::query_scalar::<_, Uuid>(
                "SELECT worker_id FROM shift_workers WHERE shift_id = $1 ORDER BY worker_id ASC",
            )
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;

            if worker_ids.is_empty() {
                return Err(AppError::BadRequest(
                    "Tidak bisa close: target tercapai dengan bonus namun tidak ada worker pada shift".into(),
                ));
            }

            let shares = split_bonus_even(*bonus_amount, worker_ids.len());
            for (worker_id, amount) in worker_ids.iter().zip(shares) {
                sqlx::query(
                    r#"
                    INSERT INTO worker_incentives (worker_id, shift_id, shift_target_id, amount)
                    VALUES ($1, $2, $3, $4)
                    "#,
                )
                .bind(worker_id)
                .bind(id)
                .bind(target_id)
                .bind(amount)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    sqlx::query(
        r#"
        UPDATE shifts
        SET status = 'closed', closed_at = NOW(), closed_by_user_id = $2, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(user.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(fetch_shift(&state.db, id).await?))
}

async fn cancel_shift(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftResponse>> {
    auth::require_permission(&user, "shifts:cancel")?;
    let result = sqlx::query(
        r#"
        UPDATE shifts
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'draft'
        "#,
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        let (_, status) = shift_outlet_status(&state.db, id).await?;
        return Err(AppError::BadRequest(format!(
            "Shift hanya bisa di-cancel dari status draft (status saat ini: {status})"
        )));
    }
    Ok(Json(fetch_shift(&state.db, id).await?))
}

async fn list_shift_workers(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftWorkersResponse>> {
    require_shift_read_access(&state.db, &user, id).await?;

    let workers = sqlx::query_as::<_, ShiftWorkerResponse>(
        r#"
        SELECT sw.shift_id, sw.worker_id, w.code, w.name, sw.created_at
        FROM shift_workers sw
        JOIN workers w ON w.id = sw.worker_id
        WHERE sw.shift_id = $1
        ORDER BY w.name ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ShiftWorkersResponse { value: workers }))
}

async fn add_shift_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<AddShiftWorkerRequest>,
) -> Result<(StatusCode, Json<ShiftWorkerResponse>)> {
    auth::require_permission(&user, "shift_workers:manage")?;
    let (outlet_id, status) = shift_outlet_status(&state.db, id).await?;

    if status != "draft" && status != "open" {
        return Err(AppError::BadRequest(
            "Worker hanya bisa ditambahkan saat shift draft atau open".into(),
        ));
    }

    // Worker must be active with an active assignment to the shift's outlet.
    let ok = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM workers w
            JOIN worker_outlets wo ON wo.worker_id = w.id
            WHERE w.id = $1
              AND w.is_active = TRUE
              AND wo.outlet_id = $2
              AND wo.is_active = TRUE
        )
        "#,
    )
    .bind(body.worker_id)
    .bind(outlet_id)
    .fetch_one(&state.db)
    .await?;
    if !ok {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "worker_id",
            "Worker harus aktif dan punya assignment aktif di outlet shift",
        ));
    }

    let already = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM shift_workers WHERE shift_id = $1 AND worker_id = $2)",
    )
    .bind(id)
    .bind(body.worker_id)
    .fetch_one(&state.db)
    .await?;
    if already {
        return Err(AppError::BadRequest(
            "Worker sudah ada pada shift ini".into(),
        ));
    }

    sqlx::query("INSERT INTO shift_workers (shift_id, worker_id) VALUES ($1, $2)")
        .bind(id)
        .bind(body.worker_id)
        .execute(&state.db)
        .await?;

    let added = sqlx::query_as::<_, ShiftWorkerResponse>(
        r#"
        SELECT sw.shift_id, sw.worker_id, w.code, w.name, sw.created_at
        FROM shift_workers sw
        JOIN workers w ON w.id = sw.worker_id
        WHERE sw.shift_id = $1 AND sw.worker_id = $2
        "#,
    )
    .bind(id)
    .bind(body.worker_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(added)))
}

async fn remove_shift_worker(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((id, worker_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "shift_workers:manage")?;
    let (_, status) = shift_outlet_status(&state.db, id).await?;
    if status == "closed" {
        return Err(AppError::BadRequest(
            "Tidak bisa menghapus worker dari shift yang sudah closed".into(),
        ));
    }

    let result =
        sqlx::query("DELETE FROM shift_workers WHERE shift_id = $1 AND worker_id = $2")
            .bind(id)
            .bind(worker_id)
            .execute(&state.db)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Worker tidak ditemukan pada shift ini".into(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn list_outlet_open_shifts(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
) -> Result<Json<ShiftsResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    let sql = format!(
        "{SHIFT_SELECT} WHERE s.outlet_id = $1 AND s.status = 'open' ORDER BY s.work_date DESC, s.created_at DESC"
    );
    let shifts = sqlx::query_as::<_, ShiftResponse>(&sql)
        .bind(outlet_id)
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ShiftsResponse { value: shifts }))
}
