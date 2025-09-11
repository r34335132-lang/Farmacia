"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bell, BellOff } from "lucide-react"

interface NotificationManagerProps {
  userRole?: string
}

export function NotificationManager({ userRole }: NotificationManagerProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [isSupported, setIsSupported] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Check if notifications are supported
    setIsSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window)

    if ("Notification" in window) {
      setPermission(Notification.permission)
    }

    // Only check stock for admins
    if (userRole === "admin") {
      checkLowStock()

      // Set up periodic check every 5 minutes
      const interval = setInterval(checkLowStock, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userRole])

  const requestPermission = async () => {
    if (!isSupported) return

    try {
      const permission = await Notification.requestPermission()
      setPermission(permission)

      if (permission === "granted") {
        // Show welcome notification
        new Notification("Farmacia Solidaria", {
          body: "Notificaciones activadas correctamente",
          icon: "/icon-192.jpg",
          tag: "welcome",
        })
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error)
    }
  }

  const checkLowStock = async () => {
    if (permission !== "granted") return

    try {
      const { data: products } = await supabase
        .from("products")
        .select("name, stock_quantity, min_stock_level")
        .eq("is_active", true)

      const lowStockProducts = products?.filter((product) => product.stock_quantity <= product.min_stock_level) || []

      if (lowStockProducts.length > 0) {
        const productNames = lowStockProducts
          .slice(0, 3)
          .map((p) => p.name)
          .join(", ")
        const message =
          lowStockProducts.length === 1
            ? `Stock bajo: ${productNames}`
            : `${lowStockProducts.length} productos con stock bajo: ${productNames}${lowStockProducts.length > 3 ? "..." : ""}`

        new Notification("⚠️ Alerta de Stock", {
          body: message,
          icon: "/icon-192.jpg",
          tag: "low-stock",
          requireInteraction: true,
          actions: [
            {
              action: "view",
              title: "Ver productos",
            },
          ],
        })
      }
    } catch (error) {
      console.error("Error checking stock:", error)
    }
  }

  const testNotification = () => {
    if (permission === "granted") {
      new Notification("Prueba de Notificación", {
        body: "Las notificaciones están funcionando correctamente",
        icon: "/icon-192.jpg",
        tag: "test",
      })
    }
  }

  if (!isSupported) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificaciones
        </CardTitle>
        <CardDescription>Recibe alertas de stock bajo y actualizaciones importantes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            Estado:{" "}
            {permission === "granted" ? "Activadas" : permission === "denied" ? "Bloqueadas" : "No configuradas"}
          </span>
          {permission === "granted" ? (
            <BellOff className="h-4 w-4 text-green-600" />
          ) : (
            <Bell className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {permission === "default" && (
          <Button onClick={requestPermission} className="w-full">
            Activar Notificaciones
          </Button>
        )}

        {permission === "granted" && (
          <Button onClick={testNotification} variant="outline" className="w-full bg-transparent">
            Probar Notificación
          </Button>
        )}

        {permission === "denied" && (
          <div className="text-sm text-muted-foreground">
            Las notificaciones están bloqueadas. Puedes habilitarlas en la configuración del navegador.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
