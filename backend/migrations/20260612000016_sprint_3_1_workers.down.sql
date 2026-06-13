DROP TABLE IF EXISTS worker_outlets;
DROP TABLE IF EXISTS workers;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'workers:read',
    'workers:create',
    'workers:update',
    'workers:delete',
    'worker_outlets:read',
    'worker_outlets:manage'
]);
