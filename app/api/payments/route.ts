import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { applyBranchFilter, resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get("branch_id")

    const context = await resolveBranchContext(supabase, requestedBranchId)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    let allPayments: Record<string, unknown>[] = []
    let start = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from("sales")
        .select(`
          id,
          total_amount,
          payment_method,
          cash_received,
          change_given,
          created_at,
          branch_id,
          branches(id, name),
          profiles(full_name, email),
          sale_items(
            quantity,
            unit_price,
            subtotal,
            products(name, barcode)
          )
        `)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .range(start, start + pageSize - 1)

      query = applyBranchFilter(query, {
        ...context,
        activeBranchId: resolveEffectiveBranchId(context, requestedBranchId),
      })

      const { data, error } = await query

      if (error) {
        console.error("Error fetching payments:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        allPayments = [...allPayments, ...data]
        start += pageSize
        if (data.length < pageSize) hasMore = false
      } else {
        hasMore = false
      }
    }

    const stats = {
      total: allPayments.reduce((sum, payment) => sum + Number(payment.total_amount), 0),
      totalCash: allPayments
        .filter((p) => p.payment_method === "efectivo")
        .reduce((sum, payment) => sum + Number(payment.total_amount), 0),
      totalCard: allPayments
        .filter((p) => p.payment_method === "tarjeta")
        .reduce((sum, payment) => sum + Number(payment.total_amount), 0),
      countCash: allPayments.filter((p) => p.payment_method === "efectivo").length,
      countCard: allPayments.filter((p) => p.payment_method === "tarjeta").length,
    }

    return NextResponse.json({
      ...stats,
      branchId: resolveEffectiveBranchId(context, requestedBranchId),
      isAdmin: context.isAdmin,
    })
  } catch (error) {
    console.error("Error in payments API:", error)
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 })
  }
}
