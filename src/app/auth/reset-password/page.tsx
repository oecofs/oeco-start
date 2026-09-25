"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getWhiteLabelConfig } from "@/lib/whitelabel";

export default function ResetPasswordPage() {
  const wl = getWhiteLabelConfig();
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Verifica se há sessão ou hash de recuperação de senha
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        // O Supabase processa o hash do token de redefinição e autentica a sessão temporária
      } catch (err) {
        console.error("Erro ao verificar sessão de recuperação:", err);
      } finally {
        setCheckingSession(false);
      }
    }
    checkAuth();
  }, [supabase]);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas digitadas não coincidem. Verifique e tente novamente.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message || "Erro ao redefinir senha. O link pode ter expirado.");
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado ao salvar nova senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Nome do App */}
        <div className="text-center mb-8">
          {wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wl.logoUrl}
              alt={wl.appName}
              className="h-16 mx-auto object-contain"
            />
          ) : (
            <h1 className="text-3xl font-extrabold text-primary tracking-tight">{wl.appName}</h1>
          )}
          <p className="text-xs text-gray-500 mt-1 font-medium">Redefinição de Senha Segura</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-4">
          <div className="text-center pb-1">
            <h2 className="text-base font-bold text-gray-900">Definir Nova Senha</h2>
            <p className="text-xs text-gray-500 mt-1">
              Crie uma nova senha de acesso para a sua conta.
            </p>
          </div>

          {success ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 space-y-2 text-xs text-center">
              <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto text-lg font-bold">
                ✓
              </div>
              <h3 className="font-bold text-emerald-900 text-sm mt-2">Senha alterada com sucesso!</h3>
              <p className="text-emerald-700">
                Redirecionando você para o sistema...
              </p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Confirme a Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repita a nova senha"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer text-sm"
              >
                {loading ? "Salvando..." : "Salvar Nova Senha"}
              </button>

              <div className="text-center pt-1">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ← Voltar para o Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
