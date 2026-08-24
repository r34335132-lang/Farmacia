"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Download, Pencil, Printer, RefreshCw, ShoppingCart, Trash2 } from "lucide-react"
import {
  buildSupplyRequestDocumentHtml,
  downloadSupplyRequestDocument,
  openSupplyRequestDocument,
  type BuyListItem,
} from "@/lib/supply-request-document"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

type BranchInfo = { id: string; name: string }

type SupplierBuyGroup = {
  supplier_id: string | null
  supplier_name: string
  items: BuyListItem[]
  total_units: number
}

type SupplierInfo = { id: string; name: string }

type RequestItem = {
  id: string
  product_name: string
  barcode?: string | null
  quantity: number
  photo_url?: string | null
  product_id?: string | null
}

type RequestRow = {
  id: string
  request_number: string
  status: string
  created_at: string
  branch_id?: string
  supplier_id?: string | null
  notes?: string | null
  branches?: { id?: string; name: string } | { id?: string; name: string }[] | null
  suppliers?: { id?: string; name: string } | { id?: string; name: string }[] | null
  profiles?: { full_name: string } | { full_name: string }[] | null
  supply_request_items?: RequestItem[]
}

interface BranchNeed {
  product_id: string
  branch_id: string
  branch_name: string
  stock: number
  min_stock: number
  recent_sales: number
  suggested: number
  cost_price: number
}

interface Suggestion {
  sku_group_id: string
  barcode?: string
  product_name: string
  branches: BranchNeed[]
  total_stock: number
  total_min_stock: number
  total_recent_sales: number
  total_suggested: number
}

interface SavedOrder {
  id: string
  order_number: string
  status: string
  created_at: string
  period_days: number
}

function relName(
  value: { name?: string; full_name?: string } | { name?: string; full_name?: string }[] | null | undefined,
) {
  const item = Array.isArray(value) ? value[0] : value
  return item?.name || item?.full_name || "—"
}

export default function PedidosGlobalesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [branchId, setBranchId] = useState("all")
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [buyList, setBuyList] = useState<BuyListItem[]>([])
  const [buyBySupplier, setBuyBySupplier] = useState<SupplierBuyGroup[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [days, setDays] = useState("14")
  const [includeZero, setIncludeZero] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [confirmed, setConfirmed] = useState<Record<string, number>>({})
  const [orders, setOrders] = useState<SavedOrder[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([])
  const [supplierFilter, setSupplierFilter] = useState("all")
  const [editing, setEditing] = useState<RequestRow | null>(null)
  const [editBranchId, setEditBranchId] = useState("")
  const [editSupplierId, setEditSupplierId] = useState("")
  const [editItems, setEditItems] = useState<RequestItem[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const branchQuery = branchId === "all" ? "" : `?branch_id=${branchId}`
  const selectedBranchName =
    branchId === "all" ? "todas las sucursales" : branches.find((b) => b.id === branchId)?.name || "sucursal"

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/pos")
  }

  const loadCaja = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [buyRes, reqRes, branchRes, supplierRes] = await Promise.all([
        fetch(`/api/supply-requests/buy-list${branchQuery}`),
        fetch(`/api/supply-requests${branchQuery}`),
        fetch("/api/branches"),
        fetch("/api/suppliers"),
      ])
      const buyData = await buyRes.json()
      const reqData = await reqRes.json()
      const branchData = await branchRes.json()
      const supplierData = await supplierRes.json().catch(() => ({ suppliers: [] }))
      if (!buyRes.ok) throw new Error(buyData.error || "No se pudo cargar lo pedido en caja")
      if (!reqRes.ok) throw new Error(reqData.error || "No se pudieron cargar los pedidos")
      setBuyList(buyData.items || [])
      setBuyBySupplier(buyData.by_supplier || [])
      setRequests(reqData.requests || [])
      setBranches(branchData.branches || [])
      setSuppliers(supplierData.suppliers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [branchQuery])

  useEffect(() => {
    checkAuth()
    loadOrders()
  }, [])

  useEffect(() => {
    loadCaja()
  }, [loadCaja])

  const loadOrders = async () => {
    const res = await fetch("/api/replenishment")
    if (res.ok) {
      const json = await res.json()
      setOrders(json.orders || [])
    }
  }

  const loadSuggestions = async () => {
    setSuggestionsLoading(true)
    setError(null)
    const res = await fetch(`/api/replenishment/suggestions?days=${days}&include_zero=${includeZero}`)
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || "No se pudieron calcular sugerencias")
      setSuggestionsLoading(false)
      return
    }
    const rows: Suggestion[] = json.suggestions || []
    setSuggestions(rows)
    const nextSelected: Record<string, boolean> = {}
    const nextConfirmed: Record<string, number> = {}
    rows.forEach((row) => {
      nextSelected[row.sku_group_id] = row.total_suggested > 0
      nextConfirmed[row.sku_group_id] = row.total_suggested
    })
    setSelected(nextSelected)
    setConfirmed(nextConfirmed)
    setSuggestionsLoaded(true)
    setSuggestionsLoading(false)
  }

  const selectedItems = useMemo(
    () => suggestions.filter((s) => selected[s.sku_group_id]),
    [suggestions, selected],
  )

  const generateOrder = async () => {
    if (selectedItems.length === 0) {
      alert("Selecciona al menos un producto")
      return
    }
    if (!confirm("¿Generar el pedido consolidado con los productos seleccionados?")) return
    setSaving(true)
    const res = await fetch("/api/replenishment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_days: Number(days),
        items: selectedItems.map((item) => ({
          sku_group_id: item.sku_group_id,
          barcode: item.barcode,
          product_name: item.product_name,
          branch_quantities: item.branches,
          total_suggested: item.total_suggested,
          total_confirmed: confirmed[item.sku_group_id] ?? item.total_suggested,
        })),
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      alert(json.error || "No se pudo generar el pedido")
      return
    }
    alert(`Pedido ${json.order.order_number} generado`)
    loadOrders()
  }

  const documentHtml = buildSupplyRequestDocumentHtml({
    title: "Lista para comprar",
    subtitle: `Pedidos de caja · ${selectedBranchName}`,
    items: buyList,
  })

  const markPurchased = async (id: string) => {
    const res = await fetch("/api/supply-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "purchased" }),
    })
    if (res.ok) loadCaja()
  }

  const openEdit = (row: RequestRow) => {
    setEditing(row)
    setEditBranchId(row.branch_id || "")
    setEditSupplierId(row.supplier_id || "")
    setEditItems([...(row.supply_request_items || [])].map((item) => ({ ...item })))
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditSaving(true)
    setError(null)
    try {
      const originalIds = new Set((editing.supply_request_items || []).map((item) => item.id))
      const currentIds = new Set(editItems.map((item) => item.id))
      const delete_item_ids = [...originalIds].filter((id) => !currentIds.has(id))

      const res = await fetch("/api/supply-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          branch_id: editBranchId || undefined,
          supplier_id: editSupplierId || null,
          delete_item_ids,
          items: editItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            product_name: item.product_name,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo guardar")
      setEditing(null)
      await loadCaja()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar")
    } finally {
      setEditSaving(false)
    }
  }

  const deleteRequest = async (id: string, number: string) => {
    if (!confirm(`¿Eliminar el pedido ${number}? Esta acción no se puede deshacer.`)) return
    const res = await fetch("/api/supply-requests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || "No se pudo eliminar")
      return
    }
    if (editing?.id === id) setEditing(null)
    loadCaja()
  }

  const filteredRequests = useMemo(() => {
    return requests.filter((row) => {
      if (supplierFilter === "all") return true
      if (supplierFilter === "none") return !row.supplier_id
      return row.supplier_id === supplierFilter
    })
  }, [requests, supplierFilter])

  const requestsBySupplierBranch = useMemo(() => {
    const supplierMap = new Map<
      string,
      {
        supplier_id: string | null
        supplier_name: string
        branches: Map<
          string,
          {
            branch_id: string
            branch_name: string
            requests: RequestRow[]
          }
        >
      }
    >()

    for (const row of filteredRequests) {
      const supplierKey = row.supplier_id || "sin-proveedor"
      const supplierName = relName(row.suppliers) !== "—" ? relName(row.suppliers) : "Sin proveedor"
      if (!supplierMap.has(supplierKey)) {
        supplierMap.set(supplierKey, {
          supplier_id: row.supplier_id || null,
          supplier_name: supplierName,
          branches: new Map(),
        })
      }
      const supplierBucket = supplierMap.get(supplierKey)!
      const branchKey = row.branch_id || relName(row.branches)
      const branchName = relName(row.branches)
      if (!supplierBucket.branches.has(branchKey)) {
        supplierBucket.branches.set(branchKey, {
          branch_id: row.branch_id || branchKey,
          branch_name: branchName,
          requests: [],
        })
      }
      supplierBucket.branches.get(branchKey)!.requests.push(row)
    }

    return [...supplierMap.values()]
      .map((supplier) => ({
        ...supplier,
        branches: [...supplier.branches.values()].sort((a, b) =>
          a.branch_name.localeCompare(b.branch_name, "es"),
        ),
      }))
      .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "es"))
  }, [filteredRequests])

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Pedidos sucursales"
        subtitle="Por proveedor y sucursal · también desde inventario"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/inventario/pedido")}>
              Pedir desde inventario
            </Button>
            <Button variant="outline" onClick={() => openSupplyRequestDocument(documentHtml)} disabled={buyList.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button
              onClick={() =>
                downloadSupplyRequestDocument(
                  documentHtml,
                  `lista-compra-${new Date().toISOString().slice(0, 10)}.html`,
                )
              }
              disabled={buyList.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sucursal</span>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56">
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
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Proveedor</span>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                <SelectItem value="none">Sin proveedor</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={loadCaja}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Lista por proveedor y sucursal ({buyList.length})</CardTitle>
            <CardDescription>
              Agrupado por proveedor. Dentro de cada uno ves cuánto pide cada sucursal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando pedidos...</p>
            ) : buyList.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Nadie ha pedido mercancía todavía. También puedes pedir desde Inventario → Pedir.
              </p>
            ) : buyBySupplier.length > 0 ? (
              buyBySupplier.map((group) => (
                <div key={group.supplier_id || "sin"} className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-black">{group.supplier_name}</h3>
                    <Badge>{group.total_units} pzas</Badge>
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={`${group.supplier_id}-${item.product_name}-${item.barcode}`}
                      className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3"
                    >
                      {item.photo_url ? (
                        <img src={item.photo_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                          Sin foto
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{item.product_name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.branches.map((b) => (
                            <Badge key={b.branch_id} variant="outline">
                              {b.branch_name}: {b.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-rose-800">{item.total}</p>
                        <p className="text-xs text-muted-foreground">comprar</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              buyList.map((item) => (
                <div key={`${item.product_name}-${item.barcode}`} className="flex items-center gap-4 rounded-xl border p-3">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                      Sin foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{item.product_name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.branches.map((b) => (
                        <Badge key={b.branch_id} variant="outline">
                          {b.branch_name}: {b.quantity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-rose-800">{item.total}</p>
                    <p className="text-xs text-muted-foreground">comprar</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos por proveedor y sucursal</CardTitle>
            <CardDescription>
              Revisa, edita cantidades, cambia proveedor/sucursal o elimina cada pedido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando pedidos...</p>
            ) : filteredRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay pedidos con este filtro.</p>
            ) : (
              requestsBySupplierBranch.map((supplierGroup) => (
                <div key={supplierGroup.supplier_id || "sin"} className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2 border-b pb-2">
                    <h3 className="text-lg font-black">{supplierGroup.supplier_name}</h3>
                    <Badge variant="outline">
                      {supplierGroup.branches.reduce((sum, b) => sum + b.requests.length, 0)} pedido
                      {supplierGroup.branches.reduce((sum, b) => sum + b.requests.length, 0) === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  {supplierGroup.branches.map((branchGroup) => (
                    <div key={branchGroup.branch_id} className="space-y-2 rounded-lg bg-muted/20 p-3">
                      <p className="text-sm font-semibold text-rose-900">{branchGroup.branch_name}</p>
                      {branchGroup.requests.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium">{row.request_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {relName(row.profiles)} · {new Date(row.created_at).toLocaleString("es-MX")}
                            </p>
                            <div className="space-y-1">
                              {(row.supply_request_items || []).map((item) => (
                                <p key={item.id} className="text-sm">
                                  {item.product_name}{" "}
                                  <span className="font-bold text-rose-800">× {item.quantity}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={row.status === "submitted" ? "default" : "secondary"}>
                              {row.status === "submitted"
                                ? "Pendiente"
                                : row.status === "purchased"
                                  ? "Comprado"
                                  : "Cancelado"}
                            </Badge>
                            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            {row.status === "submitted" && (
                              <Button size="sm" variant="outline" onClick={() => markPurchased(row.id)}>
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                Ya se compró
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteRequest(row.id, row.request_number)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sugerencias automáticas</CardTitle>
            <CardDescription>
              No se calculan solas. Pídelas solo si quieres una propuesta por stock y ventas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Ventas últimos</span>
                <Input className="w-20" type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
                <span className="text-sm text-muted-foreground">días</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeZero} onCheckedChange={(v) => setIncludeZero(v === true)} />
                Incluir productos sin necesidad
              </label>
              <Button variant="outline" onClick={loadSuggestions} disabled={suggestionsLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {suggestionsLoading ? "Calculando..." : "Calcular sugerencias"}
              </Button>
              {suggestionsLoaded && (
                <Button onClick={generateOrder} disabled={saving}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {saving ? "Generando..." : "Generar pedido sugerido"}
                </Button>
              )}
            </div>

            {!suggestionsLoaded && !suggestionsLoading ? (
              <p className="py-6 text-center text-muted-foreground">
                Las sugerencias están apagadas. Si las necesitas, pica “Calcular sugerencias”.
              </p>
            ) : suggestionsLoading ? (
              <p className="py-6 text-center text-muted-foreground">Calculando necesidades...</p>
            ) : suggestions.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">No hay productos con necesidad de pedido.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Por sucursal</TableHead>
                    <TableHead>Ventas</TableHead>
                    <TableHead>Sugerido</TableHead>
                    <TableHead>Confirmar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((item) => (
                    <TableRow key={item.sku_group_id}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selected[item.sku_group_id])}
                          onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [item.sku_group_id]: v === true }))}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.barcode || "Sin código"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.branches.map((b) => (
                            <Badge key={b.branch_id} variant={b.suggested > 0 ? "default" : "outline"}>
                              {b.branch_name}: {b.suggested} <span className="ml-1 opacity-70">(stock {b.stock})</span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{item.total_recent_sales}</TableCell>
                      <TableCell className="font-semibold">{item.total_suggested}</TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          value={confirmed[item.sku_group_id] ?? item.total_suggested}
                          onChange={(e) => setConfirmed((prev) => ({ ...prev, [item.sku_group_id]: Number(e.target.value) }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos generados por sugerencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay pedidos de sugerencia.</p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <p className="font-medium">{order.order_number}</p>
                    <p className="text-muted-foreground">
                      {new Date(order.created_at).toLocaleString("es-MX")} · {order.period_days} días
                    </p>
                  </div>
                  <Badge variant="outline">{order.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar pedido {editing?.request_number}</DialogTitle>
            <DialogDescription>
              Ajusta sucursal, proveedor y cantidades. También puedes quitar renglones.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sucursal</Label>
                <Select value={editBranchId || undefined} onValueChange={setEditBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select
                  value={editSupplierId || "none"}
                  onValueChange={(value) => setEditSupplierId(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Productos</Label>
                {editItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin productos. Al guardar vacío se puede eliminar el pedido.</p>
                ) : (
                  editItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.product_name}</p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-20"
                        value={item.quantity}
                        onChange={(e) => {
                          const quantity = Math.max(1, Number(e.target.value) || 1)
                          setEditItems((prev) =>
                            prev.map((row) => (row.id === item.id ? { ...row, quantity } : row)),
                          )
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setEditItems((prev) => prev.filter((row) => row.id !== item.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="destructive"
              disabled={editSaving || !editing}
              onClick={() => editing && deleteRequest(editing.id, editing.request_number)}
            >
              Eliminar pedido
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button disabled={editSaving || editItems.length === 0} onClick={saveEdit}>
              {editSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
