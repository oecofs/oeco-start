-- =========================================================================
-- Oeco Start — Migration 038: Adiciona 'invoices' aos Módulos do Sistema
-- =========================================================================

-- 1. Remove os checks antigos de validação de módulo
ALTER TABLE company_modules DROP CONSTRAINT IF EXISTS valid_module_key;
ALTER TABLE company_user_module_permissions DROP CONSTRAINT IF EXISTS valid_user_module_key;

-- 2. Adiciona os novos checks incluindo 'invoices'
ALTER TABLE company_modules ADD CONSTRAINT valid_module_key CHECK (module_key IN (
  'transactions', 
  'payables', 
  'receivables', 
  'invoices',
  'cards', 
  'obras', 
  'legal_cases', 
  'reports', 
  'kpis'
));

ALTER TABLE company_user_module_permissions ADD CONSTRAINT valid_user_module_key CHECK (module_key IN (
  'transactions', 
  'payables', 
  'receivables', 
  'invoices',
  'cards', 
  'obras', 
  'legal_cases', 
  'reports', 
  'kpis'
));
