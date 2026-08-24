-- =========================================================================
-- Oeco Start — Migration 011: Correção de Papéis de Usuários (Admin vs Master)
-- =========================================================================

-- 1. IDENTIFICAÇÃO E CORREÇÃO DE PAPÉIS EM user_companies
-- Este script garante que apenas o usuário proprietário (você) seja Master, 
-- e que os usuários dos clientes (ex: Nissi Engenharia) fiquem como 'admin', 'operator' ou 'viewer'.

DO $$
DECLARE
  v_nissi_id UUID;
BEGIN
  -- Busca o ID da Nissi Engenharia
  SELECT id INTO v_nissi_id 
  FROM companies 
  WHERE name ILIKE '%nissi%' 
  ORDER BY created_at ASC 
  LIMIT 1;

  -- Se a empresa Nissi existir
  IF v_nissi_id IS NOT NULL THEN
    -- Garante que se houver mais de um usuário vinculado à Nissi,
    -- os usuários que não são o primeiro (ou usuários de clientes) sejam rebaixados para 'admin'
    UPDATE user_companies
    SET role = 'admin'
    WHERE company_id = v_nissi_id 
      AND role = 'master'
      AND user_id != (
        -- Mantém apenas o usuário mais antigo (você) como Master global
        SELECT user_id FROM user_companies WHERE role = 'master' ORDER BY created_at ASC LIMIT 1
      );
  END IF;
END $$;

-- 2. FUNÇÃO AUXILIAR PARA O USUÁRIO MASTER REATRIBUIR PAPÉIS RAPIDAMENTE
-- Caso precise definir explicitamente o e-mail do seu cliente como admin:
CREATE OR REPLACE FUNCTION set_user_role_by_email(
  p_email TEXT,
  p_company_name TEXT,
  p_new_role TEXT
)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_target_company_id UUID;
BEGIN
  -- Busca o ID do usuário pelo e-mail em auth.users
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE email = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RETURN 'Usuário com e-mail "' || p_email || '" não foi encontrado.';
  END IF;

  -- Busca o ID da empresa
  SELECT id INTO v_target_company_id
  FROM companies
  WHERE name ILIKE '%' || TRIM(p_company_name) || '%'
  LIMIT 1;

  IF v_target_company_id IS NULL THEN
    RETURN 'Empresa "' || p_company_name || '" não foi encontrada.';
  END IF;

  -- Atualiza ou insere o vínculo correto
  INSERT INTO user_companies (user_id, company_id, role)
  VALUES (v_target_user_id, v_target_company_id, p_new_role)
  ON CONFLICT (user_id, company_id) 
  DO UPDATE SET role = p_new_role;

  RETURN 'Sucesso: Usuário "' || p_email || '" agora tem papel "' || p_new_role || '" na empresa "' || p_company_name || '".';
END;
$$ LANGUAGE plpgsql;

-- 3. QUERY PARA VOCÊ CONFERIR COMO ESTÃO OS USUÁRIOS ATUALMENTE:
-- (Você pode rodar esta consulta no SQL Editor do Supabase para conferir os papéis):
-- SELECT 
--   u.email,
--   c.name as empresa,
--   uc.role as perfil_acesso
-- FROM user_companies uc
-- JOIN auth.users u ON u.id = uc.user_id
-- JOIN companies c ON c.id = uc.company_id;
