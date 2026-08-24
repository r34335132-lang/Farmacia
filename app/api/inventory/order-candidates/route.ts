import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"

export const dynamic = "force-dynamic"

type ProductRow = {
  id: string
  name: string
  barcode: string | null
  stock_quantity: number
  min_stock_level: number | null
  price: number | null
  cost_price: number | null
  section: string | null
  branch_id: string
  image_url?: string | null
  branches?: { id: string; name: string } | { id: string; name: string }[] | null
}

function branchName(row: ProductRow) {
  const value = row.branches
  if (Array.isArray(value)) return value[0]?.name || "Sucursal"
  return value?.name || "Sucursal"
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
    const requestedBranchId = searchParams.get("branch_id")
    const filter = searchParams.get("filter") || "zero" // zero | low | all
    const search = (searchParams.get("q") || "").trim().toLowerCase()
    const branchId = resolveEffectiveBranchId(context, requestedBranchId)

    let all: ProductRow[] = []
    let start = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from("products")
        .select(
          "id, name, barcode, stock_quantity, min_stock_level, price, cost_price, section, branch_id, image_url, branches(id, name)",
        )
        .eq("is_active", true)
        .order("name")
        .range(start, start + pageSize - 1)

      if (branchId) query = query.eq("branch_id", branchId)

      const { data, error } = await query
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const page = (data || []) as ProductRow[]
      all = all.concat(page)
      start += pageSize
      hasMore = page.length === pageSize
    }

    let products = all.filter((p) => {
      const stock = Number(p.stock_quantity) || 0
      const min = Number(p.min_stock_level) || 5
      if (filter === "zero") return stock === 0
      if (filter === "low") return stock > 0 && stock <= min
      if (filter === "need") return stock <= min
      return true
    })

    if (search.length >= 2) {
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.barcode || "").toLowerCase().includes(search) ||
          (p.section || "").toLowerCase().includes(search),
      )
    }

    products = products.slice(0, 400)
    const productIds = products.map((p) => p.id)

    const lastSaleByProduct = new Map<
      string,
      { sold_at: string; quantity: number; unit_price: number; sale_total?: number }
    >()

    if (productIds.length > 0) {
      const { data: saleItems, error: salesError } = await supabase
        .from("sale_items")
        .select("product_id, quantity, unit_price, created_at, sale_id, sales(created_at, status)")
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(2500, Math.max(200, productIds.length * 8)))

      if (salesError) {
        console.error("order-candidates last sale:", salesError.message)
      }

      for (const item of saleItems || []) {
        const productId = item.product_id as string
        if (lastSaleByProduct.has(productId)) continue
        const saleRel = item.sales as
          | { created_at?: string; status?: string }
          | { created_at?: string; status?: string }[]
          | null
        const sale = Array.isArray(saleRel) ? saleRel[0] : saleRel
        if (sale?.status && sale.status !== "completed") continue
        lastSaleByProduct.set(productId, {
          sold_at: sale?.created_at || (item.created_at as string),
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
        })
      }
    }

    const items = products.map((p) => {
      const stock = Number(p.stock_quantity) || 0
      const min = Number(p.min_stock_level) || 5
      const last = lastSaleByProduct.get(p.id) || null
      return {
        product_id: p.id,
        product_name: p.name,
        barcode: p.barcode,
        stock_quantity: stock,
        min_stock_level: min,
        suggested_qty: Math.max(1, min - stock),
        price: Number(p.price) || 0,
        cost_price: Number(p.cost_price) || 0,
        section: p.section,
        branch_id: p.branch_id,
        branch_name: branchName(p),
        image_url: p.image_url || null,
        last_sale: last,
      }
    })

    items.sort((a, b) => {
      if (a.stock_quantity !== b.stock_quantity) return a.stock_quantity - b.stock_quantity
      return a.product_name.localeCompare(b.product_name, "es")
    })

    return NextResponse.json({
      items,
      totals: {
        products: items.length,
        zero: items.filter((i) => i.stock_quantity === 0).length,
        low: items.filter((i) => i.stock_quantity > 0 && i.stock_quantity <= i.min_stock_level).length,
      },
    })
  } catch (error) {
    console.error("inventory order-candidates error:", error)
    return NextResponse.json({ error: "Error al cargar candidatos de pedido" }, { status: 500 })
  }
}
