import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Farmacia Solidaria",
  description: "Sistema de gestión integral para Farmacia Solidaria",
  generator: "v0.app",
  manifest: "/manifest.json",
  keywords: ["farmacia", "pos", "inventario", "ventas", "solidaria"],
  authors: [{ name: "Farmacia Solidaria" }],
  creator: "Farmacia Solidaria",
  publisher: "Farmacia Solidaria",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://farmacia-solidaria.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Farmacia Solidaria",
    description: "Sistema de gestión integral para Farmacia Solidaria",
    url: "https://farmacia-solidaria.vercel.app",
    siteName: "Farmacia Solidaria",
    locale: "es_ES",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  icons: {
    icon: [
      { url: "/icon-192.jpg", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.jpg", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.jpg", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Farmacia Solidaria",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="application-name" content="Farmacia Solidaria" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Farmacia Solidaria" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#8b5cf6" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#8b5cf6" />
        <link rel="apple-touch-icon" href="/icon-192.jpg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
