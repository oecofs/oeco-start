-- =========================================================================
-- Oeco Start — Migration 017: Banco de Fornecedores e Vínculo com Payables
-- =========================================================================

-- 1. CRIA A TABELA suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cnpj TEXT,
  default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  default_cost_center TEXT,
  default_pix_or_barcode TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

-- 2. ADICIONA supplier_id NA TABELA payables
ALTER TABLE payables ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_payables_supplier_id ON payables(supplier_id);

-- 4. SEGURANÇA (RLS) PARA suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'suppliers_company_access'
  ) THEN
    CREATE POLICY "suppliers_company_access" ON suppliers
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;
