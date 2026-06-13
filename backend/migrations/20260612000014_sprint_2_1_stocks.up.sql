-- Products gain stock-tracking flag and a unit label (used for sale snapshots).
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_stock_tracked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';

CREATE TABLE IF NOT EXISTS outlet_stocks (
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (outlet_id, product_id),
    CONSTRAINT outlet_stocks_quantity_non_negative CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_outlet_stocks_product_id ON outlet_stocks(product_id);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL,
    quantity BIGINT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    notes TEXT,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stock_movements_quantity_positive CHECK (quantity > 0),
    CONSTRAINT stock_movements_type_valid CHECK (
        movement_type IN ('initial_stock', 'adjustment_in', 'adjustment_out', 'sale')
    )
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet_id ON stock_movements(outlet_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet_product
    ON stock_movements(outlet_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);

INSERT INTO permissions (name, description) VALUES
    ('stocks:read',          'View outlet stock balances'),
    ('stocks:adjust',        'Adjust outlet stock balances'),
    ('stock_movements:read', 'View stock movement history')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'stocks:read',
    'stocks:adjust',
    'stock_movements:read'
])
ON CONFLICT DO NOTHING;
