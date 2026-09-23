-- ==============================================================================
-- 028_final_fix_user_companies_no_recursion.sql
-- CORREÇÃO FINAL: Elimina completamente a recursão em user_companies.
--
-- Problema: policy com subquery self-referencial em user_companies
--   → Postgres detecta recursão → retorna zero linhas para admins
--   → App vê userComps = [] → trata todos como sem empresa
--
-- Solução: policy SIMPLES, apenas duas condições não-recursivas:
--   1. user_id = auth.uid()  → o próprio usuário sempre vê seus vínculos
--   2. is_master(auth.uid()) → masters veem todos os vínculos
--
-- Gestão de membros por admins já é feita via get_company_members()
-- que é SECURITY DEFINER e não passa pelo RLS.
-- ==============================================================================

-- Remove TODAS as variações de policy que podem estar ativas
DROP POLICY IF EXISTS "user_companies_select_policy"   ON user_companies;
DROP POLICY IF EXISTS "user_companies_secure_select"   ON user_companies;
DROP POLICY IF EXISTS "user_companies_all_access"      ON user_companies;

-- Recria de forma limpa: SEM subquery self-referencial
CREATE POLICY "user_companies_select_policy" ON user_companies
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    is_master(auth.uid())
  );

-- ==============================================================================
-- Verificação: lista as policies ativas em user_companies após a correção
-- ==============================================================================
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_companies'
ORDER BY policyname;
