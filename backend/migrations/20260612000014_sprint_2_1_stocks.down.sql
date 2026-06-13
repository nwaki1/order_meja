DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS outlet_stocks;

ALTER TABLE products DROP COLUMN IF EXISTS unit;
ALTER TABLE products DROP COLUMN IF EXISTS is_stock_tracked;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'stocks:read',
    'stocks:adjust',
    'stock_movements:read'
]);
