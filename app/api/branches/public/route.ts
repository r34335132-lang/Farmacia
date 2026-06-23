import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { formatBranchDbError } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("branches")
      .select("id, name, address, phone")
      .eq("is_active", true)
      .order("name")

    if (error) {
      console.error("Error fetching public branches:", error)
      return NextResponse.json(
        { error: formatBranchDbError(error.message), code: error.code },
        { status: 500 },
      )
    }

    return NextResponse.json({ branches: data || [] })
  } catch (error) {
    console.error("Error in public branches API:", error)
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 })
  }
}
