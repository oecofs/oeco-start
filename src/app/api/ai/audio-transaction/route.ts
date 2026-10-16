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

    const body = await request.json();
    const { audioBase64, mimeType = "audio/webm", targetTypeHint, referenceDate } = body;

    if (!audioBase64) {
      return NextResponse.json(
        { error: "Nenhum áudio fornecido para processamento." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave do Gemini (GEMINI_API_KEY) não configurada no servidor." },
        { status: 500 }
      );
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, "");

    const today = referenceDate || new Date().toISOString().split("T")[0];

    const prompt = `Você é um assistente financeiro especialista em BPO e fluxo de caixa empresarial no Brasil.
Hoje é exatamente a data: ${today}.

Ouça este áudio gravado pelo usuário e extraia com precisão os dados para criar uma conta a pagar ou conta a receber.
${targetTypeHint ? `DICA DE CONTEXTO: O usuário está na tela de "${targetTypeHint === "payable" ? "Contas a Pagar" : targetTypeHint === "receivable" ? "Contas a Receber" : "Geral"}". Se o áudio não especificar o tipo com clareza, assuma "${targetTypeHint}".` : ""}

Retorne ESTRITAMENTE um objeto JSON válido (sem qualquer formatação markdown, sem crases, apenas o JSON puro) com a seguinte estrutura:
{
  "type": "payable" ou "receivable",
  "transcription": "<transcrição exata ou mais fiel possível do que o usuário disse no áudio>",
  "amount": <número decimal com o valor, ex: 350.00 ou 1200.50>,
  "entity_name": "<nome da pessoa, empresa, fornecedor ou cliente mencionado. Ex: Posto Ipiranga, João Silva, CEMIG>",
  "description": "<resumo objetivo do que foi pago ou recebido. Ex: Combustível, Honorários Contábeis, Aluguel>",
  "due_date": "<data calculada no formato YYYY-MM-DD considerando a data de referência ${today}. Ex: se falou 'amanhã', calcule ${today} + 1 dia; se falou 'dia 20', calcule dia 20 deste mês ou próximo; se falou 'hoje' ou 'paguei agora', use ${today}>",
  "payment_method": "<pix, boleto, cartao_credito, cartao_debito, dinheiro ou outro>",
  "notes": "<observações adicionais mencionadas no áudio, ou null>",
  "confidence": <número de 0 a 1 indicando o grau de certeza da interpretação>
}

Regras:
1. Se o áudio falar "paguei", "a pagar", "boleto", "despesa", "comprei", "fornecedor" -> type: "payable".
2. Se o áudio falar "recebi", "a receber", "cliente", "faturamento", "receita", "venda" -> type: "receivable".
3. Formate a data no padrão ISO YYYY-MM-DD.
4. Se o valor não for detectado, retorne 0.0.`;

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
                    mimeType: mimeType || "audio/webm",
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Erro na API do Gemini:", errText);
      return NextResponse.json(
        { error: "Falha ao processar áudio com IA.", details: errText },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawContent =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsedResult: any = {};
    try {
      const cleanedJson = rawContent
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      parsedResult = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error("Erro no parse do JSON do Gemini:", parseErr, rawContent);
      return NextResponse.json(
        { error: "IA não retornou um formato JSON compreensível.", raw: rawContent },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsedResult,
    });
  } catch (error: any) {
    console.error("Erro no processamento do áudio:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
