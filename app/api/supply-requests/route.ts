import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"
import { logAudit } from "@/lib/audit"
import { notifySupplyRequest } from "@/lib/alerts"

export const dynamic = "force-dynamic"

function buildRequestNumber() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const seq = String(now.getTime()).slice(-4)
  return `CAJA-${y}${m}${d}-${seq}`
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const branchId = searchParams.get("branch_id")
    const context = await resolveBranchContext(supabase, branchId && branchId !== "all" ? branchId : null)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    if (id) {
      const { data: order, error } = await supabase
        .from("supply_requests")
      .select("*, branches(id, name), suppliers(id, name), profiles:created_by(full_name), supply_request_items(*)")
      .eq("id", id)
      .maybeSingle()

      if (error || !order) {
        return NextResponse.json({ error: error?.message || "Pedido no encontrado" }, { status: 404 })
      }

      if (!context.isAdmin && order.branch_id !== context.activeBranchId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 })
      }

      return NextResponse.json({ request: order })
    }

    const branchFilter = searchParams.get("branch_id")
    let query = supabase
      .from("supply_requests")
      .select("*, branches(id, name), suppliers(id, name), profiles:created_by(full_name), supply_request_items(*)")
      .order("created_at", { ascending: false })
      .limit(80)

    if (!context.isAdmin) {
      if (!context.activeBranchId) {
        return NextResponse.json({ error: "Sin sucursal asignada" }, { status: 400 })
      }
      query = query.eq("branch_id", context.activeBranchId)
    } else if (branchFilter && branchFilter !== "all") {
      query = query.eq("branch_id", branchFilter)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ requests: data || [] })
  } catch (error) {
    console.error("GET supply-requests error:", error)
    return NextResponse.json({ error: "Error al consultar pedidos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const requestedBranchId = typeof body.branch_id === "string" ? body.branch_id : null
    const context = await resolveBranchContext(supabase, requestedBranchId)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const branchId = resolveEffectiveBranchId(context, requestedBranchId)
    if (!branchId) {
      return NextResponse.json({ error: "Elige la sucursal del pedido" }, { status: 400 })
    }

    const items = Array.isArray(body.items) ? body.items : []
    const notes = typeof body.notes === "string" ? body.notes.trim() : null
    const supplierId =
      typeof body.supplier_id === "string" && body.supplier_id.trim() ? body.supplier_id.trim() : null

    if (supplierId) {
      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .select("id")
        .eq("id", supplierId)
        .eq("is_active", true)
        .maybeSingle()
      if (supplierError || !supplier) {
        return NextResponse.json(
          {
            error: "Proveedor no válido",
            hint: "Ejecuta scripts/030_suppliers_min_stock.sql o crea el proveedor primero",
          },
          { status: 400 },
        )
      }
    }

    const parsedItems = items
      .map((item: Record<string, unknown>) => {
        const productName =
          typeof item.product_name === "string" ? item.product_name.trim() : ""
        const quantity = Number(item.quantity)
        if (!productName || !Number.isFinite(quantity) || quantity <= 0) return null
        return {
          product_id: typeof item.product_id === "string" && item.product_id ? item.product_id : null,
          product_name: productName,
          barcode: typeof item.barcode === "string" && item.barcode.trim() ? item.barcode.trim() : null,
          quantity: Math.round(quantity),
          photo_url: typeof item.photo_url === "string" && item.photo_url.trim() ? item.photo_url.trim() : null,
          notes: typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : null,
        }
      })
      .filter(Boolean) as {
      product_id: string | null
      product_name: string
      barcode: string | null
      quantity: number
      photo_url: string | null
      notes: string | null
    }[]

    if (parsedItems.length === 0) {
      return NextResponse.json({ error: "Agrega por lo menos un producto" }, { status: 400 })
    }

    const { data: order, error: orderError } = await supabase
      .from("supply_requests")
      .insert({
        request_number: buildRequestNumber(),
        branch_id: branchId,
        created_by: context.userId,
        status: "submitted",
        notes,
        ...(supplierId ? { supplier_id: supplierId } : {}),
      })
      .select("*, branches(id, name), suppliers(id, name)")
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message || "No se pudo guardar el pedido" },
        { status: 400 },
      )
    }

    const { error: itemsError } = await supabase.from("supply_request_items").insert(
      parsedItems.map((item) => ({
        request_id: order.id,
        ...item,
      })),
    )

    if (itemsError) {
      await supabase.from("supply_requests").delete().eq("id", order.id)
      return NextResponse.json({ error: itemsError.message }, { status: 400 })
    }

    await logAudit(supabase, "supply_request_created", "supply_request", order.id, branchId, {
      request_number: order.request_number,
      items: parsedItems.length,
    })

    const { data: saved } = await supabase
      .from("supply_requests")
      .select("*, branches(id, name), suppliers(id, name), profiles:created_by(full_name), supply_request_items(*)")
      .eq("id", order.id)
      .single()

    const branchRel = (saved || order).branches as { name?: string } | { name?: string }[] | null
    const branchName = Array.isArray(branchRel) ? branchRel[0]?.name : branchRel?.name

    void notifySupplyRequest(supabase, {
      requestNumber: order.request_number,
      branchName: branchName || "Sucursal",
      itemCount: parsedItems.length,
      branchId,
    })

    return NextResponse.json({ request: saved || order })
  } catch (error) {
    console.error("POST supply-requests error:", error)
    return NextResponse.json({ error: "Error al guardar el pedido" }, { status: 500 })
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
      return NextResponse.json({ error: "Solo administradores pueden marcar pedidos" }, { status: 403 })
    }

    const body = await request.json()
    const id = typeof body.id === "string" ? body.id : ""
    const status = body.status === "purchased" || body.status === "cancelled" || body.status === "submitted"
      ? body.status
      : null

    if (!id || !status) {
      return NextResponse.json({ error: "Falta el pedido o el estado" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("supply_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, branches(id, name), supply_request_items(*)")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ request: data })
  } catch (error) {
    console.error("PATCH supply-requests error:", error)
    return NextResponse.json({ error: "Error al actualizar el pedido" }, { status: 500 })
  }
}
