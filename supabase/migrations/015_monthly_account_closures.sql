-- =========================================================================
-- Oeco Start — Migration 015: Tabela de Fechamento Mensal de Contas Bancárias (Ledger Pattern)
-- =========================================================================

-- 1. TABELA: bank_account_monthly_closures
CREATE TABLE IF NOT EXISTS bank_account_monthly_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE NOT NULL,
  month_ref TEXT NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_income DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_expense DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  net_change DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  closing_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  is_fully_reconciled BOOLEAN NOT NULL DEFAULT true,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, bank_account_id, month_ref)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_closures_company_id ON bank_account_monthly_closures(company_id);
CREATE INDEX IF NOT EXISTS idx_closures_bank_account_id ON bank_account_monthly_closures(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_closures_month_ref ON bank_account_monthly_closures(month_ref);
CREATE INDEX IF NOT EXISTS idx_closures_lookup ON bank_account_monthly_closures(company_id, bank_account_id, month_ref);

-- RLS (Row Level Security)
ALTER TABLE bank_account_monthly_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "closures_access_policy" ON bank_account_monthly_closures;

CREATE POLICY "closures_access_policy" ON bank_account_monthly_closures
  FOR ALL USING (
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );
