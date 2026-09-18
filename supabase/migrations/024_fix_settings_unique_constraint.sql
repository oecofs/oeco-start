-- ==============================================================================
-- 024_fix_settings_unique_constraint.sql
-- Correção da constraint de unicidade da tabela settings para Multi-empresas
-- ==============================================================================

-- 1. Remove a restrição legada que impedia o mesmo usuário de ter mais de uma empresa
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_user_id_key;

-- 2. Garante que cada empresa tenha no máximo 1 registro de settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_company_id_key'
  ) THEN
    -- Limpa possíveis duplicidades antigas se houver antes de criar a chave única
    DELETE FROM public.settings a USING public.settings b
    WHERE a.id < b.id AND a.company_id = b.company_id AND a.company_id IS NOT NULL;

    ALTER TABLE public.settings ADD CONSTRAINT settings_company_id_key UNIQUE (company_id);
  END IF;
END $$;
