import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { logAudit } from "@/lib/audit"
import { suggestedSalePrice } from "@/lib/money"

export const dynamic = "force-dynamic"

interface BranchVariantInput {
  branch_id: string
  product_id?: string | null
  price: number
  cost_price?: number
  stock_quantity: number
  min_stock_level?: number
  promotion_price?: number | null
  expiration_date?: string | null
  markup_percent?: number | null
  enabled?: boolean
}

interface SharedProductInput {
  name: string
  description?: string | null
  barcode?: string | null
  category?: string | null
  image_url?: string | null
  section?: string | null
  days_before_expiry_alert?: number
  apply_markup?: boolean
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
    const barcode = searchParams.get("barcode")?.trim()
    const skuGroupId = searchParams.get("sku_group_id")?.trim()

    if (!barcode && !skuGroupId) {
      return NextResponse.json({ error: "barcode o sku_group_id requerido" }, { status: 400 })
    }

    let query = supabase
      .from("products")
      .select("*, branches(id, name)")
      .order("name")

    if (skuGroupId) {
      query = query.eq("sku_group_id", skuGroupId)
    } else if (barcode) {
      query = query.eq("barcode", barcode)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const variants = data || []
    const sku_group_id = variants[0]?.sku_group_id || null

    return NextResponse.json({
      variants,
      sku_group_id,
      barcode: variants[0]?.barcode || barcode,
    })
  } catch (error) {
    console.error("GET branch-variants error:", error)
    return NextResponse.json({ error: "Error al cargar variantes" }, { status: 500 })
  }
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const body = await request.json()
    const shared = body.shared as SharedProductInput
    const branches = (body.branches || []) as BranchVariantInput[]
    const skuGroupId = body.sku_group_id as string | undefined

    if (!shared?.name?.trim()) {
      return NextResponse.json({ error: "El nombre del producto es obligatorio" }, { status: 400 })
    }

    const activeBranches = branches.filter((b) => b.enabled !== false && b.price > 0)
    if (activeBranches.length === 0) {
      return NextResponse.json(
        { error: "Debe configurar precio en al menos una sucursal" },
        { status: 400 },
      )
    }

    const groupId = skuGroupId || crypto.randomUUID()
    const results: Record<string, unknown>[] = []

    let globalMarkup = 0
    if (shared.apply_markup) {
      const { data: markupRow } = await supabase
        .from("markup_settings")
        .select("percent")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      globalMarkup = Number(markupRow?.percent) || 0
    }

    for (const branch of activeBranches) {
      if (!branch.branch_id) continue

      const costPrice = Number(branch.cost_price) || 0
      const markupOverride =
        branch.markup_percent == null || branch.markup_percent === ("" as unknown)
          ? null
          : Number(branch.markup_percent)
      let salePrice = branch.price
      if (shared.apply_markup && costPrice > 0) {
        const effectiveMarkup = markupOverride == null ? globalMarkup : markupOverride
        salePrice = suggestedSalePrice(costPrice, effectiveMarkup)
      }

      const row = {
        name: shared.name.trim(),
        description: shared.description?.trim() || null,
        barcode: shared.barcode?.trim() || null,
        category: shared.category?.trim() || null,
        image_url: shared.image_url || null,
        section: shared.section?.trim() || null,
        days_before_expiry_alert: shared.days_before_expiry_alert ?? 30,
        branch_id: branch.branch_id,
        sku_group_id: groupId,
        price: salePrice,
        cost_price: costPrice,
        markup_percent: markupOverride,
        stock_quantity: branch.stock_quantity ?? 0,
        min_stock_level: branch.min_stock_level ?? 5,
        promotion_price: branch.promotion_price ?? null,
        expiration_date: branch.expiration_date || null,
        is_active: true,
      }

      if (branch.product_id) {
        const { data: existing } = await supabase
          .from("products")
          .select("stock_quantity, price, cost_price, markup_percent")
          .eq("id", branch.product_id)
          .single()

        const { data, error } = await supabase
          .from("products")
          .update(row)
          .eq("id", branch.product_id)
          .select("*, branches(id, name)")
          .single()

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }

        const oldStock = existing?.stock_quantity ?? 0
        const diff = row.stock_quantity - oldStock
        if (diff !== 0 && user) {
          await supabase.from("stock_movements").insert({
            product_id: branch.product_id,
            user_id: user.id,
            movement_type: diff > 0 ? "entrada" : "salida",
            quantity: Math.abs(diff),
            reason: "Ajuste de inventario por sucursal (admin)",
            unit_cost: costPrice,
            branch_id: branch.branch_id,
          })
          await logAudit(supabase, "inventory_adjusted", "product", branch.product_id, branch.branch_id, {
            old_stock: oldStock,
            new_stock: row.stock_quantity,
          })
        }

        if (existing && Number(existing.price) !== Number(row.price)) {
          await logAudit(supabase, "price_updated", "product", branch.product_id, branch.branch_id, {
            old_price: existing.price,
            new_price: row.price,
          })
        }
        if (existing && Number(existing.cost_price || 0) !== Number(row.cost_price)) {
          await logAudit(supabase, "cost_updated", "product", branch.product_id, branch.branch_id, {
            old_cost: existing.cost_price,
            new_cost: row.cost_price,
          })
        }

        results.push(data)
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(row)
          .select("*, branches(id, name)")
          .single()

        if (error) {
          if (error.code === "23505") {
            return NextResponse.json(
              {
                error: `El código de barras ya existe en esta sucursal. Edita el producto existente.`,
              },
              { status: 400 },
            )
          }
          return NextResponse.json({ error: error.message }, { status: 400 })
        }

        if (data && row.stock_quantity > 0 && user) {
          await supabase.from("stock_movements").insert({
            product_id: data.id,
            user_id: user.id,
            movement_type: "entrada",
            quantity: row.stock_quantity,
            reason: "Stock inicial por creación en sucursal",
            unit_cost: costPrice,
            branch_id: branch.branch_id,
          })
        }

        await logAudit(supabase, "product_created", "product", data?.id as string, branch.branch_id, {
          name: row.name,
          cost_price: costPrice,
          price: salePrice,
        })

        results.push(data)
      }
    }

    // Desactivar sucursales no incluidas en el guardado (si tenían product_id)
    const disabledBranches = branches.filter((b) => b.enabled === false && b.product_id)
    for (const branch of disabledBranches) {
      await supabase.from("products").update({ is_active: false }).eq("id", branch.product_id!)
    }

    return NextResponse.json({
      success: true,
      sku_group_id: groupId,
      products: results,
    })
  } catch (error) {
    console.error("POST branch-variants error:", error)
    return NextResponse.json({ error: "Error al guardar variantes por sucursal" }, { status: 500 })
  }
}
