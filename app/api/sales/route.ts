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

    let query = supabase
      .from("sales")
      .select(`
        *,
        profiles(full_name),
        branches(id, name),
        sale_items(
          quantity,
          unit_price,
          subtotal,
          products(name, barcode, section, branch_id)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(2000)

    query = applyBranchFilter(query, {
      ...context,
      activeBranchId: resolveEffectiveBranchId(context, requestedBranchId),
    })

    const { data, error } = await query

    if (error) {
      console.error("Error fetching sales:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      sales: data || [],
      total: data?.length || 0,
      branchId: resolveEffectiveBranchId(context, requestedBranchId),
      isAdmin: context.isAdmin,
    })
  } catch (error) {
    console.error("Error in sales API:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
