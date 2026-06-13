DROP TABLE IF EXISTS invoice_counters;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS transaction_items;
DROP TABLE IF EXISTS transactions;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'transactions:read',
    'pos:checkout'
]);
