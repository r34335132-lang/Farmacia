"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SHORTAGE_STATUSES, shortageStatusLabel } from "@/lib/permissions"
import { formatMoney } from "@/lib/money"

interface Shortage {
  id: string
  quantity: number
  unit_cost: number
  total_amount: number
  reason: string
  comment?: string | null
  status: string
  reported_by: string
  created_at: string
  review_comment?: string | null
  products?: { name: string; barcode?: string } | { name: string; barcode?: string }[] | null
  branches?: { name: string } | { name: string }[] | null
  reporter?: { full_name: string } | { full_name: string }[] | null
}

const nameOf = (value: { name?: string; full_name?: string; barcode?: string } | { name?: string; full_name?: string; barcode?: string }[] | null | undefined) => {
  const row = Array.isArray(value) ? value[0] : value
  return row?.name || row?.full_name || ""
}

const NEXT_ACTIONS: Record<string, { status: string; label: string; variant?: "default" | "destructive" | "outline" }[]> = {
  pending: [
    { status: "review", label: "Enviar a revisión" },
    { status: "rejected", label: "Rechazar", variant: "destructive" },
  ],
  review: [
    { status: "approved", label: "Aprobar" },
    { status: "rejected", label: "Rechazar", variant: "destructive" },
  ],
  approved: [
    { status: "charged", label: "Marcar cobrado" },
    { status: "rejected", label: "Rechazar", variant: "destructive" },
  ],
}

export default function AdminFaltantesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [items, setItems] = useState<Shortage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState("all")
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Shortage | null>(null)
  const [reviewComment, setReviewComment] = useState("")
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadItems()
  }, [status, branchFilter, page])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    setUserId(user.id)
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/cajero/faltantes")
  }

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const json = await res.json()
      setBranches(json.branches || [])
    }
  }

  const loadItems = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: "25", status })
    if (branchFilter !== "all") params.set("branch_id", branchFilter)
    const res = await fetch(`/api/shortages?${params}`)
    const json = await res.json()
    setItems(json.shortages || [])
    setTotal(json.total || 0)
    setLoading(false)
  }

  const updateStatus = async (id: string, nextStatus: string) => {
    setUpdating(true)
    const res = await fetch("/api/shortages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: nextStatus, review_comment: reviewComment }),
    })
    const json = await res.json()
    setUpdating(false)
    if (!res.ok) {
      alert(json.error || "No se pudo actualizar")
      return
    }
    setSelected(null)
    setReviewComment("")
    loadItems()
  }

  const statusVariant = (value: string) => {
    if (value === "approved" || value === "charged") return "default"
    if (value === "rejected") return "destructive"
    return "outline"
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Faltantes" subtitle="Revisión y aprobación. No se cobra sin autorización." />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={branchFilter} onValueChange={(v) => { setPage(0); setBranchFilter(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setPage(0); setStatus(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {SHORTAGE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reportes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando faltantes...</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay faltantes en este filtro.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{new Date(item.created_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell>
                        <p className="font-medium">{nameOf(item.products)}</p>
                        <p className="text-xs text-muted-foreground">{item.reason} · {nameOf(item.reporter)}</p>
                      </TableCell>
                      <TableCell>{nameOf(item.branches)}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatMoney(item.unit_cost)}</TableCell>
                      <TableCell>{formatMoney(item.total_amount)}</TableCell>
                      <TableCell><Badge variant={statusVariant(item.status)}>{shortageStatusLabel(item.status)}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => { setSelected(item); setReviewComment(item.review_comment || "") }}>
                          Revisar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {total > 25 && (
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" disabled={(page + 1) * 25 >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisión de faltante</DialogTitle>
            <DialogDescription>
              El importe usa el costo del producto, no el precio de venta. El encargado no puede aprobar su propio reporte.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p><strong>{nameOf(selected.products)}</strong> · {selected.quantity} pzas</p>
              <p>Importe: {formatMoney(selected.total_amount)} (costo {formatMoney(selected.unit_cost)})</p>
              <p>Motivo: {selected.reason}</p>
              {selected.comment && <p>Comentario: {selected.comment}</p>}
              <Textarea placeholder="Comentario de revisión" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
              <DialogFooter className="flex-wrap gap-2">
                {(NEXT_ACTIONS[selected.status] || []).map((action) => (
                  <Button
                    key={action.status}
                    variant={action.variant || "default"}
                    disabled={updating || selected.reported_by === userId}
                    onClick={() => updateStatus(selected.id, action.status)}
                  >
                    {action.label}
                  </Button>
                ))}
              </DialogFooter>
              {selected.reported_by === userId && (
                <p className="text-xs text-destructive">No puedes aprobar un faltante que tú reportaste.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
