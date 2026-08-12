import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { logAudit } from "@/lib/audit"
import { suggestedSalePrice } from "@/lib/money"

export const dynamic = "force-dynamic"

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

    const { data: settings, error } = await supabase
      .from("markup_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: history } = await supabase
      .from("markup_history")
      .select("*, profiles:changed_by(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({
      settings: settings || { percent: 0 },
      history: history || [],
    })
  } catch (error) {
    console.error("GET markup error:", error)
    return NextResponse.json({ error: "Error al consultar markup" }, { status: 500 })
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
      return NextResponse.json({ error: "Solo administradores pueden modificar el markup" }, { status: 403 })
    }

    const body = await request.json()
    const percent = Number(body.percent)
    const note = typeof body.note === "string" ? body.note.trim() : null
    const applyToProducts = Boolean(body.apply_to_products)

    if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
      return NextResponse.json({ error: "El markup debe estar entre 0 y 1000" }, { status: 400 })
    }

    const { data: current } = await supabase
      .from("markup_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const oldPercent = Number(current?.percent ?? 0)
    let settings = current

    if (current?.id) {
      const { data, error } = await supabase
        .from("markup_settings")
        .update({
          percent,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      settings = data
    } else {
      const { data, error } = await supabase
        .from("markup_settings")
        .insert({ percent, updated_by: context.userId })
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      settings = data
    }

    await supabase.from("markup_history").insert({
      old_percent: oldPercent,
      new_percent: percent,
      changed_by: context.userId,
      note,
    })

    await logAudit(supabase, "markup_updated", "markup_settings", settings?.id, null, {
      old_percent: oldPercent,
      new_percent: percent,
      note,
      apply_to_products: applyToProducts,
    })

    let updatedCount = 0
    if (applyToProducts) {
      const pageSize = 1000
      let start = 0
      let hasMore = true
      while (hasMore) {
        const { data: products, error } = await supabase
          .from("products")
          .select("id, cost_price, markup_percent, price, branch_id")
          .eq("is_active", true)
          .gt("cost_price", 0)
          .range(start, start + pageSize - 1)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!products || products.length === 0) {
          hasMore = false
          break
        }

        for (const product of products) {
          const effectiveMarkup = product.markup_percent == null ? percent : Number(product.markup_percent)
          const newPrice = suggestedSalePrice(Number(product.cost_price), effectiveMarkup)
          if (newPrice <= 0 || newPrice === Number(product.price)) continue

          const { error: updateError } = await supabase
            .from("products")
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq("id", product.id)

          if (!updateError) {
            updatedCount += 1
            await logAudit(supabase, "price_updated", "product", product.id, product.branch_id, {
              old_price: product.price,
              new_price: newPrice,
              reason: "apply_markup",
              markup: effectiveMarkup,
            })
          }
        }

        start += pageSize
        if (products.length < pageSize) hasMore = false
      }
    }

    return NextResponse.json({
      success: true,
      settings,
      applied_products: updatedCount,
    })
  } catch (error) {
    console.error("POST markup error:", error)
    return NextResponse.json({ error: "Error al guardar markup" }, { status: 500 })
  }
}
