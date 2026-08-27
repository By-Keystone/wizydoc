import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "WizyDoc — Panel",
  description: "Panel de gestión de citas médicas de WizyDoc.",
  robots: {
    index: false,
    follow: false,
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
