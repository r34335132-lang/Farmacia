"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/money"
import { todayLocalISODate } from "@/lib/periods"
import { Trophy } from "lucide-react"

type TopProduct = {
  rank: number
  product_id: string
  product_name: string
  barcode?: string | null
  section?: string | null
  branch_id: string
  branch_name: string
  qty_sold: number
  revenue: number
}

function MasVendidosContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState(searchParams.get("branch_id") || "all")
  const [period, setPeriod] = useState(searchParams.get("period") || "month")
  const [startDate, setStartDate] = useState(searchParams.get("start_date") || todayLocalISODate())
  const [endDate, setEndDate] = useState(searchParams.get("end_date") || todayLocalISODate())
  const [products, setProducts] = useState<TopProduct[]>([])
  const [totalQty, setTotalQty] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return router.push("/auth/login")
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") router.push("/pos")
    }
    check()
    loadBranches()
  }, [])

  useEffect(() => {
    loadTop()
  }, [branchFilter, period, startDate, endDate])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (!res.ok) return
    const data = await res.json()
    setBranches(data.branches || [])
  }

  const loadTop = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({
        period,
        limit: "100",
      })
      if (branchFilter !== "all") params.set("branch_id", branchFilter)
      if (period === "custom") {
        params.set("start_date", startDate)
        params.set("end_date", endDate)
      }
      const res = await fetch(`/api/sales/top-products?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo cargar")
      setProducts(data.products || [])
      setTotalQty(Number(data.total_qty) || 0)
      setTotalRevenue(Number(data.total_revenue) || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5f3]">
      <AdminPageHeader
        title="Más vendidos"
        subtitle="Ranking completo con filtros de sucursal y periodo"
      />

      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>Hoy, semana, mes o un rango de fechas a tu gusto.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Periodo</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Hoy</SelectItem>
                  <SelectItem value="week">Últimos 7 días</SelectItem>
                  <SelectItem value="month">Mes actual</SelectItem>
                  <SelectItem value="custom">Rango personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {period === "custom" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Desde</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hasta</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="flex items-end md:col-span-2">
                <Button type="button" variant="outline" onClick={loadTop} disabled={loading}>
                  Actualizar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Piezas vendidas (top)</p>
              <p className="text-2xl font-bold">{totalQty.toLocaleString("es-MX")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Ingresos (top)</p>
              <p className="text-2xl font-bold">{formatMoney(totalRevenue)}</p>
            </CardContent>
          </Card>
        </div>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-500" />
              Ranking
            </CardTitle>
            <CardDescription>
              {loading ? "Cargando..." : `${products.length} productos`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando ranking...</p>
            ) : products.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay ventas en este periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Sección</TableHead>
                      <TableHead>Piezas</TableHead>
                      <TableHead>Ingresos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((item) => (
                      <TableRow key={`${item.branch_id}-${item.product_id}`}>
                        <TableCell>
                          <Badge variant="outline">{item.rank}</Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                        </TableCell>
                        <TableCell>{item.branch_name}</TableCell>
                        <TableCell>{item.section || "Sin sección"}</TableCell>
                        <TableCell className="font-semibold">{item.qty_sold}</TableCell>
                        <TableCell>{formatMoney(item.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function MasVendidosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Cargando más vendidos...
        </div>
      }
    >
      <MasVendidosContent />
    </Suspense>
  )
}
