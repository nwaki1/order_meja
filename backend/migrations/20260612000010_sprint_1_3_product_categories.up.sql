CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_categories_name_not_blank CHECK (BTRIM(name) <> '')
);

-- Unique case-insensitive, trim-aware name per tenant (different tenants can share the same name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_tenant_name_unique
    ON product_categories (tenant_id, LOWER(BTRIM(name)));

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id
    ON product_categories(tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id_active
    ON product_categories(tenant_id, is_active);

INSERT INTO permissions (name, description) VALUES
    ('product_categories:read',   'View all product categories'),
    ('product_categories:create', 'Create product categories'),
    ('product_categories:update', 'Update product categories'),
    ('product_categories:delete', 'Deactivate product categories')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'product_categories:read',
    'product_categories:create',
    'product_categories:update',
    'product_categories:delete'
])
ON CONFLICT DO NOTHING;
