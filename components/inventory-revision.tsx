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

type Branch = { id: string; name: string }

type ProductHit = {
  id: string
  name: string
  barcode: string
  stock_quantity: number
  cost_price: number
  price?: number
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
  const [barcode, setBarcode] = useState("")
  const [product, setProduct] = useState<ProductHit | null>(null)
  const [counted, setCounted] = useState("")
  const [lookupError, setLookupError] = useState("")
  const [looking, setLooking] = useState(false)
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

  const lookup = async (code: string) => {
    const value = code.trim()
    if (!value || !branchId) return
    setLooking(true)
    setLookupError("")
    setProduct(null)
    try {
      const res = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(value)}&branch_id=${branchId}`)
      const json = await res.json()
      if (!res.ok) {
        setLookupError(json.error || "No se encontró el producto")
        return
      }
      setProduct(json.product)
      setCounted("")
      setBarcode(json.product.barcode || value)
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

  const missingAmount = useMemo(
    () => roundMoney(missingQty * (Number(product?.cost_price) || 0)),
    [missingQty, product],
  )

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

    const row: CheckRow = {
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock_quantity,
      counted: physical,
      missing,
      unit_cost: Number(product.cost_price) || 0,
      amount: roundMoney(missing * (Number(product.cost_price) || 0)),
    }

    setRows((prev) => {
      const rest = prev.filter((r) => r.product_id !== row.product_id)
      return [row, ...rest]
    })
    setProduct(null)
    setCounted("")
    setBarcode("")
    setLookupError("")
    setMessage(`${row.name}: faltan ${missing} pzas.`)
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
      setMessage(`Se reportaron ${rows.length} faltantes. El descuento de esta sucursal queda pendiente de aprobación.`)
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
      const branchName = assignedBranches.find((b) => b.id === branchId)?.name || "sucursal"
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: `Descuento nómina por faltantes · ${branchName}`,
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
      setMessage(`Descuento de ${formatMoney(amount)} MXN registrado en salarios de ${branchName}. Ellos lo dividen.`)
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

      <div className="grid gap-3 grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendiente de revisar</p>
            <p className="text-xl font-bold">{formatMoney(branchTotals.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aprobado (descuento sucursal)</p>
            <p className="text-xl font-bold text-destructive">{formatMoney(branchTotals.approved)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Escanear producto</CardTitle>
          <CardDescription>Cámara del teléfono o escribe el código a mano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarcodeScanner disabled={!branchId || looking} onScan={(code) => lookup(code)} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              lookup(barcode)
            }}
          >
            <Input
              className="h-12 text-base"
              inputMode="numeric"
              placeholder="Código de barras"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <Button type="submit" className="h-12" disabled={!branchId || looking || !barcode.trim()}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </form>
          {lookupError ? <p className="text-sm text-destructive">{lookupError}</p> : null}
        </CardContent>
      </Card>

      {product ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
            <CardDescription className="font-mono">{product.barcode}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Marca el sistema</p>
                <p className="text-3xl font-bold">{product.stock_quantity}</p>
              </div>
              <div className="rounded-lg border p-3">
                <Label className="text-xs text-muted-foreground">¿Cuántas tienes?</Label>
                <Input
                  className="mt-1 h-12 text-2xl font-bold"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={counted}
                  autoFocus
                  onChange={(e) => setCounted(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm">
              Faltante: <strong>{missingQty} pzas.</strong> · {formatMoney(missingAmount)} MXN (costo)
            </p>
            <Button className="h-12 w-full" onClick={addRow} disabled={missingQty <= 0}>
              Agregar faltante a la lista
            </Button>
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
                      Sistema {row.system_stock} · tienes {row.counted} · faltan {row.missing}
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
