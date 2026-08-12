import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { EXPENSE_CATEGORIES } from "@/lib/money"
import { todayLocalISODate } from "@/lib/periods"

export const dynamic = "force-dynamic"

const VALID_CATEGORIES = EXPENSE_CATEGORIES.map((c) => c.value)

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
    const branchId = searchParams.get("branch_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const category = searchParams.get("category")
    const page = Math.max(0, Number(searchParams.get("page") || 0))
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("page_size") || 25)))
    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("expenses")
      .select("*, branches(id, name), profiles:created_by(full_name, email)", { count: "exact" })
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (branchId && branchId !== "all") query = query.eq("branch_id", branchId)
    if (startDate) query = query.gte("expense_date", startDate)
    if (endDate) query = query.lte("expense_date", endDate)
    if (category && category !== "all") query = query.eq("category", category)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ expenses: data || [], total: count || 0, page, pageSize })
  } catch (error) {
    console.error("GET expenses error:", error)
    return NextResponse.json({ error: "Error al consultar gastos" }, { status: 500 })
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

    const body = await request.json()
    const { concept, category, amount, expense_date, branch_id, description } = body

    if (!concept?.trim()) {
      return NextResponse.json({ error: "El concepto es obligatorio" }, { status: 400 })
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Categoría inválida" }, { status: 400 })
    }
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
    }
    if (!branch_id) {
      return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        concept: concept.trim(),
        category,
        amount: parsedAmount,
        // Fecha local, no UTC: evita que un gasto de hoy quede “mañana/ayer” y no aparezca en finanzas
        expense_date: expense_date || todayLocalISODate(),
        branch_id,
        description: description?.trim() || null,
        created_by: context.userId,
      })
      .select("*, branches(id, name), profiles:created_by(full_name, email)")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, expense: data })
  } catch (error) {
    console.error("POST expenses error:", error)
    return NextResponse.json({ error: "Error al registrar gasto" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const id = new URL(request.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })

    const { error } = await supabase.from("expenses").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE expenses error:", error)
    return NextResponse.json({ error: "Error al eliminar gasto" }, { status: 500 })
  }
}
