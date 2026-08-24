-- =========================================================================
-- Oeco Start — Migration 008: Hardening de Segurança e Blindagem Multi-Tenant
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES DE VERIFICAÇÃO DE SEGURANÇA
-- -------------------------------------------------------------------------

-- Verifica se o usuário autenticado é Master
CREATE OR REPLACE FUNCTION is_master(p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND role = 'master'
  );
END;
$$ LANGUAGE plpgsql;

-- Verifica se o usuário tem acesso à empresa
CREATE OR REPLACE FUNCTION has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN is_master(p_user_id) OR EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND company_id = p_company_id
  );
END;
$$ LANGUAGE plpgsql;

-- Verifica se o usuário tem papéis autorizados na empresa
CREATE OR REPLACE FUNCTION has_company_role(p_user_id UUID, p_company_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF is_master(p_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND company_id = p_company_id AND role = ANY(p_roles)
  );
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------------------------
-- 2. RLS EM companies E user_companies
-- -------------------------------------------------------------------------

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas se existirem
DROP POLICY IF EXISTS "companies_select_policy" ON companies;
DROP POLICY IF EXISTS "companies_insert_policy" ON companies;
DROP POLICY IF EXISTS "companies_update_policy" ON companies;
DROP POLICY IF EXISTS "companies_delete_policy" ON companies;

DROP POLICY IF EXISTS "user_companies_select_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_insert_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_update_policy" ON user_companies;
DROP POLICY IF EXISTS "user_companies_delete_policy" ON user_companies;

-- COMPANIES POLICIES
CREATE POLICY "companies_select_policy" ON companies
  FOR SELECT USING (
    is_master(auth.uid()) OR id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
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

-- USER_COMPANIES POLICIES
CREATE POLICY "user_companies_select_policy" ON user_companies
  FOR SELECT USING (
    is_master(auth.uid()) OR user_id = auth.uid() OR company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "user_companies_insert_policy" ON user_companies
  FOR INSERT WITH CHECK (
    is_master(auth.uid()) OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );

CREATE POLICY "user_companies_update_policy" ON user_companies
  FOR UPDATE USING (
    is_master(auth.uid()) OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );

CREATE POLICY "user_companies_delete_policy" ON user_companies
  FOR DELETE USING (
    is_master(auth.uid()) OR has_company_role(auth.uid(), company_id, ARRAY['admin'])
  );


-- -------------------------------------------------------------------------
-- 3. RLS BLINDADO EM TODAS AS TABELAS DE NEGÓCIO
-- -------------------------------------------------------------------------

-- CATEGORIES
DROP POLICY IF EXISTS "categories_select_own" ON categories;
DROP POLICY IF EXISTS "categories_insert_own" ON categories;
DROP POLICY IF EXISTS "categories_update_own" ON categories;
DROP POLICY IF EXISTS "categories_delete_own" ON categories;

CREATE POLICY "categories_select_mt" ON categories
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "categories_insert_mt" ON categories
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "categories_update_mt" ON categories
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "categories_delete_mt" ON categories
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- TRANSACTIONS
DROP POLICY IF EXISTS "transactions_select_own" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON transactions;
DROP POLICY IF EXISTS "transactions_update_own" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_own" ON transactions;

CREATE POLICY "transactions_select_mt" ON transactions
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "transactions_insert_mt" ON transactions
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "transactions_update_mt" ON transactions
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "transactions_delete_mt" ON transactions
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- RECEIVABLES
DROP POLICY IF EXISTS "receivables_select_own" ON receivables;
DROP POLICY IF EXISTS "receivables_insert_own" ON receivables;
DROP POLICY IF EXISTS "receivables_update_own" ON receivables;
DROP POLICY IF EXISTS "receivables_delete_own" ON receivables;

CREATE POLICY "receivables_select_mt" ON receivables
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "receivables_insert_mt" ON receivables
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "receivables_update_mt" ON receivables
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "receivables_delete_mt" ON receivables
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- BANK_ACCOUNTS
DROP POLICY IF EXISTS "bank_accounts_select_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_insert_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_update_own" ON bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_delete_own" ON bank_accounts;

CREATE POLICY "bank_accounts_select_mt" ON bank_accounts
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "bank_accounts_insert_mt" ON bank_accounts
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "bank_accounts_update_mt" ON bank_accounts
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "bank_accounts_delete_mt" ON bank_accounts
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- COST_CENTERS
DROP POLICY IF EXISTS "cost_centers_select_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_insert_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_update_own" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_delete_own" ON cost_centers;

CREATE POLICY "cost_centers_select_mt" ON cost_centers
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "cost_centers_insert_mt" ON cost_centers
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "cost_centers_update_mt" ON cost_centers
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "cost_centers_delete_mt" ON cost_centers
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- RECONCILIATION_STATUS
DROP POLICY IF EXISTS "reconciliation_select_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_insert_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_update_own" ON reconciliation_status;
DROP POLICY IF EXISTS "reconciliation_delete_own" ON reconciliation_status;

CREATE POLICY "reconciliation_select_mt" ON reconciliation_status
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "reconciliation_insert_mt" ON reconciliation_status
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "reconciliation_update_mt" ON reconciliation_status
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin', 'operator']));

CREATE POLICY "reconciliation_delete_mt" ON reconciliation_status
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

-- SETTINGS
DROP POLICY IF EXISTS "settings_select_own" ON settings;
DROP POLICY IF EXISTS "settings_insert_own" ON settings;
DROP POLICY IF EXISTS "settings_update_own" ON settings;
DROP POLICY IF EXISTS "settings_delete_own" ON settings;

CREATE POLICY "settings_select_mt" ON settings
  FOR SELECT USING (has_company_access(auth.uid(), company_id));

CREATE POLICY "settings_insert_mt" ON settings
  FOR INSERT WITH CHECK (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "settings_update_mt" ON settings
  FOR UPDATE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));

CREATE POLICY "settings_delete_mt" ON settings
  FOR DELETE USING (has_company_role(auth.uid(), company_id, ARRAY['master', 'admin']));


-- -------------------------------------------------------------------------
-- 4. RE-DEFINIÇÃO SEGURA DE TODAS AS RPCs COM VALIDAÇÃO DE AUTORIZAÇÃO
-- -------------------------------------------------------------------------

-- 4.1 Buscar Membros
CREATE OR REPLACE FUNCTION get_company_members(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
) 
SECURITY DEFINER
AS $$
BEGIN
  -- Validação de segurança: apenas quem tem acesso à empresa pode listar membros
  IF NOT has_company_access(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado: Você não tem permissão para visualizar os membros desta empresa.';
  END IF;

  RETURN QUERY
  SELECT 
    uc.id,
    uc.user_id,
    au.email::TEXT,
    uc.role,
    uc.created_at
  FROM user_companies uc
  JOIN auth.users au ON au.id = uc.user_id
  WHERE uc.company_id = p_company_id
  ORDER BY uc.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 4.2 Adicionar Membro por E-mail
CREATE OR REPLACE FUNCTION add_company_member_by_email(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
  v_target_user_id UUID;
  v_member_id UUID;
BEGIN
  -- Validação de segurança: Apenas Master ou Admin da empresa podem adicionar membros
  IF NOT has_company_role(auth.uid(), p_company_id, ARRAY['master', 'admin']) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas Masters ou Administradores podem vincular usuários.';
  END IF;

  -- Apenas Master pode conceder o papel 'master'
  IF p_role = 'master' AND NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas usuários Master podem conceder permissão Master global.';
  END IF;

  -- Busca o usuário pelo e-mail
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Usuário com este e-mail não encontrado no sistema. O usuário deve primeiro criar uma conta.'
    );
  END IF;

  -- Insere ou atualiza o vínculo
  INSERT INTO user_companies (user_id, company_id, role)
  VALUES (v_target_user_id, p_company_id, p_role)
  ON CONFLICT (user_id, company_id) 
  DO UPDATE SET role = p_role
  RETURNING id INTO v_member_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Usuário vinculado com sucesso!',
    'member_id', v_member_id
  );
END;
$$ LANGUAGE plpgsql;

-- 4.3 Atualizar Papel do Membro
CREATE OR REPLACE FUNCTION update_company_member_role(
  p_company_id UUID,
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  -- Validação de segurança: Apenas Master ou Admin da empresa podem alterar papéis
  IF NOT has_company_role(auth.uid(), p_company_id, ARRAY['master', 'admin']) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas Masters ou Administradores podem alterar permissões.';
  END IF;

  -- Apenas Master pode conceder ou remover o papel 'master'
  IF (p_new_role = 'master' OR EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND company_id = p_company_id AND role = 'master')) 
     AND NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas usuários Master podem alterar perfis Master.';
  END IF;

  UPDATE user_companies
  SET role = p_new_role
  WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 4.4 Atualizar Dados da Empresa
CREATE OR REPLACE FUNCTION update_company_info(
  p_company_id UUID,
  p_name TEXT,
  p_cnpj TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  -- Validação de segurança: Apenas Master ou Admin podem editar dados da empresa
  IF NOT has_company_role(auth.uid(), p_company_id, ARRAY['master', 'admin']) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas Masters ou Administradores podem editar dados da empresa.';
  END IF;

  UPDATE companies
  SET 
    name = TRIM(p_name),
    cnpj = NULLIF(TRIM(p_cnpj), '')
  WHERE id = p_company_id;

  UPDATE settings
  SET company_name = TRIM(p_name)
  WHERE company_id = p_company_id;
END;
$$ LANGUAGE plpgsql;

-- 4.5 Remover Membro da Empresa
CREATE OR REPLACE FUNCTION remove_company_member(
  p_company_id UUID,
  p_user_id UUID
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  -- Validação de segurança: Apenas Master ou Admin podem remover membros
  IF NOT has_company_role(auth.uid(), p_company_id, ARRAY['master', 'admin']) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas Masters ou Administradores podem remover usuários.';
  END IF;

  -- Não permite que admin comum remova um Master
  IF EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND role = 'master') AND NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas um Master pode remover outro Master.';
  END IF;

  DELETE FROM user_companies
  WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
