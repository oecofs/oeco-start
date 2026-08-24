-- =========================================================================
-- Oeco Start — Migration 011: Definição Precisa dos Papéis por E-mail
-- =========================================================================

-- 1. ATRIBUIÇÃO EXATA: oecofs@gmail.com -> MASTER | nissiengenharia@gmail.com -> ADMIN
DO $$
DECLARE
  v_master_user_id UUID;
  v_nissi_user_id UUID;
  v_nissi_company_id UUID;
BEGIN
  -- Busca o ID de oecofs@gmail.com
  SELECT id INTO v_master_user_id 
  FROM auth.users 
  WHERE LOWER(email) = 'oecofs@gmail.com'
  LIMIT 1;

  -- Busca o ID de nissiengenharia@gmail.com
  SELECT id INTO v_nissi_user_id 
  FROM auth.users 
  WHERE LOWER(email) = 'nissiengenharia@gmail.com'
  LIMIT 1;

  -- Busca o ID da empresa Nissi Engenharia
  SELECT id INTO v_nissi_company_id 
  FROM companies 
  WHERE name ILIKE '%nissi%' 
  ORDER BY created_at ASC 
  LIMIT 1;

  -- Se a empresa ainda não se chamar Nissi, pega a primeira empresa cadastrada
  IF v_nissi_company_id IS NULL THEN
    SELECT id INTO v_nissi_company_id FROM companies ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- A. Configura oecofs@gmail.com como MASTER em todas as empresas
  IF v_master_user_id IS NOT NULL THEN
    UPDATE user_companies
    SET role = 'master'
    WHERE user_id = v_master_user_id;

    -- Se não existir vínculo, insere
    IF v_nissi_company_id IS NOT NULL THEN
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES (v_master_user_id, v_nissi_company_id, 'master')
      ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'master';
    END IF;
  END IF;

  -- B. Configura nissiengenharia@gmail.com EXCLUSIVAMENTE como ADMIN na Nissi
  IF v_nissi_user_id IS NOT NULL AND v_nissi_company_id IS NOT NULL THEN
    -- Remove vínculos com outras empresas se houver
    DELETE FROM user_companies
    WHERE user_id = v_nissi_user_id AND company_id != v_nissi_company_id;

    -- Define estritamente como 'admin'
    INSERT INTO user_companies (user_id, company_id, role)
    VALUES (v_nissi_user_id, v_nissi_company_id, 'admin')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'admin';
  END IF;
END $$;

-- 2. GARANTE QUE A FUNÇÃO is_master VALIDE CORRETAMENTE
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

-- 3. RESULTADO PARA CONFERÊNCIA IMEDIATA NO SUPABASE
SELECT 
  u.email,
  c.name as empresa,
  uc.role as papel_de_acesso,
  CASE 
    WHEN uc.role = 'master' THEN '👑 Master Global (Acesso a Tudo)'
    WHEN uc.role = 'admin' THEN '👔 Administrador (Apenas da Nissi)'
    ELSE uc.role
  END as descricao_permissao
FROM user_companies uc
JOIN auth.users u ON u.id = uc.user_id
JOIN companies c ON c.id = uc.company_id
ORDER BY uc.role DESC, u.email ASC;
