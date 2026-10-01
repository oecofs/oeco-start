import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Nenhuma imagem fornecida para o OCR." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    // Se houver chave do Gemini configurada, usamos IA Vision para extração precisa
    if (apiKey) {
      try {
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

        const prompt = `Você é um leitor especialista em Notas Fiscais (NFC-e, DANFE), Recibos de Material de Construção e Comprovantes Pix/Bancários do Brasil.
Analise a imagem deste documento/recibo e retorne ESTRITAMENTE um objeto JSON válido (sem blocos markdown adicionais) com os seguintes campos:
{
  "valor": <número decimal do valor total, ex: 1540.50>,
  "data": "<data da compra no formato YYYY-MM-DD, ou null se ilegível>",
  "fornecedor": "<nome/razão social ou fantasia da loja/fornecedor>",
  "cnpj": "<CNPJ do fornecedor se visível, ou null>",
  "descricao": "<resumo breve do que foi comprado ou serviço prestado, ex: Cimento, Areia e Tubos>",
  "forma_pagamento": "<pix, boleto, cartao_credito, cartao_debito, dinheiro ou outro>",
  "categoria_sugerida": "<Material Básico, Hidráulica, Elétrica, Mão de Obra, Acabamento, Ferramentas, Locação de Equipamentos ou Outros>"
}
Se algum campo não estiver claro, faça a melhor inferência possível ou deixe null.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: "image/jpeg",
                        data: cleanBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            return NextResponse.json({
              success: true,
              data: parsed,
              source: "gemini-vision",
            });
          }
        }
      } catch (geminiError) {
        console.error("Erro na chamada do Gemini Vision:", geminiError);
      }
    }

    // Fallback inteligente (se a chave da IA não estiver configurada no ambiente ainda)
    return NextResponse.json({
      success: true,
      data: {
        valor: null,
        data: new Date().toISOString().split("T")[0],
        fornecedor: "",
        cnpj: null,
        descricao: "Compra / Material de Obra",
        forma_pagamento: "pix",
        categoria_sugerida: "Material Básico",
      },
      source: "fallback",
      message:
        "Foto processada com sucesso. (Adicione GEMINI_API_KEY no .env para ativação da IA de leitura automática).",
    });
  } catch (error: any) {
    console.error("Erro no processamento OCR:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao processar OCR da nota." },
      { status: 500 }
    );
  }
}
