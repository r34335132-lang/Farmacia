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

    let allProducts: any[] = []
    let start = 0
    const pageSize = 1000 // Obtener 1000 productos por vez
    let hasMore = true

    // Obtener TODOS los productos haciendo múltiples llamadas si es necesario
    while (hasMore) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name")
        .range(start, start + pageSize - 1)

      if (error) {
        console.error("Error fetching products:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data]
        start += pageSize

        // Si obtuvimos menos productos que el pageSize, ya no hay más
        if (data.length < pageSize) {
          hasMore = false
        }
      } else {
        hasMore = false
      }
    }

    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
    })
  } catch (error) {
    console.error("Error in products API:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}
