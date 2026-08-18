import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { normalizeProductKey, type BuyListItem } from "@/lib/supply-request-document"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const { data, error } = await supabase
      .from("supply_requests")
      .select("id, branch_id, status, created_at, branches(id, name), supply_request_items(*)")
      .eq("status", "submitted")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const grouped = new Map<string, BuyListItem>()

    for (const request of data || []) {
      const branchRel = request.branches as { id: string; name: string } | { id: string; name: string }[] | null
      const branch = Array.isArray(branchRel) ? branchRel[0] : branchRel
      const branchName = branch?.name || "Sucursal"
      const branchId = request.branch_id as string
      const items = (request.supply_request_items || []) as {
        product_name: string
        barcode?: string | null
        photo_url?: string | null
        quantity: number
      }[]

      for (const item of items) {
        const key = normalizeProductKey(item.product_name, item.barcode)
        const current = grouped.get(key) || {
          product_name: item.product_name,
          barcode: item.barcode || null,
          photo_url: item.photo_url || null,
          total: 0,
          branches: [],
        }

        if (!current.photo_url && item.photo_url) current.photo_url = item.photo_url
        current.total += Number(item.quantity) || 0

        const existingBranch = current.branches.find((b) => b.branch_id === branchId)
        if (existingBranch) {
          existingBranch.quantity += Number(item.quantity) || 0
        } else {
          current.branches.push({
            branch_id: branchId,
            branch_name: branchName,
            quantity: Number(item.quantity) || 0,
          })
        }

        grouped.set(key, current)
      }
    }

    const items = [...grouped.values()].sort((a, b) =>
      a.product_name.localeCompare(b.product_name, "es"),
    )

    return NextResponse.json({ items, totalProducts: items.length })
  } catch (error) {
    console.error("GET supply-requests buy-list error:", error)
    return NextResponse.json({ error: "Error al armar la lista de compra" }, { status: 500 })
  }
}
