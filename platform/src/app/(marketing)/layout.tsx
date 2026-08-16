import { Navbar } from "@/components/marketing/navbar"
import { Footer } from "@/components/marketing/footer"

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "WizyDoc",
  url: "https://wizydoc.app",
  description:
    "WizyDoc ayuda a sedes médicas a gestionar citas, definir horarios y confirmar asistencias por WhatsApp.",
  sameAs: [
    "https://www.linkedin.com/company/137494267",
    "https://www.instagram.com/wizydoc.app",
  ],
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}
