import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

interface SaleItemPayload {
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      items,
      payment_method,
      cash_received,
      change_given,
      subtotal_before_discount,
      discount_type,
      discount_value,
      discount_reason,
      total_amount,
      branch_id: requestedBranchId,
    } = body

    const context = await resolveBranchContext(supabase, requestedBranchId)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const effectiveBranchId = context.isAdmin ? requestedBranchId : context.activeBranchId

    if (!effectiveBranchId) {
      return NextResponse.json({ error: "Sucursal requerida para procesar la venta" }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "La venta debe incluir productos" }, { status: 400 })
    }

    const saleItems: SaleItemPayload[] = items.map((item: SaleItemPayload) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }))

    const { data, error } = await supabase.rpc("process_sale", {
      p_items: saleItems,
      p_payment_method: payment_method,
      p_cash_received: cash_received ?? null,
      p_change_given: change_given ?? null,
      p_subtotal_before_discount: subtotal_before_discount ?? total_amount,
      p_discount_type: discount_type ?? "none",
      p_discount_value: discount_value ?? 0,
      p_discount_reason: discount_reason ?? null,
      p_total_amount: total_amount,
      p_requested_branch_id: effectiveBranchId,
    })

    if (error) {
      console.error("process_sale error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error("Error in process-sale API:", error)
    return NextResponse.json({ error: "Error al procesar la venta" }, { status: 500 })
  }
}
