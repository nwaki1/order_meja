CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subtotal BIGINT NOT NULL,
    discount_amount BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    transaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transactions_subtotal_non_negative CHECK (subtotal >= 0),
    CONSTRAINT transactions_discount_non_negative CHECK (discount_amount >= 0),
    CONSTRAINT transactions_total_non_negative CHECK (total_amount >= 0),
    CONSTRAINT transactions_discount_le_subtotal CHECK (discount_amount <= subtotal),
    CONSTRAINT transactions_total_formula CHECK (total_amount = subtotal - discount_amount),
    CONSTRAINT transactions_status_valid CHECK (status IN ('completed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_invoice_number_unique
    ON transactions (invoice_number);
CREATE INDEX IF NOT EXISTS idx_transactions_outlet_id ON transactions(outlet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_at ON transactions(transaction_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    unit_snapshot TEXT NOT NULL,
    unit_price BIGINT NOT NULL,
    quantity BIGINT NOT NULL,
    subtotal BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transaction_items_unit_price_non_negative CHECK (unit_price >= 0),
    CONSTRAINT transaction_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT transaction_items_subtotal_non_negative CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id
    ON transaction_items(transaction_id);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL,
    amount BIGINT NOT NULL,
    reference_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payments_amount_positive CHECK (amount > 0),
    CONSTRAINT payments_method_valid CHECK (
        payment_method IN ('cash', 'qris', 'transfer', 'card')
    )
);

CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- Per-(outlet, day) counter used to build unique, readable invoice numbers.
CREATE TABLE IF NOT EXISTS invoice_counters (
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    day DATE NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (outlet_id, day)
);

INSERT INTO permissions (name, description) VALUES
    ('transactions:read', 'View POS transactions'),
    ('pos:checkout',      'Perform POS checkout')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'transactions:read',
    'pos:checkout'
])
ON CONFLICT DO NOTHING;
