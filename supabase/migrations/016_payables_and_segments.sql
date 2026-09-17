-- =========================================================================
-- Oeco Start — Migration 016: Contas a Pagar (Payables), Segmentos & Storage
-- =========================================================================

-- 1. ADICIONA COLUNA segment NA TABELA companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_segment_check'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_segment_check 
      CHECK (segment IN ('general', 'legal'));
  END IF;
END $$;

-- 2. CRIA A TABELA payables (Contas a Pagar)
CREATE TABLE IF NOT EXISTS payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  month_ref TEXT NOT NULL, -- Ex: '2026-10'
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'partial', 'overdue', 'cancelled')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  cost_center TEXT,
  barcode_or_pix TEXT,
  attachment_url TEXT,
  attachment_type TEXT DEFAULT 'file' CHECK (attachment_type IN ('file', 'external_link')),
  paid_amount DECIMAL(12,2) DEFAULT 0.00,
  paid_at DATE,
  is_manual_paid BOOLEAN DEFAULT false,
  notes TEXT,
  installment_number INT,
  total_installments INT,
  parent_payable_id UUID REFERENCES payables(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ADICIONA A COLUNA payable_id NA TABELA transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payable_id UUID REFERENCES payables(id) ON DELETE SET NULL;

-- 4. CRIAÇÃO DE ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_payables_company_id ON payables(company_id);
CREATE INDEX IF NOT EXISTS idx_payables_month_ref ON payables(month_ref);
CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_due_date ON payables(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_payable_id ON transactions(payable_id);

-- 5. SEGURANÇA (RLS) PARA payables
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payables' AND policyname = 'payables_company_access'
  ) THEN
    CREATE POLICY "payables_company_access" ON payables
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;

-- 6. CRIAÇÃO DO BUCKET DE STORAGE PARA COMPROVANTES (financial_docs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial_docs', 'financial_docs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para o Storage bucket financial_docs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'financial_docs_authenticated_upload'
  ) THEN
    CREATE POLICY "financial_docs_authenticated_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'financial_docs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'financial_docs_public_read'
  ) THEN
    CREATE POLICY "financial_docs_public_read" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'financial_docs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'financial_docs_authenticated_delete'
  ) THEN
    CREATE POLICY "financial_docs_authenticated_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'financial_docs');
  END IF;
END $$;
