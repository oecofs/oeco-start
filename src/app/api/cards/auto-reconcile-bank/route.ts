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
    const { company_id, month_ref } = body;

    if (!company_id || !month_ref) {
      return NextResponse.json(
        { error: "Empresa e mês de referência são obrigatórios." },
        { status: 400 }
      );
    }

    // 1. Buscar transações de entrada não conciliadas no mês
    const { data: bankTransactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("company_id", company_id)
      .eq("month_ref", month_ref)
      .gt("amount", 0) // apenas créditos / entradas
      .is("receivable_id", null)
      .is("payable_id", null)
      .is("card_installment_id", null);

    if (txError) {
      return NextResponse.json({ error: "Erro ao buscar extrato bancário: " + txError.message }, { status: 500 });
    }

    // 2. Buscar parcelas agendadas (pendentes de liquidação) no mês
    const { data: scheduledInstallments, error: instError } = await supabase
      .from("card_installments")
      .select("*, sale:card_sales(*, terminal:card_terminals(*))")
      .eq("company_id", company_id)
      .eq("month_ref", month_ref)
      .eq("status", "scheduled");

    if (instError) {
      return NextResponse.json({ error: "Erro ao buscar parcelas agendadas: " + instError.message }, { status: 500 });
    }

    const txs = bankTransactions || [];
    const insts = scheduledInstallments || [];

    const matchedPairs: Array<{
      transaction: any;
      installments: any[];
      matchedAmount: number;
    }> = [];

    const acquirerKeywords = [
      "stone",
      "cielo",
      "getnet",
      "rede",
      "pagbank",
      "pagseguro",
      "mercadopago",
      "infinitepay",
      "cartao",
      "cartões",
      "liq",
      "liquidacao",
      "recebiveis",
    ];

    const usedInstallmentIds = new Set<string>();

    for (const tx of txs) {
      const descLower = (tx.description || "").toLowerCase();
      const isAcquirerMentioned = acquirerKeywords.some((kw) => descLower.includes(kw));

      // Match 1: Valor exato de uma parcela individual (mesmo dia ou ± 3 dias)
      const directMatch = insts.find((inst) => {
        if (usedInstallmentIds.has(inst.id)) return false;
        const diffAmount = Math.abs(Number(inst.net_amount) - Number(tx.amount));
        if (diffAmount > 0.05) return false;

        const txDate = new Date(tx.date).getTime();
        const instDate = new Date(inst.expected_date).getTime();
        const daysDiff = Math.abs((txDate - instDate) / (1000 * 60 * 60 * 24));
        return daysDiff <= 3;
      });

      if (directMatch) {
        usedInstallmentIds.add(directMatch.id);
        matchedPairs.push({
          transaction: tx,
          installments: [directMatch],
          matchedAmount: Number(directMatch.net_amount),
        });
        continue;
      }

      // Match 2: Lote de parcelas da mesma maquininha ou mesmo dia somando o valor do depósito
      if (isAcquirerMentioned) {
        const candidateInsts = insts.filter((inst) => {
          if (usedInstallmentIds.has(inst.id)) return false;
          const txDate = new Date(tx.date).getTime();
          const instDate = new Date(inst.expected_date).getTime();
          const daysDiff = Math.abs((txDate - instDate) / (1000 * 60 * 60 * 24));
          return daysDiff <= 3;
        });

        const sumCandidates = candidateInsts.reduce((acc, i) => acc + Number(i.net_amount), 0);
        if (candidateInsts.length > 0 && Math.abs(sumCandidates - Number(tx.amount)) < 0.05) {
          candidateInsts.forEach((i) => usedInstallmentIds.add(i.id));
          matchedPairs.push({
            transaction: tx,
            installments: candidateInsts,
            matchedAmount: sumCandidates,
          });
        }
      }
    }

    // 3. Aplicar as baixas e vínculos encontrados
    let totalSettledAmount = 0;
    let totalInstallmentsSettled = 0;

    for (const pair of matchedPairs) {
      totalSettledAmount += pair.matchedAmount;
      totalInstallmentsSettled += pair.installments.length;

      const instIds = pair.installments.map((i) => i.id);

      // Atualiza as parcelas
      await supabase
        .from("card_installments")
        .update({
          status: "settled",
          settled_date: pair.transaction.date,
          settled_bank_account_id: pair.transaction.bank_account_id || null,
          linked_transaction_id: pair.transaction.id,
        })
        .in("id", instIds);

      // Marca a transação bancária como conciliada
      await supabase
        .from("transactions")
        .update({
          is_reconciled: true,
          card_installment_id: instIds[0],
        })
        .eq("id", pair.transaction.id);
    }

    return NextResponse.json({
      success: true,
      report: {
        matchedTransactionsCount: matchedPairs.length,
        matchedInstallmentsCount: totalInstallmentsSettled,
        totalReconciledAmount: totalSettledAmount,
        month_ref,
      },
    });
  } catch (error: any) {
    console.error("Erro na auto-conciliação bancária:", error);
    return NextResponse.json({ error: error.message || "Erro ao conciliar extrato bancário." }, { status: 500 });
  }
}
