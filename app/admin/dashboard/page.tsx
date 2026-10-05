"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
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
  LogOut,
  ArrowUpRight,
  PackageX,
  Receipt,
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
import { CountUp, Magnetic, Reveal, SplitText, stagger } from "@/components/motion"
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
} from "recharts"

const NotificationManager = dynamic(
  () => import("@/components/notification-manager").then((m) => m.NotificationManager),
  {
    ssr: false,
    loading: () => <div className="bento h-full p-6 text-sm text-muted-foreground">Cargando alertas...</div>,
  },
)

const CHART_COLORS = ["#8B1538", "#c2416b", "#e8a0b4", "#5c0d26", "#d97706", "#0f766e", "#2563eb", "#65a30d"]

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

type Tone = "default" | "danger" | "warning"

const TONE_STYLES: Record<Tone, { icon: string; value: string }> = {
  default: { icon: "bg-primary/10 text-primary", value: "text-foreground" },
  danger: { icon: "bg-red-100 text-red-600", value: "text-red-600" },
  warning: { icon: "bg-amber-100 text-amber-600", value: "text-amber-600" },
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  href,
  index = 0,
}: {
  title: string
  value: ReactNode
  icon: LucideIcon
  tone?: Tone
  href?: string
  index?: number
}) {
  const styles = TONE_STYLES[tone]
  const body = (
    <div
      className={cn(
        "group bento anim-rise flex h-full flex-col justify-between gap-4 p-4 sm:p-5",
        href && "bento-hover",
      )}
      style={stagger(index)}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:scale-110 group-hover:-rotate-6",
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {href ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-300 group-hover:rotate-45 group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight sm:text-3xl", styles.value)}>{value}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground sm:text-sm">{title}</p>
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

function AlertListCard({
  href,
  title,
  icon: Icon,
  tone,
  count,
  children,
  empty,
  index = 0,
}: {
  href: string
  title: string
  icon: LucideIcon
  tone: Tone
  count: number
  children: ReactNode
  empty: boolean
  index?: number
}) {
  const styles = TONE_STYLES[tone]
  return (
    <Reveal index={index} className="h-full">
    <Link href={href} className="block h-full">
      <div className="group bento bento-hover flex h-full flex-col p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:scale-110 group-hover:-rotate-6",
                styles.icon,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight">{title}</p>
              <p className="text-xs text-muted-foreground">Toca para ver todos</p>
            </div>
          </div>
          <span className={cn("text-2xl font-bold", styles.value)}>
            <CountUp value={count} />
          </span>
        </div>
        <div className="scrollbar-thin max-h-72 flex-1 space-y-2 overflow-y-auto pr-1">
          {empty ? <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Sin alertas</p> : children}
        </div>
      </div>
    </Link>
    </Reveal>
  )
}

function AlertRow({ name, location, badge, badgeClass }: { name: string; location: string; badge: ReactNode; badgeClass: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-muted/50 px-3.5 py-3 text-sm transition-colors hover:bg-muted">
      <div className="min-w-0">
        <p className="font-medium leading-tight">{name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{location}</p>
      </div>
      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeClass)}>{badge}</span>
    </div>
  )
}

function ChartTooltipMoney({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-white px-3 py-2 text-xs shadow-lg">
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
  const [userName, setUserName] = useState("")
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

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single()
    if (profile?.role !== "admin") {
      router.push("/pos")
      return
    }
    setUserName(profile?.full_name || "")
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

  const todayTotalForPie = pieToday.reduce((sum, p) => sum + p.value, 0)
  const branchQuery = branchFilter !== "all" ? `&branch_id=${branchFilter}` : ""
  const firstName = userName.trim().split(/\s+/)[0] || ""
  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
  const selectedBranchName =
    branchFilter === "all" ? "Todas las sucursales" : branches.find((b) => b.id === branchFilter)?.name || "Sucursal"

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (loading && !stats) {
    return (
      <div className="app-canvas flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-canvas flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 p-3 lg:block">
        <div className="rail-dark anim-slide-left flex h-full flex-col overflow-hidden rounded-[28px] shadow-xl shadow-black/10">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <img src="/logo.jpeg" alt="Farmacia Bienestar" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Farmacia Bienestar</p>
              <p className="text-[11px] text-white/50">Panel administrativo</p>
            </div>
          </div>
          <AdminDashboardNav variant="dark" className="min-h-0 flex-1" />
          <div className="p-3">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5">
                <LogOut className="h-4 w-4" />
              </span>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 lg:static lg:px-8 lg:pt-6">
          <div className="bento flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl bg-muted lg:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Menú</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] gap-0 border-0 bg-[oklch(0.2_0.045_350)] p-0 text-white sm:max-w-[300px] [&>button]:text-white!">
                  <SheetHeader className="flex-row items-center gap-3 space-y-0 px-5 py-5 text-left">
                    <img src="/logo.jpeg" alt="" className="h-10 w-10 rounded-2xl object-cover" />
                    <SheetTitle className="text-white">Farmacia Bienestar</SheetTitle>
                  </SheetHeader>
                  <AdminDashboardNav
                    variant="dark"
                    onNavigate={() => setMobileNavOpen(false)}
                    className="h-[calc(100vh-5.5rem)]"
                  />
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">
                  <SplitText key={firstName} text={`Hola${firstName ? `, ${firstName}` : ""}`} />
                </h1>
                <p
                  className="anim-rise-sm truncate text-xs capitalize text-muted-foreground sm:text-sm"
                  style={{ "--d": "250ms" } as CSSProperties}
                >
                  {todayLabel} · {selectedBranchName}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-10 w-[130px] rounded-full border-0 bg-muted px-4 sm:w-48 lg:bg-white lg:shadow-sm">
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
              <Magnetic className="hidden sm:inline-block">
                <Link href="/pos">
                  <Button className="shine h-10 rounded-full px-5 shadow-sm">
                    <ShoppingCart className="mr-1.5 h-4 w-4" />
                    POS
                  </Button>
                </Link>
              </Magnetic>
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full bg-muted lg:hidden"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Salir</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-8 px-3 py-5 sm:px-6 lg:px-8 lg:py-6">
          {error ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          ) : null}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="bento-accent anim-rise relative flex flex-col justify-between gap-6 overflow-hidden p-6 lg:col-span-5">
              <div className="pattern-rings pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white/70">Ingresos de hoy</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
                    <CountUp value={stats?.totalRevenue || 0} format={formatMoney} duration={1300} delay={150} />
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 transition-transform duration-500 [transition-timing-function:var(--ease-back)] hover:rotate-12 hover:scale-110">
                  <DollarSign className="h-6 w-6" />
                </span>
              </div>

              {pieToday.length > 0 ? (
                <div className="relative space-y-2.5">
                  {pieToday.slice(0, 4).map((b, i) => {
                    const pct = todayTotalForPie > 0 ? Math.round((b.value / todayTotalForPie) * 100) : 0
                    return (
                      <div key={b.name} className="space-y-1">
                        <div className="flex justify-between gap-2 text-xs">
                          <span className="truncate text-white/80">{b.name}</span>
                          <span className="shrink-0 font-semibold">{formatMoney(b.value)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                          <div
                            className="anim-grow-x h-full rounded-full bg-white"
                            style={{ width: `${pct}%`, ...stagger(i) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <div className="relative grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className="text-2xl font-bold">
                    <CountUp value={stats?.todaySales ?? 0} delay={250} />
                  </p>
                  <p className="text-xs text-white/70">Ventas hoy</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className="truncate text-2xl font-bold">
                    <CountUp
                      value={stats?.todaySales ? (stats.totalRevenue || 0) / stats.todaySales : 0}
                      format={formatMoney}
                      delay={300}
                    />
                  </p>
                  <p className="text-xs text-white/70">Ticket promedio</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-7">
              <KpiCard index={1} title="Cajeros activos" value={<CountUp value={stats?.activeCashiers ?? 0} />} icon={Users} />
              <KpiCard index={2} title="Productos" value={<CountUp value={stats?.totalProducts ?? 0} />} icon={Package} />
              <KpiCard index={3} title="Sucursales" value={<CountUp value={branches.length} />} icon={Store} />
              <KpiCard
                index={4}
                title="Stock bajo"
                value={<CountUp value={stats?.lowStockProducts ?? 0} />}
                icon={AlertTriangle}
                tone="danger"
                href={`/admin/alertas?type=low_stock${branchQuery}`}
              />
              <KpiCard
                index={5}
                title="Por vencer"
                value={<CountUp value={stats?.expiringProducts ?? 0} />}
                icon={Calendar}
                tone="warning"
                href={`/admin/alertas?type=expiring${branchQuery}`}
              />
              <KpiCard
                index={6}
                title="Vencidos"
                value={<CountUp value={stats?.expiredProducts ?? 0} />}
                icon={AlertTriangle}
                tone="danger"
                href={`/admin/alertas?type=expired${branchQuery}`}
              />
            </div>
          </section>

          {(branchFilter === "all" || branchSummaries.length > 0) && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="bento anim-rise p-5 xl:col-span-5" style={stagger(4)}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Dinero de hoy por sucursal</p>
                    <p className="text-xs text-muted-foreground">Participación de ingresos del día</p>
                  </div>
                </div>
                {pieToday.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">Aún no hay ingresos hoy.</p>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="relative h-[220px] w-full sm:w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieToday}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={62}
                            outerRadius={92}
                            paddingAngle={3}
                            cornerRadius={8}
                            stroke="none"
                            animationBegin={250}
                            animationDuration={1100}
                            animationEasing="ease-out"
                          >
                            {pieToday.map((_, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltipMoney />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-[11px] text-muted-foreground">Total</p>
                        <p className="text-sm font-bold">
                          <CountUp value={todayTotalForPie} format={formatMoney} delay={300} />
                        </p>
                      </div>
                    </div>
                    <div className="w-full space-y-2 sm:w-1/2">
                      {pieToday.map((p, index) => (
                        <div
                          key={p.name}
                          className="anim-slide-left flex items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-muted"
                          style={{ "--d": "400ms", ...stagger(index) } as CSSProperties}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            />
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className="shrink-0 font-semibold">{formatMoney(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bento anim-rise p-5 xl:col-span-7" style={stagger(5)}>
                <div className="mb-4">
                  <p className="font-semibold">Ingresos del mes por sucursal</p>
                  <p className="text-xs text-muted-foreground">Comparativo del mes actual</p>
                </div>
                {barsMonth.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">Sin datos de sucursales.</p>
                ) : (
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barsMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ece7e3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(139,21,56,0.06)", radius: 12 }}
                          content={<ChartTooltipMoney />}
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as { fullName?: string } | undefined
                            return row?.fullName || ""
                          }}
                        />
                        <Bar
                          dataKey="ingresos"
                          name="Ingresos"
                          fill="#8B1538"
                          radius={[12, 12, 12, 12]}
                          maxBarSize={48}
                          animationBegin={350}
                          animationDuration={1000}
                          animationEasing="ease-out"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </section>
          )}

          {branchSummaries.length > 0 ? (
            <section className="space-y-4">
              <SectionTitle title="Sucursales" subtitle="Ventas, ingresos y alertas de inventario" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branchSummaries.map((branch, index) => (
                  <Reveal key={branch.id} index={index} className="group bento bento-hover p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:scale-110 group-hover:-rotate-6"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      >
                        <Store className="h-5 w-5" />
                      </span>
                      <p className="truncate font-semibold">{branch.name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hoy</p>
                        <p className="mt-1 font-bold">{formatMoney(branch.todayRevenue)}</p>
                        <p className="text-xs text-muted-foreground">{branch.todaySales} ventas</p>
                      </div>
                      <div className="rounded-2xl bg-muted/50 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mes</p>
                        <p className="mt-1 font-bold">{formatMoney(branch.monthRevenue)}</p>
                        <p className="text-xs text-muted-foreground">{branch.monthSales} ventas</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Stock bajo: {branch.lowStock}</span>
                      <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">Agotados: {branch.outOfStock}</span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-4">
            <SectionTitle
              title="Más vendidos del mes"
              subtitle="Top por piezas en cada sucursal"
              action={
                <Link href={`/admin/mas-vendidos?period=month${branchQuery}`}>
                  <Button variant="outline" className="h-9 rounded-full bg-white">
                    Ver todos
                  </Button>
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {topByBranch.length === 0 ? (
                <Link href={`/admin/mas-vendidos?period=month${branchQuery}`} className="md:col-span-2 xl:col-span-3">
                  <div className="bento bento-hover flex items-center gap-3 p-8 text-sm text-muted-foreground">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Aún no hay ventas suficientes este mes. Abrir ranking.
                  </div>
                </Link>
              ) : (
                topByBranch.map(([branchId, group], groupIndex) => (
                  <Reveal key={branchId} index={groupIndex} className="h-full">
                  <Link href={`/admin/mas-vendidos?period=month&branch_id=${branchId}`} className="block h-full">
                    <div className="group bento bento-hover flex h-full flex-col p-5">
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:scale-110 group-hover:-rotate-12">
                            <Trophy className="h-5 w-5" />
                          </span>
                          <p className="truncate font-semibold">{group.name}</p>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-300 group-hover:rotate-45 group-hover:bg-primary group-hover:text-primary-foreground">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((item) => (
                          <div
                            key={`${item.branch_id}-${item.product_id}`}
                            className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                item.rank === 1 ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground",
                              )}
                            >
                              {item.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{item.product_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-semibold">{item.qty_sold} pz</p>
                              <p className="text-xs text-muted-foreground">{formatMoney(item.revenue)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Link>
                  </Reveal>
                ))
              )}
            </div>
          </section>

          <section className="space-y-4 pb-8">
            <SectionTitle
              title="Alertas y actividad"
              subtitle="Toca una tarjeta para ver la lista completa con filtros"
              action={
                <Link href={`/admin/alertas${branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""}`}>
                  <Button variant="outline" className="h-9 rounded-full bg-white">
                    Ver todas las alertas
                  </Button>
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Reveal index={0} className="min-h-[220px] [&>div]:h-full [&>div]:rounded-3xl">
                <NotificationManager userRole="admin" />
                <AdminAlertListener enabled />
              </Reveal>

              <AlertListCard
                href={`/admin/alertas?type=low_stock${branchQuery}`}
                title="Stock bajo"
                icon={AlertTriangle}
                tone="danger"
                index={1}
                count={stats?.lowStockProducts ?? lowStockItems.length}
                empty={lowStockItems.length === 0}
              >
                {lowStockItems.map((product) => (
                  <AlertRow
                    key={product.id}
                    name={product.name}
                    location={formatAlertLocation(product)}
                    badge={`${product.stock_quantity}/${product.min_stock_level ?? "—"}`}
                    badgeClass="bg-red-100 text-red-700"
                  />
                ))}
              </AlertListCard>

              <AlertListCard
                href={`/admin/alertas?type=out_of_stock${branchQuery}`}
                title="Agotados"
                icon={PackageX}
                tone="danger"
                index={0}
                count={outOfStockItems.length}
                empty={outOfStockItems.length === 0}
              >
                {outOfStockItems.map((product) => (
                  <AlertRow
                    key={product.id}
                    name={product.name}
                    location={formatAlertLocation(product)}
                    badge="0"
                    badgeClass="bg-red-100 text-red-700"
                  />
                ))}
              </AlertListCard>

              <AlertListCard
                href={`/admin/alertas?type=expiring${branchQuery}`}
                title="Por vencer"
                icon={Calendar}
                tone="warning"
                index={1}
                count={stats?.expiringProducts ?? expiringItems.length}
                empty={expiringItems.length === 0}
              >
                {expiringItems.map((product) => {
                  const expirationDate = new Date(product.expiration_date)
                  const daysUntilExpiry =
                    product.days_left ?? Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  return (
                    <AlertRow
                      key={product.id}
                      name={product.name}
                      location={formatAlertLocation(product)}
                      badge={`${daysUntilExpiry}d`}
                      badgeClass="bg-amber-100 text-amber-700"
                    />
                  )
                })}
              </AlertListCard>

              <AlertListCard
                href={`/admin/alertas?type=expired${branchQuery}`}
                title="Vencidos"
                icon={AlertTriangle}
                tone="danger"
                index={0}
                count={stats?.expiredProducts ?? expiredItems.length}
                empty={expiredItems.length === 0}
              >
                {expiredItems.map((product) => {
                  const expirationDate = new Date(product.expiration_date)
                  const daysAgo = Math.abs(
                    product.days_left ?? Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                  )
                  return (
                    <AlertRow
                      key={product.id}
                      name={product.name}
                      location={formatAlertLocation(product)}
                      badge={`${daysAgo}d`}
                      badgeClass="bg-red-600 text-white"
                    />
                  )
                })}
              </AlertListCard>

              <Reveal className="bento p-5 lg:col-span-2">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ShoppingCart className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold leading-tight">Ventas recientes</p>
                    <p className="text-xs text-muted-foreground">Últimos cobros del día</p>
                  </div>
                </div>
                {recentSales.length === 0 ? (
                  <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">No hay ventas hoy</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {recentSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3.5 py-3 text-sm transition-colors hover:bg-muted"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary">
                            <Receipt className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold">{formatMoney(sale.total_amount)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {sale.cashier_name || "Cajero"} · {new Date(sale.created_at).toLocaleTimeString()}
                              {sale.branch_name ? ` · ${sale.branch_name}` : ""}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium capitalize">
                          {sale.payment_method}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
