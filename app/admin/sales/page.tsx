"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Calendar, DollarSign, ShoppingCart, TrendingUp, Trash2, Printer } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface Sale {
  id: string
  total_amount: number
  payment_method: string
  created_at: string
  profiles: {
    full_name: string
  }
  sale_items: {
    quantity: number
    unit_price: number
    products: {
      name: string
    }
  }[]
}

interface PaymentStats {
  total: number
  totalCash: number
  totalCard: number
  countCash: number
  countCard: number
}

export default function SalesReports() {
  const [sales, setSales] = useState<Sale[]>([])
  const [filteredSales, setFilteredSales] = useState<Sale[]>([])
  const [salesByDay, setSalesByDay] = useState<{ [key: string]: Sale[] }>({})
  const [chartData, setChartData] = useState<any[]>([])
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState("today")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const router = useRouter()
  const supabase = createClient()

  const totalRevenue = () => {
    return filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
  }

  useEffect(() => {
    checkAuth()
    loadSales()
    loadPaymentStats()
  }, [])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") {
      router.push("/pos")
      return
    }
  }

  const loadSales = async () => {
    try {
      const response = await fetch("/api/sales")
      if (!response.ok) throw new Error("Failed to fetch sales")

      const data = await response.json()
      setSales(data.sales || [])
    } catch (error) {
      console.error("Error loading sales:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadPaymentStats = async () => {
    try {
      const response = await fetch("/api/payments")
      if (!response.ok) throw new Error("Failed to fetch payment stats")

      const data = await response.json()
      setPaymentStats(data)
    } catch (error) {
      console.error("Error loading payment stats:", error)
    }
  }

  const filterSales = () => {
    let filtered = [...sales]

    const now = new Date()
    if (dateFilter === "today") {
      // Get today's date in local timezone
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

      filtered = filtered.filter((sale) => {
        const saleDate = new Date(sale.created_at)
        return saleDate >= today && saleDate < tomorrow
      })
    } else if (dateFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= weekAgo)
    } else if (dateFilter === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= monthAgo)
    }

    // Payment method filter
    if (paymentFilter !== "all") {
      filtered = filtered.filter((sale) => sale.payment_method === paymentFilter)
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (sale) =>
          sale.profiles?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sale.id.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    setFilteredSales(filtered)

    const grouped = filtered.reduce((acc: { [key: string]: Sale[] }, sale) => {
      const date = new Date(sale.created_at).toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(sale)
      return acc
    }, {})

    setSalesByDay(grouped)

    const chartDataMap = filtered.reduce(
      (acc: { [key: string]: { date: string; ventas: number; total: number; count: number } }, sale) => {
        const dateKey = new Date(sale.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        })

        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            ventas: 0,
            total: 0,
            count: 0,
          }
        }

        acc[dateKey].ventas += Number(sale.total_amount)
        acc[dateKey].total += Number(sale.total_amount)
        acc[dateKey].count += 1

        return acc
      },
      {},
    )

    const chartDataArray = Object.values(chartDataMap).sort((a, b) => {
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)
      return dateA.getTime() - dateB.getTime()
    })

    setChartData(chartDataArray)
  }

  const getAverageTicket = () => {
    if (filteredSales.length === 0) return 0
    return totalRevenue() / filteredSales.length
  }

  const generateSalesReport = () => {
    const getFilterDescription = () => {
      switch (dateFilter) {
        case "today":
          return "HOY"
        case "week":
          return "ULTIMA SEMANA"
        case "month":
          return "ULTIMO MES"
        case "all":
          return "TODAS LAS VENTAS"
        default:
          return "FILTRO PERSONALIZADO"
      }
    }

    const totalRevenueValue = totalRevenue()
    const reportNumber = Math.floor(Math.random() * 1000) + 1

    const reportContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Corte del Turno - Farmacia Solidaria</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 13px;
            margin: 0 !important; 
            padding: 0 !important;
            width: 55mm;
            max-width: 55mm;
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .content {
            width: 100%;
            max-width: 55mm;
            margin: 0;
            padding: 2mm;
            box-sizing: border-box;
        }
        .center {
            text-align: center;
            margin-bottom: 5px;
            width: 100%;
        }
        .title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 5px;
            width: 100%;
        }
        .subtitle {
            font-size: 13px;
            margin-bottom: 10px;
            width: 100%;
        }
        .line {
            border-bottom: 1px solid #000;
            margin: 8px 0;
            width: 100%;
        }
        .double-line {
            border-bottom: 2px solid #000;
            margin: 10px 0;
            width: 100%;
        }
        .dashed-line {
            border-bottom: 1px dashed #000;
            margin: 5px 0;
            width: 100%;
        }
        .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-size: 12px;
            width: 100%;
        }
        .item-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
            font-size: 11px;
            width: 100%;
        }
        .section-title {
            text-align: center;
            font-weight: bold;
            margin: 15px 0 10px 0;
            padding: 0 2px;
            font-size: 13px;
            width: 100%;
        }
        .section-title::before,
        .section-title::after {
            content: "== ";
        }
        .section-title::after {
            content: " ==";
        }
        .right-align {
            text-align: right;
        }
        .bold {
            font-weight: bold;
        }
        .small {
            font-size: 10px;
        }
        .footer-logo {
            margin-top: 10px;
            text-align: center;
            width: 100%;
        }
        .footer-logo img {
            width: 100%;
            max-width: 51mm;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        @media print {
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 55mm !important;
                max-width: 55mm !important;
            }
            .content { 
                width: 55mm !important;
                max-width: 55mm !important;
                margin: 0 !important;
                padding: 2mm !important;
                box-sizing: border-box !important;
            }
            @page {
                size: 55mm auto;
                margin: 0 !important;
            }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="center title">CORTE DEL TURNO</div>
        <div class="center">CORTE DE TURNO #${reportNumber}</div>
        
        <div class="line"></div>
        
        <div class="row">
            <span>REALIZADO:</span>
            <span>${new Date().toLocaleDateString("es-ES")} ${new Date().toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>ADMINISTRADOR</span>
        </div>
        <div class="row">
            <span>VENTAS TOTALES:</span>
            <span class="right-align">$${totalRevenueValue.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>GANANCIA:</span>
            <span class="right-align">$${(totalRevenueValue * 0.3).toFixed(2)}</span>
        </div>
        
        <div class="center" style="margin: 15px 0;">
            <strong>${filteredSales.length} VENTAS EN EL TURNO.</strong>
        </div>
        
        <div class="section-title">DINERO EN CAJA</div>
        
        <div class="row">
            <span>FONDO DE CAJA:</span>
            <span class="right-align">$500.00</span>
        </div>
        <div class="row">
            <span>VENTAS EN EFECTIVO:</span>
            <span class="right-align">+ $${paymentStats?.totalCash.toFixed(2) || "0.00"}</span>
        </div>
        <div class="row">
            <span>ABONOS EN EFECTIVO:</span>
            <span class="right-align">+ $0.00</span>
        </div>
        <div class="row">
            <span>ENTRADAS:</span>
            <span class="right-align">+ $0.00</span>
        </div>
        <div class="row">
            <span>SALIDAS:</span>
            <span class="right-align">- $0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>EFECTIVO EN CAJA =</span>
            <span class="right-align">$${(500 + (paymentStats?.totalCash || 0)).toFixed(2)}</span>
        </div>
        
        <div class="section-title">ENTRADAS EFECTIVO</div>
        
        <div class="row">
            <span>ENTRADA DE DINERO</span>
            <span class="right-align">$0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>TOTAL ENTRADAS</span>
            <span class="right-align">= $0.00</span>
        </div>
        
        <div class="section-title">SALIDAS EFECTIVO</div>
        
        <div class="row">
            <span>SALIDA DE CAJA</span>
            <span class="right-align">$0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>TOTAL SALIDAS</span>
            <span class="right-align">$0.00</span>
        </div>
        
        <div class="section-title">VENTAS</div>
        
        <div class="row">
            <span>EN EFECTIVO</span>
            <span class="right-align">$${paymentStats?.totalCash.toFixed(2) || "0.00"}</span>
        </div>
        <div class="row">
            <span>CON TARJETA</span>
            <span class="right-align">$${paymentStats?.totalCard.toFixed(2) || "0.00"}</span>
        </div>
        <div class="row">
            <span>A CREDITO</span>
            <span class="right-align">$0.00</span>
        </div>
        <div class="row">
            <span>CON VALES</span>
            <span class="right-align">$0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>TOTAL VENTAS</span>
            <span class="right-align">$${totalRevenueValue.toFixed(2)}</span>
        </div>
        
        <div class="section-title">VENTAS POR DEPTO</div>
        
        <div class="row">
            <span>MEDICAMENTOS</span>
            <span class="right-align">$${(totalRevenueValue * 0.6).toFixed(2)}</span>
        </div>
        <div class="row">
            <span>CUIDADO PERSONAL</span>
            <span class="right-align">$${(totalRevenueValue * 0.25).toFixed(2)}</span>
        </div>
        <div class="row">
            <span>VITAMINAS</span>
            <span class="right-align">$${(totalRevenueValue * 0.15).toFixed(2)}</span>
        </div>
        
        <div class="double-line"></div>
        
        <div class="center small" style="margin-top: 15px;">
            <div><strong>FARMACIA SOLIDARIA</strong></div>
            <div>Cuidando la salud de nuestra comunidad</div>
            <div>Tel: (555) 123-4567</div>
            <div style="margin-top: 8px;">
                Período: ${getFilterDescription()}<br>
                ${paymentStats?.countCash || 0} ventas efectivo, ${paymentStats?.countCard || 0} ventas tarjeta
            </div>
            <div style="margin-top: 8px; font-size: 9px;">
                Ticket generado el ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Solidaria v1.0
            </div>
            
            <div class="footer-logo">
                <img src="/solidaria.jpg" alt="Logo Solidaria Salud" />
            </div>
        </div>
    </div>
</body>
</html>
    `

    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (printWindow) {
      printWindow.document.write(reportContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }

  const cancelSale = async (saleId: string) => {
    if (!confirm("¿Estás seguro de que quieres cancelar esta venta? Esta acción no se puede deshacer.")) {
      return
    }

    try {
      // Fetch sale items first to get product quantities before deletion
      const { data: saleItems, error: fetchError } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", saleId)

      if (fetchError) throw fetchError

      // Get current user for stock movement record
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Restore inventory for each product
      for (const item of saleItems || []) {
        // Get current stock quantity
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single()

        // Update stock by adding back the sold quantity
        await supabase
          .from("products")
          .update({
            stock_quantity: (product?.stock_quantity || 0) + item.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.product_id)

        // Create reverse stock movement record for audit trail
        await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          movement_type: "entrada",
          quantity: item.quantity,
          reason: `Devolución por cancelación de Venta #${saleId.slice(-8)}`,
          user_id: user?.id,
        })
      }

      // Delete sale items first (foreign key constraint)
      await supabase.from("sale_items").delete().eq("sale_id", saleId)

      // Then delete the sale
      const { error } = await supabase.from("sales").delete().eq("id", saleId)

      if (error) throw error

      // Reload sales to update the list
      loadSales()
      alert("Venta cancelada exitosamente y stock restaurado")
    } catch (error) {
      console.error("Error canceling sale:", error)
      alert("Error al cancelar la venta")
    }
  }

  const reprintTicket = (sale: Sale) => {
    const ticketContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Ticket de Venta - Farmacia Solidaria</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 13px;
            margin: 0 !important; 
            padding: 0 !important;
            width: 55mm;
            max-width: 55mm;
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .content {
            width: 100%;
            max-width: 55mm;
            margin: 0;
            padding: 2mm;
            box-sizing: border-box;
        }
        .center {
            text-align: center;
            margin-bottom: 5px;
            width: 100%;
        }
        .title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 5px;
            width: 100%;
        }
        .line {
            border-bottom: 1px solid #000;
            margin: 8px 0;
            width: 100%;
        }
        .dashed-line {
            border-bottom: 1px dashed #000;
            margin: 5px 0;
            width: 100%;
        }
        .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-size: 12px;
            width: 100%;
        }
        .item-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
            font-size: 11px;
            width: 100%;
        }
        .right-align {
            text-align: right;
        }
        .bold {
            font-weight: bold;
        }
        .small {
            font-size: 10px;
        }
        @media print {
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 55mm !important;
                max-width: 55mm !important;
            }
            .content { 
                width: 55mm !important;
                max-width: 55mm !important;
                margin: 0 !important;
                padding: 2mm !important;
                box-sizing: border-box !important;
            }
            @page {
                size: 55mm auto;
                margin: 0 !important;
            }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="center title">FARMACIA SOLIDARIA</div>
        <div class="center small">Cuidando la salud de nuestra comunidad</div>
        <div class="center small">Tel: (555) 123-4567</div>
        
        <div class="line"></div>
        
        <div class="row">
            <span>TICKET:</span>
            <span>#${sale.id.slice(-8)}</span>
        </div>
        <div class="row">
            <span>FECHA:</span>
            <span>${new Date(sale.created_at).toLocaleDateString("es-ES")}</span>
        </div>
        <div class="row">
            <span>HORA:</span>
            <span>${new Date(sale.created_at).toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>${sale.profiles?.full_name || "N/A"}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small bold">PRODUCTOS</div>
        
        ${
          sale.sale_items
            ?.map(
              (item) => `
        <div class="item-row">
            <span>${item.products?.name || "Producto"}</span>
            <span></span>
        </div>
        <div class="item-row">
            <span>  ${item.quantity} x $${item.unit_price.toFixed(2)}</span>
            <span class="right-align">$${(item.quantity * item.unit_price).toFixed(2)}</span>
        </div>
        `,
            )
            .join("") || ""
        }
        
        <div class="dashed-line"></div>
        
        <div class="row bold">
            <span>TOTAL:</span>
            <span class="right-align">$${Number(sale.total_amount).toFixed(2)}</span>
        </div>
        
        <div class="row">
            <span>PAGO:</span>
            <span class="right-align">${sale.payment_method.toUpperCase()}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small" style="margin-top: 10px;">
            <div><strong>¡GRACIAS POR SU COMPRA!</strong></div>
            <div>Conserve su ticket</div>
            <div style="margin-top: 8px; font-size: 9px;">
                REIMPRESIÓN - ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Solidaria v1.0
            </div>
        </div>
    </div>
</body>
</html>
    `

    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (printWindow) {
      printWindow.document.write(ticketContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }

  useEffect(() => {
    if (sales.length > 0) {
      filterSales()
    }
  }, [dateFilter, paymentFilter, searchTerm, sales])

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg">Cargando ventas...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header con logo */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <img src="/solidaria.jpg" alt="Logo Farmacia" className="h-10 w-auto" />
            <h1 className="text-xl font-bold">Reportes de Ventas</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={generateSalesReport} variant="default" className="gap-2">
              <Printer className="h-4 w-4" />
              Corte de Caja
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {paymentStats && (
            <Card className="mb-6 border-maroon-200 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-maroon-600 to-maroon-700 text-white">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Estadísticas de Pagos (Todas las Ventas)
                </CardTitle>
                <CardDescription className="text-maroon-100">Resumen de métodos de pago</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-maroon-50 rounded-lg">
                    <div className="text-sm text-maroon-600 mb-1">Total General</div>
                    <div className="text-2xl font-bold text-maroon-800">{paymentStats.total.toFixed(2)}</div>
                    <div className="text-xs text-maroon-500 mt-1">
                      {paymentStats.countCash + paymentStats.countCard} ventas
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-green-600 mb-1">Efectivo</div>
                    <div className="text-2xl font-bold text-green-800">{paymentStats.totalCash.toFixed(2)}</div>
                    <div className="text-xs text-green-600 mt-1">{paymentStats.countCash} ventas</div>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-600 mb-1">Tarjeta</div>
                    <div className="text-2xl font-bold text-blue-800">{paymentStats.totalCard.toFixed(2)}</div>
                    <div className="text-xs text-blue-600 mt-1">{paymentStats.countCard} ventas</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredSales.length}</div>
              <p className="text-xs text-muted-foreground">transacciones completadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRevenue().toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">en ventas realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getAverageTicket().toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">por transacción</p>
            </CardContent>
          </Card>
        </div>

        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Gráfica de Ventas por Día
              </CardTitle>
              <CardDescription>
                Visualización de las ventas diarias. Los días con más ventas indican días fuertes de actividad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" style={{ fontSize: "12px" }} angle={-45} textAnchor="end" height={80} />
                    <YAxis style={{ fontSize: "12px" }} tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                              <p className="font-semibold mb-1">{payload[0].payload.date}</p>
                              <p className="text-sm text-muted-foreground">{payload[0].payload.count} ventas</p>
                              <p className="text-lg font-bold text-primary">${Number(payload[0].value).toFixed(2)}</p>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar dataKey="ventas" fill="hsl(var(--primary))" name="Total de Ventas" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {chartData.length > 0 && (
                  <p>
                    Mostrando {chartData.length} día(s) con actividad. Las barras más altas representan los días más
                    fuertes en ventas.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Última Semana</SelectItem>
                    <SelectItem value="month">Último Mes</SelectItem>
                    <SelectItem value="all">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Método de Pago</label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <Input
                  placeholder="Buscar por cajero o ticket..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales grouped by day */}
        {Object.keys(salesByDay).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No hay ventas</p>
              <p className="text-sm text-muted-foreground">No se encontraron ventas con los filtros seleccionados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(salesByDay)
              .sort(([dateA], [dateB]) => {
                // Sort by date descending (most recent first)
                return new Date(dateB).getTime() - new Date(dateA).getTime()
              })
              .map(([date, daySales]) => {
                const dayTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
                return (
                  <Card key={date}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-primary" />
                          <div>
                            <CardTitle className="text-xl capitalize">{date}</CardTitle>
                            <CardDescription>
                              {daySales.length} {daySales.length === 1 ? "venta" : "ventas"} registradas
                            </CardDescription>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">{dayTotal.toFixed(2)}</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {daySales.map((sale) => (
                          <div
                            key={sale.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">#{sale.id.slice(-8)}</span>
                                <Badge variant={sale.payment_method === "efectivo" ? "default" : "secondary"}>
                                  {sale.payment_method}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(sale.created_at).toLocaleTimeString("es-ES", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {" • "}
                                {sale.profiles?.full_name || "N/A"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {sale.sale_items?.length || 0}{" "}
                                {sale.sale_items?.length === 1 ? "producto" : "productos"}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-xl font-bold">{Number(sale.total_amount).toFixed(2)}</div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => reprintTicket(sale)}
                                  title="Reimprimir ticket"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => cancelSale(sale.id)}
                                  title="Cancelar venta"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
