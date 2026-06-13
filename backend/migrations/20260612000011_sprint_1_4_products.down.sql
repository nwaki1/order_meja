DROP TABLE IF EXISTS products;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'products:read',
    'products:create',
    'products:update',
    'products:delete'
]);
