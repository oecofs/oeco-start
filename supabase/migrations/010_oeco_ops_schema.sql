-- =========================================================================
-- Oeco Ops — Migration 010: Estrutura Completa do Hub Operacional, 
-- Unit Economics, Time Tracker, Matriz de Tarefas e Cofre Seguro
-- =========================================================================

-- 1. TABELA: ops_team_members (Membros da Equipe & Custo/Hora)
CREATE TABLE IF NOT EXISTS ops_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT 'Analista Financeiro',
  monthly_cost NUMERIC(12,2) NOT NULL DEFAULT 3500.00,
  working_hours_month NUMERIC(6,2) NOT NULL DEFAULT 160.00,
  calculated_hourly_cost NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE WHEN working_hours_month > 0 THEN ROUND(monthly_cost / working_hours_month, 2) ELSE 0 END
  ) STORED,
  color_code TEXT DEFAULT '#1e3a5f',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA: ops_company_contracts (Honorários e Contratos BPO dos Clientes)
CREATE TABLE IF NOT EXISTS ops_company_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  monthly_retainer_fee NUMERIC(12,2) NOT NULL DEFAULT 1500.00,
  billing_day INTEGER DEFAULT 5,
  sla_hours INTEGER DEFAULT 24, -- SLA padrão de atendimento em horas
  contract_start_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA: ops_task_templates (Modelos de Tarefas Recorrentes & Onboarding)
CREATE TABLE IF NOT EXISTS ops_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL CHECK (task_type IN ('recurring', 'onboarding', 'request', 'internal')),
  category TEXT NOT NULL CHECK (category IN ('reconciliation', 'payment', 'invoice_nf', 'support', 'tax', 'closing', 'other')),
  default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'urgent')),
  estimated_minutes INTEGER DEFAULT 30,
  recurrence_rule TEXT, -- 'daily', 'weekly', 'monthly_day_5', etc.
  checklist JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA: ops_tasks (Quadro de Demandas / Kanban)
CREATE TABLE IF NOT EXISTS ops_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES ops_task_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'request' CHECK (task_type IN ('recurring', 'onboarding', 'request', 'internal')),
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('whatsapp', 'manual', 'system', 'email', 'recurring_schedule')),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('reconciliation', 'payment', 'invoice_nf', 'support', 'tax', 'closing', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'done', 'cancelled')),
  assigned_to UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  due_date DATE,
  estimated_minutes INTEGER DEFAULT 30,
  checklist JSONB DEFAULT '[]'::jsonb,
  whatsapp_metadata JSONB, -- telefone, id da mensagem, texto original
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 5. TABELA: ops_time_logs (Time Tracker em Tempo Real)
CREATE TABLE IF NOT EXISTS ops_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES ops_tasks(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  team_member_id UUID REFERENCES ops_team_members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'reconciliation',
  hourly_rate_snapshot NUMERIC(10,2) DEFAULT 0.00,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  notes TEXT,
  is_running BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABELA: ops_client_vault (Cofre Seguro de Senhas & Acessos)
CREATE TABLE IF NOT EXISTS ops_client_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'bank' CHECK (category IN ('bank', 'city_hall', 'erp', 'certificate', 'email', 'other')),
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  url TEXT,
  notes TEXT,
  totp_secret TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TABELA: ops_vault_audit_logs (Trilha de Auditoria Anti-Fraude)
CREATE TABLE IF NOT EXISTS ops_vault_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID REFERENCES ops_client_vault(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('view_password', 'copy_password', 'edit', 'delete', 'create')),
  ip_address TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 8. ÍNDICES DE PERFORMANCE
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ops_tasks_company ON ops_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_status ON ops_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_assigned ON ops_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ops_time_logs_company ON ops_time_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_time_logs_user ON ops_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ops_time_logs_running ON ops_time_logs(is_running);
CREATE INDEX IF NOT EXISTS idx_ops_vault_company ON ops_client_vault(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_audit_vault ON ops_vault_audit_logs(vault_id);

-- -------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------------------------------
ALTER TABLE ops_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_company_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_client_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_vault_audit_logs ENABLE ROW LEVEL SECURITY;

-- Acesso operacional para usuários autenticados da equipe interna
CREATE POLICY "ops_team_members_access" ON ops_team_members FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_contracts_access" ON ops_company_contracts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_templates_access" ON ops_task_templates FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_tasks_access" ON ops_tasks FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_time_logs_access" ON ops_time_logs FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_vault_access" ON ops_client_vault FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "ops_audit_access" ON ops_vault_audit_logs FOR ALL USING (auth.uid() IS NOT NULL);

-- -------------------------------------------------------------------------
-- 10. SEED DE TEMPLATES PADRÃO (ROTINAS RECORRENTES & ONBOARDING)
-- -------------------------------------------------------------------------
INSERT INTO ops_task_templates (title, description, task_type, category, default_priority, estimated_minutes, recurrence_rule, checklist)
VALUES
  (
    'Conciliação Bancária Periódica',
    'Importar extratos OFX/CSV e conciliar transações pendentes no Oeco Start',
    'recurring',
    'reconciliation',
    'high',
    25,
    'weekly',
    '[{"title": "Baixar extrato OFX no banco", "done": false}, {"title": "Importar no Oeco Start", "done": false}, {"title": "Categorizar e conciliar 100% dos lançamentos", "done": false}]'::jsonb
  ),
  (
    'Agendamento de Pagamentos e Boletos',
    'Lançar e agendar contas a pagar no internet banking do cliente',
    'recurring',
    'payment',
    'high',
    20,
    'weekly',
    '[{"title": "Conferir notas fiscais e boletos recebidos", "done": false}, {"title": "Agendar no banco", "done": false}, {"title": "Enviar comprovantes de agendamento ao cliente", "done": false}]'::jsonb
  ),
  (
    'Fechamento Mensal & Relatório de BI',
    'Validar DRE, conciliação e enviar relatório gerencial ao cliente',
    'recurring',
    'closing',
    'urgent',
    45,
    'monthly_day_5',
    '[{"title": "Validar saldo de todas as contas no dia 31", "done": false}, {"title": "Fechar conciliação do mês", "done": false}, {"title": "Revisar relatório AV/AH no Oeco Start", "done": false}, {"title": "Enviar relatório executivo ao cliente", "done": false}]'::jsonb
  ),
  (
    'Onboarding: Configuração de Acessos & Senhas',
    'Cadastro inicial dos acessos do novo cliente no Client Vault',
    'onboarding',
    'support',
    'high',
    30,
    NULL,
    '[{"title": "Cadastrar acesso ao Internet Banking no Cofre", "done": false}, {"title": "Cadastrar acesso à Prefeitura para emissão de NF", "done": false}, {"title": "Cadastrar acesso ao ERP/Sistema de Vendas", "done": false}]'::jsonb
  ),
  (
    'Onboarding: Parametrização do Plano de Contas',
    'Ajustar categorias, subcategorias e centros de custo específicos do cliente',
    'onboarding',
    'support',
    'medium',
    40,
    NULL,
    '[{"title": "Revisar plano de contas padrão com o cliente", "done": false}, {"title": "Cadastrar contas bancárias e saldos iniciais", "done": false}, {"title": "Cadastrar centros de custo", "done": false}]'::jsonb
  )
ON CONFLICT DO NOTHING;

-- 11. CONTRATOS PADRÃO INICIAIS PARA EMPRESAS EXISTENTES
INSERT INTO ops_company_contracts (company_id, monthly_retainer_fee, sla_hours)
SELECT id, 1800.00, 24
FROM companies
ON CONFLICT (company_id) DO NOTHING;
