CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT products_sku_not_blank CHECK (BTRIM(sku) <> ''),
    CONSTRAINT products_name_not_blank CHECK (BTRIM(name) <> '')
);

-- SKU unique case-insensitive & trim-aware per tenant; different tenants may reuse the same SKU.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku_unique
    ON products (tenant_id, LOWER(BTRIM(sku)));

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id_active ON products(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

INSERT INTO permissions (name, description) VALUES
    ('products:read',   'View all products'),
    ('products:create', 'Create products'),
    ('products:update', 'Update products'),
    ('products:delete', 'Deactivate products')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'products:read',
    'products:create',
    'products:update',
    'products:delete'
])
ON CONFLICT DO NOTHING;
