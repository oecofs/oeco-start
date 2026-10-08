-- =========================================================================
-- Oeco Start — Migration 036: Matriz de Módulos e Permissões por Empresa e Usuário
-- =========================================================================

-- 1. TABELA: Módulos Habilitados por Empresa (Controle Master)
CREATE TABLE IF NOT EXISTS company_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_company_module UNIQUE (company_id, module_key),
  CONSTRAINT valid_module_key CHECK (module_key IN (
    'transactions', 
    'payables', 
    'receivables', 
    'cards', 
    'obras', 
    'legal_cases', 
    'reports', 
    'kpis'
  ))
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_company_modules_company ON company_modules(company_id);
CREATE INDEX IF NOT EXISTS idx_company_modules_key ON company_modules(module_key);

-- 2. TABELA: Permissões Específicas de Usuários/Convidados por Módulo (Controle da Empresa)
CREATE TABLE IF NOT EXISTS company_user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_company_user_module UNIQUE (company_id, user_id, module_key),
  CONSTRAINT valid_user_module_key CHECK (module_key IN (
    'transactions', 
    'payables', 
    'receivables', 
    'cards', 
    'obras', 
    'legal_cases', 
    'reports', 
    'kpis'
  ))
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_mod_perms_company ON company_user_module_permissions(company_id);
CREATE INDEX IF NOT EXISTS idx_user_mod_perms_user ON company_user_module_permissions(user_id);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas para company_modules
DROP POLICY IF EXISTS "company_modules_select_policy" ON company_modules;
CREATE POLICY "company_modules_select_policy" ON company_modules
  FOR SELECT
  TO authenticated
  USING (
    is_master(auth.uid()) OR 
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "company_modules_master_manage" ON company_modules;
CREATE POLICY "company_modules_master_manage" ON company_modules
  FOR ALL
  TO authenticated
  USING (is_master(auth.uid()))
  WITH CHECK (is_master(auth.uid()));

-- Políticas para company_user_module_permissions
DROP POLICY IF EXISTS "user_module_perms_select_policy" ON company_user_module_permissions;
CREATE POLICY "user_module_perms_select_policy" ON company_user_module_permissions
  FOR SELECT
  TO authenticated
  USING (
    is_master(auth.uid()) OR 
    user_id = auth.uid() OR
    company_id IN (
      SELECT company_id FROM user_companies 
      WHERE user_id = auth.uid() AND role IN ('admin', 'master')
    )
  );

DROP POLICY IF EXISTS "user_module_perms_manage_policy" ON company_user_module_permissions;
CREATE POLICY "user_module_perms_manage_policy" ON company_user_module_permissions
  FOR ALL
  TO authenticated
  USING (
    is_master(auth.uid()) OR
    company_id IN (
      SELECT company_id FROM user_companies 
      WHERE user_id = auth.uid() AND role IN ('admin', 'master')
    )
  )
  WITH CHECK (
    is_master(auth.uid()) OR
    company_id IN (
      SELECT company_id FROM user_companies 
      WHERE user_id = auth.uid() AND role IN ('admin', 'master')
    )
  );

-- 4. FUNÇÃO RPC: Master ativa/desativa módulo para uma empresa
CREATE OR REPLACE FUNCTION toggle_company_module(
  p_company_id UUID,
  p_module_key TEXT,
  p_is_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas Master pode ligar/desligar módulos de empresas
  IF NOT is_master(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas usuários Master podem alterar módulos contratados pela empresa.');
  END IF;

  INSERT INTO company_modules (company_id, module_key, is_enabled, updated_at)
  VALUES (p_company_id, p_module_key, p_is_enabled, now())
  ON CONFLICT (company_id, module_key)
  DO UPDATE SET is_enabled = p_is_enabled, updated_at = now();

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Módulo atualizado com sucesso!',
    'company_id', p_company_id,
    'module_key', p_module_key,
    'is_enabled', p_is_enabled
  );
END;
$$;

-- 5. FUNÇÃO RPC: Admin ou Master define permissão de módulo para um usuário específico
CREATE OR REPLACE FUNCTION toggle_user_module_permission(
  p_company_id UUID,
  p_user_id UUID,
  p_module_key TEXT,
  p_can_access BOOLEAN,
  p_can_edit BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Verifica permissão do chamador
  SELECT role INTO v_caller_role
  FROM user_companies
  WHERE user_id = auth.uid() AND company_id = p_company_id;

  IF NOT (is_master(auth.uid()) OR v_caller_role IN ('admin', 'master')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas administradores da empresa ou Master podem gerenciar permissões de membros.');
  END IF;

  INSERT INTO company_user_module_permissions (company_id, user_id, module_key, can_access, can_edit, updated_at)
  VALUES (p_company_id, p_user_id, p_module_key, p_can_access, p_can_edit, now())
  ON CONFLICT (company_id, user_id, module_key)
  DO UPDATE SET can_access = p_can_access, can_edit = p_can_edit, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Permissão do usuário atualizada com sucesso!',
    'company_id', p_company_id,
    'user_id', p_user_id,
    'module_key', p_module_key,
    'can_access', p_can_access,
    'can_edit', p_can_edit
  );
END;
$$;

-- 6. FUNÇÃO RPC: Listar módulos ativos e acessíveis pelo usuário logado
CREATE OR REPLACE FUNCTION get_user_accessible_modules(p_company_id UUID)
RETURNS TABLE (
  module_key TEXT,
  is_enabled_for_company BOOLEAN,
  can_access BOOLEAN,
  can_edit BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_is_master BOOLEAN;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  v_is_master := is_master(v_uid);

  SELECT role INTO v_caller_role
  FROM user_companies
  WHERE user_id = v_uid AND company_id = p_company_id;

  RETURN QUERY
  WITH all_modules AS (
    SELECT unnest(ARRAY[
      'transactions', 
      'payables', 
      'receivables', 
      'cards', 
      'obras', 
      'legal_cases', 
      'reports', 
      'kpis'
    ]) AS mod_key
  )
  SELECT 
    m.mod_key::TEXT,
    COALESCE(cm.is_enabled, TRUE) AS is_enabled_for_company,
    CASE 
      WHEN v_is_master THEN TRUE
      WHEN v_caller_role = 'admin' THEN COALESCE(cm.is_enabled, TRUE)
      ELSE (COALESCE(cm.is_enabled, TRUE) AND COALESCE(cup.can_access, TRUE))
    END AS can_access,
    CASE 
      WHEN v_is_master THEN TRUE
      WHEN v_caller_role = 'admin' THEN COALESCE(cm.is_enabled, TRUE)
      WHEN v_caller_role = 'viewer' THEN FALSE
      ELSE (COALESCE(cm.is_enabled, TRUE) AND COALESCE(cup.can_edit, TRUE))
    END AS can_edit
  FROM all_modules m
  LEFT JOIN company_modules cm ON cm.company_id = p_company_id AND cm.module_key = m.mod_key
  LEFT JOIN company_user_module_permissions cup ON cup.company_id = p_company_id AND cup.user_id = v_uid AND cup.module_key = m.mod_key;
END;
$$;

-- 7. SEEDING / MIGRAÇÃO AUTOMÁTICA: Habilita módulos padrão para as empresas existentes
DO $$
DECLARE
  r_comp RECORD;
BEGIN
  FOR r_comp IN SELECT id, segment FROM companies LOOP
    -- Módulos Financeiros Gerais (Padrão para todas)
    INSERT INTO company_modules (company_id, module_key, is_enabled)
    VALUES 
      (r_comp.id, 'transactions', TRUE),
      (r_comp.id, 'payables', TRUE),
      (r_comp.id, 'receivables', TRUE),
      (r_comp.id, 'cards', TRUE),
      (r_comp.id, 'reports', TRUE),
      (r_comp.id, 'kpis', TRUE)
    ON CONFLICT (company_id, module_key) DO NOTHING;

    -- Módulo de Obras & Engenharia
    IF r_comp.segment IN ('obras_only', 'obras_financial') THEN
      INSERT INTO company_modules (company_id, module_key, is_enabled)
      VALUES (r_comp.id, 'obras', TRUE)
      ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = TRUE;
    ELSE
      INSERT INTO company_modules (company_id, module_key, is_enabled)
      VALUES (r_comp.id, 'obras', FALSE)
      ON CONFLICT (company_id, module_key) DO NOTHING;
    END IF;

    -- Módulo Jurídico / Processos
    IF r_comp.segment = 'legal' THEN
      INSERT INTO company_modules (company_id, module_key, is_enabled)
      VALUES (r_comp.id, 'legal_cases', TRUE)
      ON CONFLICT (company_id, module_key) DO UPDATE SET is_enabled = TRUE;
    ELSE
      INSERT INTO company_modules (company_id, module_key, is_enabled)
      VALUES (r_comp.id, 'legal_cases', FALSE)
      ON CONFLICT (company_id, module_key) DO NOTHING;
    END IF;
  END LOOP;
END $$;
