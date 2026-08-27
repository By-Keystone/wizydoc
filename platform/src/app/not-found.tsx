import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold text-brand-teal-dark">404</h1>
      <p className="mt-2 text-brand-gray">Página no encontrada</p>
      <Link href="/login" className="mt-4 text-brand-teal hover:text-brand-teal-dark">
        Volver al inicio
      </Link>
    </div>
  );
}
