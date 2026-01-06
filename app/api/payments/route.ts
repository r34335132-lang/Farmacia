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

    let allPayments: any[] = []
    let start = 0
    const pageSize = 1000
    let hasMore = true

    // Obtener TODOS los pagos (ventas con información de pago)
    while (hasMore) {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          id,
          total_amount,
          payment_method,
          cash_received,
          change_given,
          created_at,
          profiles(full_name, email),
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
        console.error("Error fetching payments:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        allPayments = [...allPayments, ...data]
        start += pageSize

        if (data.length < pageSize) {
          hasMore = false
        }
      } else {
        hasMore = false
      }
    }

    // Calcular estadísticas de pagos
    const stats = {
      totalPayments: allPayments.length,
      totalAmount: allPayments.reduce((sum, payment) => sum + Number(payment.total_amount), 0),
      cashPayments: allPayments.filter((p) => p.payment_method === "efectivo").length,
      cardPayments: allPayments.filter((p) => p.payment_method === "tarjeta").length,
      cashAmount: allPayments
        .filter((p) => p.payment_method === "efectivo")
        .reduce((sum, payment) => sum + Number(payment.total_amount), 0),
      cardAmount: allPayments
        .filter((p) => p.payment_method === "tarjeta")
        .reduce((sum, payment) => sum + Number(payment.total_amount), 0),
    }

    return NextResponse.json({
      payments: allPayments,
      stats,
      total: allPayments.length,
    })
  } catch (error) {
    console.error("Error in payments API:", error)
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 })
  }
}
