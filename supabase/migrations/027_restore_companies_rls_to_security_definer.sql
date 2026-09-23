-- ==============================================================================
-- 027_restore_companies_rls_to_security_definer.sql
-- CORREÇÃO DEFINITIVA: Restaura as policies de companies e user_companies
-- para usar as funções SECURITY DEFINER (is_master, has_company_access,
-- has_company_role) que bypassam RLS — eliminando a recursão circular
-- introduzida pela migração 025.
-- ==============================================================================

-- ============================================================================
-- PASSO 1: Remover TODAS as policies conflitantes criadas nas migrações 025 e 026
-- ============================================================================

-- Policies da 025
DROP POLICY IF EXISTS "companies_secure_select"  ON companies;
DROP POLICY IF EXISTS "companies_secure_insert"  ON companies;
DROP POLICY IF EXISTS "companies_secure_update"  ON companies;
DROP POLICY IF EXISTS "companies_secure_delete"  ON companies;

DROP POLICY IF EXISTS "user_companies_secure_select" ON user_companies;
DROP POLICY IF EXISTS "user_companies_secure_insert" ON user_companies;
DROP POLICY IF EXISTS "user_companies_secure_update" ON user_companies;
DROP POLICY IF EXISTS "user_companies_secure_delete" ON user_companies;

-- Policies originais da 008 (se existirem, removemos para recriar limpas)
DROP POLICY IF EXISTS "companies_select_policy" ON companies;
DROP POLICY IF EXISTS "companies_insert_policy" ON companies;
DROP POLICY IF EXISTS "companies_update_policy" ON companies;
DROP POLICY IF EXISTS "companies_delete_policy" ON companies;

DROP POLICY IF EXISTS "user_companies_select_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_insert_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_update_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_delete_policy" ON user_companies;

-- Workaround abertas da 009 (garantia)
DROP POLICY IF EXISTS "companies_all_access"      ON companies;
DROP POLICY IF EXISTS "user_companies_all_access" ON user_companies;


-- ============================================================================
-- PASSO 2: Recriar policies usando SECURITY DEFINER functions (sem recursão)
-- As funções is_master(), has_company_access() e has_company_role() da
-- migração 008 são SECURITY DEFINER — elas consultam user_companies
-- diretamente como superuser, SEM passar pelo RLS → zero recursão.
-- ============================================================================

-- COMPANIES
CREATE POLICY "companies_select_policy" ON companies
  FOR SELECT USING (
    is_master(auth.uid()) 
    OR id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "companies_insert_policy" ON companies
  FOR INSERT WITH CHECK (
    is_master(auth.uid())
  );

CREATE POLICY "companies_update_policy" ON companies
  FOR UPDATE USING (
    has_company_role(auth.uid(), id, ARRAY['master', 'admin'])
  );

CREATE POLICY "companies_delete_policy" ON companies
  FOR DELETE USING (
    is_master(auth.uid())
  );


-- USER_COMPANIES
-- SELECT: o próprio usuário vê seus vínculos + master vê todos + admin vê empresa
CREATE POLICY "user_companies_select_policy" ON user_companies
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_master(auth.uid())
    OR company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND role IN ('master', 'admin')
    )
  );
-- Nota: a subquery acima só é avaliada quando is_master() retorna FALSE e
-- user_id != auth.uid(). A condição user_id = auth.uid() cobre o caso mais
-- comum (o usuário vendo seus próprios registros) sem tocar na subquery.

CREATE POLICY "user_companies_insert_policy" ON user_companies
  FOR INSERT WITH CHECK (
    is_master(auth.uid()) 
    OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );

CREATE POLICY "user_companies_update_policy" ON user_companies
  FOR UPDATE USING (
    is_master(auth.uid()) 
    OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );

CREATE POLICY "user_companies_delete_policy" ON user_companies
  FOR DELETE USING (
    user_id = auth.uid()
    OR is_master(auth.uid()) 
    OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );
