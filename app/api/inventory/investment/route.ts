import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { roundMoney } from "@/lib/money"

export const dynamic = "force-dynamic"

type BranchRow = {
  branch_id: string
  sucursal: string
  productos: number
  unidades: number
  valor_inventario: number
  inversion: number
  utilidad_potencial: number
}

function asNumber(value: unknown) {
  return Number(value) || 0
}

function branchName(row: { branches?: { name?: string } | { name?: string }[] | null }) {
  const value = row.branches
  if (Array.isArray(value)) return value[0]?.name || "Sin sucursal"
  return value?.name || "Sin sucursal"
}

function totalsFrom(branches: BranchRow[]) {
  return {
    sucursales: branches.length,
    productos: branches.reduce((sum, row) => sum + row.productos, 0),
    unidades: branches.reduce((sum, row) => sum + row.unidades, 0),
    valor_inventario: roundMoney(branches.reduce((sum, row) => sum + row.valor_inventario, 0)),
    inversion: roundMoney(branches.reduce((sum, row) => sum + row.inversion, 0)),
    utilidad_potencial: roundMoney(branches.reduce((sum, row) => sum + row.utilidad_potencial, 0)),
  }
}

async function fetchProductPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  start: number,
  pageSize: number,
  withDeletedFlag: boolean,
) {
  const fields = withDeletedFlag
    ? "branch_id, stock_quantity, price, cost_price, is_active, is_deleted, branches(id, name)"
    : "branch_id, stock_quantity, price, cost_price, is_active, branches(id, name)"

  return supabase
    .from("products")
    .select(fields)
    .eq("is_active", true)
    .order("id")
    .range(start, start + pageSize - 1)
}

async function aggregateFromProducts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const grouped = new Map<string, BranchRow>()
  let start = 0
  const pageSize = 1000
  let hasMore = true
  let withDeletedFlag = true

  while (hasMore) {
    let { data, error } = await fetchProductPage(supabase, start, pageSize, withDeletedFlag)

    if (error && withDeletedFlag && error.message?.includes("is_deleted")) {
      withDeletedFlag = false
      const retry = await fetchProductPage(supabase, start, pageSize, false)
      data = retry.data
      error = retry.error
    }

    if (error) throw new Error(error.message)

    const page = data || []
    mergeProducts(grouped, page as Record<string, unknown>[])
    start += pageSize
    hasMore = page.length === pageSize
  }

  return [...grouped.values()].sort((a, b) => b.valor_inventario - a.valor_inventario)
}

function mergeProducts(grouped: Map<string, BranchRow>, page: Record<string, unknown>[]) {
  for (const product of page) {
    if (product.is_deleted === true) continue
    const branchId = typeof product.branch_id === "string" ? product.branch_id : ""
    if (!branchId) continue

    const stock = asNumber(product.stock_quantity)
    const price = asNumber(product.price)
    const cost = asNumber(product.cost_price)
    const current = grouped.get(branchId) || {
      branch_id: branchId,
      sucursal: branchName(product as { branches?: { name?: string } | { name?: string }[] | null }),
      productos: 0,
      unidades: 0,
      valor_inventario: 0,
      inversion: 0,
      utilidad_potencial: 0,
    }

    current.productos += 1
    current.unidades += stock
    current.valor_inventario += price * stock
    current.inversion += cost * stock
    current.utilidad_potencial += (price - cost) * stock
    grouped.set(branchId, current)
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const { data, error } = await supabase.rpc("get_inventory_investment")
    if (!error && data) {
      const payload = data as { branches?: BranchRow[]; totals?: ReturnType<typeof totalsFrom> }
      const branches = (payload.branches || []).map((row) => ({
        ...row,
        productos: asNumber(row.productos),
        unidades: asNumber(row.unidades),
        valor_inventario: roundMoney(asNumber(row.valor_inventario)),
        inversion: roundMoney(asNumber(row.inversion)),
        utilidad_potencial: roundMoney(asNumber(row.utilidad_potencial)),
      }))
      return NextResponse.json({
        branches,
        totals: payload.totals
          ? {
              sucursales: asNumber(payload.totals.sucursales),
              productos: asNumber(payload.totals.productos),
              unidades: asNumber(payload.totals.unidades),
              valor_inventario: roundMoney(asNumber(payload.totals.valor_inventario)),
              inversion: roundMoney(asNumber(payload.totals.inversion)),
              utilidad_potencial: roundMoney(asNumber(payload.totals.utilidad_potencial)),
            }
          : totalsFrom(branches),
      })
    }

    const branches = await aggregateFromProducts(supabase)
    const rounded = branches.map((row) => ({
      ...row,
      valor_inventario: roundMoney(row.valor_inventario),
      inversion: roundMoney(row.inversion),
      utilidad_potencial: roundMoney(row.utilidad_potencial),
    }))

    return NextResponse.json({
      branches: rounded,
      totals: totalsFrom(rounded),
    })
  } catch (error) {
    console.error("inventory investment error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al calcular la inversión" },
      { status: 500 },
    )
  }
}
