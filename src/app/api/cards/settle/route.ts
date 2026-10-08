import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const {
      company_id,
      installment_ids,
      bank_account_id,
      settlement_date,
      create_transaction = true,
      notes = "",
    } = body;

    if (!company_id || !installment_ids || !Array.isArray(installment_ids) || installment_ids.length === 0) {
      return NextResponse.json(
        { error: "Empresa e parcelas selecionadas são obrigatórias." },
        { status: 400 }
      );
    }

    // 1. Buscar as parcelas com suas respectivas vendas e maquininhas
    const { data: installmentsData, error: instFetchError } = await supabase
      .from("card_installments")
      .select("*, sale:card_sales(*, terminal:card_terminals(*))")
      .in("id", installment_ids)
      .eq("company_id", company_id);

    if (instFetchError || !installmentsData || installmentsData.length === 0) {
      return NextResponse.json({ error: "Parcelas não encontradas." }, { status: 404 });
    }

    const effectiveSettlementDate = settlement_date || new Date().toISOString().split("T")[0];
    const monthRef = effectiveSettlementDate.substring(0, 7);

    let createdTransactionId: string | null = null;
    const totalNet = installmentsData.reduce((acc, i) => acc + Number(i.net_amount || 0), 0);
    const totalGross = installmentsData.reduce((acc, i) => acc + Number(i.gross_amount || 0), 0);
    const totalFee = installmentsData.reduce((acc, i) => acc + Number(i.fee_amount || 0), 0);

    // 2. Se solicitado, cria a transação de entrada no Fluxo de Caixa (transactions)
    if (create_transaction && totalNet > 0 && bank_account_id) {
      // Buscar ou definir categoria padrão de Receita de Cartões
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name")
        .eq("company_id", company_id)
        .eq("type", "income")
        .ilike("name", "%cartão%")
        .limit(1);

      let categoryId = categories && categories.length > 0 ? categories[0].id : null;

      if (!categoryId) {
        // Fallback: primeira categoria de receita da empresa
        const { data: anyIncomeCat } = await supabase
          .from("categories")
          .select("id")
          .eq("company_id", company_id)
          .eq("type", "income")
          .limit(1);

        categoryId = anyIncomeCat && anyIncomeCat.length > 0 ? anyIncomeCat[0].id : null;
      }

      const terminalNames = Array.from(
        new Set(installmentsData.map((i: any) => i.sale?.terminal?.name).filter(Boolean))
      ).join(", ");

      const txDescription = `Liquidação Cartão - ${terminalNames || "Maquininha"} (${installmentsData.length} ${
        installmentsData.length === 1 ? "parcela" : "parcelas"
      })`;

      const { data: newTx, error: txError } = await supabase
        .from("transactions")
        .insert({
          company_id,
          user_id: user.id,
          date: effectiveSettlementDate,
          description: txDescription,
          amount: totalNet,
          category_id: categoryId,
          bank_account_id: bank_account_id,
          is_reconciled: true,
          month_ref: monthRef,
        })
        .select()
        .single();

      if (!txError && newTx) {
        createdTransactionId = newTx.id;
      }
    }

    // 3. Atualizar cada parcela para o status 'settled'
    const updatePayload: any = {
      status: "settled",
      settled_date: effectiveSettlementDate,
      settled_bank_account_id: bank_account_id || null,
      settlement_notes: notes || null,
    };

    if (createdTransactionId) {
      updatePayload.linked_transaction_id = createdTransactionId;
    }

    const { error: updateError } = await supabase
      .from("card_installments")
      .update(updatePayload)
      .in("id", installment_ids)
      .eq("company_id", company_id);

    if (updateError) {
      return NextResponse.json({ error: "Erro ao liquidar parcelas: " + updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      settledCount: installmentsData.length,
      totalNet,
      totalGross,
      totalFee,
      settlementDate: effectiveSettlementDate,
      transactionId: createdTransactionId,
    });
  } catch (error: any) {
    console.error("Erro ao liquidar parcelas:", error);
    return NextResponse.json({ error: error.message || "Erro ao processar liquidação." }, { status: 500 });
  }
}
