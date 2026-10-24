import Image from "next/image";
import logo from "@/images/logo.png";

export function PublicPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-surface via-white to-brand-surface">
      <main className="flex flex-1 items-start justify-center px-4 pb-8 pt-4 sm:items-center sm:py-12">
        {children}
      </main>

      <footer className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-brand-gray">
        <Image src={logo} alt="WizyDoc" className="h-5 w-auto" />
        <p>
          © {new Date().getFullYear()} WizyDoc. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
