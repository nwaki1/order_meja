DROP TABLE IF EXISTS shift_templates;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'shift_templates:read',
    'shift_templates:create',
    'shift_templates:update',
    'shift_templates:delete'
]);
