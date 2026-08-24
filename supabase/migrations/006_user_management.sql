-- =========================================================================
-- Oeco Start — Migration 006: Gestão de Membros e Usuários por Empresa
-- =========================================================================

-- 1. FUNÇÃO: Buscar membros de uma empresa com e-mail
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

-- 2. FUNÇÃO: Adicionar membro na empresa a partir do e-mail
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

-- 3. FUNÇÃO: Remover membro de uma empresa
CREATE OR REPLACE FUNCTION remove_company_member(
  p_company_id UUID,
  p_user_id UUID
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_companies
  WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
