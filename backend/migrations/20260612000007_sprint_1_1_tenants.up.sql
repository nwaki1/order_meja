CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenants_code_not_blank CHECK (BTRIM(code) <> ''),
    CONSTRAINT tenants_name_not_blank CHECK (BTRIM(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_code_unique ON tenants (LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_unique ON tenants (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

CREATE TABLE IF NOT EXISTS user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON user_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id_active ON user_tenants(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id_active ON user_tenants(tenant_id, is_active);
