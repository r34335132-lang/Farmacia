"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { formatMoney, formatPercent, percentChange } from "@/lib/money"
import { getPeriodRange, type PeriodPreset } from "@/lib/periods"
import { DollarSign, TrendingUp, TrendingDown, Receipt, Wallet, Percent, RefreshCw } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import Link from "next/link"

interface FinanceKpis {
  sales_total: number
  sales_count: number
  cogs_total: number
  gross_profit: number
  expenses_total: number
  net_profit: number
  gross_margin_percent: number
  net_margin_percent: number
  avg_ticket: number
}

interface FinancePayload {
  period: {
    start_date: string
    end_date: string
    previous_start_date: string
    previous_end_date: string
  }
  current: FinanceKpis
  previous: FinanceKpis
  expenses_by_category: { category: string; amount: number }[]
  by_branch: {
    branch_id: string
    branch_name: string
    sales_total: number
    cogs_total: number
    gross_profit: number
    expenses_total: number
    net_profit: number
  }[]
  daily: {
    date: string
    sales_total: number
    cogs_total: number
    expenses_total: number
    gross_profit: number
    net_profit: number
  }[]
}

function KpiCard({
  title,
  value,
  previous,
  icon: Icon,
  invertColors = false,
}: {
  title: string
  value: string
  previous?: number | null
  icon: typeof DollarSign
  invertColors?: boolean
}) {
  const up = (previous ?? 0) > 0
  const down = (previous ?? 0) < 0
  const positive = invertColors ? down : up
  const negative = invertColors ? up : down

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {previous == null ? (
          <p className="text-xs text-muted-foreground">Sin periodo anterior comparable</p>
        ) : (
          <p className={`mt-1 flex items-center text-xs ${positive ? "text-emerald-600" : negative ? "text-destructive" : "text-muted-foreground"}`}>
            {up ? <TrendingUp className="mr-1 h-3 w-3" /> : down ? <TrendingDown className="mr-1 h-3 w-3" /> : null}
            {previous > 0 ? "+" : ""}
            {previous.toFixed(1)}% vs periodo anterior
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function FinanzasPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FinancePayload | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [period, setPeriod] = useState<PeriodPreset>("month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadSummary()
  }, [branchFilter, period, customStart, customEnd])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/pos")
  }

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const json = await res.json()
      setBranches(json.branches || [])
    }
  }

  const loadSummary = async () => {
    setLoading(true)
    setError(null)
    try {
      const range = getPeriodRange(period, customStart, customEnd)
      const params = new URLSearchParams({
        period,
        start_date: range.start,
        end_date: range.end,
      })
      if (branchFilter !== "all") params.set("branch_id", branchFilter)
      const res = await fetch(`/api/finance/summary?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Error al cargar finanzas")
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar finanzas")
    } finally {
      setLoading(false)
    }
  }

  const current = data?.current
  const previous = data?.previous

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Finanzas"
        subtitle="Utilidad real por sucursal y periodo"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/gastos">
              <Button variant="outline">Gastos</Button>
            </Link>
            <Button variant="outline" onClick={loadSummary}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Sucursal" />
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
            <Select value={period} onValueChange={(value) => setPeriod(value as PeriodPreset)}>
              <SelectTrigger>
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Día</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mes</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </>
            )}
          </div>
          {data?.period && (
            <p className="text-sm text-muted-foreground">
              {data.period.start_date} → {data.period.end_date}
              <span className="ml-2">
                vs {data.period.previous_start_date} → {data.period.previous_end_date}
              </span>
            </p>
          )}
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {loading && !data ? (
          <div className="py-16 text-center text-muted-foreground">Cargando finanzas...</div>
        ) : current ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard title="Ventas" value={formatMoney(current.sales_total)} previous={percentChange(current.sales_total, previous?.sales_total || 0)} icon={DollarSign} />
              <KpiCard title="Costo de mercancía vendida" value={formatMoney(current.cogs_total)} previous={percentChange(current.cogs_total, previous?.cogs_total || 0)} icon={Receipt} invertColors />
              <KpiCard title="Utilidad bruta" value={formatMoney(current.gross_profit)} previous={percentChange(current.gross_profit, previous?.gross_profit || 0)} icon={TrendingUp} />
              <KpiCard title="Gastos operativos" value={formatMoney(current.expenses_total)} previous={percentChange(current.expenses_total, previous?.expenses_total || 0)} icon={Wallet} invertColors />
              <KpiCard title="Utilidad neta" value={formatMoney(current.net_profit)} previous={percentChange(current.net_profit, previous?.net_profit || 0)} icon={TrendingUp} />
              <KpiCard title="Margen de utilidad" value={formatPercent(current.net_margin_percent)} previous={percentChange(current.net_margin_percent, previous?.net_margin_percent || 0)} icon={Percent} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Evolución del periodo</CardTitle>
                  <CardDescription>Ventas, costo y utilidad neta por día</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {data.daily.length === 0 ? (
                    <p className="py-12 text-center text-muted-foreground">Sin movimientos en el periodo</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily.map((d) => ({ ...d, date: String(d.date).slice(0, 10) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={(value) => formatMoney(Number(value))} />
                        <Legend />
                        <Bar dataKey="sales_total" name="Ventas" fill="#8B1538" />
                        <Bar dataKey="cogs_total" name="Costo" fill="#94a3b8" />
                        <Bar dataKey="net_profit" name="Utilidad neta" fill="#059669" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Indicadores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span>Tickets</span><span className="font-semibold">{current.sales_count}</span></div>
                  <div className="flex justify-between"><span>Ticket promedio</span><span className="font-semibold">{formatMoney(current.avg_ticket)}</span></div>
                  <div className="flex justify-between"><span>Margen bruto</span><span className="font-semibold">{formatPercent(current.gross_margin_percent)}</span></div>
                  <div className="flex justify-between"><span>Margen neto</span><span className="font-semibold">{formatPercent(current.net_margin_percent)}</span></div>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Utilidad bruta = Ventas − Costo de mercancía vendida. Utilidad neta = Utilidad bruta − Gastos.
                    El costo proviene del valor congelado en cada venta.
                  </p>
                </CardContent>
              </Card>
            </div>

            {branchFilter === "all" && data.by_branch.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Por sucursal</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2">Sucursal</th>
                        <th className="py-2">Ventas</th>
                        <th className="py-2">Costo</th>
                        <th className="py-2">Utilidad bruta</th>
                        <th className="py-2">Gastos</th>
                        <th className="py-2">Utilidad neta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_branch.map((row) => (
                        <tr key={row.branch_id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{row.branch_name}</td>
                          <td>{formatMoney(row.sales_total)}</td>
                          <td>{formatMoney(row.cogs_total)}</td>
                          <td>{formatMoney(row.gross_profit)}</td>
                          <td>{formatMoney(row.expenses_total)}</td>
                          <td className={row.net_profit >= 0 ? "text-emerald-700" : "text-destructive"}>{formatMoney(row.net_profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Gastos por categoría</CardTitle>
              </CardHeader>
              <CardContent>
                {data.expenses_by_category.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay gastos registrados en este periodo.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.expenses_by_category.map((item) => (
                      <Badge key={item.category} variant="outline" className="px-3 py-1 text-sm">
                        {item.category}: {formatMoney(item.amount)}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
