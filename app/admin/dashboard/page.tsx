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
  DollarSign,
  Calendar,
  Store,
  Trophy,
  Menu,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { AdminAlertListener } from "@/components/admin-alert-listener"
import { AdminDashboardNav } from "@/components/admin-dashboard-nav"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { formatMoney } from "@/lib/money"
import { formatAlertLocation } from "@/lib/inventory-alerts"
import { cn } from "@/lib/utils"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"

const NotificationManager = dynamic(
  () => import("@/components/notification-manager").then((m) => m.NotificationManager),
  {
    ssr: false,
    loading: () => (
      <Card className="h-full">
        <CardContent className="py-8 text-sm text-muted-foreground">Cargando alertas...</CardContent>
      </Card>
    ),
  },
)

const CHART_COLORS = ["#8B1538", "#059669", "#d97706", "#2563eb", "#0f766e", "#b45309", "#1d4ed8", "#65a30d"]

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
    <Card className="h-full border-border/70 shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn("text-2xl font-bold tracking-tight", valueClassName)}>{value}</p>
        </div>
        <div className="rounded-xl bg-muted/70 p-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function ChartTooltipMoney({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((entry, idx) => (
        <p key={idx} className="text-muted-foreground">
          {entry.name}: <span className="font-semibold text-foreground">{formatMoney(Number(entry.value) || 0)}</span>
        </p>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const [outOfStockItems, setOutOfStockItems] = useState<any[]>([])
  const [expiringItems, setExpiringItems] = useState<any[]>([])
  const [expiredItems, setExpiredItems] = useState<any[]>([])
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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
      setOutOfStockItems(data.outOfStockItems || [])
      setExpiringItems(data.expiringItems || [])
      setExpiredItems(data.expiredItems || [])
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

  const pieToday = useMemo(
    () =>
      branchSummaries
        .filter((b) => Number(b.todayRevenue) > 0)
        .map((b) => ({
          name: b.name,
          value: Number(b.todayRevenue) || 0,
        })),
    [branchSummaries],
  )

  const barsMonth = useMemo(
    () =>
      branchSummaries.map((b) => ({
        name: b.name.length > 12 ? `${b.name.slice(0, 11)}…` : b.name,
        fullName: b.name,
        ingresos: Number(b.monthRevenue) || 0,
        ventas: Number(b.monthSales) || 0,
      })),
    [branchSummaries],
  )

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5f3]">
        <div className="text-lg text-muted-foreground">Cargando dashboard...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#f7f5f3]">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-border/60 bg-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-4">
          <img src="/logo.jpeg" alt="Farmacia Bienestar" className="h-10 w-10 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">Farmacia Bienestar</p>
            <p className="text-[11px] text-muted-foreground">Panel administrativo</p>
          </div>
        </div>
        <AdminDashboardNav className="min-h-0 flex-1" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Menú</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[300px]">
                  <SheetHeader className="border-b px-4 py-4 text-left">
                    <SheetTitle className="text-primary">Menú</SheetTitle>
                  </SheetHeader>
                  <AdminDashboardNav onNavigate={() => setMobileNavOpen(false)} className="h-[calc(100vh-4.5rem)]" />
                </SheetContent>
              </Sheet>
              <div className="min-w-0 lg:hidden">
                <p className="truncate text-sm font-semibold text-primary">Farmacia Bienestar</p>
              </div>
              <div className="hidden min-w-0 lg:block">
                <h1 className="text-base font-semibold tracking-tight">Resumen</h1>
                <p className="text-xs text-muted-foreground">
                  {branchFilter === "all" ? "Todas las sucursales" : "Filtrado por sucursal"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-9 w-[140px] sm:w-48">
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link href="/pos" className="hidden sm:block">
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

        <main className="flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <h1 className="text-xl font-semibold tracking-tight">Resumen</h1>
            <p className="text-sm text-muted-foreground">
              {branchFilter === "all" ? "Todas las sucursales" : "Filtrado por sucursal"}
            </p>
          </div>

          {error ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
            </Card>
          ) : null}

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiCard title="Ingresos hoy" value={formatMoney(stats?.totalRevenue || 0)} icon={DollarSign} />
            <KpiCard title="Ventas hoy" value={stats?.todaySales ?? 0} icon={ShoppingCart} />
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
              valueClassName="text-orange-600"
            />
          </section>

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard title="Productos" value={stats?.totalProducts ?? 0} icon={Package} />
            <KpiCard title="Cajeros activos" value={stats?.activeCashiers ?? 0} icon={Users} />
            <KpiCard
              title="Vencidos"
              value={stats?.expiredProducts ?? 0}
              icon={AlertTriangle}
              valueClassName="text-destructive"
            />
            <KpiCard title="Sucursales" value={branches.length} icon={Store} />
          </section>

          {(branchFilter === "all" || branchSummaries.length > 0) && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <Card className="border-border/70 shadow-none xl:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dinero de hoy por sucursal</CardTitle>
                  <CardDescription>Participación de ingresos del día</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  {pieToday.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">Aún no hay ingresos hoy.</p>
                  ) : (
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieToday}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={58}
                            outerRadius={92}
                            paddingAngle={2}
                          >
                            {pieToday.map((_, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltipMoney />} />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none xl:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Ingresos del mes por sucursal</CardTitle>
                  <CardDescription>Comparativo del mes actual</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  {barsMonth.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">Sin datos de sucursales.</p>
                  ) : (
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barsMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) =>
                              Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                            }
                          />
                          <Tooltip
                            content={<ChartTooltipMoney />}
                            labelFormatter={(_, payload) => {
                              const row = payload?.[0]?.payload as { fullName?: string } | undefined
                              return row?.fullName || ""
                            }}
                          />
                          <Bar dataKey="ingresos" name="Ingresos" fill="#8B1538" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {branchSummaries.length > 0 ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold tracking-wide">Detalle por sucursal</h2>
                <p className="text-xs text-muted-foreground">Ventas, ingresos y alertas de inventario</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branchSummaries.map((branch, index) => (
                  <Card key={branch.id} className="border-border/70 shadow-none">
                    <CardHeader className="pb-3 pt-5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="truncate">{branch.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5 pb-5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Hoy</span>
                        <span className="text-right font-semibold">
                          {branch.todaySales} · {formatMoney(branch.todayRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Mes</span>
                        <span className="text-right font-semibold">
                          {branch.monthSales} · {formatMoney(branch.monthRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 border-t pt-2.5">
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
          ) : null}

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold tracking-wide">Más vendidos del mes</h2>
              <p className="text-xs text-muted-foreground">Top por piezas en cada sucursal</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {topByBranch.length === 0 ? (
                <Card className="border-border/70 shadow-none md:col-span-2 xl:col-span-3">
                  <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Aún no hay ventas suficientes este mes.
                  </CardContent>
                </Card>
              ) : (
                topByBranch.map(([branchId, group]) => (
                  <Card key={branchId} className="border-border/70 shadow-none">
                    <CardHeader className="pb-3 pt-5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="truncate">{group.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pb-5">
                      {group.items.map((item) => (
                        <div
                          key={`${item.branch_id}-${item.product_id}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm"
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

          <section className="space-y-4 pb-8">
            <div>
              <h2 className="text-sm font-semibold tracking-wide">Alertas y actividad</h2>
              <p className="text-xs text-muted-foreground">
                Cada alerta muestra sucursal y sección para ubicar el producto
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="min-h-[220px]">
                <NotificationManager userRole="admin" />
                <AdminAlertListener enabled />
              </div>

              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Stock bajo
                    </span>
                    <Badge variant="outline">{stats?.lowStockProducts ?? lowStockItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2.5 overflow-y-auto pb-5">
                  {lowStockItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin alertas</p>
                  ) : (
                    lowStockItems.map((product) => (
                      <div key={product.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 font-medium leading-tight">{product.name}</p>
                          <Badge variant="destructive" className="shrink-0">
                            {product.stock_quantity}/{product.min_stock_level ?? "—"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs font-medium text-foreground/80">
                          {formatAlertLocation(product)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock {product.stock_quantity}
                          {product.barcode ? ` · ${product.barcode}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-destructive" />
                      Agotados
                    </span>
                    <Badge variant="outline">{outOfStockItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2.5 overflow-y-auto pb-5">
                  {outOfStockItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin alertas</p>
                  ) : (
                    outOfStockItems.map((product) => (
                      <div key={product.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 font-medium leading-tight">{product.name}</p>
                          <Badge variant="destructive" className="shrink-0">
                            0
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs font-medium text-foreground/80">
                          {formatAlertLocation(product)}
                        </p>
                        {product.barcode ? (
                          <p className="text-xs text-muted-foreground">{product.barcode}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-500" />
                      Por vencer
                    </span>
                    <Badge variant="outline">{stats?.expiringProducts ?? expiringItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2.5 overflow-y-auto pb-5">
                  {expiringItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin alertas</p>
                  ) : (
                    expiringItems.map((product) => {
                      const expirationDate = new Date(product.expiration_date)
                      const daysUntilExpiry =
                        product.days_left ??
                        Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      return (
                        <div key={product.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 font-medium leading-tight">{product.name}</p>
                            <Badge className="shrink-0 bg-orange-500 text-white">{daysUntilExpiry}d</Badge>
                          </div>
                          <p className="mt-1 text-xs font-medium text-foreground/80">
                            {formatAlertLocation(product)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Caduca {expirationDate.toLocaleDateString("es-MX")}
                            {product.barcode ? ` · ${product.barcode}` : ""}
                          </p>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Vencidos
                    </span>
                    <Badge variant="outline">{stats?.expiredProducts ?? expiredItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2.5 overflow-y-auto pb-5">
                  {expiredItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin alertas</p>
                  ) : (
                    expiredItems.map((product) => {
                      const expirationDate = new Date(product.expiration_date)
                      const daysAgo = Math.abs(
                        product.days_left ??
                          Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                      )
                      return (
                        <div key={product.id} className="rounded-lg bg-destructive/5 p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 font-medium leading-tight">{product.name}</p>
                            <Badge variant="destructive" className="shrink-0">
                              {daysAgo}d
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs font-medium text-foreground/80">
                            {formatAlertLocation(product)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Venció {expirationDate.toLocaleDateString("es-MX")}
                            {product.barcode ? ` · ${product.barcode}` : ""}
                          </p>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none lg:col-span-2">
                <CardHeader className="pb-3 pt-5">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShoppingCart className="h-4 w-4" />
                    Ventas recientes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 pb-5">
                  {recentSales.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay ventas hoy</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      {recentSales.map((sale) => (
                        <div key={sale.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm">
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
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
