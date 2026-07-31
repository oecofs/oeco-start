# Oeco Start

App web para conciliação bancária mensal e rastreamento de recebíveis.

## Stack
- Next.js 14 (App Router)
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Vercel (Deploy)

## Variáveis de Ambiente

Copie `.env.local.example` para `.env.local` e preencha:
```env
NEXT_PUBLIC_APP_NAME=Oeco Start
NEXT_PUBLIC_LOGO_URL=
NEXT_PUBLIC_PRIMARY_COLOR=#1e3a5f
NEXT_PUBLIC_WEBHOOK_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Desenvolvimento
```bash
npm install
npm run dev
```

Acesse http://localhost:3000
