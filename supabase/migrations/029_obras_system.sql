-- =========================================================================
-- Oeco Start — Migration 029: Sistema Oeco Obras (Gestão 360, Aditivos, OCR e Comprovantes)
-- =========================================================================

-- 1. TABELA PRINCIPAL DE OBRAS
CREATE TABLE IF NOT EXISTS obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cliente TEXT NOT NULL,
  endereco TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim_previsto DATE,
  valor_contratado NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'concluida', 'cancelada')),
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA DE ADITIVOS CONTRATUAIS DA OBRA
CREATE TABLE IF NOT EXISTS obra_aditivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  numero_aditivo INTEGER NOT NULL DEFAULT 1,
  descricao TEXT NOT NULL,
  valor NUMERIC(15, 2) NOT NULL DEFAULT 0,
  dias_adicionais INTEGER DEFAULT 0,
  data_aprovacao DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE TRANSAÇÕES DA OBRA (DESPESAS E RECEITAS)
CREATE TABLE IF NOT EXISTS obra_transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  descricao TEXT NOT NULL,
  valor NUMERIC(15, 2) NOT NULL CHECK (valor > 0),
  data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
  forma_pagamento TEXT DEFAULT 'pix',
  status_pagamento TEXT NOT NULL DEFAULT 'pago' CHECK (status_pagamento IN ('pago', 'pendente', 'cancelado')),
  fornecedor_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  fornecedor_nome TEXT,
  categoria_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  categoria_nome TEXT,
  foto_url TEXT,
  ocr_raw JSONB,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABELA DE OPERÁRIOS / RESPONSÁVEIS POR OBRA
CREATE TABLE IF NOT EXISTS obra_operarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(obra_id, user_id)
);

-- 5. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_obras_company_id ON obras(company_id);
CREATE INDEX IF NOT EXISTS idx_obras_status ON obras(status);
CREATE INDEX IF NOT EXISTS idx_obra_aditivos_obra_id ON obra_aditivos(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_transacoes_obra_id ON obra_transacoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_transacoes_company_id ON obra_transacoes(company_id);
CREATE INDEX IF NOT EXISTS idx_obra_transacoes_tipo ON obra_transacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_obra_transacoes_data ON obra_transacoes(data_movimentacao);
CREATE INDEX IF NOT EXISTS idx_obra_operarios_user ON obra_operarios(user_id);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_aditivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE obra_operarios ENABLE ROW LEVEL SECURITY;

-- Políticas RLS usando has_company_access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'obras' AND policyname = 'obras_company_access') THEN
    CREATE POLICY "obras_company_access" ON obras
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'obra_aditivos' AND policyname = 'obra_aditivos_company_access') THEN
    CREATE POLICY "obra_aditivos_company_access" ON obra_aditivos
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'obra_transacoes' AND policyname = 'obra_transacoes_company_access') THEN
    CREATE POLICY "obra_transacoes_company_access" ON obra_transacoes
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'obra_operarios' AND policyname = 'obra_operarios_company_access') THEN
    CREATE POLICY "obra_operarios_company_access" ON obra_operarios
      FOR ALL USING (company_id IS NULL OR has_company_access(auth.uid(), company_id));
  END IF;
END $$;

-- 7. STORAGE BUCKET PARA COMPROVANTES DE OBRAS
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes_obras', 'comprovantes_obras', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'comprovantes_obras_access') THEN
    CREATE POLICY "comprovantes_obras_access" ON storage.objects
      FOR ALL USING (bucket_id = 'comprovantes_obras');
  END IF;
END $$;
