-- Add indexes to improve performance for job and company listings

-- Index for searching jobs by company
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);

-- Index for sorting jobs by creation date
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Index for searching companies by name (ilike)
-- Note: ilike can be slow, but btree index on trading_name still helps for prefix matches
-- For full ilike, pg_trgm might be better, but we'll start with this.
CREATE INDEX IF NOT EXISTS idx_companies_trading_name ON companies(trading_name);

-- Index for subscription status check
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_status ON subscriptions(user_id, status);

-- Index for licensed sponsor filter
CREATE INDEX IF NOT EXISTS idx_companies_licensed_sponsor ON companies(licensed_sponsor);
