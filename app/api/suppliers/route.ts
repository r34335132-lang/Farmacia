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

    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .order("name")

    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Ejecuta scripts/030_suppliers_min_stock.sql en Supabase" },
        { status: 500 },
      )
    }

    return NextResponse.json({ suppliers: data || [] })
  } catch (error) {
    console.error("GET suppliers error:", error)
    return NextResponse.json({ error: "Error al cargar proveedores" }, { status: 500 })
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
      return NextResponse.json({ error: "Solo administradores pueden crear proveedores" }, { status: 403 })
    }

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : null
    const notes = typeof body.notes === "string" ? body.notes.trim() : null

    if (!name) {
      return NextResponse.json({ error: "Escribe el nombre del proveedor" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        phone: phone || null,
        notes: notes || null,
        is_active: true,
      })
      .select("*")
      .single()

    if (error) {
      if (error.message?.toLowerCase().includes("duplicate") || error.code === "23505") {
        return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 400 })
      }
      return NextResponse.json(
        { error: error.message, hint: "Ejecuta scripts/030_suppliers_min_stock.sql en Supabase" },
        { status: 400 },
      )
    }

    return NextResponse.json({ supplier: data })
  } catch (error) {
    console.error("POST suppliers error:", error)
    return NextResponse.json({ error: "Error al crear proveedor" }, { status: 500 })
  }
}
