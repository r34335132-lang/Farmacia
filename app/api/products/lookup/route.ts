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

const PRODUCT_FIELDS =
  "id, name, barcode, stock_quantity, cost_price, price, section, branch_id, is_active, updated_at"

function asMoney(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeProduct(row: Record<string, unknown>) {
  return {
    ...row,
    stock_quantity: Number(row.stock_quantity) || 0,
    cost_price: asMoney(row.cost_price),
    price: asMoney(row.price),
  }
}

async function enrichPriceFromSibling(
  supabase: Awaited<ReturnType<typeof createClient>>,
  product: Record<string, unknown>,
  branchId: string,
) {
  const price = asMoney(product.price)
  if (price > 0) return product
  const barcode = typeof product.barcode === "string" ? product.barcode.trim() : ""
  if (!barcode) return product

  const { data } = await supabase
    .from("products")
    .select("price")
    .eq("barcode", barcode)
    .eq("is_active", true)
    .neq("branch_id", branchId)
    .gt("price", 0)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data && asMoney(data.price) > 0) {
    return { ...product, price: asMoney(data.price), price_from_sibling: true }
  }
  return product
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const barcode = normalizeBarcode(searchParams.get("barcode"))
    const query = (searchParams.get("q") || searchParams.get("name") || "").trim()
    const requestedBranchId = searchParams.get("branch_id")

    if (!barcode && query.length < 2) {
      return NextResponse.json({ error: "Escribe al menos 2 letras o un código de barras" }, { status: 400 })
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

    if (barcode) {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
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
        return NextResponse.json({ error: "Producto no encontrado en esta sucursal", product: null, products: [] }, { status: 404 })
      }
      const enriched = normalizeProduct(
        await enrichPriceFromSibling(supabase, data as Record<string, unknown>, branchId),
      )
      return NextResponse.json({ product: enriched, products: [enriched] })
    }

    const sanitized = query.replace(/[%_,()]/g, " ").trim()
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .or(`name.ilike.%${sanitized}%,barcode.ilike.%${sanitized}%`)
      .order("name")
      .limit(25)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const products = await Promise.all(
      (data || []).map(async (row) =>
        normalizeProduct(await enrichPriceFromSibling(supabase, row as Record<string, unknown>, branchId)),
      ),
    )
    if (products.length === 0) {
      return NextResponse.json({ error: "No se encontraron productos", products: [] }, { status: 404 })
    }

    return NextResponse.json({
      products,
      product: products.length === 1 ? products[0] : null,
    })
  } catch (error) {
    console.error("GET product lookup error:", error)
    return NextResponse.json({ error: "Error al buscar producto" }, { status: 500 })
  }
}
