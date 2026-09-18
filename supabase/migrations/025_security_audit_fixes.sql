-- ==============================================================================
-- 025_security_audit_fixes.sql
-- Correções da Auditoria de Segurança — Setembro 2026
-- Resolve: VUL-01 (companies/user_companies abertas), VUL-02 (OPS sem filtro),
--          VUL-03 (company_id IS NULL nas policies de negócio)
-- ==============================================================================

-- ============================================================================
-- VUL-01: Fechar "companies_all_access" e "user_companies_all_access"
-- Essas policies foram criadas como workaround de recursão mas deixaram
-- todas as empresas e membros expostos a qualquer usuário autenticado.
-- ============================================================================

DROP POLICY IF EXISTS "companies_all_access" ON companies;
DROP POLICY IF EXISTS "user_companies_all_access" ON user_companies;

-- companies: acesso seguro via subquery direta (sem chamar has_company_access, evita recursão)
CREATE POLICY "companies_secure_select" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "companies_secure_insert" ON companies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_companies WHERE user_id = auth.uid() AND role = 'master')
  );

CREATE POLICY "companies_secure_update" ON companies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies
      WHERE user_id = auth.uid() AND company_id = id AND role IN ('master', 'admin')
    )
  );

CREATE POLICY "companies_secure_delete" ON companies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies
      WHERE user_id = auth.uid() AND company_id = id AND role = 'master'
    )
  );

-- user_companies: cada usuário vê suas próprias vinculações e as da empresa que administra
CREATE POLICY "user_companies_secure_select" ON user_companies
  FOR SELECT USING (
    user_id = auth.uid() OR
    company_id IN (
      SELECT uc2.company_id FROM user_companies uc2
      WHERE uc2.user_id = auth.uid() AND uc2.role IN ('master', 'admin')
    )
  );

CREATE POLICY "user_companies_secure_insert" ON user_companies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc2
      WHERE uc2.user_id = auth.uid() AND uc2.company_id = company_id AND uc2.role IN ('master', 'admin')
    )
  );

CREATE POLICY "user_companies_secure_update" ON user_companies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc2
      WHERE uc2.user_id = auth.uid() AND uc2.company_id = user_companies.company_id AND uc2.role IN ('master', 'admin')
    )
  );

CREATE POLICY "user_companies_secure_delete" ON user_companies
  FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_companies uc2
      WHERE uc2.user_id = auth.uid() AND uc2.company_id = user_companies.company_id AND uc2.role IN ('master', 'admin')
    )
  );


-- ============================================================================
-- VUL-02: Corrigir RLS das tabelas OPS (isolamento por empresa)
-- As policies originais usavam apenas auth.uid() IS NOT NULL,
-- expondo dados de todas as empresas a qualquer usuário.
-- ============================================================================

DROP POLICY IF EXISTS "ops_team_members_access" ON ops_team_members;
DROP POLICY IF EXISTS "ops_contracts_access" ON ops_company_contracts;
DROP POLICY IF EXISTS "ops_templates_access" ON ops_task_templates;
DROP POLICY IF EXISTS "ops_tasks_access" ON ops_tasks;
DROP POLICY IF EXISTS "ops_time_logs_access" ON ops_time_logs;
DROP POLICY IF EXISTS "ops_vault_access" ON ops_client_vault;
DROP POLICY IF EXISTS "ops_audit_access" ON ops_vault_audit_logs;

-- ops_team_members: acessível somente por masters e admins (equipe interna da Oeco)
CREATE POLICY "ops_team_members_secure" ON ops_team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_companies
      WHERE user_id = auth.uid() AND role IN ('master', 'admin')
    )
  );

-- ops_company_contracts: isolado por empresa
CREATE POLICY "ops_contracts_secure" ON ops_company_contracts
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

-- ops_task_templates: leitura para todos autenticados, escrita apenas master/admin
CREATE POLICY "ops_templates_secure_select" ON ops_task_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ops_templates_secure_write" ON ops_task_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_companies
      WHERE user_id = auth.uid() AND role IN ('master', 'admin')
    )
  );

-- ops_tasks: isolado por empresa
CREATE POLICY "ops_tasks_secure" ON ops_tasks
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

-- ops_time_logs: usuário vê seus próprios logs; masters/admins veem todos da empresa
CREATE POLICY "ops_time_logs_secure" ON ops_time_logs
  FOR ALL USING (
    user_id = auth.uid() OR
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid() AND uc.role IN ('master', 'admin')
    )
  );

-- COFRE DE SENHAS: acesso estritamente por empresa
CREATE POLICY "ops_vault_secure" ON ops_client_vault
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

-- AUDITORIA DO COFRE: somente leitura para masters/admins; inserção apenas pelo próprio usuário
CREATE POLICY "ops_audit_secure_select" ON ops_vault_audit_logs
  FOR SELECT USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid() AND uc.role IN ('master', 'admin')
    )
  );

CREATE POLICY "ops_audit_secure_insert" ON ops_vault_audit_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- VUL-03: Remover "company_id IS NULL" das policies de negócio
-- Após todas as migrações de backfill (005, 009), não deve existir mais
-- nenhum registro sem company_id. A cláusula estava permitindo acesso
-- universal a registros "órfãos".
-- ============================================================================

-- Verifica se ainda existem registros com company_id NULL antes de remover a permissividade
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM categories WHERE company_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'Ainda existem % registros em categories sem company_id. Eles perderão acesso após esta migração.', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM transactions WHERE company_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'Ainda existem % registros em transactions sem company_id.', v_count;
  END IF;
END $$;

-- categories
DROP POLICY IF EXISTS "categories_access_policy" ON categories;
CREATE POLICY "categories_access_policy" ON categories
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- transactions
DROP POLICY IF EXISTS "transactions_access_policy" ON transactions;
CREATE POLICY "transactions_access_policy" ON transactions
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- receivables
DROP POLICY IF EXISTS "receivables_access_policy" ON receivables;
CREATE POLICY "receivables_access_policy" ON receivables
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- bank_accounts
DROP POLICY IF EXISTS "bank_accounts_access_policy" ON bank_accounts;
CREATE POLICY "bank_accounts_access_policy" ON bank_accounts
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- cost_centers
DROP POLICY IF EXISTS "cost_centers_access_policy" ON cost_centers;
CREATE POLICY "cost_centers_access_policy" ON cost_centers
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- reconciliation_status
DROP POLICY IF EXISTS "reconciliation_access_policy" ON reconciliation_status;
CREATE POLICY "reconciliation_access_policy" ON reconciliation_status
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- settings
DROP POLICY IF EXISTS "settings_access_policy" ON settings;
CREATE POLICY "settings_access_policy" ON settings
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- suppliers (já estava correto mas tinha o IS NULL — padronizar)
DROP POLICY IF EXISTS "suppliers_company_access" ON suppliers;
CREATE POLICY "suppliers_company_access" ON suppliers
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- customers
DROP POLICY IF EXISTS "customers_company_access" ON customers;
CREATE POLICY "customers_company_access" ON customers
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- legal_cases
DROP POLICY IF EXISTS "legal_cases_company_access" ON legal_cases;
CREATE POLICY "legal_cases_company_access" ON legal_cases
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- legal_fee_splits
DROP POLICY IF EXISTS "legal_fee_splits_company_access" ON legal_fee_splits;
CREATE POLICY "legal_fee_splits_company_access" ON legal_fee_splits
  FOR ALL USING (has_company_access(auth.uid(), company_id));

-- legal_settlements (se existir)
DROP POLICY IF EXISTS "legal_settlements_company_access" ON legal_settlements;
CREATE POLICY "legal_settlements_company_access" ON legal_settlements
  FOR ALL USING (has_company_access(auth.uid(), company_id));
