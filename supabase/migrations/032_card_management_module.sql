-- =========================================================================
-- Oeco Start — Migration 032: Módulo de Gestão e Conciliação de Cartões
-- =========================================================================

-- 1. TABELA DE MAQUININHAS / ADQUIRENTES (card_terminals)
CREATE TABLE IF NOT EXISTS card_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- Ex: "Stone Balcão Loja 1", "PagBank Principal"
  acquirer TEXT NOT NULL, -- "stone", "cielo", "rede", "pagbank", "getnet", "mercadopago", "infinitepay", "other"
  model_serial TEXT, -- Número de série do POS (opcional)
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL, -- Conta de liquidação padrão
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA DE REGRAS DE TAXAS / MDR (card_rate_rules)
CREATE TABLE IF NOT EXISTS card_rate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  terminal_id UUID REFERENCES card_terminals(id) ON DELETE CASCADE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('debit', 'credit_cash', 'credit_installment', 'voucher', 'pix')),
  brand TEXT NOT NULL DEFAULT 'all', -- 'all', 'visa', 'mastercard', 'elo', 'hipercard', 'amex'
  min_installments INTEGER DEFAULT 1,
  max_installments INTEGER DEFAULT 1,
  mdr_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- Ex: 2.19 (%)
  fixed_fee DECIMAL(10,2) DEFAULT 0.00, -- Ex: R$ 0.40 por transação
  settlement_days INTEGER NOT NULL DEFAULT 30, -- Dias para liquidação (ex: 1 para débito, 30 para crédito)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA DE VENDAS NO CARTÃO (card_sales)
CREATE TABLE IF NOT EXISTS card_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  terminal_id UUID REFERENCES card_terminals(id) ON DELETE RESTRICT NOT NULL,
  sale_date TIMESTAMPTZ NOT NULL, -- Data e hora da transação
  gross_amount DECIMAL(12,2) NOT NULL, -- Valor Bruto da venda
  net_amount DECIMAL(12,2) NOT NULL, -- Valor Líquido Total esperado
  total_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- Total retido pela maquininha
  payment_method TEXT NOT NULL CHECK (payment_method IN ('debit', 'credit_cash', 'credit_installment', 'voucher', 'pix')),
  brand TEXT NOT NULL DEFAULT 'other',
  installments_count INTEGER NOT NULL DEFAULT 1,
  authorization_code TEXT, -- Código de Autorização
  nsu TEXT, -- Número Sequencial Único / CV da adquirente
  doc_number TEXT, -- Número do documento / DOC
  card_last_digits VARCHAR(4), -- Ex: "9208" (últimos 4 dígitos)
  terminal_serial TEXT, -- Ex: "15737577" (TERM do POS)
  customer_name TEXT, -- Nome do cliente (opcional)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  receipt_image_url TEXT, -- URL/caminho da foto do canhoto (se cadastrado por foto)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial_settled', 'settled', 'cancelled', 'chargeback')),
  entry_source TEXT NOT NULL DEFAULT 'manual' CHECK (entry_source IN ('manual', 'ocr_receipt', 'csv_import', 'api_sync')),
  notes TEXT,
  month_ref TEXT NOT NULL, -- Ex: "2026-10"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA DE PARCELAS / LIQUIDAÇÕES FUTURAS (card_installments)
CREATE TABLE IF NOT EXISTS card_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  sale_id UUID REFERENCES card_sales(id) ON DELETE CASCADE NOT NULL,
  installment_number INTEGER NOT NULL DEFAULT 1, -- Ex: 1
  total_installments INTEGER NOT NULL DEFAULT 1, -- Ex: 3 (1/3)
  gross_amount DECIMAL(12,2) NOT NULL,
  fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(12,2) NOT NULL,
  expected_date DATE NOT NULL, -- Data prevista para o dinheiro cair no banco
  settled_date DATE, -- Data efetiva de liquidação no extrato
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'settled', 'anticipated', 'cancelled', 'chargeback')),
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL, -- Vínculo com extrato bancário
  month_ref TEXT NOT NULL, -- Mês da liquidação prevista
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ÍNDICES DE PERFORMANCE E CONSULTAS
CREATE INDEX IF NOT EXISTS idx_card_terminals_company_id ON card_terminals(company_id);
CREATE INDEX IF NOT EXISTS idx_card_rate_rules_terminal_id ON card_rate_rules(terminal_id);
CREATE INDEX IF NOT EXISTS idx_card_rate_rules_company_id ON card_rate_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_card_sales_company_id ON card_sales(company_id);
CREATE INDEX IF NOT EXISTS idx_card_sales_terminal_id ON card_sales(terminal_id);
CREATE INDEX IF NOT EXISTS idx_card_sales_sale_date ON card_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_card_sales_month_ref ON card_sales(month_ref);
CREATE INDEX IF NOT EXISTS idx_card_sales_nsu ON card_sales(company_id, nsu);
CREATE INDEX IF NOT EXISTS idx_card_sales_auth_code ON card_sales(company_id, authorization_code);

CREATE INDEX IF NOT EXISTS idx_card_installments_company_id ON card_installments(company_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_sale_id ON card_installments(sale_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_expected_date ON card_installments(expected_date);
CREATE INDEX IF NOT EXISTS idx_card_installments_month_ref ON card_installments(month_ref);
CREATE INDEX IF NOT EXISTS idx_card_installments_status ON card_installments(status);
CREATE INDEX IF NOT EXISTS idx_card_installments_linked_tx ON card_installments(linked_transaction_id);

-- 6. HABILITAR SEGURANÇA POR LINHA (RLS)
ALTER TABLE card_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_rate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_installments ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE RLS (Multi-empresa)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_terminals' AND policyname = 'card_terminals_company_access') THEN
    CREATE POLICY "card_terminals_company_access" ON card_terminals
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_rate_rules' AND policyname = 'card_rate_rules_company_access') THEN
    CREATE POLICY "card_rate_rules_company_access" ON card_rate_rules
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_sales' AND policyname = 'card_sales_company_access') THEN
    CREATE POLICY "card_sales_company_access" ON card_sales
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_installments' AND policyname = 'card_installments_company_access') THEN
    CREATE POLICY "card_installments_company_access" ON card_installments
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;
END $$;
