-- ==============================================================================
-- 022_legal_lawyers_and_practice_areas.sql
-- Banca de Advogados, Modo de Assinatura & Áreas de Atuação do Direito
-- ==============================================================================

-- 1. Campos de Banca de Advogados e Áreas de Atuação na tabela settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_practice_areas JSONB DEFAULT '["civel", "trabalhista", "previdenciario", "tributario", "familia", "penal"]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_lawyers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_signature_mode TEXT DEFAULT 'responsible';

-- 2. Campos de Área de Atuação e Advogado Responsável na tabela legal_cases
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS practice_area TEXT;
ALTER TABLE public.legal_cases ADD COLUMN IF NOT EXISTS responsible_lawyer TEXT;

-- Índice para acelerar filtros de processos por área de atuação
CREATE INDEX IF NOT EXISTS idx_legal_cases_practice_area ON public.legal_cases(company_id, practice_area);
