import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkNfseStatusOnSpedy } from "@/lib/fiscal/spedyService";

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
    if (!invoiceId) {
      return NextResponse.json({ error: "ID da nota fiscal inválido." }, { status: 400 });
    }

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
        { error: "Esta nota ainda não possui um ID de transmissão no Spedy." },
        { status: 400 }
      );
    }

    // 2. Consulta configurações fiscais da empresa (se houver chave de API personalizada)
    const { data: fiscalSettings } = await supabase
      .from("company_fiscal_settings")
      .select("spedy_api_key")
      .eq("company_id", invoice.company_id)
      .single();

    const customApiKey = fiscalSettings?.spedy_api_key || undefined;

    // 3. Consulta status na API do Spedy
    const spedyStatus = await checkNfseStatusOnSpedy(invoice.spedy_id, customApiKey);

    let updatedStatus = invoice.status;
    let updatedMessage = invoice.status_message;

    if (spedyStatus.status === "authorized") {
      updatedStatus = "authorized";
      updatedMessage = "Nota fiscal autorizada com sucesso.";
    } else if (spedyStatus.status === "rejected" || spedyStatus.status === "error") {
      updatedStatus = "rejected";
      updatedMessage = spedyStatus.messages?.[0]?.message || "Nota rejeitada pelo provedor municipal.";
    }

    const { data: updated, error: updErr } = await supabase
      .from("nfse_invoices")
      .update({
        status: updatedStatus,
        status_message: updatedMessage,
        number: spedyStatus.number || invoice.number,
        series: spedyStatus.series || invoice.series,
        verification_code: spedyStatus.verificationCode || invoice.verification_code,
        danfse_url: spedyStatus.danfseUrl || invoice.danfse_url,
        xml_url: spedyStatus.xmlUrl || invoice.xml_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .select("*")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invoice: updated, spedy: spedyStatus });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao sincronizar status da NFS-e." },
      { status: 500 }
    );
  }
}
