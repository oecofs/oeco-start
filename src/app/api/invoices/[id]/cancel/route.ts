import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelNfseOnSpedy } from "@/lib/fiscal/spedyService";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const invoiceId = params.id;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Erro no preenchimento do serviço ou valor.";

    // 1. Busca a nota local
    const { data: invoice, error: fetchErr } = await supabase
      .from("nfse_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: "Nota fiscal não encontrada." }, { status: 404 });
    }

    if (!invoice.spedy_id) {
      return NextResponse.json(
        { error: "Esta nota não possui ID de processamento no Spedy para cancelamento." },
        { status: 400 }
      );
    }

    // 2. Consulta configurações fiscais da empresa
    const { data: fiscalSettings } = await supabase
      .from("company_fiscal_settings")
      .select("spedy_api_key")
      .eq("company_id", invoice.company_id)
      .single();

    const customApiKey = fiscalSettings?.spedy_api_key || undefined;

    // 3. Solicita cancelamento via Spedy
    const cancelRes = await cancelNfseOnSpedy(invoice.spedy_id, reason, customApiKey);

    if (!cancelRes.success) {
      return NextResponse.json({ error: cancelRes.message }, { status: 400 });
    }

    // 4. Atualiza status no banco
    const { data: updated, error: updErr } = await supabase
      .from("nfse_invoices")
      .update({
        status: "cancelled",
        status_message: `Nota fiscal cancelada: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .select("*")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Se vinculado a um recebível, desmarca
    if (invoice.receivable_id) {
      await supabase
        .from("receivables")
        .update({
          nf_status: "cancelada",
        })
        .eq("id", invoice.receivable_id);
    }

    return NextResponse.json({ success: true, invoice: updated, message: cancelRes.message });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao solicitar cancelamento da NFS-e." },
      { status: 500 }
    );
  }
}
