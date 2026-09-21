import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { getPeriodRange, type PeriodPreset } from "@/lib/periods"

export const dynamic = "force-dynamic"

type Agg = {
  product_id: string
  product_name: string
  barcode: string | null
  section: string | null
  branch_id: string
  branch_name: string
  qty_sold: number
  revenue: number
}

function mexicoRangeBounds(startDate: string, endDate: string) {
  // America/Mexico_City es UTC-6 todo el año
  return {
    from: `${startDate}T00:00:00-06:00`,
    to: `${endDate}T23:59:59.999-06:00`,
  }
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
    const branchId = searchParams.get("branch_id")
    const preset = (searchParams.get("period") || "month") as PeriodPreset
    const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit") || 50)))
    const range = getPeriodRange(
      preset,
      searchParams.get("start_date") || undefined,
      searchParams.get("end_date") || undefined,
    )
    const { from, to } = mexicoRangeBounds(range.start, range.end)

    let salesQuery = supabase
      .from("sales")
      .select("id, branch_id, created_at, status, branches(id, name)")
      .eq("status", "completed")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(5000)

    if (branchId && branchId !== "all") {
      salesQuery = salesQuery.eq("branch_id", branchId)
    }

    const { data: sales, error: salesError } = await salesQuery
    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 })
    }

    const saleIds = (sales || []).map((s) => s.id)
    if (saleIds.length === 0) {
      return NextResponse.json({
        products: [],
        period: preset,
        start_date: range.start,
        end_date: range.end,
        total_qty: 0,
        total_revenue: 0,
      })
    }

    const saleById = new Map((sales || []).map((s) => [s.id, s]))
    const branchNameById = new Map<string, string>()
    for (const sale of sales || []) {
      const rel = sale.branches as { id?: string; name?: string } | { id?: string; name?: string }[] | null
      const branch = Array.isArray(rel) ? rel[0] : rel
      if (sale.branch_id) {
        branchNameById.set(sale.branch_id, branch?.name || "Sin sucursal")
      }
    }

    const agg = new Map<string, Agg>()
    const chunkSize = 200
    for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize)
      const { data: items, error: itemsError } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, quantity, subtotal, unit_price, products(id, name, barcode, section)")
        .in("sale_id", chunk)

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }

      for (const item of items || []) {
        const sale = saleById.get(item.sale_id)
        if (!sale?.branch_id) continue
        const productRel = item.products as
          | { id?: string; name?: string; barcode?: string | null; section?: string | null }
          | { id?: string; name?: string; barcode?: string | null; section?: string | null }[]
          | null
        const product = Array.isArray(productRel) ? productRel[0] : productRel
        const productId = String(item.product_id || product?.id || "")
        if (!productId) continue

        const key = `${sale.branch_id}:${productId}`
        const qty = Number(item.quantity) || 0
        const revenue =
          item.subtotal != null
            ? Number(item.subtotal) || 0
            : qty * (Number(item.unit_price) || 0)

        const current = agg.get(key)
        if (current) {
          current.qty_sold += qty
          current.revenue += revenue
        } else {
          agg.set(key, {
            product_id: productId,
            product_name: product?.name || "Producto",
            barcode: product?.barcode || null,
            section: product?.section || null,
            branch_id: sale.branch_id,
            branch_name: branchNameById.get(sale.branch_id) || "Sin sucursal",
            qty_sold: qty,
            revenue,
          })
        }
      }
    }

    const products = Array.from(agg.values())
      .sort((a, b) => b.qty_sold - a.qty_sold || b.revenue - a.revenue)
      .slice(0, limit)
      .map((row, index) => ({
        ...row,
        revenue: Math.round(row.revenue * 100) / 100,
        rank: index + 1,
      }))

    const total_qty = products.reduce((sum, row) => sum + row.qty_sold, 0)
    const total_revenue = Math.round(products.reduce((sum, row) => sum + row.revenue, 0) * 100) / 100

    return NextResponse.json({
      products,
      period: preset,
      start_date: range.start,
      end_date: range.end,
      total_qty,
      total_revenue,
    })
  } catch (error) {
    console.error("GET top-products error:", error)
    return NextResponse.json({ error: "Error al consultar más vendidos" }, { status: 500 })
  }
}
