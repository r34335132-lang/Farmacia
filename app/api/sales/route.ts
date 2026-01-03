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
              // The `setAll` method was called from a Server Component.
            }
          },
        },
      },
    )

    let allSales: any[] = []
    let start = 0
    const pageSize = 1000 // Obtener 1000 ventas por vez
    let hasMore = true

    // Obtener TODAS las ventas haciendo múltiples llamadas si es necesario
    while (hasMore) {
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
        .range(start, start + pageSize - 1)

      if (error) {
        console.error("Error fetching sales:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        allSales = [...allSales, ...data]
        start += pageSize

        // Si obtuvimos menos ventas que el pageSize, ya no hay más
        if (data.length < pageSize) {
          hasMore = false
        }
      } else {
        hasMore = false
      }
    }

    return NextResponse.json({
      sales: allSales,
      total: allSales.length,
    })
  } catch (error) {
    console.error("Error in sales API:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
