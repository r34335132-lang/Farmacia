import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const manage = searchParams.get("manage") === "true"

    const context = await resolveBranchContext(supabase)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    if (manage && context.isAdmin) {
      const { data, error } = await supabase.from("branches").select("*").order("name")
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({
        branches: data || [],
        role: context.role,
        isAdmin: true,
      })
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden crear sucursales" }, { status: 403 })
    }

    const body = await request.json()
    const { name, address, phone } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("branches")
      .insert({
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, branch: data })
  } catch (error) {
    console.error("Error creating branch:", error)
    return NextResponse.json({ error: "Error al crear sucursal" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores pueden editar sucursales" }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, address, phone, is_active } = body

    if (!id) {
      return NextResponse.json({ error: "ID de sucursal requerido" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (address !== undefined) updates.address = address?.trim() || null
    if (phone !== undefined) updates.phone = phone?.trim() || null
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase.from("branches").update(updates).eq("id", id).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, branch: data })
  } catch (error) {
    console.error("Error updating branch:", error)
    return NextResponse.json({ error: "Error al actualizar sucursal" }, { status: 500 })
  }
}
