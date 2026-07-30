import { getWhiteLabelConfig } from "@/lib/whitelabel";

export default function LoginPage() {
  const wl = getWhiteLabelConfig();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
            <h1 className="text-3xl font-bold text-primary">{wl.appName}</h1>
          )}
        </div>

        {/* Formulário será implementado na Etapa 2 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-center text-gray-500">
            Tela de login — autenticação será implementada na Etapa 2.
          </p>
        </div>
      </div>
    </div>
  );
}
