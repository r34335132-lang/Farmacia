import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

function buildOrderNumber() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const seq = String(now.getTime()).slice(-4)
  return `REP-${y}${m}${d}-${seq}`
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (id) {
      const { data: order, error } = await supabase
        .from("replenishment_orders")
        .select("*, profiles:created_by(full_name), replenishment_order_items(*)")
        .eq("id", id)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      return NextResponse.json({ order })
    }

    const { data, error } = await supabase
      .from("replenishment_orders")
      .select("*, profiles:created_by(full_name)")
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ orders: data || [] })
  } catch (error) {
    console.error("GET replenishment error:", error)
    return NextResponse.json({ error: "Error al consultar pedidos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden generar pedidos" }, { status: 403 })
    }

    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []
    const notes = typeof body.notes === "string" ? body.notes.trim() : null
    const periodDays = Number(body.period_days) || 14

    if (items.length === 0) {
      return NextResponse.json({ error: "El pedido debe incluir al menos un producto" }, { status: 400 })
    }

    const { data: order, error: orderError } = await supabase
      .from("replenishment_orders")
      .insert({
        order_number: buildOrderNumber(),
        status: "generated",
        notes,
        period_days: periodDays,
        created_by: context.userId,
      })
      .select()
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || "No se pudo crear el pedido" }, { status: 400 })
    }

    const rows = items.map((item: {
      sku_group_id?: string
      barcode?: string
      product_name: string
      branch_quantities: unknown[]
      total_suggested?: number
      total_confirmed?: number
    }) => ({
      order_id: order.id,
      sku_group_id: item.sku_group_id || null,
      barcode: item.barcode || null,
      product_name: item.product_name,
      branch_quantities: item.branch_quantities || [],
      total_suggested: Number(item.total_suggested) || 0,
      total_confirmed: Number(item.total_confirmed ?? item.total_suggested) || 0,
    }))

    const { error: itemsError } = await supabase.from("replenishment_order_items").insert(rows)
    if (itemsError) {
      await supabase.from("replenishment_orders").delete().eq("id", order.id)
      return NextResponse.json({ error: itemsError.message }, { status: 400 })
    }

    await logAudit(supabase, "replenishment_created", "replenishment_order", order.id, null, {
      order_number: order.order_number,
      items: rows.length,
      period_days: periodDays,
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error("POST replenishment error:", error)
    return NextResponse.json({ error: "Error al generar pedido" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
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
    const { id, status, notes } = body
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }

    const allowed = ["draft", "generated", "sent", "received", "cancelled"]
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status) {
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
      }
      updates.status = status
    }
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await supabase
      .from("replenishment_orders")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await logAudit(supabase, "replenishment_updated", "replenishment_order", id, null, updates)
    return NextResponse.json({ success: true, order: data })
  } catch (error) {
    console.error("PATCH replenishment error:", error)
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 })
  }
}
