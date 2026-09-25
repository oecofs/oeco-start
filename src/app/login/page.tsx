"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getWhiteLabelConfig } from "@/lib/whitelabel";

export default function LoginPage() {
  const wl = getWhiteLabelConfig();
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modo de recuperação de senha
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("E-mail ou senha incorretos. Tente novamente.");
      setLoading(false);
    } else {
      window.location.href = "/dashboard";
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError("");
    setForgotSuccess(false);

    try {
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${origin}/auth/reset-password`,
      });

      if (error) {
        setForgotError(error.message || "Erro ao enviar e-mail de recuperação.");
      } else {
        setForgotSuccess(true);
      }
    } catch (err: any) {
      setForgotError(err.message || "Erro inesperado ao solicitar redefinição de senha.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] px-4">
      <div className="w-full max-w-sm">
        {/* Logo ou nome do app */}
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
          <p className="text-xs text-gray-500 mt-1 font-medium">Plataforma de Gestão Financeira</p>
        </div>

        {!isForgotMode ? (
          /* Formulário de Login */
          <form
            onSubmit={handleLogin}
            className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                E-mail de Acesso
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setForgotEmail(email);
                    setForgotError("");
                    setForgotSuccess(false);
                  }}
                  className="text-xs font-semibold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                placeholder="••••••••"
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
              {loading ? "Entrando..." : "Entrar no Sistema"}
            </button>
          </form>
        ) : (
          /* Formulário de Recuperação de Senha */
          <form
            onSubmit={handleForgotPassword}
            className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-4 animate-in fade-in duration-200"
          >
            <div className="text-center pb-1">
              <h2 className="text-base font-bold text-gray-900">Recuperar Senha</h2>
              <p className="text-xs text-gray-500 mt-1">
                Digite seu e-mail cadastrado para receber o link seguro de redefinição de senha.
              </p>
            </div>

            {forgotSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                  <span>✓</span>
                  <span>E-mail enviado!</span>
                </div>
                <p>
                  Enviamos as instruções para <strong>{forgotEmail}</strong>. Verifique sua caixa de entrada e spam para redefinir sua senha.
                </p>
                <button
                  type="button"
                  onClick={() => setIsForgotMode(false)}
                  className="w-full mt-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Seu E-mail Cadastrado
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
                    placeholder="seu@email.com"
                  />
                </div>

                {forgotError && (
                  <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{forgotError}</span>
                  </p>
                )}

                <div className="space-y-2 pt-1">
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer text-sm"
                  >
                    {forgotLoading ? "Enviando..." : "Enviar Link de Recuperação"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsForgotMode(false)}
                    className="w-full text-xs font-semibold text-gray-500 hover:text-gray-800 py-1.5 transition-colors cursor-pointer"
                  >
                    ← Voltar para o Login
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
