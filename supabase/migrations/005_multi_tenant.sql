-- =========================================================================
-- Oeco Start — Migration 005: Arquitetura Multi-Empresas (Multi-Tenancy)
-- =========================================================================

-- 1. TABELA: companies (Empresas)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA: user_companies (Membros & Permissões)
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('master', 'admin', 'operator', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- 3. ADIÇÃO DE company_id NAS TABELAS EXISTENTES
DO $$
BEGIN
  -- categories
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'company_id') THEN
    ALTER TABLE categories ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- transactions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'company_id') THEN
    ALTER TABLE transactions ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- receivables
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receivables' AND column_name = 'company_id') THEN
    ALTER TABLE receivables ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- bank_accounts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'company_id') THEN
    ALTER TABLE bank_accounts ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- cost_centers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cost_centers' AND column_name = 'company_id') THEN
    ALTER TABLE cost_centers ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- reconciliation_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reconciliation_status' AND column_name = 'company_id') THEN
    ALTER TABLE reconciliation_status ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'company_id') THEN
    ALTER TABLE settings ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_role ON user_companies(role);

CREATE INDEX IF NOT EXISTS idx_categories_company_id ON categories(company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_id ON transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_receivables_company_id ON receivables(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_company_id ON cost_centers(company_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status_company_id ON reconciliation_status(company_id);
CREATE INDEX IF NOT EXISTS idx_settings_company_id ON settings(company_id);

-- 5. FUNÇÃO PARA SEED DE CATEGORIAS PADRÃO VINCULADAS À EMPRESA
CREATE OR REPLACE FUNCTION seed_company_default_categories(p_company_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- ============================================================
  -- SAÍDAS (EXPENSE)
  -- ============================================================

  -- Fornecedores
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES ('Fornecedores', 'expense', NULL, NULL, 1, p_user_id, p_company_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('Insumos', 'expense', v_cat_id, NULL, 1, p_user_id, p_company_id),
    ('Matéria-prima', 'expense', v_cat_id, NULL, 2, p_user_id, p_company_id);

  -- Escritório
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES ('Escritório', 'expense', NULL, NULL, 2, p_user_id, p_company_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('Aluguel', 'expense', v_cat_id, NULL, 1, p_user_id, p_company_id),
    ('Energia Elétrica', 'expense', v_cat_id, NULL, 2, p_user_id, p_company_id),
    ('Água', 'expense', v_cat_id, NULL, 3, p_user_id, p_company_id),
    ('Internet e Telefone', 'expense', v_cat_id, NULL, 4, p_user_id, p_company_id),
    ('Material de Escritório', 'expense', v_cat_id, NULL, 5, p_user_id, p_company_id),
    ('Software e Assinaturas', 'expense', v_cat_id, NULL, 6, p_user_id, p_company_id);

  -- Despesa de Pessoal
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES ('Despesa de Pessoal', 'expense', NULL, NULL, 3, p_user_id, p_company_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('Salários', 'expense', v_cat_id, NULL, 1, p_user_id, p_company_id),
    ('VR (Vale Refeição)', 'expense', v_cat_id, NULL, 2, p_user_id, p_company_id),
    ('VT (Vale Transporte)', 'expense', v_cat_id, NULL, 3, p_user_id, p_company_id),
    ('Pró-labore', 'expense', v_cat_id, NULL, 4, p_user_id, p_company_id),
    ('Encargos Trabalhistas', 'expense', v_cat_id, NULL, 5, p_user_id, p_company_id);

  -- Impostos
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES ('Impostos', 'expense', NULL, NULL, 4, p_user_id, p_company_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('DAS', 'expense', v_cat_id, NULL, 1, p_user_id, p_company_id),
    ('IRPJ', 'expense', v_cat_id, NULL, 2, p_user_id, p_company_id),
    ('CSLL', 'expense', v_cat_id, NULL, 3, p_user_id, p_company_id),
    ('PIS', 'expense', v_cat_id, NULL, 4, p_user_id, p_company_id),
    ('COFINS', 'expense', v_cat_id, NULL, 5, p_user_id, p_company_id),
    ('ISS', 'expense', v_cat_id, NULL, 6, p_user_id, p_company_id),
    ('ICMS', 'expense', v_cat_id, NULL, 7, p_user_id, p_company_id);

  -- Serviço de Terceiros
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES ('Serviço de Terceiros', 'expense', NULL, NULL, 5, p_user_id, p_company_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('Contabilidade', 'expense', v_cat_id, NULL, 1, p_user_id, p_company_id),
    ('Advogado', 'expense', v_cat_id, NULL, 2, p_user_id, p_company_id),
    ('Marketing', 'expense', v_cat_id, NULL, 3, p_user_id, p_company_id);

  -- ============================================================
  -- ENTRADAS (INCOME)
  -- ============================================================

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id, company_id)
  VALUES
    ('Receita de Serviços Prestados', 'income', NULL, NULL, 1, p_user_id, p_company_id),
    ('Receita de Produtos Vendidos', 'income', NULL, NULL, 2, p_user_id, p_company_id),
    ('Estorno/Devolução', 'income', NULL, NULL, 3, p_user_id, p_company_id);
END;
$$ LANGUAGE plpgsql;

-- 6. SCRIPT DE MIGRAÇÃO INICIAL (BACKFILL DOS DADOS ATUAIS)
DO $$
DECLARE
  v_default_company_id UUID;
  v_user_record RECORD;
BEGIN
  -- Se não existir nenhuma empresa, cria a primeira para os dados atuais
  IF NOT EXISTS (SELECT 1 FROM companies LIMIT 1) THEN
    INSERT INTO companies (name, is_active)
    VALUES ('Minha Empresa Principal', true)
    RETURNING id INTO v_default_company_id;

    -- Vincula todos os usuários existentes como 'master' para garantir acesso
    FOR v_user_record IN (SELECT id FROM auth.users) LOOP
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES (v_user_record.id, v_default_company_id, 'master')
      ON CONFLICT (user_id, company_id) DO NOTHING;
    END LOOP;

    -- Atualiza os registros órfãos para a empresa padrão
    UPDATE categories SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE transactions SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE receivables SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE bank_accounts SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE cost_centers SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE reconciliation_status SET company_id = v_default_company_id WHERE company_id IS NULL;
    UPDATE settings SET company_id = v_default_company_id WHERE company_id IS NULL;
  END IF;
END $$;
