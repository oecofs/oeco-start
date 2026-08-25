-- =========================================================================
-- Oeco Start — Migration 012: Gestão de Contratos e Parcelamento Inteligente
-- =========================================================================

-- 1. TABELA: contracts
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. COLUNAS DE VÍNCULO EM receivables
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS installment_number INT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS total_installments INT;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_contracts_company_id ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_receivables_contract_id ON receivables(contract_id);
CREATE INDEX IF NOT EXISTS idx_receivables_due_date ON receivables(due_date);

-- 4. SEGURANÇA (RLS) PARA contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contracts' AND policyname = 'contracts_company_access'
  ) THEN
    CREATE POLICY "contracts_company_access" ON contracts
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;
