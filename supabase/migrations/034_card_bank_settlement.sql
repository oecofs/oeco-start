-- =========================================================================
-- Oeco Start — Migration 034: Liquidação Bancária de Cartões & Fluxo de Caixa
-- =========================================================================

-- 1. ADICIONA CAMPOS DE VÍNCULO BANCÁRIO NA TABELA card_installments
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS settled_bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS settlement_notes TEXT;

-- 2. ADICIONA CAMPOS NA TABELA transactions PARA REFERENCIAR CARTÕES
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_installment_id UUID REFERENCES card_installments(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_batch_id UUID REFERENCES card_import_batches(id) ON DELETE SET NULL;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_card_installments_linked_tx ON card_installments(linked_transaction_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_settled_bank ON card_installments(settled_bank_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card_installment ON transactions(card_installment_id);
