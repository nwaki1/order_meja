use crate::routes::transactions::{fetch_transaction_detail, TransactionDetailResponse};
use crate::{auth, AppError, AppState, Result};
use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use serde::Deserialize;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckoutItem {
    pub product_id: Uuid,
    pub quantity: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckoutPayment {
    pub payment_method: String,
    pub amount: i64,
    pub reference_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckoutRequest {
    pub outlet_id: Uuid,
    #[serde(default)]
    pub discount_amount: i64,
    pub items: Vec<CheckoutItem>,
    pub payments: Vec<CheckoutPayment>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route("/checkout", post(checkout))
}

// Resolved product line built from DB data (never trusting client prices).
struct ResolvedLine {
    product_id: Uuid,
    name: String,
    sku: String,
    unit: String,
    is_stock_tracked: bool,
    unit_price: i64,
    quantity: i64,
    subtotal: i64,
}

fn valid_payment_method(method: &str) -> bool {
    matches!(method, "cash" | "qris" | "transfer" | "card")
}

async fn checkout(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CheckoutRequest>,
) -> Result<(StatusCode, Json<TransactionDetailResponse>)> {
    auth::require_permission(&user, "pos:checkout")?;
    auth::require_outlet_access(&state.db, &user, body.outlet_id).await?;

    // Outlet must be active, with an active ownership to an active tenant.
    let outlet = sqlx::query_as::<_, (String, Uuid)>(
        r#"
        SELECT o.code, oo.tenant_id
        FROM outlets o
        JOIN outlet_ownerships oo ON oo.outlet_id = o.id AND oo.valid_until IS NULL
        JOIN tenants t ON t.id = oo.tenant_id
        WHERE o.id = $1 AND o.is_active = TRUE AND t.is_active = TRUE
        "#,
    )
    .bind(body.outlet_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Outlet tidak ditemukan atau tidak aktif".into()))?;
    let (outlet_code, tenant_id) = outlet;

    if body.items.is_empty() {
        return Err(AppError::BadRequest("Keranjang tidak boleh kosong".into()));
    }
    if body.discount_amount < 0 {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "discount_amount",
            "Diskon tidak boleh negatif",
        ));
    }

    // Merge duplicate product_ids by summing quantities, preserving first-seen order.
    let mut order: Vec<Uuid> = Vec::new();
    let mut merged: HashMap<Uuid, i64> = HashMap::new();
    for item in &body.items {
        if item.quantity <= 0 {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "quantity",
                "Quantity harus lebih dari 0",
            ));
        }
        if !merged.contains_key(&item.product_id) {
            order.push(item.product_id);
        }
        *merged.entry(item.product_id).or_insert(0) += item.quantity;
    }

    // Validate payments shape early.
    if body.payments.is_empty() {
        return Err(AppError::BadRequest("Pembayaran tidak boleh kosong".into()));
    }
    let mut payment_total: i64 = 0;
    for payment in &body.payments {
        if payment.amount <= 0 {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "amount",
                "Nominal pembayaran harus lebih dari 0",
            ));
        }
        if !valid_payment_method(&payment.payment_method) {
            return Err(AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "payment_method",
                "Metode pembayaran tidak valid",
            ));
        }
        payment_total += payment.amount;
    }

    let mut tx = state.db.begin().await?;

    // Resolve each line from the database: product validity, tenant match, and
    // the active price at this outlet. Client-supplied prices are ignored.
    let mut lines: Vec<ResolvedLine> = Vec::with_capacity(order.len());
    let mut subtotal: i64 = 0;
    for product_id in &order {
        let quantity = merged[product_id];

        let product = sqlx::query_as::<_, (Uuid, String, String, String, bool)>(
            r#"
            SELECT p.id, p.sku, p.name, p.unit, p.is_stock_tracked
            FROM products p
            WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = TRUE
            "#,
        )
        .bind(product_id)
        .bind(tenant_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Produk {product_id} tidak ditemukan, tidak aktif, atau bukan milik tenant outlet"
            ))
        })?;
        let (pid, sku, name, unit, is_stock_tracked) = product;

        let unit_price = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT price FROM product_prices
            WHERE product_id = $1 AND outlet_id = $2 AND is_active = TRUE
            "#,
        )
        .bind(product_id)
        .bind(body.outlet_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Produk {name} tidak memiliki harga aktif di outlet ini"
            ))
        })?;

        let line_subtotal = unit_price * quantity;
        subtotal += line_subtotal;

        lines.push(ResolvedLine {
            product_id: pid,
            name,
            sku,
            unit,
            is_stock_tracked,
            unit_price,
            quantity,
            subtotal: line_subtotal,
        });
    }

    if body.discount_amount > subtotal {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "discount_amount",
            "Diskon tidak boleh lebih besar dari subtotal",
        ));
    }
    let total_amount = subtotal - body.discount_amount;

    if payment_total != total_amount {
        return Err(AppError::BadRequest(format!(
            "Total pembayaran ({payment_total}) tidak sama dengan total transaksi ({total_amount})"
        )));
    }

    // Atomic invoice number: per-(outlet, day) counter.
    let today = chrono::Utc::now().format("%Y%m%d").to_string();
    let counter = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO invoice_counters (outlet_id, day, counter)
        VALUES ($1, CURRENT_DATE, 1)
        ON CONFLICT (outlet_id, day)
        DO UPDATE SET counter = invoice_counters.counter + 1
        RETURNING counter
        "#,
    )
    .bind(body.outlet_id)
    .fetch_one(&mut *tx)
    .await?;
    let invoice_number = format!("INV-{today}-{outlet_code}-{counter:04}");

    let transaction_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO transactions
            (outlet_id, invoice_number, cashier_user_id, subtotal, discount_amount, total_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'completed')
        RETURNING id
        "#,
    )
    .bind(body.outlet_id)
    .bind(&invoice_number)
    .bind(user.id)
    .bind(subtotal)
    .bind(body.discount_amount)
    .bind(total_amount)
    .fetch_one(&mut *tx)
    .await?;

    for line in &lines {
        sqlx::query(
            r#"
            INSERT INTO transaction_items
                (transaction_id, product_id, product_name_snapshot, sku_snapshot,
                 unit_snapshot, unit_price, quantity, subtotal)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(transaction_id)
        .bind(line.product_id)
        .bind(&line.name)
        .bind(&line.sku)
        .bind(&line.unit)
        .bind(line.unit_price)
        .bind(line.quantity)
        .bind(line.subtotal)
        .execute(&mut *tx)
        .await?;

        // Stock-tracked products: lock balance, verify, deduct, record sale movement.
        if line.is_stock_tracked {
            sqlx::query(
                r#"
                INSERT INTO outlet_stocks (outlet_id, product_id, quantity)
                VALUES ($1, $2, 0)
                ON CONFLICT (outlet_id, product_id) DO NOTHING
                "#,
            )
            .bind(body.outlet_id)
            .bind(line.product_id)
            .execute(&mut *tx)
            .await?;

            let current = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT quantity FROM outlet_stocks
                WHERE outlet_id = $1 AND product_id = $2
                FOR UPDATE
                "#,
            )
            .bind(body.outlet_id)
            .bind(line.product_id)
            .fetch_one(&mut *tx)
            .await?;

            if current < line.quantity {
                return Err(AppError::BadRequest(format!(
                    "Stok {} tidak cukup (tersedia {}, dibutuhkan {})",
                    line.name, current, line.quantity
                )));
            }

            sqlx::query(
                r#"
                UPDATE outlet_stocks
                SET quantity = quantity - $3, updated_at = NOW()
                WHERE outlet_id = $1 AND product_id = $2
                "#,
            )
            .bind(body.outlet_id)
            .bind(line.product_id)
            .bind(line.quantity)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                r#"
                INSERT INTO stock_movements
                    (outlet_id, product_id, movement_type, quantity,
                     reference_type, reference_id, created_by_user_id)
                VALUES ($1, $2, 'sale', $3, 'transaction', $4, $5)
                "#,
            )
            .bind(body.outlet_id)
            .bind(line.product_id)
            .bind(line.quantity)
            .bind(transaction_id)
            .bind(user.id)
            .execute(&mut *tx)
            .await?;
        }
    }

    for payment in &body.payments {
        let reference = payment
            .reference_number
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty());
        sqlx::query(
            r#"
            INSERT INTO payments (transaction_id, payment_method, amount, reference_number)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(transaction_id)
        .bind(&payment.payment_method)
        .bind(payment.amount)
        .bind(reference)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let detail = fetch_transaction_detail(&state.db, transaction_id).await?;
    Ok((StatusCode::CREATED, Json(detail)))
}
