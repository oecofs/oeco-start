-- =========================================================================
-- Oeco Start — Migration 018: Módulo Jurídico, Processos e Custas Reembolsáveis
-- =========================================================================

-- 1. CRIA A TABELA legal_cases (Processos / Casos Jurídicos)
CREATE TABLE IF NOT EXISTS legal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  case_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_document TEXT,
  client_phone TEXT,
  court_courtroom TEXT,
  action_type TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ADICIONA COLUNAS DE CUSTAS REEMBOLSÁVEIS NA TABELA payables
ALTER TABLE payables ADD COLUMN IF NOT EXISTS is_refundable_cost BOOLEAN DEFAULT false;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS legal_case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'pending' CHECK (refund_status IN ('pending', 'invoiced', 'refunded', 'non_refundable'));
ALTER TABLE payables ADD COLUMN IF NOT EXISTS refunded_at DATE;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS refund_notes TEXT;

-- 3. ADICIONA COLUNAS DE CUSTAS REEMBOLSÁVEIS NA TABELA transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_refundable_cost BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS legal_case_id UUID REFERENCES legal_cases(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'pending' CHECK (refund_status IN ('pending', 'invoiced', 'refunded', 'non_refundable'));

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_legal_cases_company_id ON legal_cases(company_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_case_number ON legal_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_legal_cases_client_name ON legal_cases(client_name);
CREATE INDEX IF NOT EXISTS idx_payables_legal_case_id ON payables(legal_case_id);
CREATE INDEX IF NOT EXISTS idx_transactions_legal_case_id ON transactions(legal_case_id);

-- 5. SEGURANÇA (RLS) PARA legal_cases
ALTER TABLE legal_cases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_cases' AND policyname = 'legal_cases_company_access'
  ) THEN
    CREATE POLICY "legal_cases_company_access" ON legal_cases
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;
