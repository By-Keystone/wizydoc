import Link from "next/link"
import Image from "next/image"
import logo from "@/images/logo.png"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-surface via-white to-brand-surface flex flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center">
          <Image src={logo} alt="WizyDoc" className="h-8 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </main>

      <footer className="py-6 text-center text-xs text-brand-gray">
        © {new Date().getFullYear()} WizyDoc. Todos los derechos reservados.
      </footer>
    </div>
  )
}
