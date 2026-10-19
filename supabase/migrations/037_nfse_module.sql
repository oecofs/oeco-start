-- =========================================================================
-- Oeco Start — Migration 037: Módulo de Emissão de NFS-e (Spedy / Prefeitura)
-- =========================================================================

-- 1. ADICIONA CAMPOS DE ENDEREÇO ESTRUTURADO NA TABELA customers (SE NÃO EXISTIREM)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS complement TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state VARCHAR(2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS municipal_inscription TEXT;

-- 2. TABELA: service_templates (Modelos Fiscais de Emissão por Empresa)
CREATE TABLE IF NOT EXISTS service_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  cnae VARCHAR(20) NOT NULL,
  service_code_lc116 VARCHAR(20) NOT NULL,
  municipal_service_code VARCHAR(20),
  default_iss_rate NUMERIC(5,2) DEFAULT 2.00,
  iss_retained_default BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA: company_fiscal_settings (Configuração Fiscal & Credenciais Spedy da Empresa)
CREATE TABLE IF NOT EXISTS company_fiscal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  spedy_company_id TEXT,
  spedy_api_key TEXT,
  municipal_inscription TEXT,
  tax_regime TEXT DEFAULT 'simples_nacional' CHECK (tax_regime IN ('mei', 'simples_nacional')),
  environment TEXT DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  has_certificate_a1 BOOLEAN DEFAULT false,
  certificate_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA: nfse_invoices (Notas Fiscais de Serviço Emitidas)
CREATE TABLE IF NOT EXISTS nfse_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  template_id UUID REFERENCES service_templates(id) ON DELETE SET NULL,
  receivable_id UUID REFERENCES receivables(id) ON DELETE SET NULL,
  
  -- Identificadores da NFS-e
  number TEXT,
  series TEXT DEFAULT '1',
  verification_code TEXT,
  spedy_id TEXT,
  spedy_protocol TEXT,
  
  -- Dados do Tomador (Snapshot na emissão)
  customer_name TEXT NOT NULL,
  customer_document TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_city TEXT NOT NULL,
  customer_state VARCHAR(2) NOT NULL,
  customer_address JSONB DEFAULT '{}'::jsonb,
  
  -- Serviço & Tributação
  competence_date DATE NOT NULL,
  issue_date TIMESTAMPTZ DEFAULT now(),
  amount NUMERIC(15,2) NOT NULL,
  cnae VARCHAR(20) NOT NULL,
  service_code_lc116 VARCHAR(20) NOT NULL,
  municipal_service_code VARCHAR(20),
  service_description TEXT NOT NULL,
  
  -- Local da Prestação (Art. 3º LC 116)
  service_location_type TEXT DEFAULT 'own_city' CHECK (service_location_type IN ('own_city', 'other_city')),
  service_location_city TEXT,
  service_location_state VARCHAR(2),
  service_location_ibge TEXT,
  
  -- Impostos
  iss_rate NUMERIC(5,2) DEFAULT 2.00,
  iss_amount NUMERIC(15,2) DEFAULT 0.00,
  iss_retained BOOLEAN DEFAULT false,
  tax_regime TEXT DEFAULT 'simples_nacional' CHECK (tax_regime IN ('mei', 'simples_nacional')),
  
  -- Ciclo de Vida da Nota
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'authorized', 'rejected', 'cancelled')),
  status_message TEXT,
  danfse_url TEXT,
  xml_url TEXT,
  raw_response JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. VÍNCULO NO RECEBÍVEL (SE EXISTIR)
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS nfse_invoice_id UUID REFERENCES nfse_invoices(id) ON DELETE SET NULL;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS nf_status TEXT;

-- 6. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_service_templates_company_id ON service_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_company_fiscal_settings_company_id ON company_fiscal_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_nfse_invoices_company_id ON nfse_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_nfse_invoices_customer_id ON nfse_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_nfse_invoices_status ON nfse_invoices(status);
CREATE INDEX IF NOT EXISTS idx_nfse_invoices_competence_date ON nfse_invoices(competence_date);
CREATE INDEX IF NOT EXISTS idx_nfse_invoices_spedy_id ON nfse_invoices(spedy_id);
CREATE INDEX IF NOT EXISTS idx_receivables_nfse_invoice_id ON receivables(nfse_invoice_id);

-- 7. SEGURANÇA (ROW LEVEL SECURITY - RLS)
ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfse_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- service_templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'service_templates' AND policyname = 'service_templates_company_access'
  ) THEN
    CREATE POLICY "service_templates_company_access" ON service_templates
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;

  -- company_fiscal_settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_settings' AND policyname = 'company_fiscal_settings_company_access'
  ) THEN
    CREATE POLICY "company_fiscal_settings_company_access" ON company_fiscal_settings
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;

  -- nfse_invoices
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nfse_invoices' AND policyname = 'nfse_invoices_company_access'
  ) THEN
    CREATE POLICY "nfse_invoices_company_access" ON nfse_invoices
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;
