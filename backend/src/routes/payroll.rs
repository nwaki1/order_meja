use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

// ---------- Responses ----------

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SalarySettingResponse {
    pub worker_id: Uuid,
    pub base_salary: i64,
    pub is_active: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PayrollPeriodResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub tenant_code: String,
    pub tenant_name: String,
    pub year: i32,
    pub month: i32,
    pub status: String,
    pub finalized_at: Option<chrono::DateTime<chrono::Utc>>,
    pub finalized_by_user_id: Option<Uuid>,
    pub worker_count: i64,
    pub total_payroll: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataPeriodListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<PayrollPeriodResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PayrollResponse {
    pub id: Uuid,
    pub payroll_period_id: Uuid,
    pub year: i32,
    pub month: i32,
    pub tenant_id: Uuid,
    pub worker_id: Uuid,
    pub worker_code: String,
    pub worker_name: String,
    pub base_salary: i64,
    pub incentive_total: i64,
    pub adjustment_total: i64,
    pub deduction_total: i64,
    pub grand_total: i64,
    pub status: String,
    pub calculated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub finalized_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataPayrollListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<PayrollResponse>,
}

#[derive(Debug, Serialize)]
pub struct PayrollPeriodDetailResponse {
    #[serde(flatten)]
    pub period: PayrollPeriodResponse,
    pub payrolls: Vec<PayrollResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PayrollItemResponse {
    pub id: Uuid,
    pub payroll_id: Uuid,
    pub item_type: String,
    pub source_type: String,
    pub source_id: Option<Uuid>,
    pub description: String,
    pub amount: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct PayrollDetailResponse {
    #[serde(flatten)]
    pub payroll: PayrollResponse,
    pub items: Vec<PayrollItemResponse>,
}

// ---------- Requests ----------

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateSalarySettingRequest {
    pub base_salary: i64,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreatePayrollPeriodRequest {
    pub tenant_id: Uuid,
    pub year: i32,
    pub month: i32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddPayrollItemRequest {
    pub item_type: String,
    pub description: String,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
pub struct PeriodListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub tenant_id: Option<Uuid>,
    pub year: Option<i32>,
    pub month: Option<i32>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WorkerPayrollQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub year: Option<i32>,
    pub status: Option<String>,
}

fn default_top() -> u32 {
    20
}

// ---------- Routers ----------

// Merged into the /workers nest.
pub fn worker_router() -> Router<AppState> {
    Router::<AppState>::new()
        .route(
            "/:id/salary-setting",
            get(get_salary_setting).put(update_salary_setting),
        )
        .route("/:id/payrolls", get(list_worker_payrolls))
}

// /payroll-periods
pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_periods).post(create_period))
        .route("/:id", get(get_period))
        .route("/:id/calculate", post(calculate_period))
        .route("/:id/finalize", post(finalize_period))
        .route("/:id/cancel", post(cancel_period))
}

// /payrolls
pub fn payroll_router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/:id", get(get_payroll))
        .route("/:id/items", post(add_payroll_item))
        .route(
            "/:id/items/:item_id",
            axum::routing::delete(delete_payroll_item),
        )
}

const PAYROLL_SELECT: &str = r#"
    SELECT
        p.id, p.payroll_period_id, pp.year, pp.month, pp.tenant_id,
        p.worker_id, w.code AS worker_code, w.name AS worker_name,
        p.base_salary, p.incentive_total, p.adjustment_total, p.deduction_total,
        p.grand_total, p.status, p.calculated_at, p.finalized_at,
        p.created_at, p.updated_at
    FROM payrolls p
    JOIN payroll_periods pp ON pp.id = p.payroll_period_id
    JOIN workers w ON w.id = p.worker_id
"#;

const PERIOD_SELECT: &str = r#"
    SELECT
        pp.id, pp.tenant_id, t.code AS tenant_code, t.name AS tenant_name,
        pp.year, pp.month, pp.status, pp.finalized_at, pp.finalized_by_user_id,
        (SELECT COUNT(*) FROM payrolls p WHERE p.payroll_period_id = pp.id) AS worker_count,
        (SELECT COALESCE(SUM(p.grand_total), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_payroll,
        pp.created_at, pp.updated_at
    FROM payroll_periods pp
    JOIN tenants t ON t.id = pp.tenant_id
"#;

// ---------- Helpers ----------

fn month_range(year: i32, month: u32) -> (NaiveDate, NaiveDate) {
    let start = NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    let end = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1).unwrap()
    };
    (start, end)
}

async fn worker_tenant(db: &sqlx::PgPool, worker_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT tenant_id FROM workers WHERE id = $1")
        .bind(worker_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Worker tidak ditemukan".into()))
}

// Tenant-scoped read: admins holding `bypass_perm` see everything; otherwise the
// user needs an active assignment to the tenant.
async fn require_tenant_read(
    db: &sqlx::PgPool,
    user: &auth::AuthUser,
    tenant_id: Uuid,
    bypass_perm: &str,
) -> Result<()> {
    if user.permissions.contains(bypass_perm) {
        return Ok(());
    }
    let ok = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM user_tenants ut
            WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.is_active = TRUE
        )
        "#,
    )
    .bind(user.id)
    .bind(tenant_id)
    .fetch_one(db)
    .await?;
    if ok {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

async fn fetch_period(db: &sqlx::PgPool, id: Uuid) -> Result<PayrollPeriodResponse> {
    let sql = format!("{PERIOD_SELECT} WHERE pp.id = $1");
    sqlx::query_as::<_, PayrollPeriodResponse>(&sql)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Payroll period tidak ditemukan".into()))
}

async fn fetch_payroll(db: &sqlx::PgPool, id: Uuid) -> Result<PayrollResponse> {
    let sql = format!("{PAYROLL_SELECT} WHERE p.id = $1");
    sqlx::query_as::<_, PayrollResponse>(&sql)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Payroll tidak ditemukan".into()))
}

// Recomputes payroll totals from its items; rejects a negative grand total.
async fn recompute_payroll(conn: &mut sqlx::PgConnection, payroll_id: Uuid) -> Result<()> {
    let (base, inc, adj, ded) = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        r#"
        SELECT
            COALESCE(SUM(amount) FILTER (WHERE item_type = 'base_salary'), 0)::BIGINT,
            COALESCE(SUM(amount) FILTER (WHERE item_type = 'incentive'), 0)::BIGINT,
            COALESCE(SUM(amount) FILTER (WHERE item_type = 'adjustment'), 0)::BIGINT,
            COALESCE(SUM(amount) FILTER (WHERE item_type = 'deduction'), 0)::BIGINT
        FROM payroll_items
        WHERE payroll_id = $1
        "#,
    )
    .bind(payroll_id)
    .fetch_one(&mut *conn)
    .await?;

    let grand = base + inc + adj - ded;
    if grand < 0 {
        return Err(AppError::BadRequest(
            "Grand total payroll tidak boleh negatif".into(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE payrolls SET
            base_salary = $2, incentive_total = $3, adjustment_total = $4,
            deduction_total = $5, grand_total = $6, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(payroll_id)
    .bind(base)
    .bind(inc)
    .bind(adj)
    .bind(ded)
    .bind(grand)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

// ---------- Salary settings ----------

async fn get_salary_setting(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(worker_id): Path<Uuid>,
) -> Result<Json<SalarySettingResponse>> {
    let tenant_id = worker_tenant(&state.db, worker_id).await?;
    require_tenant_read(&state.db, &user, tenant_id, "worker_salary_settings:read").await?;

    let setting = sqlx::query_as::<_, SalarySettingResponse>(
        r#"
        SELECT worker_id, base_salary, is_active, created_at, updated_at
        FROM worker_salary_settings
        WHERE worker_id = $1
        "#,
    )
    .bind(worker_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(setting.unwrap_or(SalarySettingResponse {
        worker_id,
        base_salary: 0,
        is_active: false,
        created_at: None,
        updated_at: None,
    })))
}

async fn update_salary_setting(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(worker_id): Path<Uuid>,
    Json(body): Json<UpdateSalarySettingRequest>,
) -> Result<Json<SalarySettingResponse>> {
    auth::require_permission(&user, "worker_salary_settings:update")?;

    let is_worker_active =
        sqlx::query_scalar::<_, bool>("SELECT is_active FROM workers WHERE id = $1")
            .bind(worker_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Worker tidak ditemukan".into()))?;
    if !is_worker_active {
        return Err(AppError::BadRequest(
            "Worker tidak aktif, tidak bisa mengatur gaji".into(),
        ));
    }

    if body.base_salary < 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "base_salary",
            "Gaji pokok tidak boleh negatif",
        ));
    }
    let is_active = body.is_active.unwrap_or(true);

    let setting = sqlx::query_as::<_, SalarySettingResponse>(
        r#"
        INSERT INTO worker_salary_settings (worker_id, base_salary, is_active)
        VALUES ($1, $2, $3)
        ON CONFLICT (worker_id) DO UPDATE
            SET base_salary = EXCLUDED.base_salary,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        RETURNING worker_id, base_salary, is_active, created_at, updated_at
        "#,
    )
    .bind(worker_id)
    .bind(body.base_salary)
    .bind(is_active)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(setting))
}

async fn list_worker_payrolls(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(worker_id): Path<Uuid>,
    Query(params): Query<WorkerPayrollQuery>,
) -> Result<Json<ODataPayrollListResponse>> {
    let tenant_id = worker_tenant(&state.db, worker_id).await?;
    require_tenant_read(&state.db, &user, tenant_id, "payrolls:read").await?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;

    let push_filters = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        qb.push(" WHERE p.worker_id = ").push_bind(worker_id);
        if let Some(year) = params.year {
            qb.push(" AND pp.year = ").push_bind(year);
        }
        if let Some(ref status) = params.status {
            qb.push(" AND p.status = ").push_bind(status.clone());
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            "SELECT COUNT(*) FROM payrolls p JOIN payroll_periods pp ON pp.id = p.payroll_period_id",
        );
        push_filters(&mut cq);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(PAYROLL_SELECT);
    push_filters(&mut dq);
    dq.push(" ORDER BY pp.year DESC, pp.month DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let payrolls = dq
        .build_query_as::<PayrollResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataPayrollListResponse {
        odata_count,
        value: payrolls,
    }))
}

// ---------- Payroll periods ----------

async fn list_periods(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PeriodListQuery>,
) -> Result<Json<ODataPeriodListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let can_read_all = user.permissions.contains("payroll_periods:read");

    let push_filters = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        qb.push(" WHERE TRUE");
        if !can_read_all {
            qb.push(
                " AND EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.tenant_id = pp.tenant_id AND ut.is_active = TRUE AND ut.user_id = ",
            )
            .push_bind(user.id)
            .push(")");
        }
        if let Some(tid) = params.tenant_id {
            qb.push(" AND pp.tenant_id = ").push_bind(tid);
        }
        if let Some(year) = params.year {
            qb.push(" AND pp.year = ").push_bind(year);
        }
        if let Some(month) = params.month {
            qb.push(" AND pp.month = ").push_bind(month);
        }
        if let Some(ref status) = params.status {
            qb.push(" AND pp.status = ").push_bind(status.clone());
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM payroll_periods pp");
        push_filters(&mut cq);
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(PERIOD_SELECT);
    push_filters(&mut dq);
    dq.push(" ORDER BY pp.year DESC, pp.month DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let periods = dq
        .build_query_as::<PayrollPeriodResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataPeriodListResponse {
        odata_count,
        value: periods,
    }))
}

async fn create_period(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreatePayrollPeriodRequest>,
) -> Result<(StatusCode, Json<PayrollPeriodResponse>)> {
    auth::require_permission(&user, "payroll_periods:create")?;

    if !(1..=12).contains(&body.month) {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "month",
            "Bulan harus 1-12",
        ));
    }
    if body.year < 2000 || body.year > 2100 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "year",
            "Tahun tidak valid",
        ));
    }

    let tenant_active =
        sqlx::query_scalar::<_, bool>("SELECT is_active FROM tenants WHERE id = $1")
            .bind(body.tenant_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Tenant tidak ditemukan".into()))?;
    if !tenant_active {
        return Err(AppError::BadRequest("Tenant tidak aktif".into()));
    }

    let id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO payroll_periods (tenant_id, year, month)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(body.tenant_id)
    .bind(body.year)
    .bind(body.month)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("idx_payroll_periods_tenant_year_month") {
                return AppError::validation(
                    "Lengkapi field yang required atau isi teks yang sesuai.",
                    "month",
                    "Payroll period untuk tenant, tahun, dan bulan ini sudah ada",
                );
            }
        }
        AppError::Database(e)
    })?;

    Ok((
        StatusCode::CREATED,
        Json(fetch_period(&state.db, id).await?),
    ))
}

async fn get_period(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PayrollPeriodDetailResponse>> {
    let period = fetch_period(&state.db, id).await?;
    require_tenant_read(&state.db, &user, period.tenant_id, "payroll_periods:read").await?;

    let sql = format!("{PAYROLL_SELECT} WHERE p.payroll_period_id = $1 ORDER BY w.name ASC");
    let payrolls = sqlx::query_as::<_, PayrollResponse>(&sql)
        .bind(id)
        .fetch_all(&state.db)
        .await?;

    Ok(Json(PayrollPeriodDetailResponse { period, payrolls }))
}

async fn calculate_period(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PayrollPeriodDetailResponse>> {
    auth::require_permission(&user, "payroll_periods:calculate")?;

    let mut tx = state.db.begin().await?;

    let period = sqlx::query_as::<_, (Uuid, String, i32, i32)>(
        "SELECT tenant_id, status, year, month FROM payroll_periods WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Payroll period tidak ditemukan".into()))?;
    let (tenant_id, status, year, month) = period;

    if status != "draft" {
        return Err(AppError::BadRequest(
            "Hanya payroll period draft yang dapat dihitung".into(),
        ));
    }

    let (start, end) = month_range(year, month as u32);

    let worker_ids = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM workers WHERE tenant_id = $1 AND is_active = TRUE ORDER BY id ASC",
    )
    .bind(tenant_id)
    .fetch_all(&mut *tx)
    .await?;

    for worker_id in &worker_ids {
        let base_salary = sqlx::query_scalar::<_, i64>(
            "SELECT base_salary FROM worker_salary_settings WHERE worker_id = $1 AND is_active = TRUE",
        )
        .bind(worker_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(0);

        // Create or refresh the draft payroll row.
        let payroll_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO payrolls (payroll_period_id, worker_id, status, calculated_at)
            VALUES ($1, $2, 'draft', NOW())
            ON CONFLICT (payroll_period_id, worker_id)
            DO UPDATE SET calculated_at = NOW(), updated_at = NOW()
            RETURNING id
            "#,
        )
        .bind(id)
        .bind(worker_id)
        .fetch_one(&mut *tx)
        .await?;

        // Remove auto-generated items only; keep manual adjustments/deductions.
        sqlx::query(
            "DELETE FROM payroll_items WHERE payroll_id = $1 AND source_type IN ('salary_setting', 'worker_incentive')",
        )
        .bind(payroll_id)
        .execute(&mut *tx)
        .await?;

        // Base salary item.
        sqlx::query(
            r#"
            INSERT INTO payroll_items (payroll_id, item_type, source_type, description, amount)
            VALUES ($1, 'base_salary', 'salary_setting', 'Gaji pokok', $2)
            "#,
        )
        .bind(payroll_id)
        .bind(base_salary)
        .execute(&mut *tx)
        .await?;

        // Incentive items: worker_incentives whose shift work_date falls in the month.
        let incentives = sqlx::query_as::<_, (Uuid, i64, String, NaiveDate)>(
            r#"
            SELECT wi.id, wi.amount, s.name_snapshot, s.work_date
            FROM worker_incentives wi
            JOIN shifts s ON s.id = wi.shift_id
            WHERE wi.worker_id = $1
              AND s.work_date >= $2
              AND s.work_date < $3
            ORDER BY s.work_date ASC
            "#,
        )
        .bind(worker_id)
        .bind(start)
        .bind(end)
        .fetch_all(&mut *tx)
        .await?;

        for (incentive_id, amount, shift_name, work_date) in &incentives {
            sqlx::query(
                r#"
                INSERT INTO payroll_items
                    (payroll_id, item_type, source_type, source_id, description, amount)
                VALUES ($1, 'incentive', 'worker_incentive', $2, $3, $4)
                "#,
            )
            .bind(payroll_id)
            .bind(incentive_id)
            .bind(format!("Insentif {shift_name} ({work_date})"))
            .bind(amount)
            .execute(&mut *tx)
            .await?;
        }

        recompute_payroll(&mut tx, payroll_id).await?;
    }

    sqlx::query("UPDATE payroll_periods SET updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    let period = fetch_period(&state.db, id).await?;
    let sql = format!("{PAYROLL_SELECT} WHERE p.payroll_period_id = $1 ORDER BY w.name ASC");
    let payrolls = sqlx::query_as::<_, PayrollResponse>(&sql)
        .bind(id)
        .fetch_all(&state.db)
        .await?;

    Ok(Json(PayrollPeriodDetailResponse { period, payrolls }))
}

async fn finalize_period(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PayrollPeriodResponse>> {
    auth::require_permission(&user, "payroll_periods:finalize")?;

    let mut tx = state.db.begin().await?;

    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM payroll_periods WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Payroll period tidak ditemukan".into()))?;

    if status != "draft" {
        return Err(AppError::BadRequest(
            "Hanya payroll period draft yang dapat difinalisasi".into(),
        ));
    }

    let payroll_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM payrolls WHERE payroll_period_id = $1")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    if payroll_count == 0 {
        return Err(AppError::BadRequest(
            "Payroll belum dihitung. Jalankan calculate terlebih dahulu".into(),
        ));
    }

    let has_negative = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM payrolls WHERE payroll_period_id = $1 AND grand_total < 0)",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if has_negative {
        return Err(AppError::BadRequest(
            "Ada payroll dengan grand total negatif".into(),
        ));
    }

    sqlx::query(
        "UPDATE payrolls SET status = 'finalized', finalized_at = NOW(), updated_at = NOW() WHERE payroll_period_id = $1 AND status = 'draft'",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE payroll_periods
        SET status = 'finalized', finalized_at = NOW(), finalized_by_user_id = $2, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(user.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(fetch_period(&state.db, id).await?))
}

async fn cancel_period(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PayrollPeriodResponse>> {
    auth::require_permission(&user, "payroll_periods:cancel")?;

    let result = sqlx::query(
        "UPDATE payroll_periods SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'draft'",
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        let status =
            sqlx::query_scalar::<_, String>("SELECT status FROM payroll_periods WHERE id = $1")
                .bind(id)
                .fetch_optional(&state.db)
                .await?
                .ok_or_else(|| AppError::NotFound("Payroll period tidak ditemukan".into()))?;
        return Err(AppError::BadRequest(format!(
            "Hanya payroll period draft yang dapat dibatalkan (status: {status})"
        )));
    }

    Ok(Json(fetch_period(&state.db, id).await?))
}

// ---------- Payroll detail + manual items ----------

async fn get_payroll(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PayrollDetailResponse>> {
    let payroll = fetch_payroll(&state.db, id).await?;
    require_tenant_read(&state.db, &user, payroll.tenant_id, "payrolls:read").await?;

    let items = sqlx::query_as::<_, PayrollItemResponse>(
        r#"
        SELECT id, payroll_id, item_type, source_type, source_id, description, amount, created_at
        FROM payroll_items
        WHERE payroll_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(PayrollDetailResponse { payroll, items }))
}

async fn payroll_status(db: &sqlx::PgPool, payroll_id: Uuid) -> Result<String> {
    sqlx::query_scalar::<_, String>("SELECT status FROM payrolls WHERE id = $1")
        .bind(payroll_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Payroll tidak ditemukan".into()))
}

async fn add_payroll_item(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<AddPayrollItemRequest>,
) -> Result<(StatusCode, Json<PayrollDetailResponse>)> {
    auth::require_permission(&user, "payroll_items:manage")?;

    if body.item_type != "adjustment" && body.item_type != "deduction" {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "item_type",
            "Manual item hanya boleh adjustment atau deduction",
        ));
    }
    if body.amount < 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "amount",
            "Amount tidak boleh negatif",
        ));
    }
    let description = body.description.trim();
    if description.is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "description",
            "Deskripsi wajib diisi",
        ));
    }

    if payroll_status(&state.db, id).await? != "draft" {
        return Err(AppError::BadRequest(
            "Hanya payroll draft yang dapat ditambah item".into(),
        ));
    }

    let mut tx = state.db.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO payroll_items (payroll_id, item_type, source_type, description, amount)
        VALUES ($1, $2, 'manual', $3, $4)
        "#,
    )
    .bind(id)
    .bind(&body.item_type)
    .bind(description)
    .bind(body.amount)
    .execute(&mut *tx)
    .await?;

    recompute_payroll(&mut tx, id).await?;
    tx.commit().await?;

    let payroll = fetch_payroll(&state.db, id).await?;
    let items = sqlx::query_as::<_, PayrollItemResponse>(
        r#"
        SELECT id, payroll_id, item_type, source_type, source_id, description, amount, created_at
        FROM payroll_items WHERE payroll_id = $1 ORDER BY created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(PayrollDetailResponse { payroll, items }),
    ))
}

async fn delete_payroll_item(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((id, item_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "payroll_items:manage")?;

    if payroll_status(&state.db, id).await? != "draft" {
        return Err(AppError::BadRequest(
            "Hanya payroll draft yang dapat dihapus itemnya".into(),
        ));
    }

    let mut tx = state.db.begin().await?;
    // Only manual items can be removed via this endpoint.
    let result = sqlx::query(
        "DELETE FROM payroll_items WHERE id = $1 AND payroll_id = $2 AND source_type = 'manual'",
    )
    .bind(item_id)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "Item manual tidak ditemukan pada payroll ini".into(),
        ));
    }

    recompute_payroll(&mut tx, id).await?;
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
