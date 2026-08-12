"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { formatMoney } from "@/lib/money"
import { AlertTriangle, Package, Plus, Search } from "lucide-react"
import Link from "next/link"

interface Product {
  id: string
  name: string
  barcode?: string
  stock_quantity: number
  min_stock_level: number
  cost_price?: number
  price: number
  expiration_date?: string | null
  branch_id: string
  branches?: { name: string } | { name: string }[] | null
}

interface AlertProduct extends Product {
  branch_name?: string
  days_left?: number
}

interface Alerts {
  out_of_stock: AlertProduct[]
  low_stock: AlertProduct[]
  expiring: AlertProduct[]
  expired: AlertProduct[]
}

interface Entry {
  id: string
  quantity: number
  unit_cost: number
  unit_price?: number
  lot_code?: string
  supplier?: string
  created_at: string
  products?: { name: string; barcode?: string } | { name: string; barcode?: string }[] | null
  branches?: { name: string } | { name: string }[] | null
  profiles?: { full_name: string } | { full_name: string }[] | null
}

const nameOf = (
  value: { name?: string; full_name?: string } | { name?: string; full_name?: string }[] | null | undefined,
) => {
  const row = Array.isArray(value) ? value[0] : value
  return row?.name || row?.full_name || ""
}

export default function DistribuidoraPage() {
  const router = useRouter()
  const supabase = createClient()
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [products, setProducts] = useState<Product[]>([])
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    product_id: "",
    quantity: "",
    unit_cost: "",
    unit_price: "",
    expiration_date: "",
    lot_code: "",
    supplier: "",
    notes: "",
    apply_markup: false,
  })

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadData()
  }, [branchFilter])

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

  const loadData = async () => {
    setLoading(true)
    const query = branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""
    const [productsRes, alertsRes, entriesRes] = await Promise.all([
      fetch(`/api/products${query}`),
      fetch(`/api/inventory/alerts${query}`),
      fetch(`/api/inventory/entries${query}`),
    ])
    const productsJson = await productsRes.json()
    const alertsJson = await alertsRes.json()
    const entriesJson = await entriesRes.json()
    setProducts((productsJson.products || []).filter((p: Product & { is_active?: boolean }) => p.is_active !== false))
    setAlerts(alertsJson.error ? null : alertsJson)
    setEntries(entriesJson.entries || [])
    setLoading(false)
  }

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase()
    return products.filter((p) =>
      p.name.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term),
    )
  }, [products, search])

  const openEntry = (product?: Product) => {
    setForm({
      product_id: product?.id || "",
      quantity: "",
      unit_cost: product?.cost_price ? String(product.cost_price) : "",
      unit_price: product?.price ? String(product.price) : "",
      expiration_date: product?.expiration_date || "",
      lot_code: "",
      supplier: "",
      notes: "",
      apply_markup: false,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch("/api/inventory/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        unit_cost: Number(form.unit_cost),
        unit_price: form.unit_price ? Number(form.unit_price) : null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      alert(json.error || "No se pudo registrar la entrada")
      return
    }
    setDialogOpen(false)
    loadData()
  }

  const statusBadge = (product: Product) => {
    if (product.stock_quantity <= 0) return <Badge variant="destructive">Agotado</Badge>
    if (product.stock_quantity <= product.min_stock_level) return <Badge className="bg-orange-500 text-white">Stock bajo</Badge>
    if (product.expiration_date) {
      const days = Math.ceil((new Date(product.expiration_date).getTime() - Date.now()) / 86400000)
      if (days < 0) return <Badge variant="destructive">Caducado</Badge>
      if (days <= 30) return <Badge className="bg-amber-500 text-white">Por caducar</Badge>
    }
    return <Badge variant="outline">OK</Badge>
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Distribuidora"
        subtitle="Entradas, inventario y alertas de todas las sucursales"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/pedidos-globales"><Button variant="outline">Pedidos globales</Button></Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => openEntry()}><Plus className="mr-2 h-4 w-4" />Entrada</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar entrada de inventario</DialogTitle>
                  <DialogDescription>
                    Actualiza stock y costo actual (promedio ponderado). El costo de ventas pasadas no cambia.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Producto</Label>
                    <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · {nameOf(p.branches) || "Sucursal"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Cantidad</Label>
                      <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Costo unitario</Label>
                      <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Precio venta (opcional)</Label>
                      <Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Caducidad</Label>
                      <Input type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Lote</Label>
                      <Input value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Proveedor</Label>
                      <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                    </div>
                  </div>
                  <Textarea placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.apply_markup} onCheckedChange={(v) => setForm({ ...form, apply_markup: v === true })} />
                    Aplicar markup global si no indico precio de venta
                  </label>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Registrar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar producto o código" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Agotados</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-destructive">{alerts?.out_of_stock.length || 0}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Stock bajo</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-orange-600">{alerts?.low_stock.length || 0}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Por caducar</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-amber-600">{alerts?.expiring.length || 0}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Caducados</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-destructive">{alerts?.expired.length || 0}</CardContent></Card>
        </div>

        <Tabs defaultValue="inventario">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
            <TabsTrigger value="entradas">Entradas</TabsTrigger>
          </TabsList>

          <TabsContent value="inventario">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Inventario</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-8 text-center text-muted-foreground">Cargando inventario...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No hay productos.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Sucursal</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Costo</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.slice(0, 100).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.barcode || "Sin código"}</p>
                          </TableCell>
                          <TableCell>{nameOf(product.branches)}</TableCell>
                          <TableCell>{product.stock_quantity} / mín {product.min_stock_level}</TableCell>
                          <TableCell>{formatMoney(product.cost_price || 0)}</TableCell>
                          <TableCell>{formatMoney(product.price)}</TableCell>
                          <TableCell>{statusBadge(product)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openEntry(product)}>Entrada</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alertas">
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { title: "Agotados", items: alerts?.out_of_stock || [], tone: "destructive" },
                { title: "Stock bajo", items: alerts?.low_stock || [], tone: "orange" },
                { title: "Por caducar", items: alerts?.expiring || [], tone: "amber" },
                { title: "Caducados", items: alerts?.expired || [], tone: "destructive" },
              ].map((group) => (
                <Card key={group.title}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4" />
                      {group.title}
                    </CardTitle>
                    <CardDescription>{group.items.length} productos</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {group.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin alertas.</p>
                    ) : group.items.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-muted-foreground">{item.branch_name} · stock {item.stock_quantity}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openEntry(item as Product)}>Entrada</Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="entradas">
            <Card>
              <CardHeader>
                <CardTitle>Últimas entradas</CardTitle>
              </CardHeader>
              <CardContent>
                {entries.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">Aún no hay entradas registradas.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Sucursal</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Costo</TableHead>
                        <TableHead>Usuario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(entry.created_at).toLocaleString("es-MX")}</TableCell>
                          <TableCell>{nameOf(entry.products)}</TableCell>
                          <TableCell>{nameOf(entry.branches)}</TableCell>
                          <TableCell>{entry.quantity}</TableCell>
                          <TableCell>{formatMoney(entry.unit_cost)}</TableCell>
                          <TableCell>{nameOf(entry.profiles) || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
