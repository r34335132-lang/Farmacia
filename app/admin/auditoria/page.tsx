"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AuditLog {
  id: string
  action: string
  entity_type: string
  entity_id?: string | null
  details?: Record<string, unknown>
  created_at: string
  profiles?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null
  branches?: { name?: string } | { name?: string }[] | null
}

const ENTITY_TYPES = [
  { value: "all", label: "Todos" },
  { value: "product", label: "Productos" },
  { value: "expense", label: "Gastos" },
  { value: "shortage", label: "Faltantes" },
  { value: "markup_settings", label: "Markup" },
  { value: "inventory_entry", label: "Entradas" },
  { value: "replenishment_order", label: "Pedidos" },
  { value: "sale", label: "Ventas" },
]

export default function AuditoriaPage() {
  const router = useRouter()
  const supabase = createClient()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [entityType, setEntityType] = useState("all")
  const [branchFilter, setBranchFilter] = useState("all")
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadLogs()
  }, [entityType, branchFilter, page])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
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

  const loadLogs = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: "30", entity_type: entityType })
    if (branchFilter !== "all") params.set("branch_id", branchFilter)
    const res = await fetch(`/api/audit?${params}`)
    const json = await res.json()
    setLogs(json.logs || [])
    setTotal(json.total || 0)
    setLoading(false)
  }

  const userName = (log: AuditLog) => {
    const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
    return profile?.full_name || profile?.email || "Sistema"
  }
  const branchName = (log: AuditLog) => {
    const branch = Array.isArray(log.branches) ? log.branches[0] : log.branches
    return branch?.name
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Auditoría" subtitle="Cambios de precios, costos, gastos, faltantes y pedidos" />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={entityType} onValueChange={(v) => { setPage(0); setEntityType(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={(v) => { setPage(0); setBranchFilter(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registro de acciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando auditoría...</p>
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay eventos para este filtro.</p>
            ) : logs.map((log) => (
              <div key={log.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="text-sm font-medium">{log.entity_type}</span>
                  <span className="text-xs text-muted-foreground">
                    {userName(log)} {branchName(log) ? `· ${branchName(log)}` : ""} · {new Date(log.created_at).toLocaleString("es-MX")}
                  </span>
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(log.details, null, 2)}</pre>
                )}
              </div>
            ))}
            {total > 30 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" disabled={(page + 1) * 30 >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
