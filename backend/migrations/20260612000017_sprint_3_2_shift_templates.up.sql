CREATE TABLE IF NOT EXISTS shift_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shift_templates_name_not_blank CHECK (BTRIM(name) <> '')
);

-- Template name unique case-insensitive & trim-aware per outlet.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_outlet_name_unique
    ON shift_templates (outlet_id, LOWER(BTRIM(name)));
CREATE INDEX IF NOT EXISTS idx_shift_templates_outlet_id ON shift_templates(outlet_id);

INSERT INTO permissions (name, description) VALUES
    ('shift_templates:read',   'View shift templates'),
    ('shift_templates:create', 'Create shift templates'),
    ('shift_templates:update', 'Update shift templates'),
    ('shift_templates:delete', 'Deactivate shift templates')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'shift_templates:read',
    'shift_templates:create',
    'shift_templates:update',
    'shift_templates:delete'
])
ON CONFLICT DO NOTHING;
