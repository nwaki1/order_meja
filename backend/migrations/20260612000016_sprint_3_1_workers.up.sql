CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workers_code_not_blank CHECK (BTRIM(code) <> ''),
    CONSTRAINT workers_name_not_blank CHECK (BTRIM(name) <> '')
);

-- Worker code unique case-insensitive & trim-aware per tenant; reusable across tenants.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_tenant_code_unique
    ON workers (tenant_id, LOWER(BTRIM(code)));
CREATE INDEX IF NOT EXISTS idx_workers_tenant_id ON workers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workers_tenant_id_active ON workers(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS worker_outlets (
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (worker_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_outlets_outlet_id ON worker_outlets(outlet_id);
CREATE INDEX IF NOT EXISTS idx_worker_outlets_outlet_id_active
    ON worker_outlets(outlet_id, is_active);

INSERT INTO permissions (name, description) VALUES
    ('workers:read',          'View workers'),
    ('workers:create',        'Create workers'),
    ('workers:update',        'Update workers'),
    ('workers:delete',        'Deactivate workers'),
    ('worker_outlets:read',   'View worker outlet assignments'),
    ('worker_outlets:manage', 'Assign/revoke worker outlet assignments')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'workers:read',
    'workers:create',
    'workers:update',
    'workers:delete',
    'worker_outlets:read',
    'worker_outlets:manage'
])
ON CONFLICT DO NOTHING;
