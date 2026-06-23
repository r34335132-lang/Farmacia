import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { applyBranchFilter, resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const requestedBranchId = searchParams.get("branch_id")

    const context = await resolveBranchContext(supabase, requestedBranchId)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    let allProducts: Record<string, unknown>[] = []
    let start = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from("products")
        .select("*, branches(id, name)")
        .order("name")
        .range(start, start + pageSize - 1)

      query = applyBranchFilter(query, {
        ...context,
        activeBranchId: resolveEffectiveBranchId(context, requestedBranchId),
      })

      const { data, error } = await query

      if (error) {
        console.error("Error fetching products:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data]
        start += pageSize
        if (data.length < pageSize) hasMore = false
      } else {
        hasMore = false
      }
    }

    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
      branchId: resolveEffectiveBranchId(context, requestedBranchId),
      isAdmin: context.isAdmin,
    })
  } catch (error) {
    console.error("Error in products API:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, stock, reason = "Actualización manual desde admin" } = body

    if (!id || stock === undefined) {
      return NextResponse.json({ error: "Faltan datos requeridos (id, stock)" }, { status: 400 })
    }

    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: oldProduct, error: fetchError } = await supabase
      .from("products")
      .select("stock_quantity, branch_id")
      .eq("id", id)
      .single()

    if (fetchError || !oldProduct) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    if (!context.isAdmin && oldProduct.branch_id !== context.activeBranchId) {
      return NextResponse.json({ error: "No autorizado para modificar este producto" }, { status: 403 })
    }

    const previous_stock = oldProduct.stock_quantity
    const difference = stock - previous_stock

    if (difference === 0) {
      return NextResponse.json({ success: true, message: "El stock es el mismo, no hubo cambios" })
    }

    const movementType = difference > 0 ? "entrada" : "salida"
    const quantity = Math.abs(difference)

    const { error: updateError } = await supabase.from("products").update({ stock_quantity: stock }).eq("id", id)

    if (updateError) throw updateError

    const { error: logError } = await supabase.from("stock_movements").insert({
      product_id: id,
      user_id: user.id,
      movement_type: movementType,
      quantity,
      reason,
    })

    if (logError) console.error("Error registrando en bitácora:", logError)

    return NextResponse.json({
      success: true,
      message: "Inventario actualizado y registrado correctamente",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    console.error("Error in PATCH products API:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { branch_id: requestedBranchId, ...productData } = body

    const context = await resolveBranchContext(supabase, requestedBranchId)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const effectiveBranchId = resolveEffectiveBranchId(context, requestedBranchId)
    if (!effectiveBranchId) {
      return NextResponse.json({ error: "Debe seleccionar una sucursal" }, { status: 400 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert({ ...productData, branch_id: effectiveBranchId })
      .select("*, branches(id, name)")
      .single()

    if (insertError) throw insertError

    const initialStock = newProduct.stock_quantity || 0
    if (newProduct && initialStock > 0) {
      await supabase.from("stock_movements").insert({
        product_id: newProduct.id,
        user_id: user?.id,
        movement_type: "entrada",
        quantity: initialStock,
        reason: "Stock inicial por creación de producto",
      })
    }

    return NextResponse.json({ success: true, product: newProduct })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear producto"
    console.error("Error al crear producto:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID de producto requerido" }, { status: 400 })
    }

    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden eliminar productos" }, { status: 403 })
    }

    await supabase.from("stock_movements").delete().eq("product_id", id)

    const { error: deleteError } = await supabase.from("products").delete().eq("id", id)
    if (deleteError) throw deleteError

    return NextResponse.json({
      success: true,
      message: "Producto y su historial eliminados correctamente",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar producto"
    console.error("Error al eliminar producto:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
