import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { fetchInventoryAlerts } from "@/lib/inventory-alerts"

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

    const alerts = await fetchInventoryAlerts(supabase, branchId, 200)
    return NextResponse.json(alerts)
  } catch (error) {
    console.error("GET inventory alerts error:", error)
    return NextResponse.json({ error: "Error al consultar alertas" }, { status: 500 })
  }
}
