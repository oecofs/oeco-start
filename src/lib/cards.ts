// =========================================================================
// Oeco Start — Utilitários e Cálculo do Módulo de Cartões
// =========================================================================

export type PaymentMethod = 'debit' | 'credit_cash' | 'credit_installment' | 'voucher' | 'pix';
export type CardBrand = 'visa' | 'mastercard' | 'elo' | 'hipercard' | 'amex' | 'other';
export type Acquirer = 'stone' | 'cielo' | 'rede' | 'pagbank' | 'getnet' | 'mercadopago' | 'infinitepay' | 'other';

export interface CardTerminal {
  id: string;
  company_id: string;
  name: string;
  acquirer: Acquirer;
  model_serial?: string;
  bank_account_id?: string;
  is_active: boolean;
  created_at?: string;
}

export interface CardRateRule {
  id: string;
  company_id: string;
  terminal_id: string;
  payment_method: PaymentMethod;
  brand: string;
  min_installments: number;
  max_installments: number;
  mdr_percentage: number;
  fixed_fee: number;
  settlement_days: number;
}

export interface CardSale {
  id: string;
  company_id: string;
  terminal_id: string;
  sale_date: string;
  gross_amount: number;
  net_amount: number;
  total_fee_amount: number;
  payment_method: PaymentMethod;
  brand: string;
  installments_count: number;
  authorization_code?: string;
  nsu?: string;
  doc_number?: string;
  card_last_digits?: string;
  terminal_serial?: string;
  customer_name?: string;
  customer_id?: string;
  receipt_image_url?: string;
  status: 'pending' | 'partial_settled' | 'settled' | 'cancelled' | 'chargeback';
  audit_status?: 'pending' | 'verified' | 'divergence' | 'cancelled' | 'chargeback';
  real_fee_amount?: number;
  real_fee_percentage?: number;
  fee_difference_amount?: number;
  settlement_batch_id?: string;
  batch_id?: string;
  entry_source: 'manual' | 'ocr_receipt' | 'csv_import' | 'api_sync';
  cancelled_at?: string;
  cancellation_reason?: string;
  chargeback_date?: string;
  chargeback_notes?: string;
  notes?: string;
  month_ref: string;
  terminal?: CardTerminal;
  installments?: CardInstallment[];
}

export interface CardInstallment {
  id: string;
  company_id: string;
  sale_id: string;
  installment_number: number;
  total_installments: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  real_fee_amount?: number;
  expected_date: string;
  settled_date?: string;
  settled_bank_account_id?: string;
  settlement_notes?: string;
  settlement_batch_id?: string;
  anticipated_at?: string;
  anticipation_rate_monthly?: number;
  anticipation_fee_amount?: number;
  anticipation_net_amount?: number;
  status: 'scheduled' | 'settled' | 'anticipated' | 'cancelled' | 'chargeback';
  linked_transaction_id?: string;
  month_ref: string;
  sale?: CardSale;
}

export interface AnticipationCalculationItem {
  installment: CardInstallment;
  daysToMaturity: number;
  originalNetAmount: number;
  anticipationFeeAmount: number;
  finalNetAmount: number;
  effectiveRatePercentage: number;
}

export interface AnticipationCalculationResult {
  totalOriginalNet: number;
  totalAnticipationFee: number;
  totalFinalNet: number;
  items: AnticipationCalculationItem[];
}

export function calculateAnticipation(
  installments: CardInstallment[],
  monthlyRatePercentage: number,
  anticipationDate: Date = new Date()
): AnticipationCalculationResult {
  const anticipationTime = new Date(anticipationDate.toISOString().split('T')[0] + 'T00:00:00').getTime();

  let totalOriginalNet = 0;
  let totalAnticipationFee = 0;
  let totalFinalNet = 0;

  const items: AnticipationCalculationItem[] = installments.map((inst) => {
    const expectedTime = new Date(inst.expected_date + 'T00:00:00').getTime();
    const diffDays = Math.max(0, Math.round((expectedTime - anticipationTime) / (1000 * 60 * 60 * 24)));

    const originalNet = Number(inst.net_amount) || 0;
    // Cálculo pró-rata com base na taxa mensal informada (30 dias padrão)
    const effectiveRate = (diffDays / 30) * (monthlyRatePercentage / 100);
    const anticipationFee = Math.round(originalNet * effectiveRate * 100) / 100;
    const finalNet = Math.max(0, Math.round((originalNet - anticipationFee) * 100) / 100);

    totalOriginalNet += originalNet;
    totalAnticipationFee += anticipationFee;
    totalFinalNet += finalNet;

    return {
      installment: inst,
      daysToMaturity: diffDays,
      originalNetAmount: originalNet,
      anticipationFeeAmount: anticipationFee,
      finalNetAmount: finalNet,
      effectiveRatePercentage: Math.round(effectiveRate * 10000) / 100,
    };
  });

  return {
    totalOriginalNet: Math.round(totalOriginalNet * 100) / 100,
    totalAnticipationFee: Math.round(totalAnticipationFee * 100) / 100,
    totalFinalNet: Math.round(totalFinalNet * 100) / 100,
    items,
  };
}

export const ACQUIRER_LABELS: Record<Acquirer, { label: string; color: string }> = {
  stone: { label: 'Stone', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cielo: { label: 'Cielo', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  rede: { label: 'Rede', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  pagbank: { label: 'PagBank', color: 'bg-lime-100 text-lime-800 border-lime-300' },
  getnet: { label: 'Getnet', color: 'bg-red-100 text-red-800 border-red-300' },
  mercadopago: { label: 'Mercado Pago', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  infinitepay: { label: 'InfinitePay', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  other: { label: 'Outra', color: 'bg-gray-100 text-gray-800 border-gray-300' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  debit: 'Débito',
  credit_cash: 'Crédito à Vista',
  credit_installment: 'Crédito Parcelado',
  voucher: 'Voucher / Refeição',
  pix: 'Pix Maquininha',
};

export const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  hipercard: 'Hipercard',
  amex: 'American Express',
  other: 'Outra',
  all: 'Todas as Bandeiras',
};

/**
 * Encontra a regra de taxa aplicável para uma venda com base no terminal, método e parcelas.
 */
export function findMatchingRateRule(
  rules: CardRateRule[],
  paymentMethod: PaymentMethod,
  installmentsCount: number,
  brand: string = 'all'
): CardRateRule | null {
  const methodRules = rules.filter((r) => r.payment_method === paymentMethod);
  if (methodRules.length === 0) return null;

  // 1. Tenta encontrar por bandeira específica e faixa de parcelas
  const specific = methodRules.find(
    (r) =>
      r.brand.toLowerCase() === brand.toLowerCase() &&
      installmentsCount >= r.min_installments &&
      installmentsCount <= r.max_installments
  );
  if (specific) return specific;

  // 2. Tenta encontrar regra genérica (brand = 'all') na faixa de parcelas
  const generic = methodRules.find(
    (r) =>
      (r.brand === 'all' || !r.brand) &&
      installmentsCount >= r.min_installments &&
      installmentsCount <= r.max_installments
  );
  if (generic) return generic;

  // 3. Fallback: primeira regra encontrada para o método
  return methodRules[0];
}

/**
 * Calcula o desdobramento de parcelas e liquidações futuras de uma venda no cartão.
 */
export function calculateSaleInstallments({
  grossAmount,
  paymentMethod,
  installmentsCount,
  saleDate,
  rateRule,
}: {
  grossAmount: number;
  paymentMethod: PaymentMethod;
  installmentsCount: number;
  saleDate: Date;
  rateRule?: CardRateRule | null;
}) {
  const count = Math.max(1, paymentMethod === 'credit_installment' ? installmentsCount : 1);
  const mdrPercent = rateRule ? Number(rateRule.mdr_percentage) : paymentMethod === 'debit' ? 1.2 : paymentMethod === 'credit_cash' ? 2.5 : 3.5;
  const fixedFee = rateRule ? Number(rateRule.fixed_fee || 0) : 0;
  const baseSettlementDays = rateRule ? Number(rateRule.settlement_days) : paymentMethod === 'debit' ? 1 : 30;

  const totalFee = Number(((grossAmount * mdrPercent) / 100 + fixedFee).toFixed(2));
  const totalNet = Number((grossAmount - totalFee).toFixed(2));

  const grossPerInstallment = Number((grossAmount / count).toFixed(2));
  const feePerInstallment = Number((totalFee / count).toFixed(2));
  const netPerInstallment = Number((grossPerInstallment - feePerInstallment).toFixed(2));

  const installments = [];

  for (let i = 1; i <= count; i++) {
    // Projeção da data prevista de liquidação
    const expectedDate = new Date(saleDate);
    if (paymentMethod === 'debit') {
      expectedDate.setDate(expectedDate.getDate() + baseSettlementDays);
    } else {
      // Crédito: 1ª parcela em D+30 (ou base), 2ª em D+60, 3ª em D+90...
      expectedDate.setDate(expectedDate.getDate() + (baseSettlementDays + (i - 1) * 30));
    }

    // Se cair no fim de semana, move para a próxima segunda-feira
    const dayOfWeek = expectedDate.getDay();
    if (dayOfWeek === 0) expectedDate.setDate(expectedDate.getDate() + 1); // Domingo -> Segunda
    if (dayOfWeek === 6) expectedDate.setDate(expectedDate.getDate() + 2); // Sábado -> Segunda

    const expectedDateStr = expectedDate.toISOString().split('T')[0];
    const monthRef = expectedDateStr.substring(0, 7);

    // Ajuste de centavos na última parcela
    const isLast = i === count;
    const currentGross = isLast
      ? Number((grossAmount - grossPerInstallment * (count - 1)).toFixed(2))
      : grossPerInstallment;
    const currentFee = isLast
      ? Number((totalFee - feePerInstallment * (count - 1)).toFixed(2))
      : feePerInstallment;
    const currentNet = Number((currentGross - currentFee).toFixed(2));

    installments.push({
      installment_number: i,
      total_installments: count,
      gross_amount: currentGross,
      fee_amount: currentFee,
      net_amount: currentNet,
      expected_date: expectedDateStr,
      month_ref: monthRef,
      status: 'scheduled' as const,
    });
  }

  return {
    gross_amount: grossAmount,
    total_fee_amount: totalFee,
    net_amount: totalNet,
    installments,
  };
}
