-- 
-- Oeco Start — RLS Policies (Row Level Security)
-- Garante que cada usuário só acessa seus próprios dados
-- 

-- ============================================================
-- 1. CATEGORIES
-- ============================================================

-- Habilita RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário só vê suas categorias
CREATE POLICY "categories_select_own" ON categories
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: usuário só cria categorias para si mesmo
CREATE POLICY "categories_insert_own" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: usuário só edita suas categorias
CREATE POLICY "categories_update_own" ON categories
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: usuário só exclui suas categorias
CREATE POLICY "categories_delete_own" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. TRANSACTIONS
-- ============================================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_own" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update_own" ON transactions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_delete_own" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. RECEIVABLES
-- ============================================================

ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receivables_select_own" ON receivables
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "receivables_insert_own" ON receivables
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "receivables_update_own" ON receivables
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "receivables_delete_own" ON receivables
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. RECONCILIATION_STATUS
-- ============================================================

ALTER TABLE reconciliation_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_select_own" ON reconciliation_status
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "reconciliation_insert_own" ON reconciliation_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reconciliation_update_own" ON reconciliation_status
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reconciliation_delete_own" ON reconciliation_status
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 5. SETTINGS
-- ============================================================

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_own" ON settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "settings_insert_own" ON settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_update_own" ON settings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_delete_own" ON settings
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: Auto-preencher user_id no INSERT
-- ============================================================
-- Quando uma transação, recebível, etc. é criado,
-- o user_id é preenchido automaticamente com o ID do usuário logado.
-- Isso evita que o frontend precise enviar o user_id manualmente.

CREATE OR REPLACE FUNCTION set_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica o trigger em todas as tabelas
CREATE TRIGGER trg_set_user_id_categories
  BEFORE INSERT ON categories
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trg_set_user_id_transactions
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trg_set_user_id_receivables
  BEFORE INSERT ON receivables
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trg_set_user_id_reconciliation
  BEFORE INSERT ON reconciliation_status
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

CREATE TRIGGER trg_set_user_id_settings
  BEFORE INSERT ON settings
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
