-- ==============================================================================
-- 021_legal_splits_and_pipeline.sql
-- Fase 4: Splits de Honorários (Parcerias e Correspondentes) & Pipeline de Êxito
-- ==============================================================================

-- 1. Adiciona campos de Pipeline / Previsibilidade de Êxito na tabela legal_cases
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS claim_value NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS expected_fee_rate NUMERIC(5, 2) DEFAULT 30.00;
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS current_phase TEXT NOT NULL DEFAULT 'initial' CHECK (current_phase IN ('initial', 'instruction', 'sentence', 'appeal', 'execution', 'settled'));
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS probability TEXT NOT NULL DEFAULT 'medium' CHECK (probability IN ('high', 'medium', 'low'));
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS estimated_conclusion_date DATE;

-- Índice para consultas rápidas por fase processual
CREATE INDEX IF NOT EXISTS idx_legal_cases_phase ON public.legal_cases(company_id, current_phase);

-- 2. Tabela de Splits / Rateio de Honorários com Parceiros e Correspondentes
CREATE TABLE IF NOT EXISTS public.legal_fee_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    legal_case_id UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
    settlement_id UUID REFERENCES public.legal_settlements(id) ON DELETE CASCADE,
    
    -- Dados do Parceiro / Advogado Externo
    partner_name TEXT NOT NULL,
    partner_role TEXT NOT NULL DEFAULT 'partner' CHECK (partner_role IN ('partner', 'captador', 'correspondent', 'associate', 'expert')),
    partner_pix_or_bank TEXT,
    
    -- Regra de Rateio
    split_type TEXT NOT NULL DEFAULT 'percentage' CHECK (split_type IN ('percentage', 'fixed')),
    split_percentage NUMERIC(5, 2) DEFAULT 0.00,
    split_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    
    -- Vínculo com o Contas a Pagar do Escritório
    payable_id UUID REFERENCES public.payables(id) ON DELETE SET NULL,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'paid')),
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.legal_fee_splits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'legal_fee_splits' AND policyname = 'legal_fee_splits_company_access'
  ) THEN
    CREATE POLICY "legal_fee_splits_company_access" ON public.legal_fee_splits
      FOR ALL USING (
        company_id IS NULL OR has_company_access(auth.uid(), company_id)
      );
  END IF;
END $$;

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_splits_company ON public.legal_fee_splits(company_id);
CREATE INDEX IF NOT EXISTS idx_splits_case ON public.legal_fee_splits(legal_case_id);
CREATE INDEX IF NOT EXISTS idx_splits_settlement ON public.legal_fee_splits(settlement_id);
