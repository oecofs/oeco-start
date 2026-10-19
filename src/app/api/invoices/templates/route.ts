import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json({ error: "O parâmetro company_id é obrigatório." }, { status: 400 });
    }

    const { data: templates, error } = await supabase
      .from("service_templates")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({ templates: [], pending_migration: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao buscar modelos fiscais." }, { status: 500 });
  }
}

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
      id,
      company_id,
      name,
      description,
      cnae,
      service_code_lc116,
      municipal_service_code,
      default_iss_rate = 2.0,
      iss_retained_default = false,
      is_favorite = false,
    } = body;

    if (!company_id || !name?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: "Empresa, nome do modelo e descrição do serviço são obrigatórios." },
        { status: 400 }
      );
    }

    const payload = {
      company_id,
      name: name.trim(),
      description: description.trim(),
      cnae: cnae?.trim() || "7020-4/00",
      service_code_lc116: service_code_lc116?.trim() || "17.01",
      municipal_service_code: municipal_service_code?.trim() || null,
      default_iss_rate: Number(default_iss_rate),
      iss_retained_default: Boolean(iss_retained_default),
      is_favorite: Boolean(is_favorite),
      updated_at: new Date().toISOString(),
    };

    if (id && !id.startsWith("tpl-")) {
      const { data: updated, error } = await supabase
        .from("service_templates")
        .update(payload)
        .eq("id", id)
        .eq("company_id", company_id)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, template: updated });
    } else {
      const { data: created, error } = await supabase
        .from("service_templates")
        .insert(payload)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, template: created });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao salvar modelo fiscal." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const companyId = searchParams.get("company_id");

    if (!id || !companyId) {
      return NextResponse.json({ error: "ID e company_id são obrigatórios." }, { status: 400 });
    }

    const { error } = await supabase
      .from("service_templates")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao excluir modelo fiscal." }, { status: 500 });
  }
}
