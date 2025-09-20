"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Download, Calendar, DollarSign, ShoppingCart, TrendingUp } from "lucide-react"
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
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          *,
          profiles(full_name),
          sale_items(
            quantity,
            unit_price,
            products(name)
          )
        `)
        .order("created_at", { ascending: false })

      setSales(salesData || [])
    } catch (error) {
      console.error("Error loading sales:", error)
    } finally {
      setLoading(false)
    }
  }

  const filterSales = () => {
    let filtered = [...sales]

    // Date filter
    const now = new Date()
    if (dateFilter === "today") {
      const today = now.toISOString().split("T")[0]
      filtered = filtered.filter((sale) => sale.created_at.startsWith(today))
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
          return "Hoy"
        case "week":
          return "Última semana"
        case "month":
          return "Último mes"
        case "all":
          return "Todas las ventas"
        default:
          return "Filtro personalizado"
      }
    }

    const getPaymentFilterDescription = () => {
      switch (paymentFilter) {
        case "all":
          return "Todos los métodos"
        case "efectivo":
          return "Solo efectivo"
        case "tarjeta":
          return "Solo tarjeta"
        default:
          return paymentFilter
      }
    }

    const reportContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Reporte de Ventas - Farmacia Solidaria</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body { 
            font-family: Arial, sans-serif; 
            font-size: 12px;
            background: white;
            color: #000;
            line-height: 1.4;
            width: 100%;
            max-width: 100%;
        }
        .container {
            width: 100%;
            max-width: 100%;
            padding: 15px;
        }
        .header { 
            border-bottom: 2px solid #000; 
            padding-bottom: 15px; 
            margin-bottom: 20px;
            width: 100%;
        }
        .logo-text { 
            font-size: 24px; 
            font-weight: bold; 
            margin-bottom: 5px;
            width: 100%;
        }
        .subtitle { 
            font-size: 14px; 
            margin-bottom: 10px;
            color: #666;
            width: 100%;
        }
        .report-info {
            background: #f5f5f5;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 5px;
            width: 100%;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 15px;
            width: 100%;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            width: 100%;
        }
        .info-label {
            font-weight: bold;
        }
        .stats-section {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
            width: 100%;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #dee2e6;
            width: 100%;
        }
        .stat-title {
            font-size: 11px;
            color: #666;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: #333;
        }
        .sales-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            table-layout: fixed;
        }
        .sales-table th,
        .sales-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
            word-wrap: break-word;
        }
        .sales-table th {
            background-color: #f2f2f2;
            font-weight: bold;
        }
        .sales-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .sales-table th:nth-child(1),
        .sales-table td:nth-child(1) { width: 12%; }
        .sales-table th:nth-child(2),
        .sales-table td:nth-child(2) { width: 15%; }
        .sales-table th:nth-child(3),
        .sales-table td:nth-child(3) { width: 18%; }
        .sales-table th:nth-child(4),
        .sales-table td:nth-child(4) { width: 30%; }
        .sales-table th:nth-child(5),
        .sales-table td:nth-child(5) { width: 12%; }
        .sales-table th:nth-child(6),
        .sales-table td:nth-child(6) { width: 13%; }
        .payment-method {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
        }
        .payment-efectivo {
            background-color: #d4edda;
            color: #155724;
        }
        .payment-tarjeta {
            background-color: #d1ecf1;
            color: #0c5460;
        }
        .footer {
            margin-top: 30px;
            border-top: 1px solid #ddd;
            padding-top: 15px;
            font-size: 11px;
            color: #666;
            width: 100%;
        }
        @media print {
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            html, body { 
                margin: 0 !important; 
                padding: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
            }
            .container {
                width: 100% !important;
                max-width: 100% !important;
                padding: 10mm !important;
                box-sizing: border-box !important;
            }
            .stats-section { 
                grid-template-columns: repeat(2, 1fr); 
            }
            @page { 
                margin: 0.5cm; 
                size: A4 landscape;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-text">FARMACIA SOLIDARIA</div>
            <div class="subtitle">Reporte de Ventas</div>
            <div style="font-size: 12px; color: #666;">
                Generado el ${new Date().toLocaleString("es-ES")}
            </div>
        </div>

        <div class="report-info">
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Período:</span>
                    <span>${getFilterDescription()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Método de pago:</span>
                    <span>${getPaymentFilterDescription()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Búsqueda:</span>
                    <span>${searchTerm || "Sin filtro"}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Total de ventas:</span>
                    <span>${filteredSales.length} registros</span>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stat-card">
                <div class="stat-title">Total Ventas</div>
                <div class="stat-value">${filteredSales.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Ingresos Totales</div>
                <div class="stat-value">$${getTotalRevenue().toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Ticket Promedio</div>
                <div class="stat-value">$${getAverageTicket().toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Efectivo vs Tarjeta</div>
                <div class="stat-value" style="font-size: 14px;">
                    ${filteredSales.filter((s) => s.payment_method === "efectivo").length} / ${filteredSales.filter((s) => s.payment_method === "tarjeta").length}
                </div>
            </div>
        </div>

        ${
          filteredSales.length > 0
            ? `
        <table class="sales-table">
            <thead>
                <tr>
                    <th>ID Venta</th>
                    <th>Fecha</th>
                    <th>Cajero</th>
                    <th>Productos</th>
                    <th>Método Pago</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${filteredSales
                  .map(
                    (sale) => `
                <tr>
                    <td>#${sale.id.slice(-8)}</td>
                    <td>${new Date(sale.created_at).toLocaleDateString("es-ES")}<br>
                        <small>${new Date(sale.created_at).toLocaleTimeString("es-ES")}</small>
                    </td>
                    <td>${sale.profiles?.full_name || "N/A"}</td>
                    <td style="font-size: 10px;">
                        ${sale.sale_items?.map((item) => `${item.products?.name} (x${item.quantity})`).join(", ") || "N/A"}
                    </td>
                    <td>
                        <span class="payment-method payment-${sale.payment_method}">
                            ${sale.payment_method.toUpperCase()}
                        </span>
                    </td>
                    <td style="font-weight: bold;">$${Number(sale.total_amount).toFixed(2)}</td>
                </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
        `
            : `
        <div style="text-align: center; padding: 40px; color: #666;">
            <h3>No se encontraron ventas</h3>
            <p>No hay ventas que coincidan con los filtros aplicados.</p>
        </div>
        `
        }

        <div class="footer">
            <div>
                <strong>Farmacia Solidaria</strong><br>
                Cuidando la salud de nuestra comunidad<br>
                Dirección: Calle Principal #123 | Tel: (555) 123-4567<br>
                www.farmaciasolidaria.com
            </div>
            <div style="margin-top: 10px;">
                Sistema POS - Farmacia Solidaria v1.0
            </div>
        </div>
    </div>
</body>
</html>
    `

    const printWindow = window.open("", "_blank", "width=1200,height=800")
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
                    <div className="text-right">
                      <p className="text-lg font-bold">${sale.total_amount}</p>
                      <Badge variant={sale.payment_method === "efectivo" ? "default" : "secondary"}>
                        {sale.payment_method}
                      </Badge>
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
