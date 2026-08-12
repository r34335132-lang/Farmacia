import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"
import { logAudit } from "@/lib/audit"
import { SHORTAGE_REASONS, SHORTAGE_STATUSES } from "@/lib/permissions"
import { roundMoney } from "@/lib/money"

export const dynamic = "force-dynamic"

const VALID_REASONS = SHORTAGE_REASONS.map((r) => r.value)
const VALID_STATUSES = SHORTAGE_STATUSES.map((s) => s.value)
const NEXT_STATUS: Record<string, string[]> = {
  pending: ["review", "rejected"],
  review: ["approved", "rejected"],
  approved: ["charged", "rejected"],
  rejected: [],
  charged: [],
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get("branch_id")
    const status = searchParams.get("status")
    const page = Math.max(0, Number(searchParams.get("page") || 0))
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("page_size") || 25)))
    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("shortages")
      .select(
        "*, products(id, name, barcode, cost_price), branches(id, name), reporter:reported_by(full_name), reviewer:reviewed_by(full_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to)

    const effectiveBranch = resolveEffectiveBranchId(context, requestedBranchId)
    if (!context.isAdmin) {
      if (!context.activeBranchId) {
        return NextResponse.json({ error: "Sin sucursal asignada" }, { status: 403 })
      }
      query = query.eq("branch_id", context.activeBranchId)
    } else if (effectiveBranch) {
      query = query.eq("branch_id", effectiveBranch)
    }

    if (status && status !== "all") query = query.eq("status", status)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      shortages: data || [],
      total: count || 0,
      page,
      pageSize,
      isAdmin: context.isAdmin,
    })
  } catch (error) {
    console.error("GET shortages error:", error)
    return NextResponse.json({ error: "Error al consultar faltantes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const body = await request.json()
    const { product_id, quantity, reason, comment, branch_id: requestedBranchId } = body

    if (!product_id) {
      return NextResponse.json({ error: "Producto requerido" }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 })
    }
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Motivo inválido" }, { status: 400 })
    }

    const branchId = context.isAdmin
      ? requestedBranchId || context.activeBranchId
      : context.activeBranchId

    if (!branchId) {
      return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 })
    }

    if (!context.isAdmin && branchId !== context.activeBranchId) {
      return NextResponse.json({ error: "No puedes reportar faltantes de otra sucursal" }, { status: 403 })
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, branch_id, cost_price, is_active")
      .eq("id", product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    if (product.branch_id !== branchId) {
      return NextResponse.json({ error: "El producto no pertenece a la sucursal" }, { status: 400 })
    }

    const unitCost = Number(product.cost_price) || 0
    const totalAmount = roundMoney(unitCost * qty)

    const { data, error } = await supabase
      .from("shortages")
      .insert({
        product_id,
        branch_id: branchId,
        quantity: qty,
        unit_cost: unitCost,
        total_amount: totalAmount,
        reason,
        comment: comment?.trim() || null,
        status: "pending",
        reported_by: context.userId,
      })
      .select(
        "*, products(id, name, barcode, cost_price), branches(id, name), reporter:reported_by(full_name)",
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await logAudit(supabase, "shortage_reported", "shortage", data.id, branchId, {
      product_id,
      quantity: qty,
      unit_cost: unitCost,
      total_amount: totalAmount,
      reason,
    })

    return NextResponse.json({ success: true, shortage: data })
  } catch (error) {
    console.error("POST shortages error:", error)
    return NextResponse.json({ error: "Error al reportar faltante" }, { status: 500 })
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
      return NextResponse.json({ error: "Solo administradores pueden revisar faltantes" }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, review_comment } = body

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from("shortages")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Faltante no encontrado" }, { status: 404 })
    }

    if (existing.reported_by === context.userId && ["approved", "rejected", "charged"].includes(status)) {
      return NextResponse.json(
        { error: "No puedes aprobar, rechazar o cobrar un faltante que tú reportaste" },
        { status: 403 },
      )
    }

    const allowedNext = NEXT_STATUS[existing.status] || []
    if (!allowedNext.includes(status)) {
      return NextResponse.json(
        { error: `No se puede pasar de ${existing.status} a ${status}` },
        { status: 400 },
      )
    }

    const updates: Record<string, unknown> = {
      status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      review_comment: review_comment?.trim() || existing.review_comment,
      updated_at: new Date().toISOString(),
    }
    if (status === "charged") {
      updates.charged_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("shortages")
      .update(updates)
      .eq("id", id)
      .select(
        "*, products(id, name, barcode), branches(id, name), reporter:reported_by(full_name), reviewer:reviewed_by(full_name)",
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await logAudit(supabase, `shortage_${status}`, "shortage", id, existing.branch_id, {
      from: existing.status,
      to: status,
      review_comment: updates.review_comment,
    })

    return NextResponse.json({ success: true, shortage: data })
  } catch (error) {
    console.error("PATCH shortages error:", error)
    return NextResponse.json({ error: "Error al actualizar faltante" }, { status: 500 })
  }
}
