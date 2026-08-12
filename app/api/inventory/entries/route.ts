import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

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
    const branchId = searchParams.get("branch_id")
    const productId = searchParams.get("product_id")
    const page = Math.max(0, Number(searchParams.get("page") || 0))
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("page_size") || 25)))
    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("inventory_entries")
      .select("*, products(id, name, barcode), branches(id, name), profiles:created_by(full_name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (branchId && branchId !== "all") query = query.eq("branch_id", branchId)
    if (productId) query = query.eq("product_id", productId)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries: data || [], total: count || 0, page, pageSize })
  } catch (error) {
    console.error("GET inventory entries error:", error)
    return NextResponse.json({ error: "Error al consultar entradas" }, { status: 500 })
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
      return NextResponse.json({ error: "Solo administradores pueden registrar entradas" }, { status: 403 })
    }

    const body = await request.json()
    const {
      product_id,
      quantity,
      unit_cost,
      unit_price,
      expiration_date,
      lot_code,
      supplier,
      notes,
      apply_markup,
    } = body

    if (!product_id) {
      return NextResponse.json({ error: "Producto requerido" }, { status: 400 })
    }

    const qty = Number(quantity)
    const cost = Number(unit_cost)
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 })
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "Costo inválido" }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("register_inventory_entry", {
      p_product_id: product_id,
      p_quantity: qty,
      p_unit_cost: cost,
      p_unit_price: unit_price != null && unit_price !== "" ? Number(unit_price) : null,
      p_expiration_date: expiration_date || null,
      p_lot_code: lot_code?.trim() || null,
      p_supplier: supplier?.trim() || null,
      p_notes: notes?.trim() || null,
      p_apply_markup: Boolean(apply_markup),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error("POST inventory entry error:", error)
    return NextResponse.json({ error: "Error al registrar entrada" }, { status: 500 })
  }
}
