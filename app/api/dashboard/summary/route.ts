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
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id")
    const topLimit = Math.min(10, Math.max(3, Number(searchParams.get("top_limit") || 5)))

    const { data, error } = await supabase.rpc("get_admin_dashboard", {
      p_branch_id: branchId && branchId !== "all" ? branchId : null,
      p_top_limit: topLimit,
    })

    if (error) {
      console.error("get_admin_dashboard error:", error)
      return NextResponse.json(
        {
          error: error.message,
          hint: "Ejecuta scripts/023_finance_dashboard_performance.sql en Supabase",
        },
        { status: 500 },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("dashboard summary error:", error)
    return NextResponse.json({ error: "Error al cargar dashboard" }, { status: 500 })
  }
}
