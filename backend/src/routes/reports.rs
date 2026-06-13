use crate::{auth, AppState, Result};
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;
use uuid::Uuid;

// ---------- Query params ----------

#[derive(Debug, Deserialize)]
pub struct DashboardQuery {
    pub tenant_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct SalesQuery {
    pub tenant_id: Option<Uuid>,
    pub outlet_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub group_by: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProductSalesQuery {
    pub tenant_id: Option<Uuid>,
    pub outlet_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct StockQuery {
    pub tenant_id: Option<Uuid>,
    pub outlet_id: Option<Uuid>,
    pub only_low: Option<bool>,
    pub threshold: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ShiftPerfQuery {
    pub tenant_id: Option<Uuid>,
    pub outlet_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WorkerIncentiveQuery {
    pub tenant_id: Option<Uuid>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayrollSummaryQuery {
    pub tenant_id: Option<Uuid>,
    pub year: Option<i32>,
    pub status: Option<String>,
}

// ---------- Responses ----------

#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub today_transaction_count: i64,
    pub today_revenue: i64,
    pub month_transaction_count: i64,
    pub month_revenue: i64,
    pub active_outlet_count: i64,
    pub active_worker_count: i64,
    pub active_product_count: i64,
    pub open_shift_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SalesRow {
    pub label: String,
    pub transaction_count: i64,
    pub gross_revenue: i64,
    pub total_discount: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProductSalesRow {
    pub product_id: Uuid,
    pub sku: String,
    pub name: String,
    pub quantity_sold: i64,
    pub revenue: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StockRow {
    pub outlet_id: Uuid,
    pub outlet_name: String,
    pub product_id: Uuid,
    pub sku: String,
    pub name: String,
    pub unit: String,
    pub quantity: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftPerfRow {
    pub shift_id: Uuid,
    pub outlet_name: String,
    pub work_date: chrono::NaiveDate,
    pub name_snapshot: String,
    pub status: String,
    pub worker_count: i64,
    pub revenue: i64,
    pub target_value: Option<i64>,
    pub actual_value: Option<i64>,
    pub is_achieved: Option<bool>,
    pub incentive_total: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct WorkerIncentiveRow {
    pub worker_id: Uuid,
    pub worker_code: String,
    pub worker_name: String,
    pub tenant_name: String,
    pub incentive_count: i64,
    pub incentive_total: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PayrollSummaryRow {
    pub payroll_period_id: Uuid,
    pub tenant_name: String,
    pub year: i32,
    pub month: i32,
    pub status: String,
    pub worker_count: i64,
    pub total_base: i64,
    pub total_incentive: i64,
    pub total_adjustment: i64,
    pub total_deduction: i64,
    pub total_grand: i64,
}

#[derive(Debug, Serialize)]
pub struct ListResponse<T> {
    pub value: Vec<T>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/dashboard", get(dashboard))
        .route("/sales", get(sales_report))
        .route("/product-sales", get(product_sales_report))
        .route("/stock", get(stock_report))
        .route("/shift-performance", get(shift_performance_report))
        .route("/worker-incentives", get(worker_incentive_report))
        .route("/payroll-summary", get(payroll_summary_report))
}

// Applies an optional date range over a date-typed SQL expression.
fn push_date_range(
    qb: &mut QueryBuilder<sqlx::Postgres>,
    expr: &str,
    from: &Option<String>,
    to: &Option<String>,
) {
    if let Some(d) = from {
        qb.push(format!(" AND {expr} >= "))
            .push_bind(d.clone())
            .push("::date");
    }
    if let Some(d) = to {
        qb.push(format!(" AND {expr} <= "))
            .push_bind(d.clone())
            .push("::date");
    }
}

async fn dashboard(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<DashboardQuery>,
) -> Result<Json<DashboardResponse>> {
    auth::require_permission(&user, "reports:read")?;
    let tid = params.tenant_id;

    // Today's and this month's completed sales, optionally scoped to a tenant
    // (via the outlet's active ownership).
    let (today_count, today_revenue) = sqlx::query_as::<_, (i64, i64)>(
        r#"
        SELECT COUNT(*), COALESCE(SUM(total_amount), 0)::BIGINT
        FROM transactions t
        WHERE t.status = 'completed'
          AND t.transaction_at::date = CURRENT_DATE
          AND ($1::uuid IS NULL OR EXISTS (
              SELECT 1 FROM outlet_ownerships oo
              WHERE oo.outlet_id = t.outlet_id AND oo.valid_until IS NULL AND oo.tenant_id = $1))
        "#,
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    let (month_count, month_revenue) = sqlx::query_as::<_, (i64, i64)>(
        r#"
        SELECT COUNT(*), COALESCE(SUM(total_amount), 0)::BIGINT
        FROM transactions t
        WHERE t.status = 'completed'
          AND to_char(t.transaction_at, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
          AND ($1::uuid IS NULL OR EXISTS (
              SELECT 1 FROM outlet_ownerships oo
              WHERE oo.outlet_id = t.outlet_id AND oo.valid_until IS NULL AND oo.tenant_id = $1))
        "#,
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    let active_outlet_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM outlets o
        WHERE o.is_active = TRUE
          AND ($1::uuid IS NULL OR EXISTS (
              SELECT 1 FROM outlet_ownerships oo
              WHERE oo.outlet_id = o.id AND oo.valid_until IS NULL AND oo.tenant_id = $1))
        "#,
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    let active_worker_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM workers WHERE is_active = TRUE AND ($1::uuid IS NULL OR tenant_id = $1)",
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    let active_product_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM products WHERE is_active = TRUE AND ($1::uuid IS NULL OR tenant_id = $1)",
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    let open_shift_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM shifts s
        WHERE s.status = 'open'
          AND ($1::uuid IS NULL OR EXISTS (
              SELECT 1 FROM outlet_ownerships oo
              WHERE oo.outlet_id = s.outlet_id AND oo.valid_until IS NULL AND oo.tenant_id = $1))
        "#,
    )
    .bind(tid)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(DashboardResponse {
        today_transaction_count: today_count,
        today_revenue,
        month_transaction_count: month_count,
        month_revenue,
        active_outlet_count,
        active_worker_count,
        active_product_count,
        open_shift_count,
    }))
}

fn push_tenant_filter(qb: &mut QueryBuilder<sqlx::Postgres>, tenant_id: Option<Uuid>) {
    if let Some(tid) = tenant_id {
        qb.push(
            " AND EXISTS (SELECT 1 FROM outlet_ownerships oo WHERE oo.outlet_id = t.outlet_id AND oo.valid_until IS NULL AND oo.tenant_id = ",
        )
        .push_bind(tid)
        .push(")");
    }
}

async fn sales_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<SalesQuery>,
) -> Result<Json<ListResponse<SalesRow>>> {
    auth::require_permission(&user, "reports:read")?;

    let group_expr = match params.group_by.as_deref() {
        Some("outlet") => "o.name",
        Some("month") => "to_char(t.transaction_at, 'YYYY-MM')",
        _ => "t.transaction_at::date::text",
    };

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(format!(
        r#"
        SELECT
            {group_expr} AS label,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(t.total_amount), 0)::BIGINT AS gross_revenue,
            COALESCE(SUM(t.discount_amount), 0)::BIGINT AS total_discount
        FROM transactions t
        JOIN outlets o ON o.id = t.outlet_id
        WHERE t.status = 'completed'
        "#
    ));
    if let Some(oid) = params.outlet_id {
        qb.push(" AND t.outlet_id = ").push_bind(oid);
    }
    push_tenant_filter(&mut qb, params.tenant_id);
    push_date_range(
        &mut qb,
        "t.transaction_at::date",
        &params.date_from,
        &params.date_to,
    );
    qb.push(format!(
        " GROUP BY {group_expr} ORDER BY {group_expr} DESC LIMIT 366"
    ));

    let rows = qb.build_query_as::<SalesRow>().fetch_all(&state.db).await?;
    Ok(Json(ListResponse { value: rows }))
}

async fn product_sales_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ProductSalesQuery>,
) -> Result<Json<ListResponse<ProductSalesRow>>> {
    auth::require_permission(&user, "reports:read")?;
    let limit = params.limit.unwrap_or(20).min(200) as i64;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            ti.product_id,
            MAX(ti.sku_snapshot) AS sku,
            MAX(ti.product_name_snapshot) AS name,
            COALESCE(SUM(ti.quantity), 0)::BIGINT AS quantity_sold,
            COALESCE(SUM(ti.subtotal), 0)::BIGINT AS revenue
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
        "#,
    );
    if let Some(oid) = params.outlet_id {
        qb.push(" AND t.outlet_id = ").push_bind(oid);
    }
    push_tenant_filter(&mut qb, params.tenant_id);
    push_date_range(
        &mut qb,
        "t.transaction_at::date",
        &params.date_from,
        &params.date_to,
    );
    qb.push(" GROUP BY ti.product_id ORDER BY revenue DESC LIMIT ")
        .push_bind(limit);

    let rows = qb
        .build_query_as::<ProductSalesRow>()
        .fetch_all(&state.db)
        .await?;
    Ok(Json(ListResponse { value: rows }))
}

async fn stock_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<StockQuery>,
) -> Result<Json<ListResponse<StockRow>>> {
    auth::require_permission(&user, "reports:read")?;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            os.outlet_id, o.name AS outlet_name,
            os.product_id, p.sku, p.name, p.unit,
            os.quantity
        FROM outlet_stocks os
        JOIN products p ON p.id = os.product_id
        JOIN outlets o ON o.id = os.outlet_id
        WHERE p.is_stock_tracked = TRUE
        "#,
    );
    if let Some(oid) = params.outlet_id {
        qb.push(" AND os.outlet_id = ").push_bind(oid);
    }
    if let Some(tid) = params.tenant_id {
        qb.push(" AND p.tenant_id = ").push_bind(tid);
    }
    if params.only_low.unwrap_or(false) {
        let threshold = params.threshold.unwrap_or(5);
        qb.push(" AND os.quantity <= ").push_bind(threshold);
    }
    qb.push(" ORDER BY os.quantity ASC, p.name ASC LIMIT 500");

    let rows = qb.build_query_as::<StockRow>().fetch_all(&state.db).await?;
    Ok(Json(ListResponse { value: rows }))
}

async fn shift_performance_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ShiftPerfQuery>,
) -> Result<Json<ListResponse<ShiftPerfRow>>> {
    auth::require_permission(&user, "reports:read")?;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            s.id AS shift_id,
            o.name AS outlet_name,
            s.work_date,
            s.name_snapshot,
            s.status,
            (SELECT COUNT(*) FROM shift_workers sw WHERE sw.shift_id = s.id) AS worker_count,
            (SELECT COALESCE(SUM(tr.total_amount), 0)::BIGINT FROM transactions tr
                WHERE tr.shift_id = s.id AND tr.status = 'completed') AS revenue,
            (SELECT st.target_value FROM shift_targets st
                WHERE st.shift_id = s.id AND st.target_type = 'revenue' AND st.is_active = TRUE
                LIMIT 1) AS target_value,
            (SELECT r.actual_value FROM shift_target_results r
                JOIN shift_targets st2 ON st2.id = r.shift_target_id
                WHERE st2.shift_id = s.id AND st2.target_type = 'revenue'
                LIMIT 1) AS actual_value,
            (SELECT r.is_achieved FROM shift_target_results r
                JOIN shift_targets st3 ON st3.id = r.shift_target_id
                WHERE st3.shift_id = s.id AND st3.target_type = 'revenue'
                LIMIT 1) AS is_achieved,
            (SELECT COALESCE(SUM(wi.amount), 0)::BIGINT FROM worker_incentives wi
                WHERE wi.shift_id = s.id) AS incentive_total
        FROM shifts s
        JOIN outlets o ON o.id = s.outlet_id
        WHERE TRUE
        "#,
    );
    if let Some(oid) = params.outlet_id {
        qb.push(" AND s.outlet_id = ").push_bind(oid);
    }
    if let Some(tid) = params.tenant_id {
        qb.push(
            " AND EXISTS (SELECT 1 FROM outlet_ownerships oo WHERE oo.outlet_id = s.outlet_id AND oo.valid_until IS NULL AND oo.tenant_id = ",
        )
        .push_bind(tid)
        .push(")");
    }
    if let Some(ref status) = params.status {
        qb.push(" AND s.status = ").push_bind(status.clone());
    }
    push_date_range(&mut qb, "s.work_date", &params.date_from, &params.date_to);
    qb.push(" ORDER BY s.work_date DESC, s.created_at DESC LIMIT 500");

    let rows = qb
        .build_query_as::<ShiftPerfRow>()
        .fetch_all(&state.db)
        .await?;
    Ok(Json(ListResponse { value: rows }))
}

async fn worker_incentive_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<WorkerIncentiveQuery>,
) -> Result<Json<ListResponse<WorkerIncentiveRow>>> {
    auth::require_permission(&user, "reports:read")?;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            w.id AS worker_id, w.code AS worker_code, w.name AS worker_name,
            tn.name AS tenant_name,
            COUNT(*) AS incentive_count,
            COALESCE(SUM(wi.amount), 0)::BIGINT AS incentive_total
        FROM worker_incentives wi
        JOIN workers w ON w.id = wi.worker_id
        JOIN tenants tn ON tn.id = w.tenant_id
        JOIN shifts s ON s.id = wi.shift_id
        WHERE TRUE
        "#,
    );
    if let Some(tid) = params.tenant_id {
        qb.push(" AND w.tenant_id = ").push_bind(tid);
    }
    push_date_range(&mut qb, "s.work_date", &params.date_from, &params.date_to);
    qb.push(" GROUP BY w.id, w.code, w.name, tn.name ORDER BY incentive_total DESC LIMIT 500");

    let rows = qb
        .build_query_as::<WorkerIncentiveRow>()
        .fetch_all(&state.db)
        .await?;
    Ok(Json(ListResponse { value: rows }))
}

async fn payroll_summary_report(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PayrollSummaryQuery>,
) -> Result<Json<ListResponse<PayrollSummaryRow>>> {
    auth::require_permission(&user, "reports:read")?;

    let mut qb: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            pp.id AS payroll_period_id,
            t.name AS tenant_name,
            pp.year, pp.month, pp.status,
            (SELECT COUNT(*) FROM payrolls p WHERE p.payroll_period_id = pp.id) AS worker_count,
            (SELECT COALESCE(SUM(p.base_salary), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_base,
            (SELECT COALESCE(SUM(p.incentive_total), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_incentive,
            (SELECT COALESCE(SUM(p.adjustment_total), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_adjustment,
            (SELECT COALESCE(SUM(p.deduction_total), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_deduction,
            (SELECT COALESCE(SUM(p.grand_total), 0)::BIGINT FROM payrolls p WHERE p.payroll_period_id = pp.id) AS total_grand
        FROM payroll_periods pp
        JOIN tenants t ON t.id = pp.tenant_id
        WHERE TRUE
        "#,
    );
    if let Some(tid) = params.tenant_id {
        qb.push(" AND pp.tenant_id = ").push_bind(tid);
    }
    if let Some(year) = params.year {
        qb.push(" AND pp.year = ").push_bind(year);
    }
    if let Some(ref status) = params.status {
        qb.push(" AND pp.status = ").push_bind(status.clone());
    }
    qb.push(" ORDER BY pp.year DESC, pp.month DESC LIMIT 500");

    let rows = qb
        .build_query_as::<PayrollSummaryRow>()
        .fetch_all(&state.db)
        .await?;
    Ok(Json(ListResponse { value: rows }))
}
