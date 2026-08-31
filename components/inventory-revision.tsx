"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarcodeScanner } from "@/components/barcode-scanner"
import { formatMoney, roundMoney } from "@/lib/money"
import { todayLocalISODate } from "@/lib/periods"
import { Loader2, Trash2 } from "lucide-react"
import Link from "next/link"

type Branch = { id: string; name: string }

type ProductHit = {
  id: string
  name: string
  barcode: string
  stock_quantity: number
  cost_price: number
  price?: number
  section?: string | null
  price_from_sibling?: boolean
}

type CheckRow = {
  product_id: string
  barcode: string
  name: string
  system_stock: number
  counted: number
  missing: number
  unit_cost: number
  amount: number
}

export function InventoryRevision({
  isAdmin,
  assignedBranches,
}: {
  isAdmin: boolean
  assignedBranches: Branch[]
}) {
  const [branchId, setBranchId] = useState(assignedBranches[0]?.id || "")
  const [search, setSearch] = useState("")
  const [product, setProduct] = useState<ProductHit | null>(null)
  const [matches, setMatches] = useState<ProductHit[]>([])
  const [counted, setCounted] = useState("")
  const [editStock, setEditStock] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editSection, setEditSection] = useState("")
  const [lookupError, setLookupError] = useState("")
  const [looking, setLooking] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [rows, setRows] = useState<CheckRow[]>([])
  const [saving, setSaving] = useState(false)
  const [payrollSaving, setPayrollSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [branchTotals, setBranchTotals] = useState<{ pending: number; approved: number }>({ pending: 0, approved: 0 })

  useEffect(() => {
    if (!branchId && assignedBranches[0]) setBranchId(assignedBranches[0].id)
  }, [assignedBranches, branchId])

  useEffect(() => {
    setProduct(null)
    setMatches([])
    setRows([])
    setMessage("")
    if (branchId) loadBranchTotals()
  }, [branchId])

  const loadBranchTotals = async () => {
    if (!branchId) return
    const [pendingRes, approvedRes] = await Promise.all([
      fetch(`/api/shortages?branch_id=${branchId}&status=pending&page_size=100`),
      fetch(`/api/shortages?branch_id=${branchId}&status=approved&page_size=100`),
    ])
    const pendingJson = await pendingRes.json()
    const approvedJson = await approvedRes.json()
    const sum = (list: Array<{ total_amount?: number }>) =>
      roundMoney((list || []).reduce((acc, item) => acc + Number(item.total_amount || 0), 0))
    setBranchTotals({
      pending: sum(pendingJson.shortages || []),
      approved: sum(approvedJson.shortages || []),
    })
  }

  const selectProduct = (hit: ProductHit) => {
    setProduct(hit)
    setMatches([])
    setCounted("")
    setEditStock(String(Number(hit.stock_quantity) || 0))
    const salePrice = Number(hit.price)
    setEditPrice(Number.isFinite(salePrice) ? String(salePrice) : "0")
    setEditSection(hit.section || "")
    setSearch(hit.barcode || hit.name)
    setLookupError("")
  }

  const lookup = async (term: string) => {
    const value = term.trim()
    if (!value || !branchId) return
    setLooking(true)
    setLookupError("")
    setProduct(null)
    setMatches([])
    try {
      const looksLikeBarcode = /^\d{6,}$/.test(value)
      const params = new URLSearchParams({ branch_id: branchId })
      if (looksLikeBarcode) params.set("barcode", value)
      else params.set("q", value)

      const res = await fetch(`/api/products/lookup?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setLookupError(json.error || "No se encontró el producto")
        return
      }

      const list = (json.products || (json.product ? [json.product] : [])) as ProductHit[]
      if (list.length === 1) {
        selectProduct(list[0])
        return
      }
      setMatches(list)
    } finally {
      setLooking(false)
    }
  }

  const missingQty = useMemo(() => {
    if (!product) return 0
    const physical = Number(counted)
    if (!Number.isInteger(physical) || physical < 0) return 0
    return Math.max(0, Number(product.stock_quantity) - physical)
  }, [product, counted])

  const effectivePrice = useMemo(() => {
    const fromEdit = Number(editPrice)
    if (Number.isFinite(fromEdit) && fromEdit >= 0) return fromEdit
    return Number(product?.price) || 0
  }, [editPrice, product])

  const missingAmount = useMemo(
    () => roundMoney(missingQty * effectivePrice),
    [missingQty, effectivePrice],
  )

  const saveProduct = async () => {
    if (!product) return
    const stock = Number(editStock)
    const price = Number(editPrice)
    if (!Number.isInteger(stock) || stock < 0) {
      setLookupError("El stock debe ser un entero ≥ 0")
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setLookupError("El precio no es válido")
      return
    }

    setSavingProduct(true)
    setLookupError("")
    setMessage("")
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          stock,
          price,
          section: editSection,
          reason: "Ajuste desde revisión de inventario",
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setLookupError(json.error || "No se pudo guardar el producto")
        return
      }
      const updated = {
        ...product,
        stock_quantity: stock,
        price,
        section: editSection.trim().toUpperCase() || null,
        price_from_sibling: false,
      }
      setProduct(updated)
      setMessage("Stock, precio y sección guardados")
    } finally {
      setSavingProduct(false)
    }
  }

  const addRow = () => {
    if (!product) return
    const physical = Number(counted)
    if (!Number.isInteger(physical) || physical < 0) {
      setLookupError("Escribe cuántas piezas tienes (entero ≥ 0)")
      return
    }
    const missing = Math.max(0, Number(product.stock_quantity) - physical)
    if (missing <= 0) {
      setLookupError("Cuadra o hay de más: no hay faltante para descuento")
      return
    }
    const unitPrice = effectivePrice
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setLookupError("El precio de venta no es válido")
      return
    }
    if (unitPrice <= 0) {
      setLookupError("Pon el precio de venta antes de agregar el faltante")
      return
    }

    const row: CheckRow = {
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock_quantity,
      counted: physical,
      missing,
      unit_cost: unitPrice,
      amount: roundMoney(missing * unitPrice),
    }

    setRows((prev) => {
      const rest = prev.filter((r) => r.product_id !== row.product_id)
      return [row, ...rest]
    })
    setProduct(null)
    setCounted("")
    setSearch("")
    setLookupError("")
    setMessage(`${row.name}: faltan ${missing} pzas. · ${formatMoney(row.amount)}`)
  }

  const sessionTotal = useMemo(
    () => roundMoney(rows.reduce((acc, row) => acc + row.amount, 0)),
    [rows],
  )

  const reportShortages = async () => {
    if (rows.length === 0) return
    setSaving(true)
    setMessage("")
    try {
      for (const row of rows) {
        const res = await fetch("/api/shortages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: row.product_id,
            quantity: row.missing,
            unit_cost: row.unit_cost,
            reason: "error_inventario",
            comment: `Revisión física: sistema ${row.system_stock}, conteo ${row.counted}`,
            branch_id: branchId,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          setMessage(json.error || "No se pudieron reportar los faltantes")
          return
        }
      }
      setMessage(`Se reportaron ${rows.length} faltantes. Quedaron en el módulo de faltantes para revisión.`)
      setRows([])
      loadBranchTotals()
    } finally {
      setSaving(false)
    }
  }

  const registerPayrollDiscount = async () => {
    if (!isAdmin) return
    const amount = sessionTotal > 0 ? sessionTotal : branchTotals.approved || branchTotals.pending
    if (amount <= 0) {
      setMessage("No hay monto de descuento para registrar")
      return
    }
    setPayrollSaving(true)
    setMessage("")
    try {
      const currentBranchName = assignedBranches.find((b) => b.id === branchId)?.name || "sucursal"
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: `Descuento nómina por faltantes · ${currentBranchName}`,
          category: "salarios",
          amount,
          expense_date: todayLocalISODate(),
          branch_id: branchId,
          description:
            "Descuento de la sucursal por faltantes de inventario. El equipo lo divide entre las personas. No se reparte automático.",
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage(json.error || "No se pudo registrar el descuento en salarios")
        return
      }
      setMessage(`Descuento de ${formatMoney(amount)} MXN registrado en salarios de ${currentBranchName}. Ellos lo dividen.`)
    } finally {
      setPayrollSaving(false)
    }
  }

  const branchName = assignedBranches.find((b) => b.id === branchId)?.name || ""

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sucursal</CardTitle>
          <CardDescription>Todo el conteo y el descuento quedan en esta sucursal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={branchId} onValueChange={setBranchId} disabled={!isAdmin && assignedBranches.length <= 1}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Seleccionar sucursal" />
            </SelectTrigger>
            <SelectContent>
              {assignedBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href={isAdmin ? "/admin/faltantes" : "/cajero/faltantes"} className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pendiente de revisar · ver faltantes</p>
              <p className="text-xl font-bold">{formatMoney(branchTotals.pending)}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={isAdmin ? "/admin/faltantes" : "/cajero/faltantes"} className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Aprobado (descuento sucursal)</p>
              <p className="text-xl font-bold text-destructive">{formatMoney(branchTotals.approved)}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={isAdmin ? "/admin/faltantes" : "/cajero/faltantes"}>
          <Button variant="outline" size="sm">
            Abrir módulo de faltantes
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buscar producto</CardTitle>
          <CardDescription>Cámara, código o nombre.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarcodeScanner disabled={!branchId || looking} onScan={(code) => lookup(code)} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              lookup(search)
            }}
          >
            <Input
              className="h-12 text-base"
              placeholder="Nombre o código de barras"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" className="h-12" disabled={!branchId || looking || search.trim().length < 2}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </form>
          {lookupError ? <p className="text-sm text-destructive">{lookupError}</p> : null}
          {matches.length > 1 ? (
            <div className="max-h-56 space-y-2 overflow-auto">
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-lg border p-3 text-left"
                  onClick={() => selectProduct(item)}
                >
                  <p className="font-medium leading-tight">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.barcode || "Sin código"} · stock {item.stock_quantity} · {formatMoney(Number(item.price) || 0)} ·{" "}
                    {item.section || "sin sección"}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {product ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
            <CardDescription className="font-mono">{product.barcode || "Sin código"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Stock sistema</Label>
                <Input
                  className="h-12 text-xl font-bold"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>¿Cuántas tienes?</Label>
                <Input
                  className="h-12 text-xl font-bold"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Precio venta (MXN)</Label>
                <Input
                  className="h-12"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
                {product.price_from_sibling ? (
                  <p className="text-xs text-amber-700">
                    Este producto estaba en $0 aquí; se tomó el precio de otra sucursal. Guárdalo si aplica.
                  </p>
                ) : Number(editPrice) === 0 ? (
                  <p className="text-xs text-amber-700">Precio en 0. Revísalo antes de agregar el faltante.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Sección</Label>
                <Input
                  className="h-12 uppercase"
                  placeholder="A1, B2..."
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <p className="text-sm">
              Faltante vs sistema actual: <strong>{missingQty} pzas.</strong> · precio unit.{" "}
              {formatMoney(effectivePrice)} · <strong>{formatMoney(missingAmount)} MXN</strong>
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button className="h-12" variant="outline" onClick={saveProduct} disabled={savingProduct}>
                {savingProduct ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar stock / precio / sección
              </Button>
              <Button className="h-12" onClick={addRow} disabled={missingQty <= 0}>
                Agregar faltante
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lista de esta revisión</CardTitle>
          <CardDescription>
            Total de esta sesión: <strong>{formatMoney(sessionTotal)} MXN</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay productos con faltante.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.product_id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium leading-tight">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Sistema {row.system_stock} · tienes {row.counted} · faltan {row.missing} · precio{" "}
                      {formatMoney(row.unit_cost)}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      {formatMoney(row.amount)}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((r) => r.product_id !== row.product_id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button className="h-12 w-full" disabled={rows.length === 0 || saving} onClick={reportShortages}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reportar faltantes
          </Button>
          <Link href={isAdmin ? "/admin/faltantes" : "/cajero/faltantes"} className="block">
            <Button variant="outline" className="h-11 w-full">
              Ver / revisar faltantes reportados
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="border-amber-300 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Descuento de salarios · {branchName}</CardTitle>
          <CardDescription>
            El monto es de toda la sucursal. No se reparte automático: ellos lo dividen entre las personas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold text-destructive">
            {formatMoney(sessionTotal > 0 ? sessionTotal : branchTotals.approved || branchTotals.pending)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">MXN</span>
          </p>
          {isAdmin ? (
            <Button className="h-12 w-full" variant="outline" disabled={payrollSaving} onClick={registerPayrollDiscount}>
              {payrollSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Pasar descuento a salarios de esta sucursal
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Cuando el admin apruebe, aquí verán cuánto les toca de descuento como sucursal.
            </p>
          )}
        </CardContent>
      </Card>

      {message ? <p className="text-sm font-medium">{message}</p> : null}
    </div>
  )
}
