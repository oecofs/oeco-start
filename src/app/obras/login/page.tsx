"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ObrasLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authErr) {
        throw new Error(authErr.message || "E-mail ou senha incorretos.");
      }

      if (data?.user) {
        router.push("/obras");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao entrar no sistema.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-950 via-gray-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 border border-amber-900/20">
        {/* Logo & Marca */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 text-white flex items-center justify-center text-3xl mx-auto shadow-lg shadow-amber-600/30">
            🏗️
          </div>
          <div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-2xl font-black tracking-tight text-gray-900">Óeco</span>
              <span className="px-2 py-0.5 text-xs font-black uppercase tracking-wider rounded bg-amber-100 text-amber-900 border border-amber-200">
                Obras
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Controle Financeiro de Obras & Projetos
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              E-mail de Acesso
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Senha
              </label>
              <Link
                href="/auth/reset-password"
                className="text-[11px] font-bold text-amber-800 hover:underline"
              >
                Esqueceu?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-sm shadow-md shadow-amber-700/20 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar no Óeco Obras →"}
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-gray-400">
          Acesso seguro corporativo • Óeco Consultoria
        </div>
      </div>
    </div>
  );
}
