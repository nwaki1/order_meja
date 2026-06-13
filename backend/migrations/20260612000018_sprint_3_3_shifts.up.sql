CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    shift_template_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
    work_date DATE NOT NULL,
    name_snapshot TEXT NOT NULL,
    start_time_snapshot TIME NOT NULL,
    end_time_snapshot TIME NOT NULL,
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shifts_name_not_blank CHECK (BTRIM(name_snapshot) <> ''),
    CONSTRAINT shifts_status_valid CHECK (status IN ('draft', 'open', 'closed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_shifts_outlet_id ON shifts(outlet_id);
CREATE INDEX IF NOT EXISTS idx_shifts_outlet_id_status ON shifts(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_shifts_work_date ON shifts(work_date);

CREATE TABLE IF NOT EXISTS shift_workers (
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (shift_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_workers_worker_id ON shift_workers(worker_id);

INSERT INTO permissions (name, description) VALUES
    ('shifts:read',          'View shifts'),
    ('shifts:create',        'Create shifts'),
    ('shifts:update',        'Update shifts'),
    ('shifts:open',          'Open shifts'),
    ('shifts:close',         'Close shifts'),
    ('shifts:cancel',        'Cancel shifts'),
    ('shift_workers:read',   'View shift worker assignments'),
    ('shift_workers:manage', 'Add/remove shift workers')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'shifts:read',
    'shifts:create',
    'shifts:update',
    'shifts:open',
    'shifts:close',
    'shifts:cancel',
    'shift_workers:read',
    'shift_workers:manage'
])
ON CONFLICT DO NOTHING;
