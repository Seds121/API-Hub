-- Immutable financial ledger and audit trail.
-- wallet_transactions: no UPDATE, no DELETE — corrections are new REVERSAL rows.
-- audit_logs: no UPDATE; DELETE only inside a retention purge that sets app.retention_purge = 'on'.

CREATE OR REPLACE FUNCTION zz_block_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions is append-only (% blocked)', TG_OP USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transactions_immutable
  BEFORE UPDATE OR DELETE ON "wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION zz_block_ledger_mutation();

CREATE OR REPLACE FUNCTION zz_block_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (% blocked)', TG_OP USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION zz_block_audit_mutation();

-- Defence in depth: balances can never fall below the configured credit limit.
ALTER TABLE "wallets" ADD CONSTRAINT wallets_balance_floor CHECK ("balance" - "reserved" >= -"creditLimit" OR "reserved" = 0 AND "balance" >= -"creditLimit");
ALTER TABLE "wallets" ADD CONSTRAINT wallets_reserved_nonneg CHECK ("reserved" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT wallets_credit_limit_nonneg CHECK ("creditLimit" >= 0);

-- Search support for the marketplace.
CREATE INDEX IF NOT EXISTS api_products_name_lower_idx ON "api_products" (lower("name"));
