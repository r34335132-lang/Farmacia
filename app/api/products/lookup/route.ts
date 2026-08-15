import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"

export const dynamic = "force-dynamic"

function normalizeBarcode(value: unknown): string {
  if (value == null) return ""
  let raw = String(value).trim()
  if (!raw) return ""
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && Number.isInteger(n)) raw = String(n)
  }
  if (/^\d+\.0+$/.test(raw)) raw = raw.replace(/\.0+$/, "")
  return raw
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const barcode = normalizeBarcode(searchParams.get("barcode"))
    const requestedBranchId = searchParams.get("branch_id")

    if (!barcode) {
      return NextResponse.json({ error: "Código de barras requerido" }, { status: 400 })
    }

    const context = await resolveBranchContext(supabase, requestedBranchId)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const branchId = resolveEffectiveBranchId(context, requestedBranchId)
    if (!branchId) {
      return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 })
    }

    if (!context.isAdmin && branchId !== context.activeBranchId) {
      return NextResponse.json({ error: "No puedes consultar otra sucursal" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, stock_quantity, cost_price, price, branch_id, is_active")
      .eq("barcode", barcode)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Producto no encontrado en esta sucursal", product: null }, { status: 404 })
    }

    return NextResponse.json({ product: data })
  } catch (error) {
    console.error("GET product lookup error:", error)
    return NextResponse.json({ error: "Error al buscar producto" }, { status: 500 })
  }
}
