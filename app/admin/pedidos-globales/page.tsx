"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Printer, RefreshCw, ShoppingCart } from "lucide-react"

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

export default function PedidosGlobalesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [days, setDays] = useState("14")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [confirmed, setConfirmed] = useState<Record<string, number>>({})
  const [orders, setOrders] = useState<SavedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeZero, setIncludeZero] = useState(false)

  useEffect(() => {
    checkAuth()
    loadOrders()
  }, [])

  useEffect(() => {
    loadSuggestions()
  }, [days, includeZero])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/pos")
  }

  const loadSuggestions = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/replenishment/suggestions?days=${days}&include_zero=${includeZero}`)
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || "No se pudieron calcular sugerencias")
      setLoading(false)
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
    setLoading(false)
  }

  const loadOrders = async () => {
    const res = await fetch("/api/replenishment")
    if (res.ok) {
      const json = await res.json()
      setOrders(json.orders || [])
    }
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

  const printOrder = () => {
    const rows = selectedItems
      .map((item) => {
        const branchLines = item.branches
          .map((b) => `  ${b.branch_name}: stock ${b.stock} / mín ${b.min_stock} / ventas ${b.recent_sales} / sugerido ${b.suggested}`)
          .join("\n")
        return `${item.product_name} (${item.barcode || "s/c"})\n${branchLines}\n  TOTAL: ${confirmed[item.sku_group_id] ?? item.total_suggested}`
      })
      .join("\n\n")
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`
      <html><head><title>Pedido consolidado</title>
      <style>body{font-family:Arial,sans-serif;padding:24px} h1{font-size:20px} pre{font-size:13px}</style>
      </head><body>
      <h1>Pedido consolidado de sucursales</h1>
      <p>Periodo de ventas: últimos ${days} días · ${new Date().toLocaleString("es-MX")}</p>
      <pre>${rows || "Sin productos seleccionados"}</pre>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  const exportCsv = () => {
    const lines = ["Producto,Codigo,Sucursal,Stock,Minimo,Ventas,Sugerido,Total"]
    selectedItems.forEach((item) => {
      item.branches.forEach((b) => {
        lines.push([
          `"${item.product_name}"`,
          item.barcode || "",
          `"${b.branch_name}"`,
          b.stock,
          b.min_stock,
          b.recent_sales,
          b.suggested,
          confirmed[item.sku_group_id] ?? item.total_suggested,
        ].join(","))
      })
    })
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pedido-global-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Pedidos globales"
        subtitle="Necesidades consolidadas de todas las sucursales"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={printOrder}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
            <Button variant="outline" onClick={exportCsv}>CSV</Button>
            <Button onClick={generateOrder} disabled={saving}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {saving ? "Generando..." : "Generar pedido"}
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
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
          <Button variant="outline" onClick={loadSuggestions}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Sugerencias</CardTitle>
            <CardDescription>
              Cantidad sugerida = lo mayor entre reponer al mínimo y cubrir ventas recientes. {selectedItems.length} seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Calculando necesidades...</p>
            ) : suggestions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay productos con necesidad de pedido.</p>
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
            <CardTitle>Pedidos generados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay pedidos guardados.</p>
            ) : orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <div>
                  <p className="font-medium">{order.order_number}</p>
                  <p className="text-muted-foreground">{new Date(order.created_at).toLocaleString("es-MX")} · {order.period_days} días</p>
                </div>
                <Badge variant="outline">{order.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
