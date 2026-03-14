import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET() {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // Server Component context
            }
          },
        },
      },
    )

    // Eliminamos el bucle while. Pedimos solo las últimas 2000 ventas.
    // Esto evita que el servidor se quede sin memoria o que la base de datos colapse.
    const { data, error } = await supabase
      .from("sales")
      .select(`
        *,
        profiles(full_name),
        sale_items(
          quantity,
          unit_price,
          subtotal,
          products(name, barcode)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(2000) 

    if (error) {
      console.error("Error fetching sales:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      sales: data || [],
      total: data?.length || 0,
    })
  } catch (error) {
    console.error("Error in sales API:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
