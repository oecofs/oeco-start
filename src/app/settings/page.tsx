"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navigation from "@/components/Navigation";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Navigation>
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Configurações</h1>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-gray-500 mb-4">
              As configurações de empresa, banco e categorias serão construídas
              na Etapa 5.
            </p>
          </div>

          {/* Botão de logout */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="w-full md:w-auto px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors"
            >
              Sair (logout)
            </button>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
