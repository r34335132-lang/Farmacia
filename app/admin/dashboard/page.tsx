"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Package,
  ShoppingCart,
  Users,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Calendar,
  Sparkles,
  Store,
  ClipboardList,
  Wallet,
  Trophy,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NotificationManager } from "@/components/notification-manager"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMoney } from "@/lib/money"

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

interface TopProduct {
  branch_id: string
  branch_name: string
  product_id: string
  product_name: string
  barcode?: string
  qty_sold: number
  revenue: number
  rank: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const [expiringItems, setExpiringItems] = useState<any[]>([])
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [branchFilter])

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
    }
  }

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ top_limit: "5" })
      if (branchFilter !== "all") params.set("branch_id", branchFilter)

      const res = await fetch(`/api/dashboard/summary?${params}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.hint ? `${data.error}. ${data.hint}` : data.error || "Error al cargar dashboard")
      }

      setStats({
        totalProducts: Number(data.stats?.totalProducts || 0),
        lowStockProducts: Number(data.stats?.lowStockProducts || 0),
        expiringProducts: Number(data.stats?.expiringProducts || 0),
        expiredProducts: Number(data.stats?.expiredProducts || 0),
        todaySales: Number(data.stats?.todaySales || 0),
        totalRevenue: Number(data.stats?.totalRevenue || 0),
        activeCashiers: Number(data.stats?.activeCashiers || 0),
      })
      setBranchSummaries(data.branchSummaries || [])
      setLowStockItems(data.lowStockItems || [])
      setExpiringItems(data.expiringItems || [])
      setRecentSales(data.recentSales || [])
      setTopProducts(data.topProductsByBranch || [])
    } catch (err) {
      console.error("Error loading dashboard:", err)
      setError(err instanceof Error ? err.message : "Error al cargar dashboard")
    } finally {
      setLoading(false)
    }
  }

  const topByBranch = useMemo(() => {
    const map = new Map<string, { name: string; items: TopProduct[] }>()
    for (const item of topProducts) {
      if (!map.has(item.branch_id)) {
        map.set(item.branch_id, { name: item.branch_name, items: [] })
      }
      map.get(item.branch_id)!.items.push(item)
    }
    return Array.from(map.entries())
  }, [topProducts])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <img src="/logo.jpeg" alt="Farmacia Bienestar" className="h-10 w-auto rounded-full" />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-lg leading-tight text-primary">Farmacia Bienestar</h1>
              <p className="text-xs text-muted-foreground">Panel administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/pos">
              <Button variant="outline" className="border-rose-200 text-rose-800">
                <ShoppingCart className="h-4 w-4 mr-2" />
                POS
              </Button>
            </Link>
            <Button onClick={handleLogout} variant="outline">
              Cerrar Sesión
            </Button>
          </div>
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

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

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
              <div className="text-2xl font-bold">{formatMoney(stats?.totalRevenue || 0)}</div>
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
                      {branch.todaySales} · {formatMoney(branch.todayRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas del mes</span>
                    <span className="font-semibold">
                      {branch.monthSales} · {formatMoney(branch.monthRevenue)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {topByBranch.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Más vendidos del mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Aún no hay ventas suficientes este mes.</p>
              </CardContent>
            </Card>
          ) : (
            topByBranch.map(([branchId, group]) => (
              <Card key={branchId}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Más vendidos · {group.name}
                  </CardTitle>
                  <CardDescription>Top del mes por piezas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.items.map((item) => (
                    <div key={`${item.branch_id}-${item.product_id}`} className="flex items-center justify-between rounded border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          #{item.rank} {item.product_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{item.qty_sold} pzas</p>
                        <p className="text-xs text-muted-foreground">{formatMoney(item.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </div>

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
          <Link href="/admin/finanzas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Finanzas
                </CardTitle>
                <CardDescription>Utilidad, costos y gastos</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/gastos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Gastos
                </CardTitle>
                <CardDescription>Registrar nómina y operativos</CardDescription>
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
          <Link href="/admin/branches">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Gestionar Sucursales
                </CardTitle>
                <CardDescription>Crear y administrar farmacias</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/pos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-rose-200 bg-rose-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-900">
                  <ShoppingCart className="h-5 w-5" />
                  Punto de Venta
                </CardTitle>
                <CardDescription>Ir al POS (elige sucursal al entrar)</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

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
          <NotificationManager userRole="admin" />
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
                        <p className="text-sm text-muted-foreground">
                          Stock: {product.stock_quantity}
                          {product.branch_name ? ` · ${product.branch_name}` : ""}
                        </p>
                      </div>
                      <Badge variant="destructive">Bajo Stock</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                    const expirationDate = new Date(product.expiration_date)
                    const daysUntilExpiry = Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    return (
                      <div key={product.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Vence: {expirationDate.toLocaleDateString("es-ES")}
                            {product.branch_name ? ` · ${product.branch_name}` : ""}
                          </p>
                        </div>
                        <Badge className="bg-orange-500 text-white">{daysUntilExpiry}d</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
                        <p className="font-medium">{formatMoney(sale.total_amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {sale.cashier_name || "Cajero"} - {new Date(sale.created_at).toLocaleTimeString()}
                          {sale.branch_name ? ` · ${sale.branch_name}` : ""}
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
