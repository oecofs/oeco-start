import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const status = searchParams.get("status");
    const competenceMonth = searchParams.get("month"); // "YYYY-MM"

    if (!companyId) {
      return NextResponse.json({ error: "O parâmetro company_id é obrigatório." }, { status: 400 });
    }

    let query = supabase
      .from("nfse_invoices")
      .select("*, template:service_templates(name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (competenceMonth) {
      query = query.gte("competence_date", `${competenceMonth}-01`).lte("competence_date", `${competenceMonth}-31`);
    }

    const { data: invoices, error } = await query;

    if (error) {
      // Se a tabela ainda não foi criada no banco remoto, retorna array vazio sem quebrar o app
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({ invoices: [], pending_migration: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao buscar notas fiscais." }, { status: 500 });
  }
}
