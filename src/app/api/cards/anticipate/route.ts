import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAnticipation } from "@/lib/cards";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company_id,
      installment_ids,
      monthly_rate_percentage,
      bank_account_id,
      anticipation_date,
      notes,
    } = body;

    if (!company_id || !installment_ids || installment_ids.length === 0 || !bank_account_id) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios ausentes (empresa, parcelas ou conta bancária)." },
        { status: 400 }
      );
    }

    const ratePercent = Number(monthly_rate_percentage) || 0;
    if (ratePercent <= 0) {
      return NextResponse.json(
        { error: "Informe uma taxa de antecipação mensal válida." },
        { status: 400 }
      );
    }

    const effDate = anticipation_date || new Date().toISOString().split("T")[0];
    const anticipationDateObj = new Date(effDate + "T12:00:00");
    const monthRef = effDate.substring(0, 7);

    // 1. Buscar as parcelas no banco
    const { data: installments, error: fetchError } = await supabase
      .from("card_installments")
      .select("*, sale:card_sales(*, terminal:card_terminals(id, name, acquirer))")
      .eq("company_id", company_id)
      .in("id", installment_ids);

    if (fetchError || !installments || installments.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma parcela encontrada para antecipação." },
        { status: 404 }
      );
    }

    // 2. Calcular a antecipação
    const calc = calculateAnticipation(installments, ratePercent, anticipationDateObj);

    // 3. Buscar ou criar categoria para Receita de Cartões e Despesa Financeira
    const { data: incomeCat } = await supabase
      .from("categories")
      .select("id")
      .eq("company_id", company_id)
      .eq("type", "income")
      .ilike("name", "%cart%")
      .limit(1)
      .maybeSingle();

    const { data: expenseCat } = await supabase
      .from("categories")
      .select("id")
      .eq("company_id", company_id)
      .eq("type", "expense")
      .or("name.ilike.%antecipa%,name.ilike.%juro%,name.ilike.%bancár%,name.ilike.%financeir%")
      .limit(1)
      .maybeSingle();

    // 4. Criar transação de receita líquida no Fluxo de Caixa
    const firstTerminal = installments[0]?.sale?.terminal?.name || "Cartões";
    const incomeDescription = `Antecipação Cartões ${firstTerminal} (${installments.length} parcelas) - Líquido Recebido`;

    const { data: incomeTx, error: txError } = await supabase
      .from("transactions")
      .insert({
        company_id,
        bank_account_id,
        category_id: incomeCat?.id || null,
        description: notes ? `${incomeDescription} - ${notes}` : incomeDescription,
        amount: calc.totalFinalNet,
        date: effDate,
        month_ref: monthRef,
        is_reconciled: true,
      })
      .select()
      .single();

    if (txError) {
      console.error("Erro ao criar transação de antecipação:", txError);
    }

    // 5. Se houver taxa/juros de antecipação, registrar a despesa financeira correspondente
    if (calc.totalAnticipationFee > 0) {
      const expenseDescription = `Taxa / Juros de Antecipação de Cartões (${ratePercent}% a.m.) - ${firstTerminal}`;
      await supabase.from("transactions").insert({
        company_id,
        bank_account_id,
        category_id: expenseCat?.id || null,
        description: expenseDescription,
        amount: -calc.totalAnticipationFee,
        date: effDate,
        month_ref: monthRef,
        is_reconciled: true,
      });
    }

    // 6. Atualizar as parcelas para o status 'anticipated'
    for (const item of calc.items) {
      await supabase
        .from("card_installments")
        .update({
          status: "anticipated",
          anticipated_at: new Date().toISOString(),
          anticipation_rate_monthly: ratePercent,
          anticipation_fee_amount: item.anticipationFeeAmount,
          anticipation_net_amount: item.finalNetAmount,
          settled_date: effDate,
          settled_bank_account_id: bank_account_id,
          linked_transaction_id: incomeTx?.id || null,
          settlement_notes: notes || `Antecipado a ${ratePercent}% a.m.`,
        })
        .eq("id", item.installment.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        totalOriginalNet: calc.totalOriginalNet,
        totalAnticipationFee: calc.totalAnticipationFee,
        totalFinalNet: calc.totalFinalNet,
        count: installments.length,
        transactionId: incomeTx?.id,
      },
    });
  } catch (err: any) {
    console.error("Erro na rota de antecipação:", err);
    return NextResponse.json({ error: err.message || "Erro interno do servidor." }, { status: 500 });
  }
}
