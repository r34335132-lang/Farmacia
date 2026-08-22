"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

/** Escucha pedidos nuevos y muestra notificación local si el admin tiene el panel abierto. */
export function AdminAlertListener({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    if (!("Notification" in window) || Notification.permission !== "granted") return

    const supabase = createClient()
    const channel = supabase
      .channel("admin-supply-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "supply_requests" },
        async (payload) => {
          const row = payload.new as {
            request_number?: string
            branch_id?: string
          }
          let branchName = "Sucursal"
          if (row.branch_id) {
            const { data } = await supabase.from("branches").select("name").eq("id", row.branch_id).maybeSingle()
            if (data?.name) branchName = data.name
          }
          new Notification("Pedido de stock faltante", {
            body: `${branchName}: ${row.request_number || "nuevo pedido"}`,
            icon: "/icon-192.jpg",
            tag: `supply-${row.request_number || Date.now()}`,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled])

  return null
}
