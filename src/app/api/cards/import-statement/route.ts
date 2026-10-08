import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseStatementCsv } from "@/lib/card-parsers";
import { calculateSaleInstallments, findMatchingRateRule, CardRateRule } from "@/lib/cards";

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const terminalId = formData.get("terminal_id") as string | null;
    const companyId = formData.get("company_id") as string | null;

    if (!file || !terminalId || !companyId) {
      return NextResponse.json(
        { error: "Arquivo, maquininha e empresa são obrigatórios." },
        { status: 400 }
      );
    }

    // 1. Obter informações do terminal e regras de taxa contratadas
    const { data: terminal } = await supabase
      .from("card_terminals")
      .select("*")
      .eq("id", terminalId)
      .eq("company_id", companyId)
      .single();

    if (!terminal) {
      return NextResponse.json({ error: "Maquininha não encontrada." }, { status: 404 });
    }

    const { data: rateRulesData } = await supabase
      .from("card_rate_rules")
      .select("*")
      .eq("terminal_id", terminalId)
      .eq("company_id", companyId);

    const rateRules: CardRateRule[] = rateRulesData || [];

    // 2. Ler o conteúdo do arquivo
    const fileText = await file.text();
    const parsedRows = parseStatementCsv(fileText);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma linha válida de venda encontrada no arquivo CSV." },
        { status: 400 }
      );
    }

    // 3. Buscar vendas já existentes na empresa para realizar o Match
    const { data: existingSalesData } = await supabase
      .from("card_sales")
      .select("*, installments:card_installments(*)")
      .eq("company_id", companyId)
      .eq("terminal_id", terminalId);

    const existingSales = existingSalesData || [];

    let matchedCount = 0;
    let createdCount = 0;
    let divergenceCount = 0;
    let totalGross = 0;
    let totalNet = 0;
    let totalFeeDifference = 0;

    // Criar registro de lote
    const { data: batch, error: batchError } = await supabase
      .from("card_import_batches")
      .insert({
        company_id: companyId,
        terminal_id: terminalId,
        filename: file.name,
        acquirer: terminal.acquirer,
        total_rows: parsedRows.length,
      })
      .select()
      .single();

    const batchId = batch?.id;

    // 4. Processar cada linha do extrato
    for (const row of parsedRows) {
      totalGross += row.grossAmount;
      totalNet += row.netAmount;

      // Busca em cascata por venda já existente
      let matchedSale = null;

      if (row.authorizationCode) {
        matchedSale = existingSales.find(
          (s) =>
            s.authorization_code === row.authorizationCode &&
            Math.abs(Number(s.gross_amount) - row.grossAmount) < 0.05
        );
      }

      if (!matchedSale && row.nsu) {
        matchedSale = existingSales.find(
          (s) =>
            s.nsu === row.nsu &&
            Math.abs(Number(s.gross_amount) - row.grossAmount) < 0.05
        );
      }

      if (!matchedSale && row.docNumber) {
        matchedSale = existingSales.find(
          (s) =>
            s.doc_number === row.docNumber &&
            Math.abs(Number(s.gross_amount) - row.grossAmount) < 0.05
        );
      }

      // Regra de taxa contratada
      const matchedRule = findMatchingRateRule(
        rateRules,
        row.paymentMethod,
        row.installmentsCount,
        row.brand
      );

      const expectedFeePercent = matchedRule ? Number(matchedRule.mdr_percentage) : 0;
      const expectedFeeAmount = Number(((row.grossAmount * expectedFeePercent) / 100).toFixed(2));
      const realFeeAmount = row.feeAmount || Number((row.grossAmount - row.netAmount).toFixed(2));
      const realFeePercent = row.feePercentage || (row.grossAmount > 0 ? Number(((realFeeAmount / row.grossAmount) * 100).toFixed(2)) : 0);

      // Auditoria de taxa (Diferença entre o cobrado pela maquininha e o contratado)
      const feeDiff = Number((realFeeAmount - expectedFeeAmount).toFixed(2));
      const isDivergent = feeDiff > 0.1; // Cobrou mais de 10 centavos a mais do que o contratado

      if (isDivergent) {
        divergenceCount++;
        totalFeeDifference += feeDiff;
      }

      const auditStatus = isDivergent ? "divergence" : "verified";

      if (matchedSale) {
        // ✅ MATCH: A venda já existia (ex: cadastrada por foto do canhoto). Atualiza e audita sem duplicar!
        matchedCount++;

        await supabase
          .from("card_sales")
          .update({
            real_fee_amount: realFeeAmount,
            real_fee_percentage: realFeePercent,
            fee_difference_amount: Math.max(0, feeDiff),
            audit_status: auditStatus,
            settlement_batch_id: row.settlementBatchId || matchedSale.settlement_batch_id,
            batch_id: batchId,
          })
          .eq("id", matchedSale.id);

        // Se houver data de liquidação informada no arquivo, atualiza a parcela correspondente
        if (row.settlementDate && matchedSale.installments && matchedSale.installments.length > 0) {
          const instToUpdate = matchedSale.installments[0];
          await supabase
            .from("card_installments")
            .update({
              expected_date: row.settlementDate,
              settlement_batch_id: row.settlementBatchId || instToUpdate.settlement_batch_id,
            })
            .eq("id", instToUpdate.id);
        }
      } else {
        // ➕ NOVA VENDA: Venda veio no extrato da adquirente mas não estava cadastrada antes
        createdCount++;
        const saleDateObj = new Date(row.saleDate);
        const monthRef = row.saleDate.substring(0, 7);

        const calculated = calculateSaleInstallments({
          grossAmount: row.grossAmount,
          paymentMethod: row.paymentMethod,
          installmentsCount: row.installmentsCount,
          saleDate: saleDateObj,
          rateRule: matchedRule,
        });

        const { data: newSale } = await supabase
          .from("card_sales")
          .insert({
            company_id: companyId,
            terminal_id: terminalId,
            sale_date: saleDateObj.toISOString(),
            gross_amount: row.grossAmount,
            net_amount: row.netAmount,
            total_fee_amount: realFeeAmount,
            real_fee_amount: realFeeAmount,
            real_fee_percentage: realFeePercent,
            fee_difference_amount: Math.max(0, feeDiff),
            audit_status: auditStatus,
            payment_method: row.paymentMethod,
            brand: row.brand,
            installments_count: row.installmentsCount,
            authorization_code: row.authorizationCode || null,
            nsu: row.nsu || null,
            doc_number: row.docNumber || null,
            card_last_digits: row.cardLastDigits || null,
            settlement_batch_id: row.settlementBatchId || null,
            batch_id: batchId,
            entry_source: "csv_import",
            month_ref: monthRef,
            status: "pending",
          })
          .select()
          .single();

        if (newSale) {
          const installmentsToInsert = calculated.installments.map((inst) => ({
            company_id: companyId,
            sale_id: newSale.id,
            installment_number: inst.installment_number,
            total_installments: inst.total_installments,
            gross_amount: inst.gross_amount,
            fee_amount: inst.fee_amount,
            net_amount: inst.net_amount,
            real_fee_amount: inst.fee_amount,
            expected_date: row.settlementDate || inst.expected_date,
            month_ref: (row.settlementDate || inst.expected_date).substring(0, 7),
            status: "scheduled",
          }));

          await supabase.from("card_installments").insert(installmentsToInsert);
        }
      }
    }

    // 5. Atualizar o lote com os totais consolidados
    if (batchId) {
      await supabase
        .from("card_import_batches")
        .update({
          matched_count: matchedCount,
          created_count: createdCount,
          divergence_count: divergenceCount,
          total_gross_amount: totalGross,
          total_net_amount: totalNet,
          total_fee_difference: totalFeeDifference,
        })
        .eq("id", batchId);
    }

    return NextResponse.json({
      success: true,
      report: {
        totalRows: parsedRows.length,
        matchedCount,
        createdCount,
        divergenceCount,
        totalGross,
        totalNet,
        totalFeeDifference,
      },
    });
  } catch (error: any) {
    console.error("Erro ao importar extrato:", error);
    return NextResponse.json({ error: error.message || "Erro ao processar extrato." }, { status: 500 });
  }
}
