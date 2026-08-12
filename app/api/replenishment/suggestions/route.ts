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
    const days = Math.min(365, Math.max(1, Number(searchParams.get("days") || 14)))
    const includeZero = searchParams.get("include_zero") === "true"

    const { data, error } = await supabase.rpc("get_replenishment_suggestions", {
      p_days: days,
      p_include_zero: includeZero,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ suggestions: data || [], days })
  } catch (error) {
    console.error("GET replenishment suggestions error:", error)
    return NextResponse.json({ error: "Error al calcular sugerencias" }, { status: 500 })
  }
}
