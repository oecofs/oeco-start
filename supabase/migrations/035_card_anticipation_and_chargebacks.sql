-- =========================================================================
-- Oeco Start — Migration 035: Antecipação de Recebíveis, Chargebacks & Analytics
-- =========================================================================

-- 1. CAMPOS DE ANTECIPAÇÃO E CHARGEBACK EM card_installments
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS anticipated_at TIMESTAMPTZ;
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS anticipation_rate_monthly NUMERIC(5,2);
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS anticipation_fee_amount NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE card_installments ADD COLUMN IF NOT EXISTS anticipation_net_amount NUMERIC(12,2);

-- 2. CAMPOS DE CANCELAMENTO E CHARGEBACK EM card_sales
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS chargeback_date DATE;
ALTER TABLE card_sales ADD COLUMN IF NOT EXISTS chargeback_notes TEXT;

-- 3. ÍNDICES PARA CONSULTAS DE ANALYTICS E ANTECIPAÇÃO
CREATE INDEX IF NOT EXISTS idx_card_installments_status ON card_installments(status);
CREATE INDEX IF NOT EXISTS idx_card_installments_anticipated ON card_installments(anticipated_at);
CREATE INDEX IF NOT EXISTS idx_card_sales_status ON card_sales(status);
CREATE INDEX IF NOT EXISTS idx_card_sales_brand ON card_sales(brand);
CREATE INDEX IF NOT EXISTS idx_card_sales_method ON card_sales(payment_method);
