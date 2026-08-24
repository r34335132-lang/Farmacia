"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMoney } from "@/lib/money"
import {
  CheckCircle2,
  PackagePlus,
  Plus,
  RefreshCw,
  Store,
  Truck,
} from "lucide-react"

type BranchInfo = { id: string; name: string }
type Supplier = { id: string; name: string; phone?: string | null }

type Candidate = {
  product_id: string
  product_name: string
  barcode: string | null
  stock_quantity: number
  min_stock_level: number
  suggested_qty: number
  price: number
  cost_price: number
  section: string | null
  branch_id: string
  branch_name: string
  image_url?: string | null
  last_sale: { sold_at: string; quantity: number; unit_price: number } | null
}

type FilterKey = "zero" | "low" | "need"

function formatSaleDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export default function InventarioPedidoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [branchId, setBranchId] = useState("all")
  const [supplierId, setSupplierId] = useState("")
  const [filter, setFilter] = useState<FilterKey>("zero")
  const [search, setSearch] = useState("")
  const [items, setItems] = useState<Candidate[]>([])
  const [totals, setTotals] = useState({ products: 0, zero: 0, low: 0 })
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [qty, setQty] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")
  const [creatingSupplier, setCreatingSupplier] = useState(false)

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return router.push("/auth/login")
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") return router.push("/pos")

      const [branchRes, supplierRes] = await Promise.all([fetch("/api/branches"), fetch("/api/suppliers")])
      const branchJson = await branchRes.json()
      const supplierJson = await supplierRes.json()
      setBranches(branchJson.branches || [])
      setSuppliers(supplierJson.suppliers || [])
      if (supplierJson.suppliers?.[0]) setSupplierId(supplierJson.suppliers[0].id)
    }
    void boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ filter })
      if (branchId !== "all") params.set("branch_id", branchId)
      if (search.trim().length >= 2) params.set("q", search.trim())
      const res = await fetch(`/api/inventory/order-candidates?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el inventario")
      const list: Candidate[] = json.items || []
      setItems(list)
      setTotals(json.totals || { products: 0, zero: 0, low: 0 })
      setSelected({})
      const nextQty: Record<string, number> = {}
      list.forEach((item) => {
        nextQty[item.product_id] = item.suggested_qty
      })
      setQty(nextQty)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [branchId, filter, search])

  useEffect(() => {
    void loadCandidates()
  }, [branchId, filter])

  // Recargar al buscar con Enter / botón, no en cada letra
  const runSearch = () => {
    void loadCandidates()
  }

  const selectedItems = useMemo(() => items.filter((item) => selected[item.product_id]), [items, selected])

  const groupedPreview = useMemo(() => {
    const map = new Map<string, Candidate[]>()
    for (const item of selectedItems) {
      const key = item.branch_id
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()].map(([id, rows]) => ({
      branch_id: id,
      branch_name: rows[0]?.branch_name || "Sucursal",
      rows,
    }))
  }, [selectedItems])

  const createSupplier = async () => {
    if (!newSupplierName.trim()) return
    setCreatingSupplier(true)
    setError(null)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSupplierName, phone: newSupplierPhone }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.hint ? `${json.error}. ${json.hint}` : json.error || "No se pudo crear")
      setSuppliers((prev) => [...prev, json.supplier].sort((a, b) => a.name.localeCompare(b.name, "es")))
      setSupplierId(json.supplier.id)
      setNewSupplierName("")
      setNewSupplierPhone("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear proveedor")
    } finally {
      setCreatingSupplier(false)
    }
  }

  const submitOrders = async () => {
    if (!supplierId) {
      setError("Elige o crea un proveedor")
      return
    }
    if (selectedItems.length === 0) {
      setError("Selecciona al menos un producto")
      return
    }

    setSaving(true)
    setError(null)
    setDone(null)
    try {
      const byBranch = new Map<string, Candidate[]>()
      for (const item of selectedItems) {
        const list = byBranch.get(item.branch_id) || []
        list.push(item)
        byBranch.set(item.branch_id, list)
      }

      const created: string[] = []
      for (const [bId, rows] of byBranch) {
        const res = await fetch("/api/supply-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: bId,
            supplier_id: supplierId,
            notes: "Pedido desde inventario",
            items: rows.map((row) => ({
              product_id: row.product_id,
              product_name: row.product_name,
              barcode: row.barcode,
              quantity: Math.max(1, Number(qty[row.product_id]) || row.suggested_qty),
              photo_url: row.image_url || null,
            })),
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "No se pudo guardar el pedido")
        created.push(json.request?.request_number || "Pedido")
      }

      setDone(`Listo: ${created.join(", ")}. Ya quedó en pedidos por sucursal y proveedor.`)
      setSelected({})
      loadCandidates()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el pedido")
    } finally {
      setSaving(false)
    }
  }

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name || "Proveedor"

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {}
    if (value) items.forEach((item) => {
      next[item.product_id] = true
    })
    setSelected(next)
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <AdminPageHeader
        title="Pedir desde inventario"
        subtitle="Productos en 0 o stock bajo, con última venta y proveedor"
        backHref="/admin/inventario"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/pedidos-globales">
              <Button variant="outline">Ver pedidos</Button>
            </Link>
            <Button variant="outline" onClick={loadCandidates} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Select value={branchId} onValueChange={setBranchId}>
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

          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zero">Solo stock 0</SelectItem>
              <SelectItem value="low">Stock bajo (1 a mínimo)</SelectItem>
              <SelectItem value="need">Todo lo que necesita pedido</SelectItem>
            </SelectContent>
          </Select>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              runSearch()
            }}
          >
            <Input
              placeholder="Buscar nombre o código"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Buscar
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <Badge variant="destructive">{totals.zero} en 0</Badge>
            <Badge variant="secondary">{totals.low} bajos</Badge>
            <Badge variant="outline">{totals.products} en lista</Badge>
          </div>
        </div>

        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              Proveedor del pedido
            </CardTitle>
            <CardDescription>Elige a quién se le pide. Puedes crear uno aquí mismo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={supplierId || undefined} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar proveedor" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Input
                placeholder="Nuevo proveedor"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
              />
              <Input
                placeholder="Teléfono"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={creatingSupplier || !newSupplierName.trim()}
                onClick={createSupplier}
              >
                <Plus className="mr-1 h-4 w-4" />
                Crear
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}
        {done && (
          <Card className="border-emerald-300 bg-emerald-50">
            <CardContent className="flex items-start gap-2 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{done}</p>
                <Link href="/admin/pedidos-globales" className="font-semibold underline">
                  Ir a lista por sucursal y proveedor
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <div>
              <CardTitle className="text-base">Productos para pedir</CardTitle>
              <CardDescription>Marca lo que vas a pedir. Cantidad sugerida = mínimo − stock.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                Todos
              </Button>
              <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                Ninguno
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="py-10 text-center text-muted-foreground">Cargando inventario...</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">No hay productos en este filtro.</p>
            ) : (
              items.map((item) => {
                const checked = Boolean(selected[item.product_id])
                return (
                  <div
                    key={item.product_id}
                    className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${
                      item.stock_quantity === 0 ? "border-red-200 bg-red-50/50" : "bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelected((prev) => ({ ...prev, [item.product_id]: Boolean(v) }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.barcode || "Sin código"} · {item.section || "sin sección"} ·{" "}
                          <Store className="inline h-3 w-3" /> {item.branch_name}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant={item.stock_quantity === 0 ? "destructive" : "secondary"}>
                            Stock {item.stock_quantity} / mín {item.min_stock_level}
                          </Badge>
                          <Badge variant="outline">{formatMoney(item.price)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.last_sale
                            ? `Última venta: ${formatSaleDate(item.last_sale.sold_at)} · ${item.last_sale.quantity} pza · ${formatMoney(item.last_sale.unit_price)}`
                            : "Sin ventas recientes registradas"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:w-36">
                      <Input
                        type="number"
                        min={1}
                        className="h-10"
                        value={qty[item.product_id] ?? item.suggested_qty}
                        onChange={(e) =>
                          setQty((prev) => ({
                            ...prev,
                            [item.product_id]: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">pza</span>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {groupedPreview.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumen antes de enviar</CardTitle>
              <CardDescription>
                Proveedor: <strong>{supplierName}</strong> · se creará un pedido por cada sucursal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {groupedPreview.map((group) => (
                <div key={group.branch_id} className="rounded-lg border p-3">
                  <p className="font-semibold">{group.branch_name}</p>
                  <p className="text-muted-foreground">
                    {group.rows.length} producto{group.rows.length === 1 ? "" : "s"} ·{" "}
                    {group.rows.reduce((sum, r) => sum + (qty[r.product_id] || r.suggested_qty), 0)} pzas
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="mx-auto flex max-w-5xl gap-3">
          <Button
            className="h-14 flex-1 text-lg font-bold bg-emerald-600 hover:bg-emerald-700"
            disabled={saving || selectedItems.length === 0 || !supplierId}
            onClick={submitOrders}
          >
            <PackagePlus className="mr-2 h-5 w-5" />
            {saving
              ? "Enviando..."
              : `Pedir a ${supplierName} · ${selectedItems.length} producto${selectedItems.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
