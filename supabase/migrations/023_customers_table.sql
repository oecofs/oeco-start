-- =========================================================================
-- Oeco Start — Migration 023: Banco de Clientes e Vínculo com Recebíveis/Contratos
-- =========================================================================

-- 1. CRIA A TABELA customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  email TEXT,
  default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  default_cost_center TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

-- 2. ADICIONA customer_id NAS TABELAS receivables E contracts
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_receivables_customer_id ON receivables(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer_id ON contracts(customer_id);

-- 4. SEGURANÇA (RLS) PARA customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'customers_company_access'
  ) THEN
    CREATE POLICY "customers_company_access" ON customers
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;
