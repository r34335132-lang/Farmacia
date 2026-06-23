"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Package, ShoppingCart, Users, AlertTriangle, TrendingUp, DollarSign, Calendar, Sparkles, Store, ClipboardList } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NotificationManager } from "@/components/notification-manager"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DashboardStats {
  totalProducts: number
  lowStockProducts: number
  expiringProducts: number
  expiredProducts: number
  todaySales: number
  totalRevenue: number
  activeCashiers: number
}

interface BranchSummary {
  id: string
  name: string
  todaySales: number
  todayRevenue: number
  monthSales: number
  monthRevenue: number
  lowStock: number
  outOfStock: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const [expiringItems, setExpiringItems] = useState<any[]>([])
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [branchFilter, branches.length])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const data = await res.json()
      setBranches(data.branches || [])
    }
  }

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

  const loadDashboardData = async () => {
    try {
      const branchQuery = branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""
      const productsRes = await fetch(`/api/products${branchQuery}`)
      const productsJson = await productsRes.json()
      const products = productsJson.products || []

      const lowStock = products.filter((p: { stock_quantity: number; min_stock_level: number }) => p.stock_quantity <= p.min_stock_level)

      const today = new Date()
      const expiringProducts =
        products.filter((p: { expiration_date?: string; days_before_expiry_alert?: number }) => {
          if (!p.expiration_date) return false
          const expirationDate = new Date(p.expiration_date)
          const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          const alertThreshold = p.days_before_expiry_alert || 30
          return daysUntilExpiry > 0 && daysUntilExpiry <= alertThreshold
        }) || []

      const expiredProducts =
        products.filter((p: { expiration_date?: string }) => {
          if (!p.expiration_date) return false
          const expirationDate = new Date(p.expiration_date)
          return expirationDate < today
        }) || []

      const now = new Date()
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      const salesRes = await fetch(`/api/sales${branchQuery}`)
      const salesJson = await salesRes.json()
      const allSales = salesJson.sales || []

      const todaySales = allSales.filter(
        (sale: { created_at: string }) =>
          new Date(sale.created_at) >= todayDate && new Date(sale.created_at) < tomorrow,
      )
      const totalRevenue = todaySales.reduce(
        (sum: number, sale: { total_amount: number }) => sum + Number(sale.total_amount),
        0,
      )

      const { data: cashiers } = await supabase.from("profiles").select("*").eq("role", "cajero").eq("is_active", true)

      setStats({
        totalProducts: products.length,
        lowStockProducts: lowStock.length,
        expiringProducts: expiringProducts.length,
        expiredProducts: expiredProducts.length,
        todaySales: todaySales.length,
        totalRevenue,
        activeCashiers: cashiers?.length || 0,
      })

      setLowStockItems(lowStock.slice(0, 5))
      setExpiringItems(expiringProducts.slice(0, 5))
      setRecentSales(todaySales.slice(0, 5))

      if (branchFilter === "all") {
        const allProductsRes = await fetch("/api/products")
        const allProductsJson = await allProductsRes.json()
        const allProducts = allProductsJson.products || []
        const allSalesRes = await fetch("/api/sales")
        const allSalesJson = await allSalesRes.json()
        const globalSales = allSalesJson.sales || []

        const summaries = branches.map((branch) => {
          const branchProducts = allProducts.filter((p: { branch_id: string }) => p.branch_id === branch.id)
          const branchSales = globalSales.filter((sale: { branch_id: string }) => sale.branch_id === branch.id)
          const branchTodaySales = branchSales.filter(
            (sale: { created_at: string }) =>
              new Date(sale.created_at) >= todayDate && new Date(sale.created_at) < tomorrow,
          )
          const branchMonthSales = branchSales.filter(
            (sale: { created_at: string }) => new Date(sale.created_at) >= monthStart,
          )

          return {
            id: branch.id,
            name: branch.name,
            todaySales: branchTodaySales.length,
            todayRevenue: branchTodaySales.reduce(
              (sum: number, sale: { total_amount: number }) => sum + Number(sale.total_amount),
              0,
            ),
            monthSales: branchMonthSales.length,
            monthRevenue: branchMonthSales.reduce(
              (sum: number, sale: { total_amount: number }) => sum + Number(sale.total_amount),
              0,
            ),
            lowStock: branchProducts.filter(
              (p: { stock_quantity: number; min_stock_level: number }) => p.stock_quantity <= p.min_stock_level && p.stock_quantity > 0,
            ).length,
            outOfStock: branchProducts.filter((p: { stock_quantity: number }) => p.stock_quantity === 0).length,
          }
        })

        setBranchSummaries(summaries)
      } else {
        setBranchSummaries([])
      }
    } catch (error) {
      console.error("Error loading dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header con logo */}
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <img src="/logo.jpeg" alt="Farmacia Bienestar" className="h-10 w-auto rounded-full" />
          </div>
          <Button onClick={handleLogout} variant="outline">
            Cerrar Sesión
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Panel administrativo</h2>
            <p className="text-sm text-muted-foreground">
              {branchFilter === "all" ? "Vista global de todas las farmacias" : "Vista filtrada por sucursal"}
            </p>
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Filtrar sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.lowStockProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Por Vencer</CardTitle>
              <Calendar className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{stats?.expiringProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.expiredProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.todaySales}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos Hoy</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalRevenue.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cajeros Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeCashiers}</div>
            </CardContent>
          </Card>
        </div>

        {branchFilter === "all" && branchSummaries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {branchSummaries.map((branch) => (
              <Card key={branch.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Store className="h-4 w-4" />
                    {branch.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Ventas hoy</span>
                    <span className="font-semibold">
                      {branch.todaySales} · ${branch.todayRevenue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas del mes</span>
                    <span className="font-semibold">
                      {branch.monthSales} · ${branch.monthRevenue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stock bajo</span>
                    <span className="font-semibold text-orange-600">{branch.lowStock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Agotados</span>
                    <span className="font-semibold text-destructive">{branch.outOfStock}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/admin/products">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Gestionar Productos
                </CardTitle>
                <CardDescription>Agregar, editar y ver inventario</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/sales">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Reportes de Ventas
                </CardTitle>
                <CardDescription>Ver historial y estadísticas</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Gestionar Usuarios
                </CardTitle>
                <CardDescription>Administrar cajeros y permisos</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/pos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Punto de Venta
                </CardTitle>
                <CardDescription>Ir al sistema de cobro</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* Online Store Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/tienda">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Store className="h-5 w-5" />
                  Tienda Online
                </CardTitle>
                <CardDescription>Ver la tienda publica</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/orders">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <ClipboardList className="h-5 w-5" />
                  Pedidos Online
                </CardTitle>
                <CardDescription>Gestionar pedidos de clientes</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/promotions">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  Promociones
                </CardTitle>
                <CardDescription>Crear y gestionar ofertas</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/cajero">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <ClipboardList className="h-5 w-5" />
                  Panel Cajero
                </CardTitle>
                <CardDescription>Dashboard para atender pedidos</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Notification Manager */}
          <NotificationManager userRole="admin" />

          {/* Low Stock Alert */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Productos con Stock Bajo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <p className="text-muted-foreground">No hay productos con stock bajo</p>
              ) : (
                <div className="space-y-2">
                  {lowStockItems.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">Stock: {product.stock_quantity}</p>
                      </div>
                      <Badge variant="destructive">Bajo Stock</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expiring Products Alert */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-500" />
                Productos por Vencer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expiringItems.length === 0 ? (
                <p className="text-muted-foreground">No hay productos por vencer</p>
              ) : (
                <div className="space-y-2">
                  {expiringItems.map((product) => {
                    const today = new Date()
                    const expirationDate = new Date(product.expiration_date)
                    const daysUntilExpiry = Math.ceil(
                      (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
                    )

                    return (
                      <div key={product.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Vence: {expirationDate.toLocaleDateString("es-ES")}
                          </p>
                        </div>
                        <Badge variant="warning" className="bg-orange-500 text-white">
                          {daysUntilExpiry}d
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Sales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Ventas Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <p className="text-muted-foreground">No hay ventas hoy</p>
              ) : (
                <div className="space-y-2">
                  {recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">${sale.total_amount}</p>
                        <p className="text-sm text-muted-foreground">
                          {sale.profiles?.full_name} - {new Date(sale.created_at).toLocaleTimeString()}
                          {sale.branches && !Array.isArray(sale.branches) ? ` · ${sale.branches.name}` : ""}
                          {Array.isArray(sale.branches) && sale.branches[0] ? ` · ${sale.branches[0].name}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{sale.payment_method}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
