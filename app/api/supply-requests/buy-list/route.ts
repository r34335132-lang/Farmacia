import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { normalizeProductKey, type BuyListItem } from "@/lib/supply-request-document"

export const dynamic = "force-dynamic"

type SupplierGroup = {
  supplier_id: string | null
  supplier_name: string
  items: BuyListItem[]
  total_units: number
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id")
    const supplierId = searchParams.get("supplier_id")

    let query = supabase
      .from("supply_requests")
      .select(
        "id, branch_id, supplier_id, status, created_at, branches(id, name), suppliers(id, name), supply_request_items(*)",
      )
      .eq("status", "submitted")
      .order("created_at", { ascending: false })

    if (!context.isAdmin) {
      if (!context.activeBranchId) {
        return NextResponse.json({ error: "Sin sucursal asignada" }, { status: 400 })
      }
      query = query.eq("branch_id", context.activeBranchId)
    } else if (branchId && branchId !== "all") {
      query = query.eq("branch_id", branchId)
    }

    if (supplierId && supplierId !== "all") {
      query = query.eq("supplier_id", supplierId)
    }

    const { data, error } = await query
    if (error) {
      // Compatibilidad si aún no corre el script de proveedores
      if (error.message?.includes("supplier")) {
        const fallback = await supabase
          .from("supply_requests")
          .select("id, branch_id, status, created_at, branches(id, name), supply_request_items(*)")
          .eq("status", "submitted")
          .order("created_at", { ascending: false })
        if (fallback.error) {
          return NextResponse.json({ error: fallback.error.message }, { status: 500 })
        }
        return NextResponse.json(buildResponse(fallback.data || [], null))
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(buildResponse(data || [], supplierId))
  } catch (error) {
    console.error("GET supply-requests buy-list error:", error)
    return NextResponse.json({ error: "Error al armar la lista de compra" }, { status: 500 })
  }
}

function relOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

function buildResponse(
  data: Array<Record<string, unknown>>,
  _supplierFilter: string | null,
) {
  const bySupplier = new Map<string, { supplier_id: string | null; supplier_name: string; grouped: Map<string, BuyListItem> }>()

  for (const request of data) {
    const branch = relOne(request.branches as { id: string; name: string } | { id: string; name: string }[] | null)
    const supplier = relOne(request.suppliers as { id: string; name: string } | { id: string; name: string }[] | null)
    const branchName = branch?.name || "Sucursal"
    const branchId = request.branch_id as string
    const supplierKey = (request.supplier_id as string) || "sin-proveedor"
    const supplierName = supplier?.name || "Sin proveedor"

    if (!bySupplier.has(supplierKey)) {
      bySupplier.set(supplierKey, {
        supplier_id: (request.supplier_id as string) || null,
        supplier_name: supplierName,
        grouped: new Map(),
      })
    }

    const bucket = bySupplier.get(supplierKey)!
    const items = (request.supply_request_items || []) as {
      product_name: string
      barcode?: string | null
      photo_url?: string | null
      quantity: number
    }[]

    for (const item of items) {
      const key = normalizeProductKey(item.product_name, item.barcode)
      const current = bucket.grouped.get(key) || {
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

      bucket.grouped.set(key, current)
    }
  }

  const by_supplier: SupplierGroup[] = [...bySupplier.values()]
    .map((bucket) => {
      const items = [...bucket.grouped.values()].sort((a, b) =>
        a.product_name.localeCompare(b.product_name, "es"),
      )
      return {
        supplier_id: bucket.supplier_id,
        supplier_name: bucket.supplier_name,
        items,
        total_units: items.reduce((sum, item) => sum + item.total, 0),
      }
    })
    .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "es"))

  const items = by_supplier.flatMap((group) => group.items)

  return {
    items,
    by_supplier,
    totalProducts: items.length,
  }
}
