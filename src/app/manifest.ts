import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Quadro semanal", short_name: "Quadro", description: "Designações das reuniões, em um só lugar.", lang: "pt-BR", start_url: "/", scope: "/", display: "standalone", background_color: "#f7f8fc", theme_color: "#4338ca", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
