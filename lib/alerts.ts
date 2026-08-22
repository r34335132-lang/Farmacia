import type { SupabaseClient } from "@supabase/supabase-js"
import { formatMoney } from "@/lib/money"
import { sendPushWithCooldown } from "@/lib/push"

const SPIKE_WINDOW_MINUTES = 15
const SPIKE_SALES_THRESHOLD = 10
const SPIKE_UNITS_THRESHOLD = 40
const SPIKE_COOLDOWN_MINUTES = 30

export async function notifySupplyRequest(
  supabase: SupabaseClient,
  info: {
    requestNumber: string
    branchName: string
    itemCount: number
    branchId: string
  },
) {
  try {
    await sendPushWithCooldown(supabase, `supply-${info.branchId}-${info.requestNumber}`, 1, {
      title: "Pedido de stock faltante",
      body: `${info.branchName}: pedido ${info.requestNumber} · ${info.itemCount} producto${info.itemCount === 1 ? "" : "s"}`,
      url: "/admin/pedidos-globales",
      tag: `supply-${info.requestNumber}`,
    })
  } catch (err) {
    console.error("notifySupplyRequest:", err)
  }
}

export async function notifySalesSpikeIfNeeded(
  supabase: SupabaseClient,
  branchId: string,
  branchName?: string | null,
) {
  try {
    const since = new Date(Date.now() - SPIKE_WINDOW_MINUTES * 60 * 1000).toISOString()

    const { data: sales } = await supabase
      .from("sales")
      .select("id, total_amount")
      .eq("branch_id", branchId)
      .eq("status", "completed")
      .gte("created_at", since)

    const saleIds = (sales || []).map((s) => s.id)
    const saleCount = saleIds.length
    const salesTotal = (sales || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)

    let units = 0
    if (saleIds.length > 0) {
      const { data: items } = await supabase
        .from("sale_items")
        .select("quantity")
        .in("sale_id", saleIds)
      units = (items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
    }

    const manySales = saleCount >= SPIKE_SALES_THRESHOLD
    const manyUnits = units >= SPIKE_UNITS_THRESHOLD
    if (!manySales && !manyUnits) return

    const label = branchName || "Sucursal"
    const reason = manySales
      ? `${saleCount} ventas en ${SPIKE_WINDOW_MINUTES} min`
      : `${units} piezas movidas en ${SPIKE_WINDOW_MINUTES} min`

    await sendPushWithCooldown(supabase, `sales-spike-${branchId}`, SPIKE_COOLDOWN_MINUTES, {
      title: "Mucho movimiento en caja",
      body: `${label}: ${reason} · ${formatMoney(salesTotal)}`,
      url: "/admin/sales",
      tag: `sales-spike-${branchId}`,
    })
  } catch (err) {
    console.error("notifySalesSpikeIfNeeded:", err)
  }
}
