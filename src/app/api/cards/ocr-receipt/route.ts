import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const terminalHint = formData.get("terminal_hint") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    let extractedData = null;

    // Se houver chave do Gemini configurada, usa a IA multimodal do Google
    if (geminiApiKey) {
      try {
        const prompt = `Você é um especialista em OCR e auditoria de comprovantes de maquininhas de cartão de crédito e débito brasileiras (Getnet, Stone, Cielo, Rede, PagBank, Mercado Pago, InfinitePay, etc.).
Analise a imagem deste comprovante de venda ("canhoto") e extraia as seguintes informações padronizadas em formato JSON estrito:
{
  "acquirer": "getnet" | "stone" | "cielo" | "rede" | "pagbank" | "mercadopago" | "infinitepay" | "other",
  "brand": "visa" | "mastercard" | "elo" | "hipercard" | "amex" | "other",
  "payment_method": "debit" | "credit_cash" | "credit_installment" | "voucher" | "pix",
  "gross_amount": number (ex: 180.00),
  "installments_count": number (1 se for débito ou crédito à vista / 1x, ou o número de parcelas ex: 2, 3, 6, 10),
  "sale_date": "YYYY-MM-DDTHH:mm:ss" (data e hora da venda impressa no canhoto, ex: "2026-09-01T14:48:44"),
  "card_last_digits": "string" (apenas os 4 últimos dígitos do cartão se visível, ex: "9208"),
  "nsu": "string" (Número Sequencial Único / CV da Getnet / NSU principal impresso),
  "doc_number": "string" (Número do Documento / DOC impresso, se houver),
  "authorization_code": "string" (Código de autorização / AUT / AUTO impresso),
  "terminal_serial": "string" (Número do terminal / TERM impresso, se houver),
  "confidence": number (de 0 a 100 indicando a qualidade da leitura)
}
Atenção aos detalhes:
- Se estiver escrito "CREDITO" sem indicação de parcelamento, a modalidade é "credit_cash" e installments_count é 1.
- No comprovante Getnet: CV é o "nsu", DOC é o "doc_number", e AUT é o "authorization_code".
- Retorne SOMENTE o JSON puro, sem marcações markdown.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Image,
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            extractedData = JSON.parse(cleanText);
          }
        }
      } catch (err) {
        console.error("Erro ao chamar API de IA para OCR:", err);
      }
    }

    // Fallback caso a chave de IA não esteja configurada no .env.local
    if (!extractedData) {
      extractedData = {
        acquirer: terminalHint || "getnet",
        brand: "visa",
        payment_method: "credit_cash",
        gross_amount: 0,
        installments_count: 1,
        sale_date: new Date().toISOString(),
        card_last_digits: "",
        nsu: "",
        doc_number: "",
        authorization_code: "",
        terminal_serial: "",
        confidence: 0,
        is_simulated: true,
      };
    }

    return NextResponse.json({
      success: true,
      data: extractedData,
    });
  } catch (error: any) {
    console.error("Erro no OCR de comprovante:", error);
    return NextResponse.json({ error: error.message || "Erro ao processar imagem." }, { status: 500 });
  }
}
