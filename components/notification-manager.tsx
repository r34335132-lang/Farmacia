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
      checkExpiringProducts()

      // Set up periodic check every 5 minutes
      const interval = setInterval(
        () => {
          checkLowStock()
          checkExpiringProducts()
        },
        5 * 60 * 1000,
      )
      return () => clearInterval(interval)
    }
  }, [userRole])

  const requestPermission = async () => {
    if (!isSupported) return

    try {
      const permission = await Notification.requestPermission()
      setPermission(permission)

      if (permission === "granted") {
        new Notification("Farmacia Bienestar", {
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
        })
      }
    } catch (error) {
      console.error("Error checking stock:", error)
    }
  }

  const checkExpiringProducts = async () => {
    if (permission !== "granted") return

    try {
      const { data: products } = await supabase
        .from("products")
        .select("name, expiration_date, days_before_expiry_alert, stock_quantity")
        .eq("is_active", true)
        .not("expiration_date", "is", null)

      const today = new Date()

      // Check for expiring products
      const expiringProducts =
        products?.filter((product) => {
          const expirationDate = new Date(product.expiration_date)
          const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          const alertThreshold = product.days_before_expiry_alert || 30
          return daysUntilExpiry > 0 && daysUntilExpiry <= alertThreshold
        }) || []

      // Check for expired products
      const expiredProducts =
        products?.filter((product) => {
          const expirationDate = new Date(product.expiration_date)
          return expirationDate < today
        }) || []

      // Notify about expiring products
      if (expiringProducts.length > 0) {
        const productNames = expiringProducts
          .slice(0, 3)
          .map((p) => p.name)
          .join(", ")
        const message =
          expiringProducts.length === 1
            ? `Producto por vencer: ${productNames}`
            : `${expiringProducts.length} productos por vencer: ${productNames}${expiringProducts.length > 3 ? "..." : ""}`

        new Notification("📅 Alerta de Caducidad", {
          body: message,
          icon: "/icon-192.jpg",
          tag: "expiring-products",
          requireInteraction: true,
        })
      }

      // Notify about expired products
      if (expiredProducts.length > 0) {
        const productNames = expiredProducts
          .slice(0, 3)
          .map((p) => p.name)
          .join(", ")
        const message =
          expiredProducts.length === 1
            ? `Producto vencido: ${productNames}`
            : `${expiredProducts.length} productos vencidos: ${productNames}${expiredProducts.length > 3 ? "..." : ""}`

        new Notification("🚨 Productos Vencidos", {
          body: message,
          icon: "/icon-192.jpg",
          tag: "expired-products",
          requireInteraction: true,
        })
      }
    } catch (error) {
      console.error("Error checking expiration:", error)
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
        <CardDescription>Recibe alertas de stock bajo y productos por vencer</CardDescription>
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
