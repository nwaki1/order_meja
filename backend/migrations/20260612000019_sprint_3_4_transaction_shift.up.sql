-- Link transactions to the shift they were rung up under. Nullable so existing
-- Sprint 2 transactions remain valid.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_transactions_shift_id ON transactions(shift_id);
