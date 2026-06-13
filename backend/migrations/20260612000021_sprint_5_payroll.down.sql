DROP TABLE IF EXISTS payroll_items;
DROP TABLE IF EXISTS payrolls;
DROP TABLE IF EXISTS payroll_periods;
DROP TABLE IF EXISTS worker_salary_settings;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'worker_salary_settings:read',
    'worker_salary_settings:update',
    'payroll_periods:read',
    'payroll_periods:create',
    'payroll_periods:calculate',
    'payroll_periods:finalize',
    'payroll_periods:cancel',
    'payrolls:read',
    'payroll_items:manage'
]);
