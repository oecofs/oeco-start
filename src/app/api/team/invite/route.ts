import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, email, role = "operator" } = body;

    if (!companyId || !email) {
      return NextResponse.json(
        { error: "Empresa e e-mail são obrigatórios para realizar o convite." },
        { status: 400 }
      );
    }

    const emailClean = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return NextResponse.json(
        { error: "Formato de e-mail inválido." },
        { status: 400 }
      );
    }

    // 1. Autentica o usuário solicitante
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sessão expirada ou não autenticado." },
        { status: 401 }
      );
    }

    // 2. Valida se o usuário tem permissão de 'admin' na empresa especificada ou é 'master' global
    const { data: userRoles } = await supabase
      .from("user_companies")
      .select("company_id, role")
      .eq("user_id", user.id);

    const isUserMaster = (userRoles || []).some((r) => r.role === "master");
    const isCompanyAdmin = (userRoles || []).some(
      (r) => r.company_id === companyId && r.role === "admin"
    );

    if (!isUserMaster && !isCompanyAdmin) {
      return NextResponse.json(
        { error: "Permissão negada. Apenas administradores da empresa ou usuários Master podem convidar membros." },
        { status: 403 }
      );
    }

    // 3. Obtém cliente Admin com Service Role
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            "A chave SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor. Por favor, adicione-a nas variáveis de ambiente.",
        },
        { status: 500 }
      );
    }

    // 4. Primeiro, tenta vincular se o usuário já estiver cadastrado no sistema
    const { data: linkData, error: linkErr } = await adminClient.rpc(
      "add_company_member_by_email",
      {
        p_company_id: companyId,
        p_email: emailClean,
        p_role: role,
      }
    );

    if (!linkErr && linkData?.success) {
      // Busca o user_id do usuário vinculado para que a interface possa associar as permissões de módulos
      const { data: linkedUser } = await adminClient
        .from("user_companies")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("id", linkData.member_id)
        .single();

      return NextResponse.json({
        success: true,
        isNewUser: false,
        userId: linkedUser?.user_id,
        message: `Usuário "${emailClean}" já possuía cadastro e foi vinculado à empresa com sucesso!`,
      });
    }

    // 5. Se o usuário ainda não existe, dispara o convite oficial do Supabase Admin
    const requestOrigin = request.headers.get("origin") || request.headers.get("host");
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (requestOrigin?.startsWith("http") ? requestOrigin : `https://${requestOrigin}`) ||
      "https://app.oecofs.com";

    const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/reset-password`;

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(emailClean, {
        redirectTo,
        data: {
          role,
          company_id: companyId,
        },
      });

    if (inviteError) {
      return NextResponse.json(
        { error: `Erro ao enviar convite: ${inviteError.message}` },
        { status: 400 }
      );
    }

    if (inviteData?.user?.id) {
      // Pré-vincula o usuário na tabela user_companies
      await adminClient.from("user_companies").upsert(
        {
          user_id: inviteData.user.id,
          company_id: companyId,
          role: role,
        },
        { onConflict: "user_id,company_id" }
      );
    }

    return NextResponse.json({
      success: true,
      isNewUser: true,
      userId: inviteData?.user?.id,
      message: `Convite oficial enviado por e-mail para "${emailClean}"! O usuário foi pré-vinculado e o acesso estará liberado assim que ele criar a senha pelo link recebido.`,
    });
  } catch (error: any) {
    console.error("Erro na rota de convite:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao processar o convite." },
      { status: 500 }
    );
  }
}
