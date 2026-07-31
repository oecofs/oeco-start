-- 
-- Oeco Start — Tabela de Centros de Custo
-- Centro de custo é independente de categorias
-- 

CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, user_id)
);

-- RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_centers_select_own" ON cost_centers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cost_centers_insert_own" ON cost_centers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cost_centers_update_own" ON cost_centers
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cost_centers_delete_own" ON cost_centers
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger auto user_id
CREATE TRIGGER trg_set_user_id_cost_centers
  BEFORE INSERT ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION set_user_id();

-- Seed de centros de custo padrão (3 básicos)
CREATE OR REPLACE FUNCTION seed_default_cost_centers(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cost_centers (name, user_id)
  VALUES
    ('Operação', p_user_id),
    ('Administrativo', p_user_id),
    ('Comercial', p_user_id)
  ON CONFLICT (name, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
