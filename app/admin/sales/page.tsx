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
          <Button variant="outline">
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
