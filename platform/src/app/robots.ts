import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/beta"],
      disallow: ["/account", "/clinic", "/onboarding", "/login", "/register", "/invite", "/confirm-email", "/api"],
    },
    sitemap: "https://wizydoc.app/sitemap.xml",
  }
}
