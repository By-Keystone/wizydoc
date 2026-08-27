import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/beta"],
    },
    sitemap: "https://wizydoc.app/sitemap.xml",
  }
}
