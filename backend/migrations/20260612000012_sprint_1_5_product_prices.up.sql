CREATE TABLE IF NOT EXISTS product_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    price BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_prices_price_non_negative CHECK (price >= 0)
);

-- One price row per (product, outlet); the same product can be priced
-- differently across outlets.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_prices_product_outlet_unique
    ON product_prices (product_id, outlet_id);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_id ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_outlet_id ON product_prices(outlet_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_outlet_id_active
    ON product_prices(outlet_id, is_active);

INSERT INTO permissions (name, description) VALUES
    ('product_prices:read',   'View all product prices'),
    ('product_prices:create', 'Set product prices'),
    ('product_prices:update', 'Update product prices'),
    ('product_prices:delete', 'Deactivate product prices')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'product_prices:read',
    'product_prices:create',
    'product_prices:update',
    'product_prices:delete'
])
ON CONFLICT DO NOTHING;
