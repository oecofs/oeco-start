import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_id, sale_id, action, reason, date } = body;

    if (!company_id || !sale_id || !action) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios ausentes (empresa, venda ou ação)." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const targetStatus = action === "chargeback" ? "chargeback" : "cancelled";

    // 1. Atualizar a venda
    const { error: saleError } = await supabase
      .from("card_sales")
      .update({
        status: targetStatus,
        audit_status: targetStatus,
        cancelled_at: nowIso,
        cancellation_reason: reason || null,
        chargeback_date: date || nowIso.split("T")[0],
        chargeback_notes: reason || null,
      })
      .eq("id", sale_id)
      .eq("company_id", company_id);

    if (saleError) {
      return NextResponse.json({ error: "Erro ao atualizar status da venda: " + saleError.message }, { status: 500 });
    }

    // 2. Atualizar parcelas agendadas para canceladas/chargeback
    const { error: instError } = await supabase
      .from("card_installments")
      .update({
        status: targetStatus,
      })
      .eq("sale_id", sale_id)
      .eq("company_id", company_id)
      .eq("status", "scheduled");

    if (instError) {
      console.error("Erro ao cancelar parcelas futuras:", instError);
    }

    return NextResponse.json({
      success: true,
      message: action === "chargeback" ? "Chargeback registrado com sucesso." : "Venda cancelada com sucesso.",
    });
  } catch (err: any) {
    console.error("Erro na rota de chargeback:", err);
    return NextResponse.json({ error: err.message || "Erro interno do servidor." }, { status: 500 });
  }
}
