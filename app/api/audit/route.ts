import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden consultar auditoría" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get("entity_type")
    const branchId = searchParams.get("branch_id")
    const page = Math.max(0, Number(searchParams.get("page") || 0))
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("page_size") || 25)))
    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("audit_logs")
      .select("*, profiles:user_id(full_name, email), branches(id, name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (entityType && entityType !== "all") query = query.eq("entity_type", entityType)
    if (branchId && branchId !== "all") query = query.eq("branch_id", branchId)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data || [], total: count || 0, page, pageSize })
  } catch (error) {
    console.error("GET audit error:", error)
    return NextResponse.json({ error: "Error al consultar auditoría" }, { status: 500 })
  }
}
