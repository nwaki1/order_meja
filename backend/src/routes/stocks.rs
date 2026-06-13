use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OutletStockResponse {
    pub outlet_id: Uuid,
    pub product_id: Uuid,
    pub sku: String,
    pub name: String,
    pub category_name: Option<String>,
    pub unit: String,
    pub is_stock_tracked: bool,
    pub quantity: i64,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize)]
pub struct ODataStockListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<OutletStockResponse>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StockMovementResponse {
    pub id: Uuid,
    pub outlet_id: Uuid,
    pub product_id: Uuid,
    pub product_sku: String,
    pub product_name: String,
    pub movement_type: String,
    pub quantity: i64,
    pub reference_type: Option<String>,
    pub reference_id: Option<Uuid>,
    pub notes: Option<String>,
    pub created_by_user_id: Uuid,
    pub created_by_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ODataMovementListResponse {
    #[serde(rename = "@odata.count", skip_serializing_if = "Option::is_none")]
    pub odata_count: Option<i64>,
    pub value: Vec<StockMovementResponse>,
}

#[derive(Debug, Deserialize)]
pub struct StockListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub search: Option<String>,
    pub is_stock_tracked: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MovementListQuery {
    #[serde(rename = "$top", default = "default_top")]
    pub top: u32,
    #[serde(rename = "$skip", default)]
    pub skip: u32,
    #[serde(rename = "$count", default)]
    pub count: bool,
    pub product_id: Option<Uuid>,
}

fn default_top() -> u32 {
    20
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdjustStockRequest {
    pub movement_type: String,
    pub quantity: i64,
    pub notes: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/:id/stocks", get(list_outlet_stocks))
        .route("/:id/stocks/:product_id", get(get_outlet_stock))
        .route("/:id/stocks/:product_id/adjust", post(adjust_outlet_stock))
        .route("/:id/stock-movements", get(list_stock_movements))
}

// Returns the outlet's active owner tenant; errors if the outlet is missing,
// inactive, or has no active ownership.
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

async fn list_outlet_stocks(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
    Query(params): Query<StockListQuery>,
) -> Result<Json<ODataStockListResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;
    let tenant_id = active_outlet_tenant(&state.db, outlet_id).await?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
            "SELECT COUNT(*) FROM products p WHERE p.tenant_id = ",
        );
        cq.push_bind(tenant_id).push(" AND p.is_active = TRUE");
        if let Some(tracked) = params.is_stock_tracked {
            cq.push(" AND p.is_stock_tracked = ").push_bind(tracked);
        }
        if let Some(ref search) = params.search {
            let like = format!("%{search}%");
            cq.push(" AND (p.name ILIKE ")
                .push_bind(like.clone())
                .push(" OR p.sku ILIKE ")
                .push_bind(like)
                .push(")");
        }
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            "#,
    );
    dq.push_bind(outlet_id)
        .push(
            r#" AS outlet_id,
            p.id AS product_id,
            p.sku,
            p.name,
            pc.name AS category_name,
            p.unit,
            p.is_stock_tracked,
            COALESCE(os.quantity, 0) AS quantity,
            os.updated_at
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN outlet_stocks os ON os.product_id = p.id AND os.outlet_id = "#,
        )
        .push_bind(outlet_id)
        .push(" WHERE p.tenant_id = ")
        .push_bind(tenant_id)
        .push(" AND p.is_active = TRUE");
    if let Some(tracked) = params.is_stock_tracked {
        dq.push(" AND p.is_stock_tracked = ").push_bind(tracked);
    }
    if let Some(ref search) = params.search {
        let like = format!("%{search}%");
        dq.push(" AND (p.name ILIKE ")
            .push_bind(like.clone())
            .push(" OR p.sku ILIKE ")
            .push_bind(like)
            .push(")");
    }
    dq.push(" ORDER BY p.name ASC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let stocks = dq
        .build_query_as::<OutletStockResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataStockListResponse {
        odata_count,
        value: stocks,
    }))
}

async fn get_outlet_stock(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((outlet_id, product_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OutletStockResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;
    let tenant_id = active_outlet_tenant(&state.db, outlet_id).await?;

    let stock = sqlx::query_as::<_, OutletStockResponse>(
        r#"
        SELECT
            $1 AS outlet_id,
            p.id AS product_id,
            p.sku,
            p.name,
            pc.name AS category_name,
            p.unit,
            p.is_stock_tracked,
            COALESCE(os.quantity, 0) AS quantity,
            os.updated_at
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN outlet_stocks os ON os.product_id = p.id AND os.outlet_id = $1
        WHERE p.id = $2 AND p.tenant_id = $3 AND p.is_active = TRUE
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Produk tidak ditemukan pada outlet ini".into()))?;

    Ok(Json(stock))
}

async fn list_stock_movements(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
    Query(params): Query<MovementListQuery>,
) -> Result<Json<ODataMovementListResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    let top = params.top.min(100) as i64;
    let skip = params.skip as i64;

    let odata_count = if params.count {
        let mut cq: QueryBuilder<sqlx::Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM stock_movements sm WHERE sm.outlet_id = ");
        cq.push_bind(outlet_id);
        if let Some(pid) = params.product_id {
            cq.push(" AND sm.product_id = ").push_bind(pid);
        }
        let row = cq.build().fetch_one(&state.db).await?;
        let n: i64 = row.try_get(0).map_err(AppError::Database)?;
        Some(n)
    } else {
        None
    };

    let mut dq: QueryBuilder<sqlx::Postgres> = QueryBuilder::new(
        r#"
        SELECT
            sm.id,
            sm.outlet_id,
            sm.product_id,
            p.sku AS product_sku,
            p.name AS product_name,
            sm.movement_type,
            sm.quantity,
            sm.reference_type,
            sm.reference_id,
            sm.notes,
            sm.created_by_user_id,
            u.name AS created_by_name,
            sm.created_at
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        LEFT JOIN users u ON u.id = sm.created_by_user_id
        WHERE sm.outlet_id = "#,
    );
    dq.push_bind(outlet_id);
    if let Some(pid) = params.product_id {
        dq.push(" AND sm.product_id = ").push_bind(pid);
    }
    dq.push(" ORDER BY sm.created_at DESC");
    dq.push(" LIMIT ").push_bind(top);
    dq.push(" OFFSET ").push_bind(skip);

    let movements = dq
        .build_query_as::<StockMovementResponse>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ODataMovementListResponse {
        odata_count,
        value: movements,
    }))
}

async fn adjust_outlet_stock(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path((outlet_id, product_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<AdjustStockRequest>,
) -> Result<Json<OutletStockResponse>> {
    auth::require_permission(&user, "stocks:adjust")?;
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    // Only manual adjustment types are allowed here; 'sale' is reserved for checkout.
    let inbound = match body.movement_type.as_str() {
        "initial_stock" | "adjustment_in" => true,
        "adjustment_out" => false,
        _ => {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "movement_type",
                "movement_type harus initial_stock, adjustment_in, atau adjustment_out",
            ))
        }
    };

    if body.quantity <= 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "quantity",
            "Quantity harus lebih dari 0",
        ));
    }

    let tenant_id = active_outlet_tenant(&state.db, outlet_id).await?;

    // Product must be active, owned by the outlet's tenant, and stock-tracked.
    let is_tracked = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT p.is_stock_tracked
        FROM products p
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = TRUE
        "#,
    )
    .bind(product_id)
    .bind(tenant_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| {
        AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "product_id",
            "Produk tidak ditemukan, tidak aktif, atau bukan milik tenant outlet",
        )
    })?;

    if !is_tracked {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "product_id",
            "Produk bukan produk yang dilacak stoknya",
        ));
    }

    let notes = body
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned);

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO outlet_stocks (outlet_id, product_id, quantity)
        VALUES ($1, $2, 0)
        ON CONFLICT (outlet_id, product_id) DO NOTHING
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .execute(&mut *tx)
    .await?;

    let current = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT quantity FROM outlet_stocks
        WHERE outlet_id = $1 AND product_id = $2
        FOR UPDATE
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .fetch_one(&mut *tx)
    .await?;

    let new_quantity = if inbound {
        current + body.quantity
    } else {
        current - body.quantity
    };

    if new_quantity < 0 {
        return Err(AppError::BadRequest(
            "Stok tidak cukup untuk pengurangan ini".into(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE outlet_stocks
        SET quantity = $3, updated_at = NOW()
        WHERE outlet_id = $1 AND product_id = $2
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .bind(new_quantity)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO stock_movements
            (outlet_id, product_id, movement_type, quantity, notes, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .bind(&body.movement_type)
    .bind(body.quantity)
    .bind(notes.as_deref())
    .bind(user.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let stock = sqlx::query_as::<_, OutletStockResponse>(
        r#"
        SELECT
            $1 AS outlet_id,
            p.id AS product_id,
            p.sku,
            p.name,
            pc.name AS category_name,
            p.unit,
            p.is_stock_tracked,
            COALESCE(os.quantity, 0) AS quantity,
            os.updated_at
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN outlet_stocks os ON os.product_id = p.id AND os.outlet_id = $1
        WHERE p.id = $2
        "#,
    )
    .bind(outlet_id)
    .bind(product_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(stock))
}
