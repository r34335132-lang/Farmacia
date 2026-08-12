import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { getPeriodRange, type PeriodPreset } from "@/lib/periods"

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
    const preset = (searchParams.get("period") || "month") as PeriodPreset
    const range = getPeriodRange(
      preset,
      searchParams.get("start_date") || undefined,
      searchParams.get("end_date") || undefined,
    )

    const { data, error } = await supabase.rpc("get_financial_summary", {
      p_branch_id: branchId && branchId !== "all" ? branchId : null,
      p_start_date: range.start,
      p_end_date: range.end,
    })

    if (error) {
      console.error("get_financial_summary error:", error)
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
    console.error("finance summary error:", error)
    return NextResponse.json({ error: "Error al obtener finanzas" }, { status: 500 })
  }
}
