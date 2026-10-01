-- =========================================================================
-- Oeco Start — Migration 030: Categorias Padrão para Construção Civil / Obras
-- =========================================================================

CREATE OR REPLACE FUNCTION seed_construction_categories(p_company_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  -- 1. MATERIAIS BÁSICOS & BRUTOS
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Materiais Básicos & Estruturais', 'expense', NULL, p_company_id, 1)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Cimento & Cal', 'expense', v_cat_id, p_company_id, 1),
    ('Areia, Brita & Pedra', 'expense', v_cat_id, p_company_id, 2),
    ('Tijolos, Blocos & Canaletas', 'expense', v_cat_id, p_company_id, 3),
    ('Argamassas & Rejuntes', 'expense', v_cat_id, p_company_id, 4),
    ('Aço, Ferragem & Telas', 'expense', v_cat_id, p_company_id, 5),
    ('Madeiramento & Formas', 'expense', v_cat_id, p_company_id, 6),
    ('Impermeabilizantes & Aditivos', 'expense', v_cat_id, p_company_id, 7);

  -- 2. HIDRÁULICA & SANITÁRIO
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Hidráulica & Sanitário', 'expense', NULL, p_company_id, 2)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Tubos & Conexões (Água Fria/Quente)', 'expense', v_cat_id, p_company_id, 1),
    ('Tubos & Conexões (Esgoto)', 'expense', v_cat_id, p_company_id, 2),
    ('Caixas d''Água, Fossas & Cisternas', 'expense', v_cat_id, p_company_id, 3),
    ('Registros, Válvulas & Torneiras', 'expense', v_cat_id, p_company_id, 4),
    ('Ralos, Sifões & Grelhas', 'expense', v_cat_id, p_company_id, 5);

  -- 3. ELÉTRICA & ILUMINAÇÃO
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Elétrica & Iluminação', 'expense', NULL, p_company_id, 3)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Fios & Cabos Elétricos', 'expense', v_cat_id, p_company_id, 1),
    ('Conduítes, Eletrodutos & Caixas', 'expense', v_cat_id, p_company_id, 2),
    ('Disjuntores & Quadros de Distribuição', 'expense', v_cat_id, p_company_id, 3),
    ('Tomadas, Interruptores & Placas', 'expense', v_cat_id, p_company_id, 4),
    ('Luminárias, Spots & Fitas LED', 'expense', v_cat_id, p_company_id, 5);

  -- 4. ACABAMENTO & PINTURA
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Acabamento & Pintura', 'expense', NULL, p_company_id, 4)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Pisos, Porcelanatos & Revestimentos', 'expense', v_cat_id, p_company_id, 1),
    ('Tintas, Seladores & Vernizes', 'expense', v_cat_id, p_company_id, 2),
    ('Gesso, Drywall & Forros', 'expense', v_cat_id, p_company_id, 3),
    ('Louças, Cubas & Sanitários', 'expense', v_cat_id, p_company_id, 4),
    ('Metais, Chuveiros & Acessórios', 'expense', v_cat_id, p_company_id, 5),
    ('Esquadrias, Portas & Janelas', 'expense', v_cat_id, p_company_id, 6),
    ('Vidros, Espelhos & Box', 'expense', v_cat_id, p_company_id, 7);

  -- 5. MÃO DE OBRA & EMPREITEIROS
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Mão de Obra & Empreiteiros', 'expense', NULL, p_company_id, 5)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Pedreiro & Alvenaria', 'expense', v_cat_id, p_company_id, 1),
    ('Eletricista', 'expense', v_cat_id, p_company_id, 2),
    ('Encanador / Bombeiro Hidráulico', 'expense', v_cat_id, p_company_id, 3),
    ('Pintor & Gesseiro', 'expense', v_cat_id, p_company_id, 4),
    ('Ajudante / Servente', 'expense', v_cat_id, p_company_id, 5),
    ('Empreiteira Terceirizada', 'expense', v_cat_id, p_company_id, 6),
    ('Serralheria & Marcenaria', 'expense', v_cat_id, p_company_id, 7);

  -- 6. EQUIPAMENTOS, LOCAÇÃO & FERRAMENTAS
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Equipamentos, Locação & Ferramentas', 'expense', NULL, p_company_id, 6)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Locação de Betoneira & Andaimes', 'expense', v_cat_id, p_company_id, 1),
    ('Locação de Caçambas (Entulho)', 'expense', v_cat_id, p_company_id, 2),
    ('Locação de Compactador / Rompedor', 'expense', v_cat_id, p_company_id, 3),
    ('Ferramentas & EPIs de Segurança', 'expense', v_cat_id, p_company_id, 4);

  -- 7. PROJETOS, TAXAS & DOCUMENTAÇÃO
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Projetos, Taxas & Engenharia', 'expense', NULL, p_company_id, 7)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Alvarás & Taxas da Prefeitura', 'expense', v_cat_id, p_company_id, 1),
    ('ART / RRT de Engenharia e Arquitetura', 'expense', v_cat_id, p_company_id, 2),
    ('Projetos (Arquitetônico, Estrutural, Elétrico)', 'expense', v_cat_id, p_company_id, 3),
    ('Topografia & Sondagem de Solo', 'expense', v_cat_id, p_company_id, 4);

  -- 8. LOGÍSTICA & FRETES
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Logística & Transportes', 'expense', NULL, p_company_id, 8)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Frete de Materiais', 'expense', v_cat_id, p_company_id, 1),
    ('Combustível & Transporte da Equipe', 'expense', v_cat_id, p_company_id, 2);

  -- 9. RECEITAS DE OBRAS (INCOME)
  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES ('Faturamento de Obras', 'income', NULL, p_company_id, 1)
  RETURNING id INTO v_cat_id;

  INSERT INTO categories (name, type, parent_id, company_id, sort_order)
  VALUES
    ('Entrada / Sinal Contratual', 'income', v_cat_id, p_company_id, 1),
    ('Medições Aprovadas', 'income', v_cat_id, p_company_id, 2),
    ('Aditivos de Contrato Faturados', 'income', v_cat_id, p_company_id, 3),
    ('Taxa de Administração de Obra', 'income', v_cat_id, p_company_id, 4);

END;
$$ LANGUAGE plpgsql;
