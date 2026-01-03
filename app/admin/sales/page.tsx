"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Download, Calendar, DollarSign, ShoppingCart, TrendingUp, Trash2, Printer } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

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

export default function SalesReports() {
  const [sales, setSales] = useState<Sale[]>([])
  const [filteredSales, setFilteredSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState("today")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
    loadSales()
  }, [])

  useEffect(() => {
    filterSales()
  }, [sales, dateFilter, paymentFilter, searchTerm])

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
  }

  const getTotalRevenue = () => {
    return filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
  }

  const getAverageTicket = () => {
    if (filteredSales.length === 0) return 0
    return getTotalRevenue() / filteredSales.length
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

    const getPaymentStats = () => {
      const efectivo = filteredSales.filter((s) => s.payment_method === "efectivo")
      const tarjeta = filteredSales.filter((s) => s.payment_method === "tarjeta")

      return {
        efectivoCount: efectivo.length,
        efectivoTotal: efectivo.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
        tarjetaCount: tarjeta.length,
        tarjetaTotal: tarjeta.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
      }
    }

    const paymentStats = getPaymentStats()
    const totalRevenue = getTotalRevenue()
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
            <span class="right-align">$${totalRevenue.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>GANANCIA:</span>
            <span class="right-align">$${(totalRevenue * 0.3).toFixed(2)}</span>
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
            <span class="right-align">+ $${paymentStats.efectivoTotal.toFixed(2)}</span>
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
            <span class="right-align">$${(200 + paymentStats.efectivoTotal).toFixed(2)}</span>
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
            <span class="right-align">$${paymentStats.efectivoTotal.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>CON TARJETA</span>
            <span class="right-align">$${paymentStats.tarjetaTotal.toFixed(2)}</span>
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
            <span class="right-align">$${totalRevenue.toFixed(2)}</span>
        </div>
        
        <div class="section-title">VENTAS POR DEPTO</div>
        
        <div class="row">
            <span>MEDICAMENTOS</span>
            <span class="right-align">$${(totalRevenue * 0.6).toFixed(2)}</span>
        </div>
        <div class="row">
            <span>CUIDADO PERSONAL</span>
            <span class="right-align">$${(totalRevenue * 0.25).toFixed(2)}</span>
        </div>
        <div class="row">
            <span>VITAMINAS</span>
            <span class="right-align">$${(totalRevenue * 0.15).toFixed(2)}</span>
        </div>
        
        <div class="double-line"></div>
        
        <div class="center small" style="margin-top: 15px;">
            <div><strong>FARMACIA SOLIDARIA</strong></div>
            <div>Cuidando la salud de nuestra comunidad</div>
            <div>Tel: (555) 123-4567</div>
            <div style="margin-top: 8px;">
                Período: ${getFilterDescription()}<br>
                ${paymentStats.efectivoCount} ventas efectivo, ${paymentStats.tarjetaCount} ventas tarjeta
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando reportes...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-primary">Reportes de Ventas</h1>
          </div>
          <Button variant="outline" onClick={generateSalesReport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredSales.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${getTotalRevenue().toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${getAverageTicket().toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Efectivo vs Tarjeta</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <div>Efectivo: {filteredSales.filter((s) => s.payment_method === "efectivo").length}</div>
                <div>Tarjeta: {filteredSales.filter((s) => s.payment_method === "tarjeta").length}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Período</label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Última semana</SelectItem>
                    <SelectItem value="month">Último mes</SelectItem>
                    <SelectItem value="all">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Método de Pago</label>
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

              <div>
                <label className="text-sm font-medium mb-2 block">Buscar</label>
                <Input
                  placeholder="Cajero o ID de venta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales List */}
        <Card>
          <CardHeader>
            <CardTitle>Historial de Ventas</CardTitle>
            <CardDescription>Mostrando {filteredSales.length} ventas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredSales.map((sale) => (
                <div key={sale.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium">Venta #{sale.id.slice(-8)}</p>
                        <p className="text-sm text-muted-foreground">
                          {sale.profiles?.full_name} - {new Date(sale.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-4">
                        <p className="text-lg font-bold">${sale.total_amount}</p>
                        <Badge variant={sale.payment_method === "efectivo" ? "default" : "secondary"}>
                          {sale.payment_method}
                        </Badge>
                      </div>
                      {/* Action buttons for each sale */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reprintTicket(sale)}
                          title="Reimprimir ticket"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelSale(sale.id)}
                          title="Cancelar venta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <p className="text-sm font-medium mb-1">Productos:</p>
                    <div className="text-sm text-muted-foreground">
                      {sale.sale_items?.map((item, index) => (
                        <span key={index}>
                          {item.products?.name} (x{item.quantity}){index < sale.sale_items.length - 1 && ", "}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {filteredSales.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron ventas con los filtros aplicados
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
