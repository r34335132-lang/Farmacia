"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatAlertLocation, type InventoryAlertItem } from "@/lib/inventory-alerts"
import { AlertTriangle, Calendar, Package, Search } from "lucide-react"

type AlertType = "low_stock" | "out_of_stock" | "expiring" | "expired" | "all"

const TYPE_LABELS: Record<AlertType, string> = {
  all: "Todas",
  low_stock: "Stock bajo",
  out_of_stock: "Agotados",
  expiring: "Por vencer",
  expired: "Vencidos",
}

function AlertasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState(searchParams.get("branch_id") || "all")
  const [typeFilter, setTypeFilter] = useState<AlertType>((searchParams.get("type") as AlertType) || "all")
  const [search, setSearch] = useState("")
  const [sectionFilter, setSectionFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [alerts, setAlerts] = useState<{
    out_of_stock: InventoryAlertItem[]
    low_stock: InventoryAlertItem[]
    expiring: InventoryAlertItem[]
    expired: InventoryAlertItem[]
  }>({ out_of_stock: [], low_stock: [], expiring: [], expired: [] })

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
    loadAlerts()
  }, [branchFilter])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (!res.ok) return
    const data = await res.json()
    setBranches(data.branches || [])
  }

  const loadAlerts = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (branchFilter !== "all") params.set("branch_id", branchFilter)
      const res = await fetch(`/api/inventory/alerts?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar alertas")
      setAlerts({
        out_of_stock: data.out_of_stock || [],
        low_stock: data.low_stock || [],
        expiring: data.expiring || [],
        expired: data.expired || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }

  const tagged = useMemo(() => {
    const rows: Array<InventoryAlertItem & { alert_type: Exclude<AlertType, "all"> }> = [
      ...alerts.low_stock.map((item) => ({ ...item, alert_type: "low_stock" as const })),
      ...alerts.out_of_stock.map((item) => ({ ...item, alert_type: "out_of_stock" as const })),
      ...alerts.expiring.map((item) => ({ ...item, alert_type: "expiring" as const })),
      ...alerts.expired.map((item) => ({ ...item, alert_type: "expired" as const })),
    ]
    return rows
  }, [alerts])

  const sections = useMemo(() => {
    const set = new Set<string>()
    for (const item of tagged) {
      if (item.section?.trim()) set.add(item.section.trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"))
  }, [tagged])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tagged.filter((item) => {
      if (typeFilter !== "all" && item.alert_type !== typeFilter) return false
      if (sectionFilter !== "all" && (item.section || "") !== sectionFilter) return false
      if (!term) return true
      return (
        item.name.toLowerCase().includes(term) ||
        (item.barcode || "").toLowerCase().includes(term) ||
        (item.section || "").toLowerCase().includes(term) ||
        item.branch_name.toLowerCase().includes(term)
      )
    })
  }, [tagged, typeFilter, sectionFilter, search])

  const counts = {
    low_stock: alerts.low_stock.length,
    out_of_stock: alerts.out_of_stock.length,
    expiring: alerts.expiring.length,
    expired: alerts.expired.length,
  }

  return (
    <div className="min-h-screen bg-[#f7f5f3]">
      <AdminPageHeader
        title="Alertas de inventario"
        subtitle="Lista completa con filtros por sucursal, tipo y sección"
      />

      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              ["low_stock", "Stock bajo", counts.low_stock],
              ["out_of_stock", "Agotados", counts.out_of_stock],
              ["expiring", "Por vencer", counts.expiring],
              ["expired", "Vencidos", counts.expired],
            ] as const
          ).map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setTypeFilter(key)} className="text-left">
              <Card className={typeFilter === key ? "border-primary" : ""}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>Elige sucursal, tipo de alerta o busca por nombre/código/sección.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AlertType)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as AlertType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Sección" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las secciones</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar producto, código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              {TYPE_LABELS[typeFilter]}
            </CardTitle>
            <CardDescription>{loading ? "Cargando..." : `${filtered.length} productos`}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando alertas...</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay alertas con estos filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Sección</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Caducidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={`${item.alert_type}-${item.id}`}>
                        <TableCell>
                          <Badge variant={item.alert_type === "expiring" ? "secondary" : "destructive"}>
                            {TYPE_LABELS[item.alert_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                        </TableCell>
                        <TableCell>{item.branch_name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            {item.section || "Sin sección"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.stock_quantity}
                          {item.alert_type === "low_stock" ? ` / mín ${item.min_stock_level}` : ""}
                        </TableCell>
                        <TableCell>
                          {item.expiration_date ? (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {new Date(item.expiration_date).toLocaleDateString("es-MX")}
                              {item.days_left != null ? ` (${item.days_left}d)` : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && filtered.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Ubicación ejemplo: {formatAlertLocation(filtered[0])}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AdminAlertasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando alertas...</div>
      }
    >
      <AlertasContent />
    </Suspense>
  )
}
