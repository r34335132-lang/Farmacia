"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SHORTAGE_REASONS, shortageStatusLabel } from "@/lib/permissions"
import { formatMoney } from "@/lib/money"
import { ArrowLeft } from "lucide-react"

interface Product {
  id: string
  name: string
  barcode?: string
  cost_price?: number
  stock_quantity: number
}

interface Shortage {
  id: string
  quantity: number
  unit_cost: number
  total_amount: number
  reason: string
  comment?: string | null
  status: string
  created_at: string
  products?: { name: string } | { name: string }[] | null
}

export default function CajeroFaltantesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<Shortage[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState({
    product_id: "",
    quantity: "1",
    reason: "error_inventario",
    comment: "",
  })

  useEffect(() => {
    checkAuth()
    loadData()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
  }

  const loadData = async () => {
    setLoading(true)
    const [productsRes, shortagesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/shortages"),
    ])
    const productsJson = await productsRes.json()
    const shortagesJson = await shortagesRes.json()
    setProducts((productsJson.products || []).filter((p: Product & { is_active?: boolean }) => p.is_active !== false))
    setItems(shortagesJson.shortages || [])
    setLoading(false)
  }

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return products.slice(0, 50)
    return products.filter((p) => p.name.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term)).slice(0, 50)
  }, [products, search])

  const selectedProduct = products.find((p) => p.id === form.product_id)
  const estimated = selectedProduct ? (Number(selectedProduct.cost_price) || 0) * Number(form.quantity || 0) : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const res = await fetch("/api/shortages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: form.product_id,
        quantity: Number(form.quantity),
        reason: form.reason,
        comment: form.comment,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMessage(json.error || "No se pudo reportar el faltante")
      return
    }
    setMessage("Faltante reportado. Queda pendiente de revisión administrativa.")
    setForm({ product_id: "", quantity: "1", reason: "error_inventario", comment: "" })
    loadData()
  }

  const productName = (item: Shortage) =>
    Array.isArray(item.products) ? item.products[0]?.name : item.products?.name

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/cajero">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-primary">Reportar faltantes</h1>
            <p className="text-xs text-muted-foreground">Solo de tu sucursal. El cobro requiere aprobación del admin.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nuevo reporte</CardTitle>
            <CardDescription>El importe se calcula con el costo, no con el precio de venta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Buscar producto</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o código" />
              </div>
              <div className="space-y-2">
                <Label>Producto</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                  <Label>Motivo</Label>
                  <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHORTAGE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea placeholder="Comentario" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
              <p className="text-sm text-muted-foreground">
                Costo unitario: {formatMoney(selectedProduct?.cost_price || 0)} · Importe estimado: {formatMoney(estimated)}
              </p>
              {message && <p className="text-sm">{message}</p>}
              <Button type="submit" disabled={saving || !form.product_id}>{saving ? "Enviando..." : "Reportar faltante"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mis reportes / sucursal</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Cargando...</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground">Aún no hay faltantes reportados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{productName(item)}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} pzas · {new Date(item.created_at).toLocaleDateString("es-MX")}</p>
                      </TableCell>
                      <TableCell>{formatMoney(item.total_amount)}</TableCell>
                      <TableCell><Badge variant="outline">{shortageStatusLabel(item.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
