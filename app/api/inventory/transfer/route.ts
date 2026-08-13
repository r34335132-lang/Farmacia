import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

type TransferItem = { barcode: string; name?: string; quantity: number }

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

function validateItems(items: unknown): { ok: true; items: TransferItem[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Debes enviar al menos un producto" }
  }
  if (items.length > 20000) return { ok: false, error: "Máximo 20,000 filas" }

  const seen = new Map<string, number>()
  const normalized: TransferItem[] = []

  for (let i = 0; i < items.length; i++) {
    const row = items[i] as Record<string, unknown>
    const barcode = normalizeBarcode(row?.barcode)
    const name = row?.name != null ? String(row.name).trim() : ""
    const quantity = typeof row?.quantity === "number" ? row.quantity : Number(row?.quantity)

    if (!barcode) return { ok: false, error: `Fila ${i + 1}: falta código de barras` }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, error: `Fila ${i + 1} (${barcode}): cantidad debe ser entero > 0` }
    }
    if (seen.has(barcode)) {
      return { ok: false, error: `Código duplicado: ${barcode}` }
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
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const body = await request.json()
    const action = body?.action as string
    const fromBranchId = body?.from_branch_id as string | undefined
    const toBranchId = body?.to_branch_id as string | undefined

    if (!fromBranchId || !toBranchId) {
      return NextResponse.json({ error: "Sucursal origen y destino requeridas" }, { status: 400 })
    }
    if (fromBranchId === toBranchId) {
      return NextResponse.json({ error: "Origen y destino deben ser distintas" }, { status: 400 })
    }
    if (!["preview", "apply"].includes(action)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }

    const validated = validateItems(body?.items)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    if (action === "preview") {
      const { data, error } = await supabase.rpc("preview_inventory_transfer", {
        p_from_branch_id: fromBranchId,
        p_to_branch_id: toBranchId,
        p_items: validated.items,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ success: true, result: data })
    }

    // Solo transferir filas ready / will_create (el RPC valida stock otra vez)
    const applyItems =
      Array.isArray(body?.apply_items) && body.apply_items.length > 0
        ? validateItems(body.apply_items)
        : validated

    if (!applyItems.ok) {
      return NextResponse.json({ error: applyItems.error }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("apply_inventory_transfer", {
      p_from_branch_id: fromBranchId,
      p_to_branch_id: toBranchId,
      p_items: applyItems.items.map(({ barcode, quantity }) => ({ barcode, quantity })),
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    console.error("POST inventory transfer error:", error)
    return NextResponse.json({ error: "Error en el traspaso" }, { status: 500 })
  }
}
