-- ==============================================================================
-- 020_legal_firm_settings.sql
-- Fase 3 (Ajuste): Parâmetros Jurídicos do Escritório / Patrono da Causa
-- ==============================================================================

-- Adiciona campos na tabela settings para personalização do patrono da causa e registro na OAB
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_patron_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS legal_oab_number TEXT;
