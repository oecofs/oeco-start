-- 
-- Oeco Start — Criação das Tabelas
-- 

-- 1. TABELA: categories
-- Armazena categorias (ex: Fornecedores) e subcategorias (filhas de categorias)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  cost_center TEXT,
  sort_order INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA: transactions
-- Armazena as transações importadas do extrato (OFX/CSV)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  cost_center TEXT,
  is_reconciled BOOLEAN DEFAULT false,
  month_ref TEXT NOT NULL,
  fitid TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA: receivables
-- Armazena os recebíveis (contas a receber) com suporte a recorrência
CREATE TABLE IF NOT EXISTS receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'overdue')),
  is_recurring BOOLEAN DEFAULT false,
  recurring_day INTEGER,
  received_at DATE,
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  month_ref TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA: reconciliation_status
-- Controla o status da conciliação por mês
CREATE TABLE IF NOT EXISTS reconciliation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'finalized', 'sent_to_cfo')),
  finalized_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month_ref, user_id)
);

-- 5. TABELA: settings
-- Configurações da empresa (nome, banco, webhook)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  bank_name TEXT,
  webhook_url TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 
-- ÍNDICES (para performance nas buscas)
-- 

CREATE INDEX IF NOT EXISTS idx_transactions_month_ref ON transactions(month_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fitid ON transactions(fitid);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_receivables_month_ref ON receivables(month_ref);
CREATE INDEX IF NOT EXISTS idx_receivables_user_id ON receivables(user_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status_user_id ON reconciliation_status(user_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status_month_ref ON reconciliation_status(month_ref);

CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- 
-- CATEGORIAS PADRÃO (seed inicial)
-- 
-- Estas categorias são criadas como referência, mas o usuário
-- pode editar/excluir/adicionar na tela de Configurações.
-- NOTA: O user_id é NULL aqui porque estas são categorias-模板.
-- O usuário vai criar as suas próprias pela tela de Configurações.

-- 
-- TRIGGER: Auto-atualizar is_reconciled
-- 
-- Quando uma transação recebe category_id, is_reconciled vira true automaticamente
CREATE OR REPLACE FUNCTION auto_reconcile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND OLD.category_id IS NULL THEN
    NEW.is_reconciled := true;
  ELSIF NEW.category_id IS NULL AND OLD.category_id IS NOT NULL THEN
    NEW.is_reconciled := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reconcile
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION auto_reconcile();

-- Também ao inserir: se já vier com categoria, marcar como reconciliada
CREATE OR REPLACE FUNCTION auto_reconcile_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    NEW.is_reconciled := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reconcile_insert
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION auto_reconcile_on_insert();
