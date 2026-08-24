-- =========================================================================
-- Oeco Start — Migration 009: Correção de Recursão de RLS e Restauração Total dos Dados
-- =========================================================================

-- 1. LIMPEZA DE POLICIES ANTIGAS
DROP POLICY IF EXISTS "companies_select_policy" ON companies;
DROP POLICY IF EXISTS "companies_insert_policy" ON companies;
DROP POLICY IF EXISTS "companies_update_policy" ON companies;
DROP POLICY IF EXISTS "companies_delete_policy" ON companies;
DROP POLICY IF EXISTS "companies_select_clean" ON companies;
DROP POLICY IF EXISTS "companies_insert_clean" ON companies;
DROP POLICY IF EXISTS "companies_update_clean" ON companies;
DROP POLICY IF EXISTS "companies_delete_clean" ON companies;

DROP POLICY IF EXISTS "user_companies_select_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_insert_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_update_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_delete_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_select_clean" ON user_companies;
DROP POLICY IF EXISTS "user_companies_insert_clean" ON user_companies;
DROP POLICY IF EXISTS "user_companies_update_clean" ON user_companies;
DROP POLICY IF EXISTS "user_companies_delete_clean" ON user_companies;

-- 2. RE-CRIAÇÃO DAS FUNÇÕES SEM RECURSÃO E COM SEARCH_PATH SEGURO
CREATE OR REPLACE FUNCTION is_master(p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND role = 'master'
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF is_master(p_user_id) THEN
    RETURN TRUE;
  END IF;

  IF p_company_id IS NULL THEN
    RETURN TRUE; -- Permite acesso a registros legados sem empresa
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND company_id = p_company_id
  );
END;
$$ LANGUAGE plpgsql;

-- 3. POLICIES PARA companies E user_companies
CREATE POLICY "companies_all_access" ON companies
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "user_companies_all_access" ON user_companies
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 4. POLICIES NAS TABELAS DE NEGÓCIO

-- CATEGORIES
DROP POLICY IF EXISTS "categories_select_mt" ON categories;
DROP POLICY IF EXISTS "categories_insert_mt" ON categories;
DROP POLICY IF EXISTS "categories_update_mt" ON categories;
DROP POLICY IF EXISTS "categories_delete_mt" ON categories;
DROP POLICY IF EXISTS "categories_select_own" ON categories;
DROP POLICY IF EXISTS "categories_insert_own" ON categories;
DROP POLICY IF EXISTS "categories_update_own" ON categories;
DROP POLICY IF EXISTS "categories_delete_own" ON categories;
DROP POLICY IF EXISTS "categories_access_policy" ON categories;

CREATE POLICY "categories_access_policy" ON categories
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- TRANSACTIONS
DROP POLICY IF EXISTS "transactions_select_mt" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_mt" ON transactions;
DROP POLICY IF EXISTS "transactions_update_mt" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_mt" ON transactions;
DROP POLICY IF EXISTS "transactions_select_own" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON transactions;
DROP POLICY IF EXISTS "transactions_update_own" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_own" ON transactions;
DROP POLICY IF EXISTS "transactions_access_policy" ON transactions;

CREATE POLICY "transactions_access_policy" ON transactions
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- RECEIVABLES
DROP POLICY IF EXISTS "receivables_select_mt" ON receivables;
DROP POLICY IF EXISTS "receivables_insert_mt" ON receivables;
DROP POLICY IF EXISTS "receivables_update_mt" ON receivables;
DROP POLICY IF EXISTS "receivables_delete_mt" ON receivables;
DROP POLICY IF EXISTS "receivables_select_own" ON receivables;
DROP POLICY IF EXISTS "receivables_insert_own" ON receivables;
DROP POLICY IF EXISTS "receivables_update_own" ON receivables;
DROP POLICY IF EXISTS "receivables_delete_own" ON receivables;
DROP POLICY IF EXISTS "receivables_access_policy" ON receivables;

CREATE POLICY "receivables_access_policy" ON receivables
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- BANK_ACCOUNTS (Nota: bank_accounts é indexada por company_id)
DROP POLICY IF EXISTS "bank_accounts_select_mt" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_insert_mt" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_update_mt" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_delete_mt" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_select_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_insert_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_update_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_delete_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_access_policy" ON bank_accounts;

CREATE POLICY "bank_accounts_access_policy" ON bank_accounts
  FOR ALL USING (
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- COST_CENTERS
DROP POLICY IF EXISTS "cost_centers_select_mt" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_insert_mt" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_update_mt" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_delete_mt" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_select_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_insert_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_update_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_delete_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_access_policy" ON cost_centers;

CREATE POLICY "cost_centers_access_policy" ON cost_centers
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- RECONCILIATION_STATUS
DROP POLICY IF EXISTS "reconciliation_select_mt" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_insert_mt" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_update_mt" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_delete_mt" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_select_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_insert_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_update_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_delete_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_access_policy" ON reconciliation_status;

CREATE POLICY "reconciliation_access_policy" ON reconciliation_status
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- SETTINGS
DROP POLICY IF EXISTS "settings_select_mt" ON settings;
DROP POLICY IF EXISTS "settings_insert_mt" ON settings;
DROP POLICY IF EXISTS "settings_update_mt" ON settings;
DROP POLICY IF EXISTS "settings_delete_mt" ON settings;
DROP POLICY IF EXISTS "settings_select_own" ON settings;
DROP POLICY IF EXISTS "settings_insert_own" ON settings;
DROP POLICY IF EXISTS "settings_update_own" ON settings;
DROP POLICY IF EXISTS "settings_delete_own" ON settings;
DROP POLICY IF EXISTS "settings_access_policy" ON settings;

CREATE POLICY "settings_access_policy" ON settings
  FOR ALL USING (
    auth.uid() = user_id OR 
    company_id IS NULL OR 
    has_company_access(auth.uid(), company_id)
  );

-- 5. GARANTE QUE NENHUM DADO ANTIGO TENHA company_id NULO
DO $$
DECLARE
  v_main_company_id UUID;
BEGIN
  SELECT id INTO v_main_company_id FROM companies WHERE is_active = true ORDER BY created_at ASC LIMIT 1;

  IF v_main_company_id IS NOT NULL THEN
    UPDATE categories SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE transactions SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE receivables SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE bank_accounts SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE cost_centers SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE reconciliation_status SET company_id = v_main_company_id WHERE company_id IS NULL;
    UPDATE settings SET company_id = v_main_company_id WHERE company_id IS NULL;
  END IF;
END $$;
