DROP TABLE IF EXISTS worker_incentives;
DROP TABLE IF EXISTS shift_target_results;
DROP TABLE IF EXISTS shift_targets;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'shift_targets:read',
    'shift_targets:create',
    'shift_targets:update',
    'shift_targets:delete',
    'shift_target_results:read',
    'worker_incentives:read'
]);
