DROP TABLE IF EXISTS shift_workers;
DROP TABLE IF EXISTS shifts;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'shifts:read',
    'shifts:create',
    'shifts:update',
    'shifts:open',
    'shifts:close',
    'shifts:cancel',
    'shift_workers:read',
    'shift_workers:manage'
]);
