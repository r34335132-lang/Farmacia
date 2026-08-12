import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

type CountItem = {
  barcode: string
  name?: string
  quantity: number
}

function normalizeBarcode(value: unknown): string {
  if (value == null) return ""
  let raw = String(value).trim()
  if (!raw) return ""

  // Notación científica típica de Excel
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && Number.isInteger(n)) {
      raw = String(n)
    }
  }

  // "12345.0" → "12345"
  if (/^\d+\.0+$/.test(raw)) {
    raw = raw.replace(/\.0+$/, "")
  }

  return raw
}

function validateItems(items: unknown): { ok: true; items: CountItem[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Debes enviar al menos un producto del conteo" }
  }

  if (items.length > 20000) {
    return { ok: false, error: "El archivo supera el límite de 20,000 filas" }
  }

  const seen = new Map<string, number>()
  const normalized: CountItem[] = []

  for (let i = 0; i < items.length; i++) {
    const row = items[i] as Record<string, unknown>
    const barcode = normalizeBarcode(row?.barcode)
    const name = row?.name != null ? String(row.name).trim() : ""
    const quantityRaw = row?.quantity
    const quantity = typeof quantityRaw === "number" ? quantityRaw : Number(quantityRaw)

    if (!barcode) {
      return { ok: false, error: `Fila ${i + 1}: falta código de barras` }
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, error: `Fila ${i + 1} (${barcode}): la cantidad debe ser un entero >= 0` }
    }

    if (seen.has(barcode)) {
      return {
        ok: false,
        error: `Código de barras duplicado en el archivo: ${barcode} (filas ${(seen.get(barcode) || 0) + 1} y ${i + 1})`,
      }
    }

    seen.set(barcode, i)
    normalized.push({ barcode, name, quantity })
  }

  return { ok: true, items: normalized }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden usar el conteo de inventario" }, { status: 403 })
    }

    const body = await request.json()
    const action = body?.action as string
    const branchId = body?.branch_id as string | undefined

    if (!branchId) {
      return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 })
    }

    if (!["compare", "apply"].includes(action)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }

    if (action === "compare") {
      const validated = validateItems(body?.items)
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }

      const startDate = typeof body?.start_date === "string" ? body.start_date : null
      const endDate = typeof body?.end_date === "string" ? body.end_date : null

      const { data, error } = await supabase.rpc("compare_inventory_count", {
        p_branch_id: branchId,
        p_items: validated.items,
        p_start_date: startDate,
        p_end_date: endDate,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, result: data })
    }

    // action === apply
    const applyItems =
      Array.isArray(body?.apply_items) && body.apply_items.length > 0
        ? validateItems(body.apply_items)
        : Array.isArray(body?.items) && body.items.length > 0
          ? validateItems(body.items)
          : { ok: true as const, items: [] as CountItem[] }

    if (!applyItems.ok) {
      return NextResponse.json({ error: applyItems.error }, { status: 400 })
    }

    const rawSaleItems = Array.isArray(body?.sale_items) ? body.sale_items : []
    const saleItems: Array<{
      barcode: string
      product_id?: string | null
      quantity: number
      unit_price: number
      unit_cost: number
      source: string
    }> = []

    for (const line of rawSaleItems) {
      const barcode = normalizeBarcode(line?.barcode)
      const quantity = Number(line?.quantity)
      const unitPrice = Number(line?.unit_price)
      const unitCost = Number(line?.unit_cost)
      if (!barcode || !Number.isInteger(quantity) || quantity <= 0) continue
      if (!Number.isFinite(unitPrice) || unitPrice < 0) continue
      saleItems.push({
        barcode,
        product_id: line?.product_id ? String(line.product_id) : null,
        quantity,
        unit_price: unitPrice,
        unit_cost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0,
        source: String(line?.source || "estimado"),
      })
    }

    if (applyItems.items.length === 0 && saleItems.length === 0) {
      return NextResponse.json(
        { error: "No hay ajustes de stock ni líneas de venta para aplicar" },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc("apply_inventory_count", {
      p_branch_id: branchId,
      p_items: applyItems.items.map(({ barcode, quantity }) => ({ barcode, quantity })),
      p_sale_items: saleItems,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    console.error("POST inventory count error:", error)
    return NextResponse.json({ error: "Error en el conteo de inventario" }, { status: 500 })
  }
}
