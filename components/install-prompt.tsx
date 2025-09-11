"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, X } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt(): Promise<void>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    const isInWebAppiOS = (window.navigator as any).standalone === true
    setIsInstalled(isStandalone || isInWebAppiOS)

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowInstallPrompt(true)
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === "accepted") {
      setShowInstallPrompt(false)
    }

    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    // Hide for 24 hours
    localStorage.setItem("installPromptDismissed", Date.now().toString())
  }

  // Don't show if already installed or recently dismissed
  if (isInstalled || !showInstallPrompt) return null

  const dismissedTime = localStorage.getItem("installPromptDismissed")
  if (dismissedTime && Date.now() - Number.parseInt(dismissedTime) < 24 * 60 * 60 * 1000) {
    return null
  }

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 shadow-lg md:left-auto md:right-4 md:w-96">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Instalar Farmacia Solidaria</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>Instala la app en tu dispositivo para acceso rápido y funcionalidad offline</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-2">
          <Button onClick={handleInstallClick} className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Instalar App
          </Button>
          <Button variant="outline" onClick={handleDismiss}>
            Ahora no
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
