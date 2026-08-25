-- =========================================================================
-- Oeco Start — Migration 013: Adição de receivable_id e Correção de Status
-- =========================================================================

-- 1. Cria a coluna receivable_id na tabela transactions se ainda não existir
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receivable_id UUID REFERENCES receivables(id) ON DELETE SET NULL;

-- 2. Remove qualquer constraint restritiva antiga de status em receivables
ALTER TABLE receivables DROP CONSTRAINT IF EXISTS receivables_status_check;

-- 3. Adiciona a constraint abrangente que aceita todos os estados do ciclo de vida
ALTER TABLE receivables ADD CONSTRAINT receivables_status_check 
  CHECK (status IN ('open', 'pending', 'partial', 'received', 'paid', 'overdue'));

-- 4. Cria os índices de performance para vínculos bidirecionais
CREATE INDEX IF NOT EXISTS idx_transactions_receivable_id ON transactions(receivable_id);
CREATE INDEX IF NOT EXISTS idx_receivables_linked_trx ON receivables(linked_transaction_id);
