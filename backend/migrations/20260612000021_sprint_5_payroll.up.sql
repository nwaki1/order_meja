CREATE TABLE IF NOT EXISTS worker_salary_settings (
    worker_id UUID PRIMARY KEY REFERENCES workers(id) ON DELETE RESTRICT,
    base_salary BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT worker_salary_settings_base_non_negative CHECK (base_salary >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    year INT NOT NULL,
    month INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    finalized_at TIMESTAMPTZ,
    finalized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payroll_periods_month_valid CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT payroll_periods_status_valid CHECK (status IN ('draft', 'finalized', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periods_tenant_year_month
    ON payroll_periods (tenant_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant_id ON payroll_periods(tenant_id);

CREATE TABLE IF NOT EXISTS payrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    base_salary BIGINT NOT NULL DEFAULT 0,
    incentive_total BIGINT NOT NULL DEFAULT 0,
    adjustment_total BIGINT NOT NULL DEFAULT 0,
    deduction_total BIGINT NOT NULL DEFAULT 0,
    grand_total BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    calculated_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payrolls_grand_total_non_negative CHECK (grand_total >= 0),
    CONSTRAINT payrolls_status_valid CHECK (status IN ('draft', 'finalized')),
    CONSTRAINT payrolls_period_worker_unique UNIQUE (payroll_period_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_payrolls_period_id ON payrolls(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payrolls_worker_id ON payrolls(worker_id);

CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_id UUID NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    description TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payroll_items_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT payroll_items_type_valid CHECK (
        item_type IN ('base_salary', 'incentive', 'adjustment', 'deduction')
    ),
    CONSTRAINT payroll_items_source_valid CHECK (
        source_type IN ('salary_setting', 'worker_incentive', 'manual')
    )
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll_id ON payroll_items(payroll_id);

INSERT INTO permissions (name, description) VALUES
    ('worker_salary_settings:read',   'View worker salary settings'),
    ('worker_salary_settings:update', 'Update worker salary settings'),
    ('payroll_periods:read',          'View payroll periods'),
    ('payroll_periods:create',        'Create payroll periods'),
    ('payroll_periods:calculate',     'Calculate payroll periods'),
    ('payroll_periods:finalize',      'Finalize payroll periods'),
    ('payroll_periods:cancel',        'Cancel payroll periods'),
    ('payrolls:read',                 'View payrolls'),
    ('payroll_items:manage',          'Manage manual payroll items')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'worker_salary_settings:read',
    'worker_salary_settings:update',
    'payroll_periods:read',
    'payroll_periods:create',
    'payroll_periods:calculate',
    'payroll_periods:finalize',
    'payroll_periods:cancel',
    'payrolls:read',
    'payroll_items:manage'
])
ON CONFLICT DO NOTHING;
