import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext, resolveEffectiveBranchId } from "@/lib/branch"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

const SESSION_SELECT =
  "id, branch_id, cashier_id, status, opened_at, closed_at, opening_float, notes, branches(id, name), profiles:cashier_id(id, full_name)"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id")
    const status = searchParams.get("status")
    const mine = searchParams.get("mine") === "1"
    const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get("limit") || "80") || 80))

    const context = await resolveBranchContext(supabase, branchId && branchId !== "all" ? branchId : null)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // Sesión abierta del usuario actual en la sucursal efectiva
    if (mine) {
      const effectiveBranchId = resolveEffectiveBranchId(context, branchId)
      if (!effectiveBranchId) {
        return NextResponse.json({ error: "Debe seleccionar una sucursal" }, { status: 400 })
      }

      const { data, error } = await supabase
        .from("cash_sessions")
        .select(SESSION_SELECT)
        .eq("cashier_id", user.id)
        .eq("branch_id", effectiveBranchId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        session: data || null,
        branchId: effectiveBranchId,
        isAdmin: context.isAdmin,
      })
    }

    let query = supabase
      .from("cash_sessions")
      .select(SESSION_SELECT)
      .order("opened_at", { ascending: false })
      .limit(limit)

    if (!context.isAdmin) {
      if (!context.activeBranchId) {
        return NextResponse.json({ error: "Sin sucursal asignada" }, { status: 400 })
      }
      query = query.eq("branch_id", context.activeBranchId).eq("cashier_id", user.id)
    } else if (branchId && branchId !== "all") {
      query = query.eq("branch_id", branchId)
    }

    if (status === "open" || status === "closed") {
      query = query.eq("status", status)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sessions: data || [], isAdmin: context.isAdmin })
  } catch (error) {
    console.error("GET cash-sessions error:", error)
    return NextResponse.json({ error: "Error al consultar sesiones de caja" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const requestedBranchId = typeof body.branch_id === "string" ? body.branch_id : null
    const openingFloat = Number.isFinite(Number(body.opening_float)) ? Number(body.opening_float) : 500

    const context = await resolveBranchContext(supabase, requestedBranchId)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const effectiveBranchId = resolveEffectiveBranchId(context, requestedBranchId)
    if (!effectiveBranchId) {
      return NextResponse.json({ error: "Debe seleccionar una sucursal" }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from("cash_sessions")
      .select(SESSION_SELECT)
      .eq("cashier_id", user.id)
      .eq("branch_id", effectiveBranchId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (existing) {
      // Si ya hay caja abierta, se reanuda; el saldo de inicio no se cambia
      return NextResponse.json({ session: existing, resumed: true })
    }

    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      return NextResponse.json({ error: "Saldo de caja inválido" }, { status: 400 })
    }

    const { data: created, error: createError } = await supabase
      .from("cash_sessions")
      .insert({
        branch_id: effectiveBranchId,
        cashier_id: user.id,
        status: "open",
        opening_float: openingFloat,
      })
      .select(SESSION_SELECT)
      .single()

    if (createError) {
      // Carrera: otra pestaña abrió la sesión al mismo tiempo
      if (createError.code === "23505") {
        const { data: raced } = await supabase
          .from("cash_sessions")
          .select(SESSION_SELECT)
          .eq("cashier_id", user.id)
          .eq("branch_id", effectiveBranchId)
          .eq("status", "open")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (raced) return NextResponse.json({ session: raced, resumed: true })
      }
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    await logAudit(supabase, "cash_session_opened", "cash_session", created.id, effectiveBranchId, {
      opening_float: openingFloat,
    })

    return NextResponse.json({ session: created, resumed: false })
  } catch (error) {
    console.error("POST cash-sessions error:", error)
    return NextResponse.json({ error: "Error al abrir sesión de caja" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const sessionId = typeof body.id === "string" ? body.id : ""
    const notes = typeof body.notes === "string" ? body.notes.trim() : null

    if (!sessionId) {
      return NextResponse.json({ error: "Falta el id de la sesión" }, { status: 400 })
    }

    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: session, error: fetchError } = await supabase
      .from("cash_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .maybeSingle()

    if (fetchError || !session) {
      return NextResponse.json({ error: fetchError?.message || "Sesión no encontrada" }, { status: 404 })
    }

    if (!context.isAdmin && session.cashier_id !== user.id) {
      return NextResponse.json({ error: "No autorizado para cerrar esta caja" }, { status: 403 })
    }

    if (session.status === "closed") {
      return NextResponse.json({ session, alreadyClosed: true })
    }

    const closedAt = new Date().toISOString()
    const { data: closed, error: closeError } = await supabase
      .from("cash_sessions")
      .update({
        status: "closed",
        closed_at: closedAt,
        notes: notes || session.notes || null,
      })
      .eq("id", sessionId)
      .eq("status", "open")
      .select(SESSION_SELECT)
      .single()

    if (closeError) {
      return NextResponse.json({ error: closeError.message }, { status: 500 })
    }

    const durationMs = Math.max(0, new Date(closedAt).getTime() - new Date(session.opened_at).getTime())
    await logAudit(supabase, "cash_session_closed", "cash_session", sessionId, session.branch_id, {
      opened_at: session.opened_at,
      closed_at: closedAt,
      duration_ms: durationMs,
    })

    return NextResponse.json({
      session: closed,
      duration_ms: durationMs,
      alreadyClosed: false,
    })
  } catch (error) {
    console.error("PATCH cash-sessions error:", error)
    return NextResponse.json({ error: "Error al cerrar sesión de caja" }, { status: 500 })
  }
}
