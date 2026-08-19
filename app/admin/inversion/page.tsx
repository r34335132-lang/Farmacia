"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/money"
import { Boxes, Landmark, Package, RefreshCw, Store, Trophy } from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"

type BranchInvestment = {
  branch_id: string
  sucursal: string
  productos: number
  unidades: number
  valor_inventario: number
}

type Totals = {
  sucursales: number
  productos: number
  unidades: number
  valor_inventario: number
}

const COLORS = ["#8B1538", "#059669", "#d97706", "#2563eb", "#7c3aed", "#0891b2", "#be123c", "#65a30d"]

function formatCompact(value: number) {
  const amount = Number(value) || 0
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)} M`
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)} mil`
  return formatMoney(amount)
}

function formatUnits(value: number) {
  return (Number(value) || 0).toLocaleString("es-MX")
}

export default function InversionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchInvestment[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    checkAuth()
    loadData()
  }, [])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/pos")
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/inventory/investment")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo cargar la inversión")
      setBranches(json.branches || [])
      setTotals(json.totals || null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }

  const ranked = useMemo(
    () => [...branches].sort((a, b) => b.valor_inventario - a.valor_inventario),
    [branches],
  )

  const totalValue = totals?.valor_inventario || 0

  const chartData = ranked.map((row, index) => ({
    name: row.sucursal,
    valor: row.valor_inventario,
    fill: COLORS[index % COLORS.length],
  }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-background to-amber-50/40">
      <AdminPageHeader
        title="Inversión"
        subtitle="Valor de la mercancía por sucursal"
        actions={
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {loading && !totals ? (
          <div className="py-24 text-center text-muted-foreground">Calculando inversión por sucursal...</div>
        ) : totals ? (
          <>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-950 via-rose-800 to-amber-700 p-6 text-white shadow-xl sm:p-10">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-amber-300/20 blur-2xl" />
              <div className="relative space-y-3">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-200">Dueño · cadena</p>
                <h2 className="text-2xl font-black sm:text-3xl">Valor del inventario</h2>
                <p className="text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                  {formatMoney(totalValue)}
                </p>
                <p className="max-w-xl text-sm text-rose-100 sm:text-base">
                  Precio × piezas en anaquel. Productos activos de cada sucursal.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    {formatUnits(totals.sucursales)} sucursales
                  </Badge>
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    {formatUnits(totals.productos)} productos
                  </Badge>
                  <Badge className="bg-white/15 text-white hover:bg-white/20">
                    {formatUnits(totals.unidades)} piezas
                  </Badge>
                </div>
              </div>
              {updatedAt && (
                <p className="relative mt-6 text-xs text-rose-200">
                  Actualizado {updatedAt.toLocaleString("es-MX")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Kpi title="Valor inventario" value={formatMoney(totals.valor_inventario)} hint="Precio × stock" icon={Landmark} />
              <Kpi title="Productos" value={formatUnits(totals.productos)} hint="Activos en sucursales" icon={Package} />
              <Kpi title="Unidades" value={formatUnits(totals.unidades)} hint="Piezas en anaquel" icon={Boxes} />
            </div>

            <section className="space-y-3">
              <div>
                <h3 className="text-lg font-black">Ranking por sucursal</h3>
                <p className="text-sm text-muted-foreground">De mayor a menor valor de inventario.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {ranked.map((row, index) => {
                  const share = totalValue > 0 ? (row.valor_inventario / totalValue) * 100 : 0
                  const color = COLORS[index % COLORS.length]
                  return (
                    <Card key={row.branch_id} className="overflow-hidden border-0 shadow-lg">
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          <div
                            className="flex w-16 shrink-0 flex-col items-center justify-center text-white"
                            style={{ background: color }}
                          >
                            {index === 0 ? <Trophy className="mb-1 h-5 w-5" /> : null}
                            <span className="text-2xl font-black">#{index + 1}</span>
                          </div>
                          <div className="flex-1 space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="flex items-center gap-2 text-xl font-black">
                                  <Store className="h-5 w-5 text-muted-foreground" />
                                  {row.sucursal}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {formatUnits(row.productos)} productos · {formatUnits(row.unidades)} pzas
                                </p>
                              </div>
                              <p className="text-right text-2xl font-black" style={{ color }}>
                                {formatMoney(row.valor_inventario)}
                              </p>
                            </div>
                            <div>
                              <div className="mb-1 flex justify-between text-xs font-semibold text-muted-foreground">
                                <span>Participación de la cadena</span>
                                <span>{share.toFixed(1)}%</span>
                              </div>
                              <div className="h-3 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.max(share, 1.5)}%`, background: color }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <Card className="border-0 shadow-lg xl:col-span-3">
                <CardHeader>
                  <CardTitle>Comparativo visual</CardTitle>
                  <CardDescription>Valor de inventario por sucursal</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {chartData.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground">Sin inventario activo</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompact} fontSize={12} />
                        <YAxis type="category" dataKey="name" width={110} fontSize={12} />
                        <Tooltip formatter={(value) => formatMoney(Number(value))} />
                        <Bar dataKey="valor" radius={[0, 10, 10, 0]}>
                          {chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg xl:col-span-2">
                <CardHeader>
                  <CardTitle>Cómo se reparte</CardTitle>
                  <CardDescription>Porcentaje de cada sucursal</CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData}
                              dataKey="valor"
                              nameKey="name"
                              innerRadius={52}
                              outerRadius={82}
                              paddingAngle={3}
                            >
                              {chartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatMoney(Number(value))} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5">
                        {chartData.map((entry) => {
                          const share = totalValue > 0 ? (entry.valor / totalValue) * 100 : 0
                          return (
                            <div key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.fill }} />
                                <span className="truncate font-medium">{entry.name}</span>
                              </span>
                              <span className="shrink-0 font-semibold text-muted-foreground">{share.toFixed(1)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Detalle
                </CardTitle>
                <CardDescription>
                  Mismo cálculo de tu SQL: productos, unidades y valor = precio × stock.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 pr-3">#</th>
                      <th className="py-3 pr-3">Sucursal</th>
                      <th className="py-3 pr-3 text-right">Productos</th>
                      <th className="py-3 pr-3 text-right">Unidades</th>
                      <th className="py-3 text-right">Valor inventario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((row, index) => (
                      <tr key={row.branch_id} className="border-b last:border-0">
                        <td className="py-3 pr-3 font-black" style={{ color: COLORS[index % COLORS.length] }}>
                          {index + 1}
                        </td>
                        <td className="py-3 pr-3 font-semibold">{row.sucursal}</td>
                        <td className="py-3 pr-3 text-right">{formatUnits(row.productos)}</td>
                        <td className="py-3 pr-3 text-right">{formatUnits(row.unidades)}</td>
                        <td className="py-3 text-right font-bold">{formatMoney(row.valor_inventario)}</td>
                      </tr>
                    ))}
                    <tr className="bg-rose-50/70 font-black">
                      <td className="py-3 pr-3" colSpan={2}>
                        Total cadena
                      </td>
                      <td className="py-3 pr-3 text-right">{formatUnits(totals.productos)}</td>
                      <td className="py-3 pr-3 text-right">{formatUnits(totals.unidades)}</td>
                      <td className="py-3 text-right">{formatMoney(totals.valor_inventario)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Kpi({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string
  hint: string
  icon: typeof Landmark
}) {
  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-black">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
