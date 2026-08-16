import Link from "next/link"
import Image from "next/image"
import { Linkedin, Instagram } from "lucide-react"
import logo from "@/images/logo.png"

const links = {
  Producto: [
    { label: "Funcionalidades", href: "#features" },
    { label: "Precios",         href: "#pricing" },
    { label: "Cómo funciona",   href: "#how-it-works" },
  ],
}

const socials = [
  { label: "LinkedIn", href: "https://www.linkedin.com/company/137494267", icon: Linkedin },
  { label: "Instagram (@wizydoc.app)", href: "https://www.instagram.com/wizydoc.app", icon: Instagram },
]

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-3">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center">
              <Image src={logo} alt="WizyDoc" className="h-8 w-auto" />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-brand-gray max-w-xs">
              Gestión de citas médicas para sedes médicas que quieren
              operar sin fricciones.
            </p>
          </div>

          {/* Link groups */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-gray">
                {group}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-brand-gray hover:text-brand-ink transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Socials */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gray">
              Síguenos
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {socials.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-brand-gray hover:text-brand-ink transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-100 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-brand-gray">
            © {new Date().getFullYear()} WizyDoc. Todos los derechos reservados.
          </p>
          <p className="text-xs text-brand-gray">
            Hecho con cuidado para el sector salud.
          </p>
        </div>
      </div>
    </footer>
  )
}
