import Link from "next/link";
import Navigation from "@/components/Navigation";

export default function DashboardPage() {
  return (
    <Navigation>
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Dashboard</h1>
        <p className="text-gray-500">
          Os cards de saldo e recebíveis serão construídos na Etapa 9.
        </p>
      </div>

      {/* Floating button — Subir extrato */}
      <Link
        href="/upload"
        className="md:hidden fixed bottom-20 right-4 bg-primary text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:bg-primary-dark transition-colors z-40"
      >
        <span className="text-2xl">+</span>
      </Link>

      {/* Desktop — button no canto */}
      <Link
        href="/upload"
        className="hidden md:flex fixed bottom-6 right-6 bg-primary text-white px-4 py-2.5 rounded-lg shadow-lg hover:bg-primary-dark transition-colors items-center gap-2 z-40"
      >
        <span className="text-lg">📁</span>
        <span className="font-medium">Subir extrato</span>
      </Link>
    </Navigation>
  );
}
