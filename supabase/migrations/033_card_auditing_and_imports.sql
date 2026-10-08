-- =========================================================================
-- Oeco Start — Migration 033: Auditoria de Taxas e Importação de Extratos
-- =========================================================================

-- 1. ADICIONA CAMPOS DE AUDITORIA NA TABELA card_sales
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS real_fee_amount DECIMAL(12,2);
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS real_fee_percentage DECIMAL(5,2);
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS fee_difference_amount DECIMAL(12,2) DEFAULT 0.00;
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'verified', 'divergence', 'cancelled', 'chargeback'));
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS settlement_batch_id TEXT; -- Código do Lote de Liquidação da operadora
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 2. ADICIONA CAMPOS NA TABELA card_installments
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS real_fee_amount DECIMAL(12,2);
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS settlement_batch_id TEXT;

-- 3. TABELA DE HISTÓRICO DE IMPORTAÇÃO DE EXTRATOS (card_import_batches)
CREATE TABLE IF NOT EXISTS card_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  terminal_id UUID REFERENCES card_terminals(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  acquirer TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0, -- Vendas já existentes que foram auditadas
  created_count INTEGER NOT NULL DEFAULT 0, -- Novas vendas inseridas
  divergence_count INTEGER NOT NULL DEFAULT 0, -- Vendas com taxa cobrada maior que a contratada
  total_gross_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_net_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_fee_difference DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ÍNDICES DE PERFORMANCE PARA AUDITORIA E BUSCAS
CREATE INDEX IF NOT EXISTS idx_card_sales_audit_status ON card_sales(company_id, audit_status);
CREATE INDEX IF NOT EXISTS idx_card_sales_settlement_batch ON card_sales(company_id, settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_card_import_batches_company ON card_import_batches(company_id);

-- 5. RLS PARA card_import_batches
ALTER TABLE card_import_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_import_batches' AND policyname = 'card_import_batches_company_access') THEN
    CREATE POLICY "card_import_batches_company_access" ON card_import_batches
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;
END $$;
