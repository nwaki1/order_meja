use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TransactionResponse {
    pub id: Uuid,
    pub outlet_id: Uuid,
    pub outlet_code: String,
    pub outlet_name: String,
    pub invoice_number: String,
    pub cashier_user_id: Uuid,
    pub cashier_name: Option<String>,
    pub subtotal: i64,
    pub discount_amount: i64,
    pub total_amount: i64,
    pub status: String,
    pub shift_id: Option<Uuid>,
    pub shift_name: Option<String>,
    pub shift_work_date: Option<chrono::NaiveDate>,
    pub transaction_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftWorkerName {
    pub worker_id: Uuid,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TransactionItemResponse {
    pub id: Uuid,
    pub product_id: Uuid,
    pub product_name_snapshot: String,
    pub sku_snapshot: String,
    pub unit_snapshot: String,
    pub unit_price: i64,
    pub quantity: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PaymentResponse {
    pub id: Uuid,
    pub payment_method: String,
    pub amount: i64,
    pub reference_number: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct TransactionDetailResponse {
    #[serde(flatten)]
    pub transaction: TransactionResponse,
    pub items: Vec<TransactionItemResponse>,
    pub payments: Vec<PaymentResponse>,
    pub shift_workers: Vec<ShiftWorkerName>,
}

#[derive(Debug, Serialize)]
pub struct ODataListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<TransactionResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$orderby")]
    pub orderby: Option<String>,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub outlet_id: Option<Uuid>,
    pub search: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

fn default_top() -> u32 {
    20
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/", get(list_transactions))
        .route("/:id", get(get_transaction))
}

fn parse_orderby(orderby: Option<&str>) -> (&'static str, &'static str) {
    let Some(s) = orderby else {
        return ("t.transaction_at", "DESC");
    };
    let mut parts = s.trim().splitn(2, ' ');
    let col = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "invoice_number" => "t.invoice_number",
        "total_amount" => "t.total_amount",
        "status" => "t.status",
        _ => "t.transaction_at",
    };
    let dir = match parts.next().unwrap_or("").to_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };
    (col, dir)
}

// Loads a transaction header with its items and payments. No access checks here;
// callers must authorize first (or be the creator, as in checkout).
pub async fn fetch_transaction_detail(
    db: &sqlx::PgPool,
    id: Uuid,
) -> Result<TransactionDetailResponse> {
    let transaction = sqlx::query_as::<_, TransactionResponse>(
        r#"
        SELECT
            t.id,
            t.outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            t.invoice_number,
            t.cashier_user_id,
            u.name AS cashier_name,
            t.subtotal,
            t.discount_amount,
            t.total_amount,
            t.status,
            t.shift_id,
            sh.name_snapshot AS shift_name,
            sh.work_date AS shift_work_date,
            t.transaction_at,
            t.created_at,
            t.updated_at
        FROM transactions t
        JOIN outlets o ON o.id = t.outlet_id
        LEFT JOIN users u ON u.id = t.cashier_user_id
        LEFT JOIN shifts sh ON sh.id = t.shift_id
        WHERE t.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Transaksi tidak ditemukan".into()))?;

    let shift_workers = if transaction.shift_id.is_some() {
        sqlx::query_as::<_, ShiftWorkerName>(
            r#"
            SELECT sw.worker_id, w.code, w.name
            FROM shift_workers sw
            JOIN workers w ON w.id = sw.worker_id
            WHERE sw.shift_id = $1
            ORDER BY w.name ASC
            "#,
        )
        .bind(transaction.shift_id)
        .fetch_all(db)
        .await?
    } else {
        Vec::new()
    };

    let items = sqlx::query_as::<_, TransactionItemResponse>(
        r#"
        SELECT
            id, product_id, product_name_snapshot, sku_snapshot,
            unit_snapshot, unit_price, quantity, subtotal
        FROM transaction_items
        WHERE transaction_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(db)
    .await?;

    let payments = sqlx::query_as::<_, PaymentResponse>(
        r#"
        SELECT id, payment_method, amount, reference_number, created_at
        FROM payments
        WHERE transaction_id = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(id)
    .fetch_all(db)
    .await?;

    Ok(TransactionDetailResponse {
        transaction,
        items,
        payments,
        shift_workers,
    })
}

async fn list_transactions(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ODataListResponse>> {
    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;
    let (order_col, order_dir) = parse_orderby(params.orderby.as_deref());
    let can_read_all = user.permissions.contains("transactions:read");

    let push_filters = |qb: &mut QueryBuilder<sqlx::Postgres>| {
        if !can_read_all {
            qb.push(
                " AND EXISTS (SELECT 1 FROM user_outlets uo WHERE uo.outlet_id = t.outlet_id AND uo.is_active = TRUE AND uo.user_id = ",
            )
            .push_bind(user.id)
            .push(")");
        }
        if let Some(oid) = params.outlet_id {
            qb.push(" AND t.outlet_id = ").push_bind(oid);
        }
        if let Some(ref status) = params.status {
            qb.push(" AND t.status = ").push_bind(status.clone());
        }
        if let Some(ref search) = params.search {
            qb.push(" AND t.invoice_number ILIKE ")
                .push_bind(format!("%{search}%"));
        }
        if let Some(ref date_from) = params.date_from {
            qb.push(" AND t.transaction_at::date >= ")
                .push_bind(date_from.clone())
                .push("::date");
        }
        if let Some(ref date_to) = params.date_to {
            qb.push(" AND t.transaction_at::date <= ")
                .push_bind(date_to.clone())
                .push("::date");
        }
    };

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM transactions t WHERE TRUE");
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
            t.id,
            t.outlet_id,
            o.code AS outlet_code,
            o.name AS outlet_name,
            t.invoice_number,
            t.cashier_user_id,
            u.name AS cashier_name,
            t.subtotal,
            t.discount_amount,
            t.total_amount,
            t.status,
            t.shift_id,
            sh.name_snapshot AS shift_name,
            sh.work_date AS shift_work_date,
            t.transaction_at,
            t.created_at,
            t.updated_at
        FROM transactions t
        JOIN outlets o ON o.id = t.outlet_id
        LEFT JOIN users u ON u.id = t.cashier_user_id
        LEFT JOIN shifts sh ON sh.id = t.shift_id
        WHERE TRUE
        "#,
    );
    push_filters(&mut dq);
    dq.push(format!(" ORDER BY {order_col} {order_dir}"));
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let transactions = dq
        .build_query_as::<TransactionResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataListResponse {
        odata_count,
        value: transactions,
    }))
}

async fn get_transaction(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TransactionDetailResponse>> {
    // Resolve the owning outlet first, then authorize by outlet access unless the
    // user can read all transactions.
    let outlet_id = sqlx::query_scalar::<_, Uuid>("SELECT outlet_id FROM transactions WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Transaksi tidak ditemukan".into()))?;

    if !user.permissions.contains("transactions:read") {
        auth::require_outlet_access(&state.db, &user, outlet_id).await?;
    }

    Ok(Json(fetch_transaction_detail(&state.db, id).await?))
}
