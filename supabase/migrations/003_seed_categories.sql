-- 
-- Seed de categorias padrão (versão final aprovada)
-- 

CREATE OR REPLACE FUNCTION seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- ============================================================
  -- SAÍDAS (EXPENSE)
  -- ============================================================

  -- Fornecedores
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES ('Fornecedores', 'expense', NULL, NULL, 1, p_user_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('Insumos', 'expense', v_cat_id, NULL, 1, p_user_id),
    ('Matéria-prima', 'expense', v_cat_id, NULL, 2, p_user_id);

  -- Escritório
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES ('Escritório', 'expense', NULL, NULL, 2, p_user_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('Aluguel', 'expense', v_cat_id, NULL, 1, p_user_id),
    ('Energia Elétrica', 'expense', v_cat_id, NULL, 2, p_user_id),
    ('Água', 'expense', v_cat_id, NULL, 3, p_user_id),
    ('Internet e Telefone', 'expense', v_cat_id, NULL, 4, p_user_id),
    ('Material de Escritório', 'expense', v_cat_id, NULL, 5, p_user_id),
    ('Software e Assinaturas', 'expense', v_cat_id, NULL, 6, p_user_id);

  -- Despesa de Pessoal
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES ('Despesa de Pessoal', 'expense', NULL, NULL, 3, p_user_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('Salários', 'expense', v_cat_id, NULL, 1, p_user_id),
    ('VR (Vale Refeição)', 'expense', v_cat_id, NULL, 2, p_user_id),
    ('VT (Vale Transporte)', 'expense', v_cat_id, NULL, 3, p_user_id),
    ('Pró-labore', 'expense', v_cat_id, NULL, 4, p_user_id),
    ('Encargos Trabalhistas', 'expense', v_cat_id, NULL, 5, p_user_id);

  -- Impostos
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES ('Impostos', 'expense', NULL, NULL, 4, p_user_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('DAS', 'expense', v_cat_id, NULL, 1, p_user_id),
    ('IRPJ', 'expense', v_cat_id, NULL, 2, p_user_id),
    ('CSLL', 'expense', v_cat_id, NULL, 3, p_user_id),
    ('PIS', 'expense', v_cat_id, NULL, 4, p_user_id),
    ('COFINS', 'expense', v_cat_id, NULL, 5, p_user_id),
    ('ISS', 'expense', v_cat_id, NULL, 6, p_user_id),
    ('ICMS', 'expense', v_cat_id, NULL, 7, p_user_id);

  -- Serviço de Terceiros
  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES ('Serviço de Terceiros', 'expense', NULL, NULL, 5, p_user_id)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('Contabilidade', 'expense', v_cat_id, NULL, 1, p_user_id),
    ('Advogado', 'expense', v_cat_id, NULL, 2, p_user_id),
    ('Marketing', 'expense', v_cat_id, NULL, 3, p_user_id);

  -- ============================================================
  -- ENTRADAS (INCOME)
  -- ============================================================

  INSERT INTO categories (name, type, parent_id, cost_center, sort_order, user_id)
  VALUES
    ('Receita de Serviços Prestados', 'income', NULL, NULL, 1, p_user_id),
    ('Receita de Produtos Vendidos', 'income', NULL, NULL, 2, p_user_id),
    ('Estorno/Devolução', 'income', NULL, NULL, 3, p_user_id);
END;
$$ LANGUAGE plpgsql;
