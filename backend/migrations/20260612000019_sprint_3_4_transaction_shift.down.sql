DROP INDEX IF EXISTS idx_transactions_shift_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS shift_id;
