-- =========================================================================
-- Oeco Start — Migration 007: Ajuste de Nome Nissi Engenharia + Funções de Edição
-- =========================================================================

-- 1. Ajuste de nome da empresa principal para "Nissi Engenharia"
UPDATE companies 
SET name = 'Nissi Engenharia' 
WHERE name = 'Minha Empresa Principal' OR name ILIKE '%principal%';

UPDATE settings 
SET company_name = 'Nissi Engenharia'
WHERE company_name = 'Minha Empresa Principal' OR company_name ILIKE '%principal%';

-- 2. FUNÇÃO: Atualizar papel/perfil de um membro da empresa
CREATE OR REPLACE FUNCTION update_company_member_role(
  p_company_id UUID,
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_companies
  SET role = p_new_role
  WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 3. FUNÇÃO: Atualizar dados de uma empresa (Nome, CNPJ)
CREATE OR REPLACE FUNCTION update_company_info(
  p_company_id UUID,
  p_name TEXT,
  p_cnpj TEXT
)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE companies
  SET 
    name = TRIM(p_name),
    cnpj = NULLIF(TRIM(p_cnpj), '')
  WHERE id = p_company_id;

  -- Sincroniza também na tabela settings se existir
  UPDATE settings
  SET company_name = TRIM(p_name)
  WHERE company_id = p_company_id;
END;
$$ LANGUAGE plpgsql;
