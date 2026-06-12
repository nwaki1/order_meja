CREATE TABLE IF NOT EXISTS outlets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT outlets_code_not_blank CHECK (BTRIM(code) <> ''),
    CONSTRAINT outlets_name_not_blank CHECK (BTRIM(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outlets_code_unique ON outlets (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_outlets_is_active ON outlets(is_active);

CREATE TABLE IF NOT EXISTS outlet_ownerships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT outlet_ownerships_valid_range CHECK (
        valid_until IS NULL OR valid_until > valid_from
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outlet_ownerships_active_outlet
    ON outlet_ownerships(outlet_id)
    WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_outlet_ownerships_outlet_id
    ON outlet_ownerships(outlet_id);
CREATE INDEX IF NOT EXISTS idx_outlet_ownerships_tenant_id
    ON outlet_ownerships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outlet_ownerships_tenant_id_active
    ON outlet_ownerships(tenant_id)
    WHERE valid_until IS NULL;

CREATE TABLE IF NOT EXISTS user_outlets (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_user_outlets_outlet_id ON user_outlets(outlet_id);
CREATE INDEX IF NOT EXISTS idx_user_outlets_user_id_active
    ON user_outlets(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_outlets_outlet_id_active
    ON user_outlets(outlet_id, is_active);

INSERT INTO permissions (name, description) VALUES
    ('outlets:read', 'View all outlets'),
    ('outlets:create', 'Create outlets'),
    ('outlets:update', 'Update outlets'),
    ('outlets:delete', 'Deactivate outlets'),
    ('outlet_ownerships:read', 'View outlet ownership history'),
    ('outlet_ownerships:transfer', 'Transfer outlet ownership'),
    ('outlet_users:read', 'View outlet user assignments'),
    ('outlet_users:assign', 'Assign users to outlets'),
    ('outlet_users:revoke', 'Revoke user access to outlets')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'outlets:read',
    'outlets:create',
    'outlets:update',
    'outlets:delete',
    'outlet_ownerships:read',
    'outlet_ownerships:transfer',
    'outlet_users:read',
    'outlet_users:assign',
    'outlet_users:revoke'
])
ON CONFLICT DO NOTHING;
