-- =========================================================================
-- Oeco Start — Migration 031: Perfis de Empresas (Obras Only vs Obras + Financeiro)
-- =========================================================================

-- Atualiza a constraint de segment na tabela companies para suportar perfis de obras
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_segment_check;

ALTER TABLE companies ADD CONSTRAINT companies_segment_check 
  CHECK (segment IN ('general', 'legal', 'obras_only', 'obras_financial'));

COMMENT ON COLUMN companies.segment IS 'Perfil de atuação: general (Financeiro Geral), legal (Jurídico), obras_only (Exclusivo Obras), obras_financial (Obras + Financeiro Integrado)';
