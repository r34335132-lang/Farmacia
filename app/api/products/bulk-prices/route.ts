import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { logAudit } from "@/lib/audit"
import { roundMoney } from "@/lib/money"

export const dynamic = "force-dynamic"

type PriceUpdate = { id: string; price: number }
type ProductCreate = { name: string; price: number }

const CHUNK = 10

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const body = await request.json()
    const branchId = String(body.branch_id || "").trim()
    const updates = (Array.isArray(body.updates) ? body.updates : []) as PriceUpdate[]
    const creates = (Array.isArray(body.creates) ? body.creates : []) as ProductCreate[]

    if (!branchId) {
      return NextResponse.json({ error: "Falta la sucursal" }, { status: 400 })
    }
    if (updates.length === 0 && creates.length === 0) {
      return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 })
    }

    for (const u of updates) {
      if (!u?.id || !Number.isFinite(Number(u.price)) || Number(u.price) <= 0) {
        return NextResponse.json({ error: "Hay un precio inválido en la lista" }, { status: 400 })
      }
    }
    for (const c of creates) {
      if (!String(c?.name || "").trim() || !Number.isFinite(Number(c.price)) || Number(c.price) <= 0) {
        return NextResponse.json({ error: "Hay un producto nuevo sin nombre o con precio inválido" }, { status: 400 })
      }
    }

    const ids = Array.from(new Set(updates.map((u) => u.id)))
    const current = new Map<string, { price: number; branch_id: string; name: string }>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("products")
        .select("id, price, branch_id, name")
        .in("id", ids.slice(i, i + 200))
      if (error) throw error
      for (const row of data || []) current.set(row.id, row)
    }

    const failed: { name: string; error: string }[] = []
    let updated = 0
    let unchanged = 0

    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(
        updates.slice(i, i + CHUNK).map(async (u) => {
          const old = current.get(u.id)
          if (!old || old.branch_id !== branchId) {
            failed.push({ name: old?.name || u.id, error: "No pertenece a la sucursal" })
            return
          }
          const newPrice = roundMoney(Number(u.price))
          if (Number(old.price) === newPrice) {
            unchanged++
            return
          }
          const { error } = await supabase
            .from("products")
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq("id", u.id)
          if (error) {
            failed.push({ name: old.name, error: error.message })
            return
          }
          updated++
          await logAudit(supabase, "price_updated", "product", u.id, branchId, {
            old_price: old.price,
            new_price: newPrice,
            source: "lista_de_precios",
          })
        }),
      )
    }

    let created = 0
    if (creates.length > 0) {
      const rows = creates.map((c) => ({
        name: String(c.name).trim(),
        price: roundMoney(Number(c.price)),
        cost_price: 0,
        stock_quantity: 0,
        min_stock_level: 5,
        branch_id: branchId,
        is_active: true,
      }))
      const { data, error } = await supabase.from("products").insert(rows).select("id, name")
      if (error) {
        failed.push({ name: `${rows.length} productos nuevos`, error: error.message })
      } else {
        created = data?.length || 0
        for (const row of data || []) {
          await logAudit(supabase, "product_created", "product", row.id, branchId, {
            name: row.name,
            source: "lista_de_precios",
          })
        }
      }
    }

    return NextResponse.json({ success: failed.length === 0, updated, unchanged, created, failed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al aplicar precios"
    console.error("bulk-prices error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
