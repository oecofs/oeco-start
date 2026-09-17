-- ==============================================================================
-- 019_settlements_and_alvaras.sql
-- Fase 3: Central de Alvarás, RPVs, Repasses a Clientes e Honorários Advocatícios
-- ==============================================================================

-- 1. Tabela de Liquidação de Alvarás e RPVs (legal_settlements)
CREATE TABLE IF NOT EXISTS public.legal_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    legal_case_id UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE RESTRICT,
    
    -- Identificação do Título Judicial / Alvará / RPV
    settlement_number TEXT, -- Ex: "Alvará nº 489/2026", "RPV nº 2026.001.99"
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Quebra Financeira Matemática
    gross_amount NUMERIC(15, 2) NOT NULL CHECK (gross_amount > 0),
    contractual_fee_rate NUMERIC(5, 2) NOT NULL DEFAULT 30.00, -- Ex: 30%
    contractual_fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    succumbence_fee_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00, -- Honorários de sucumbência pertencentes ao advogado
    deducted_costs_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00, -- Custas que o escritório adiantou e agora ressarciu
    net_client_amount NUMERIC(15, 2) NOT NULL CHECK (net_client_amount >= 0), -- O que sobra líquido para o cliente
    
    -- Dados de Repasse do Cliente
    client_name TEXT NOT NULL,
    client_pix_or_bank TEXT, -- Chave Pix ou conta do cliente para transferência
    
    -- Vínculos com o Financeiro Real
    client_payable_id UUID REFERENCES public.payables(id) ON DELETE SET NULL, -- Conta a pagar gerada para o cliente
    office_receivable_id UUID, -- Referência futura a contas a receber/faturamento líquido do escritório
    
    -- Status da liquidação
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.legal_settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_settlements' AND policyname = 'legal_settlements_company_access'
  ) THEN
    CREATE POLICY "legal_settlements_company_access" ON public.legal_settlements
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;

-- Índices para alta performance
CREATE INDEX IF NOT EXISTS idx_settlements_company ON public.legal_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_settlements_case ON public.legal_settlements(legal_case_id);
