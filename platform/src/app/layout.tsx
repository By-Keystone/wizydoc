import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

const siteUrl = "https://wizydoc.app"
const title = "WizyDoc — Gestión de citas médicas"
const description =
  "WizyDoc ayuda a sedes médicas a gestionar citas, definir horarios y confirmar asistencias por WhatsApp. Sin complicaciones."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | WizyDoc",
  },
  description,
  keywords: ["citas médicas", "sede médica", "agenda médica", "WhatsApp", "gestión de citas"],
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: siteUrl,
    siteName: "WizyDoc",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
