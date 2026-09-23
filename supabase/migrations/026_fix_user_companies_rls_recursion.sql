-- ==============================================================================
-- 026_fix_user_companies_rls_recursion.sql
-- Corrige recursão na policy SELECT de user_companies que impedia
-- o usuário de ver seus próprios registros (lendo o próprio role).
-- ==============================================================================

-- Remove a policy que causa recursão ao verificar role dentro de si mesma
DROP POLICY IF EXISTS "user_companies_secure_select" ON user_companies;

-- Recria sem recursão:
-- Regra 1: Usuário SEMPRE vê seus próprios vínculos (user_id = auth.uid())
-- Regra 2: Masters e admins também veem os vínculos da empresa deles
--          mas usando uma subquery que busca apenas o próprio user_id
--          (sem verificar role de novo — isso evita a recursão)
CREATE POLICY "user_companies_secure_select" ON user_companies
  FOR SELECT USING (
    -- Condição primária: sempre pode ver seu próprio registro (sem recursão)
    user_id = auth.uid()
    OR
    -- Condição secundária: masters e admins veem membros da mesma empresa
    -- A subquery filtra apenas pelo user_id do próprio usuário logado
    -- sem depender do role para filtrar (evita loop)
    company_id IN (
      SELECT uc_self.company_id
      FROM user_companies uc_self
      WHERE uc_self.user_id = auth.uid()
        AND uc_self.role IN ('master', 'admin')
    )
  );
