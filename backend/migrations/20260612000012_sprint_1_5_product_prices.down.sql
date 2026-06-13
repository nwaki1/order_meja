DROP TABLE IF EXISTS product_prices;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'product_prices:read',
    'product_prices:create',
    'product_prices:update',
    'product_prices:delete'
]);
