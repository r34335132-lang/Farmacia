"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
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
  Truck,
  ClipboardCheck,
  ScrollText,
  Percent,
  History,
  ClipboardPenLine,
  ArrowRightLeft,
  PiggyBank,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NotificationManager } from "@/components/notification-manager"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

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

function KpiCard({
  title,
  value,
  icon: Icon,
  valueClassName,
}: {
  title: string
  value: ReactNode
  icon: LucideIcon
  valueClassName?: string
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-xl font-bold tracking-tight sm:text-2xl", valueClassName)}>{value}</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function NavCard({
  href,
  title,
  description,
  icon: Icon,
  tone = "default",
}: {
  href: string
  title: string
  description: string
  icon: LucideIcon
  tone?: "default" | "pos" | "store"
}) {
  return (
    <Link href={href} className="block h-full">
      <Card
        className={cn(
          "h-full transition-shadow hover:shadow-md",
          tone === "pos" && "border-rose-200 bg-rose-50/50",
          tone === "store" && "border-primary/20 bg-primary/5",
        )}
      >
        <CardHeader className="space-y-3 p-4">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              tone === "pos" && "bg-rose-100 text-rose-800",
              tone === "store" && "bg-primary/10 text-primary",
              tone === "default" && "bg-muted text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle
              className={cn(
                "text-base leading-tight",
                tone === "pos" && "text-rose-900",
                tone === "store" && "text-primary",
              )}
            >
              {title}
            </CardTitle>
            <CardDescription className="text-xs leading-snug">{description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-muted-foreground">Cargando dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.jpeg" alt="Farmacia Bienestar" className="h-9 w-9 rounded-full object-cover" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-primary sm:text-lg">Farmacia Bienestar</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Panel administrativo</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/pos">
              <Button variant="outline" size="sm" className="border-rose-200 text-rose-800">
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                POS
              </Button>
            </Link>
            <Button onClick={handleLogout} variant="outline" size="sm">
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Resumen</h2>
            <p className="text-sm text-muted-foreground">
              {branchFilter === "all" ? "Todas las sucursales" : "Filtrado por sucursal"}
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

        {/* KPIs: 2 / 4 / 4 — evita el grid de 7 que se rompía */}
        <section className="space-y-3">
          <SectionTitle title="Indicadores de hoy" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard title="Productos" value={stats?.totalProducts ?? 0} icon={Package} />
            <KpiCard title="Ventas hoy" value={stats?.todaySales ?? 0} icon={ShoppingCart} />
            <KpiCard title="Ingresos hoy" value={formatMoney(stats?.totalRevenue || 0)} icon={DollarSign} />
            <KpiCard title="Cajeros activos" value={stats?.activeCashiers ?? 0} icon={Users} />
            <KpiCard
              title="Stock bajo"
              value={stats?.lowStockProducts ?? 0}
              icon={AlertTriangle}
              valueClassName="text-destructive"
            />
            <KpiCard
              title="Por vencer"
              value={stats?.expiringProducts ?? 0}
              icon={Calendar}
              valueClassName="text-orange-500"
            />
            <KpiCard
              title="Vencidos"
              value={stats?.expiredProducts ?? 0}
              icon={AlertTriangle}
              valueClassName="text-destructive"
            />
            <KpiCard title="Sucursales" value={branches.length} icon={Store} />
          </div>
        </section>

        {branchFilter === "all" && branchSummaries.length > 0 && (
          <section className="space-y-3">
            <SectionTitle title="Por sucursal" subtitle="Ventas e inventario del día y del mes" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {branchSummaries.map((branch) => (
                <Card key={branch.id} className="h-full">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Store className="h-4 w-4 shrink-0" />
                      <span className="truncate">{branch.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Ventas hoy</span>
                      <span className="font-semibold text-right">
                        {branch.todaySales} · {formatMoney(branch.todayRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Ventas del mes</span>
                      <span className="font-semibold text-right">
                        {branch.monthSales} · {formatMoney(branch.monthRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Stock bajo</span>
                      <span className="font-semibold text-orange-600">{branch.lowStock}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Agotados</span>
                      <span className="font-semibold text-destructive">{branch.outOfStock}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <SectionTitle title="Más vendidos del mes" subtitle="Top por piezas en cada sucursal" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topByBranch.length === 0 ? (
              <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Aún no hay ventas suficientes este mes.
                </CardContent>
              </Card>
            ) : (
              topByBranch.map(([branchId, group]) => (
                <Card key={branchId} className="h-full">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
                      <span className="truncate">{group.name}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4">
                    {group.items.map((item) => (
                      <div
                        key={`${item.branch_id}-${item.product_id}`}
                        className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            #{item.rank} {item.product_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold">{item.qty_sold}</p>
                          <p className="text-xs text-muted-foreground">{formatMoney(item.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Operación" subtitle="Inventario, ventas y administración" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <NavCard href="/admin/products" title="Productos" description="Inventario y precios" icon={Package} />
            <NavCard href="/admin/sales" title="Ventas" description="Reportes e historial" icon={TrendingUp} />
            <NavCard href="/admin/finanzas" title="Finanzas" description="Utilidad y márgenes" icon={DollarSign} />
            <NavCard href="/admin/inversion" title="Inversión" description="Valor del inventario por sucursal" icon={PiggyBank} />
            <NavCard href="/admin/gastos" title="Gastos" description="Nómina y operativos" icon={Wallet} />
            <NavCard href="/admin/movimientos" title="Movimientos" description="Entradas y salidas" icon={History} />
            <NavCard href="/admin/inventario" title="Conteo de Inventario" description="Excel vs stock real" icon={ClipboardPenLine} />
            <NavCard href="/admin/traspasos" title="Traspasos" description="Mover stock entre sucursales" icon={ArrowRightLeft} />
            <NavCard href="/admin/pedidos-globales" title="Pedidos sucursales" description="Lo pedido en caja, por sucursal" icon={ClipboardList} />
            <NavCard href="/admin/distribuidora" title="Distribuidora" description="Entradas y alertas" icon={Truck} />
            <NavCard href="/admin/revision-inventario" title="Revisión inventario" description="Escanear y contar en sucursal" icon={ClipboardCheck} />
            <NavCard href="/admin/faltantes" title="Faltantes" description="Revisión y aprobación" icon={ClipboardCheck} />
            <NavCard href="/admin/markup" title="Markup" description="Aumento sobre costo" icon={Percent} />
            <NavCard href="/admin/auditoria" title="Auditoría" description="Historial de cambios" icon={ScrollText} />
            <NavCard href="/admin/users" title="Usuarios" description="Cajeros y permisos" icon={Users} />
            <NavCard href="/admin/branches" title="Sucursales" description="Administrar farmacias" icon={Store} />
            <NavCard href="/pos" title="Punto de Venta" description="Cobrar en mostrador" icon={ShoppingCart} tone="pos" />
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Tienda online" subtitle="Pedidos y promociones públicas" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NavCard href="/tienda" title="Tienda" description="Vista pública" icon={Store} tone="store" />
            <NavCard href="/admin/orders" title="Pedidos online" description="Atender clientes" icon={ClipboardList} tone="store" />
            <NavCard href="/admin/promotions" title="Promociones" description="Ofertas activas" icon={Sparkles} tone="store" />
            <NavCard href="/cajero" title="Panel cajero" description="Pedidos e inventario" icon={ClipboardList} tone="store" />
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Alertas y actividad" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="min-h-[220px]">
              <NotificationManager userRole="admin" />
            </div>

            <Card className="h-full">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Stock bajo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4">
                {lowStockItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin alertas</p>
                ) : (
                  lowStockItems.map((product) => (
                    <div key={product.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock: {product.stock_quantity}
                          {product.branch_name ? ` · ${product.branch_name}` : ""}
                        </p>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        Bajo
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  Por vencer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4">
                {expiringItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin alertas</p>
                ) : (
                  expiringItems.map((product) => {
                    const expirationDate = new Date(product.expiration_date)
                    const daysUntilExpiry = Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    return (
                      <div key={product.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {expirationDate.toLocaleDateString("es-ES")}
                            {product.branch_name ? ` · ${product.branch_name}` : ""}
                          </p>
                        </div>
                        <Badge className="shrink-0 bg-orange-500 text-white">{daysUntilExpiry}d</Badge>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  Ventas recientes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-4">
                {recentSales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay ventas hoy</p>
                ) : (
                  recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{formatMoney(sale.total_amount)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {sale.cashier_name || "Cajero"} · {new Date(sale.created_at).toLocaleTimeString()}
                          {sale.branch_name ? ` · ${sale.branch_name}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {sale.payment_method}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}
