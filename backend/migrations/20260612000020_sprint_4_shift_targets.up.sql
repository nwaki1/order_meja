CREATE TABLE IF NOT EXISTS shift_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    target_type TEXT NOT NULL,
    target_value BIGINT NOT NULL,
    bonus_amount BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shift_targets_type_valid CHECK (target_type IN ('revenue')),
    CONSTRAINT shift_targets_value_positive CHECK (target_value > 0),
    CONSTRAINT shift_targets_bonus_non_negative CHECK (bonus_amount >= 0)
);

-- One active target per (shift, target_type).
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_targets_active_unique
    ON shift_targets (shift_id, target_type)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_shift_targets_shift_id ON shift_targets(shift_id);

CREATE TABLE IF NOT EXISTS shift_target_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_target_id UUID NOT NULL REFERENCES shift_targets(id) ON DELETE RESTRICT,
    actual_value BIGINT NOT NULL,
    achievement_percentage DOUBLE PRECISION NOT NULL,
    is_achieved BOOLEAN NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shift_target_results_actual_non_negative CHECK (actual_value >= 0),
    CONSTRAINT shift_target_results_target_unique UNIQUE (shift_target_id)
);

CREATE TABLE IF NOT EXISTS worker_incentives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    shift_target_id UUID NOT NULL REFERENCES shift_targets(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT worker_incentives_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT worker_incentives_worker_target_unique UNIQUE (worker_id, shift_target_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_incentives_worker_id ON worker_incentives(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_incentives_shift_id ON worker_incentives(shift_id);

INSERT INTO permissions (name, description) VALUES
    ('shift_targets:read',         'View shift targets'),
    ('shift_targets:create',       'Create shift targets'),
    ('shift_targets:update',       'Update shift targets'),
    ('shift_targets:delete',       'Deactivate shift targets'),
    ('shift_target_results:read',  'View shift target results'),
    ('worker_incentives:read',     'View worker incentives')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'shift_targets:read',
    'shift_targets:create',
    'shift_targets:update',
    'shift_targets:delete',
    'shift_target_results:read',
    'worker_incentives:read'
])
ON CONFLICT DO NOTHING;
