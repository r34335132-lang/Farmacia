"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, BellOff, Smartphone } from "lucide-react"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

interface NotificationManagerProps {
  userRole?: string
}

export function NotificationManager({ userRole }: NotificationManagerProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [isSupported, setIsSupported] = useState(false)
  const [pushReady, setPushReady] = useState(false)
  const [pushConfigured, setPushConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isSafari, setIsSafari] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const safari = /^((?!chrome|android).)*safari/i.test(ua)
    setIsSafari(safari)
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-expect-error iOS Safari
        Boolean(navigator.standalone),
    )

    const supported =
      "Notification" in window && "serviceWorker" in navigator && ("PushManager" in window || safari)
    setIsSupported(supported)

    if ("Notification" in window) {
      setPermission(Notification.permission)
    }

    if (userRole === "admin" && Notification.permission === "granted") {
      void ensurePushSubscription()
    }
  }, [userRole])

  const ensurePushSubscription = async () => {
    try {
      const meta = await fetch("/api/push/subscribe")
      const metaJson = await meta.json().catch(() => ({}))
      setPushConfigured(Boolean(metaJson.configured && metaJson.publicKey))

      if (!metaJson.configured || !metaJson.publicKey) {
        setMessage("Faltan claves VAPID en el servidor. Las alertas locales sí funcionan con la app abierta.")
        return
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMessage(
          isSafari && !isStandalone
            ? "En iPhone/iPad: Agregar a pantalla de inicio para recibir push."
            : "Este navegador no soporta push en segundo plano.",
        )
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(metaJson.publicKey),
        })
      }

      const payload = subscription.toJSON()
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.hint ? `${json.error}. ${json.hint}` : json.error || "No se pudo registrar push")
        return
      }

      setPushReady(true)
      setMessage(null)
    } catch (err) {
      console.error(err)
      setMessage(err instanceof Error ? err.message : "No se pudo activar push")
    }
  }

  const requestPermission = async () => {
    if (!isSupported) return
    setBusy(true)
    setMessage(null)
    try {
      const next = await Notification.requestPermission()
      setPermission(next)
      if (next === "granted") {
        new Notification("Farmacia Bienestar", {
          body: "Notificaciones activadas. Te avisaremos de pedidos, movimiento y el resumen de las 10 pm.",
          icon: "/icon-192.jpg",
          tag: "welcome",
        })
        if (userRole === "admin") await ensurePushSubscription()
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error)
      setMessage("No se pudo pedir permiso de notificaciones")
    } finally {
      setBusy(false)
    }
  }

  const testNotification = async () => {
    if (permission !== "granted") return
    new Notification("Prueba de alerta", {
      body: "Si ves esto, las notificaciones locales funcionan.",
      icon: "/icon-192.jpg",
      tag: "test",
    })
    if (userRole === "admin") await ensurePushSubscription()
  }

  if (!isSupported && userRole !== "admin") return null

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Alertas push
        </CardTitle>
        <CardDescription className="text-xs">
          Pedidos de stock, mucho movimiento en caja y resumen a las 10 pm
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between text-sm">
          <span>
            Estado:{" "}
            {permission === "granted"
              ? pushReady
                ? "Push activo"
                : "Permiso OK"
              : permission === "denied"
                ? "Bloqueadas"
                : "No configuradas"}
          </span>
          {permission === "granted" ? (
            <Bell className="h-4 w-4 text-emerald-600" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {isSafari && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <Smartphone className="mr-1 inline h-3 w-3" />
            Safari: en iPhone/iPad usa <strong>Compartir → Agregar a pantalla de inicio</strong> (iOS 16.4+). En Mac
            Safari sí permite notificaciones del sitio.
          </p>
        )}

        {permission === "default" && (
          <Button onClick={requestPermission} disabled={busy} className="w-full">
            {busy ? "Activando..." : "Activar alertas"}
          </Button>
        )}

        {permission === "granted" && (
          <Button onClick={testNotification} variant="outline" className="w-full bg-transparent" disabled={busy}>
            Probar notificación
          </Button>
        )}

        {permission === "denied" && (
          <p className="text-xs text-muted-foreground">
            Están bloqueadas. Actívalas en la configuración del navegador o de la app.
          </p>
        )}

        {message && <p className="text-xs text-amber-800">{message}</p>}

        {!pushConfigured && permission === "granted" && (
          <p className="text-xs text-muted-foreground">
            Configura VAPID en Vercel para push con la app cerrada. Sin eso, las alertas llegan si tienes el panel
            abierto.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
