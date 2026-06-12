DROP TABLE IF EXISTS product_categories;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'product_categories:read',
    'product_categories:create',
    'product_categories:update',
    'product_categories:delete'
]);
