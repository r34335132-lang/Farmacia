import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    return NextResponse.json({
      branches: context.assignedBranches,
      activeBranchId: context.activeBranchId,
      activeBranch: context.activeBranch,
      role: context.role,
      isAdmin: context.isAdmin,
    })
  } catch (error) {
    console.error("Error in branches API:", error)
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 })
  }
}
