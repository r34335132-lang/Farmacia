"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { BarcodeScanner } from "@/components/barcode-scanner"
import { ImageUpload } from "@/components/image-upload"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, ScanBarcode } from "lucide-react"

type BranchInfo = { id: string; name: string }

type BranchRow = {
  branch_id: string
  branch_name: string
  enabled: boolean
  product_id?: string
  price: string
  cost_price: string
  stock_quantity: string
  add_qty: string
  min_stock_level: string
  promotion_price: string
  expiration_date: string
  markup_percent: string
}

type SharedForm = {
  name: string
  description: string
  barcode: string
  category: string
  image_url: string
  section: string
  days_before_expiry_alert: string
}

const emptyShared = (barcode = ""): SharedForm => ({
  name: "",
  description: "",
  barcode,
  category: "",
  image_url: "",
  section: "",
  days_before_expiry_alert: "30",
})

export default function AgregadoRapidoPage() {
  const router = useRouter()
  const supabase = createClient()
  const barcodeRef = useRef<HTMLInputElement>(null)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [barcode, setBarcode] = useState("")
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [mode, setMode] = useState<"scan" | "form">("scan")
  const [isNew, setIsNew] = useState(false)
  const [skuGroupId, setSkuGroupId] = useState<string | null>(null)
  const [applyMarkup, setApplyMarkup] = useState(false)
  const [form, setForm] = useState<SharedForm>(emptyShared())
  const [rows, setRows] = useState<BranchRow[]>([])

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
    if (mode === "scan") barcodeRef.current?.focus()
  }, [mode, notice])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (!res.ok) return
    const data = await res.json()
    setBranches(data.branches || [])
  }

  const blankRows = (list: BranchInfo[], enableFirst = true): BranchRow[] =>
    list.map((branch, index) => ({
      branch_id: branch.id,
      branch_name: branch.name,
      enabled: enableFirst ? index === 0 : false,
      price: "",
      cost_price: "",
      stock_quantity: "0",
      add_qty: "",
      min_stock_level: "5",
      promotion_price: "",
      expiration_date: "",
      markup_percent: "",
    }))

  const resetScan = (message = "") => {
    setMode("scan")
    setIsNew(false)
    setSkuGroupId(null)
    setApplyMarkup(false)
    setBarcode("")
    setForm(emptyShared())
    setRows([])
    setError("")
    setNotice(message)
  }

  const lookup = async (raw: string) => {
    const code = raw.trim()
    if (!code) return
    setLooking(true)
    setError("")
    setNotice("")
    try {
      const branchList = branches.length
        ? branches
        : await fetch("/api/branches")
            .then((res) => res.json())
            .then((data) => (data.branches || []) as BranchInfo[])
      if (!branches.length) setBranches(branchList)

      const res = await fetch(`/api/products/branch-variants?barcode=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "No se pudo buscar el código")
        return
      }

      const variants = (data.variants || []).filter((item: { is_active?: boolean }) => item.is_active !== false)
      if (variants.length === 0) {
        setIsNew(true)
        setSkuGroupId(null)
        setForm(emptyShared(code))
        setRows(blankRows(branchList, true))
        setMode("form")
        return
      }

      const first = variants[0]
      setIsNew(false)
      setSkuGroupId(data.sku_group_id || first.sku_group_id || null)
      setForm({
        name: first.name || "",
        description: first.description || "",
        barcode: first.barcode || code,
        category: first.category || "",
        image_url: first.image_url || "",
        section: first.section || "",
        days_before_expiry_alert: String(first.days_before_expiry_alert || 30),
      })
      setRows(
        branchList.map((branch) => {
          const variant = variants.find((item: { branch_id?: string }) => item.branch_id === branch.id)
          return {
            branch_id: branch.id,
            branch_name: branch.name,
            enabled: Boolean(variant),
            product_id: variant?.id,
            price: variant ? String(variant.price ?? "") : "",
            cost_price: variant?.cost_price != null ? String(variant.cost_price) : "",
            stock_quantity: variant ? String(variant.stock_quantity ?? 0) : "0",
            add_qty: "",
            min_stock_level: variant ? String(variant.min_stock_level ?? 5) : "5",
            promotion_price: variant?.promotion_price != null ? String(variant.promotion_price) : "",
            expiration_date: variant?.expiration_date || "",
            markup_percent: variant?.markup_percent != null ? String(variant.markup_percent) : "",
          }
        }),
      )
      setMode("form")
    } finally {
      setLooking(false)
    }
  }

  const updateRow = (branchId: string, updates: Partial<BranchRow>) => {
    setRows((current) => current.map((row) => (row.branch_id === branchId ? { ...row, ...updates } : row)))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError("Escribe el nombre del producto")
      return
    }

    const enabled = rows.filter((row) => row.enabled)
    if (enabled.length === 0) {
      setError("Activa al menos una sucursal")
      return
    }

    for (const row of enabled) {
      const price = Number(row.price)
      if (!Number.isFinite(price) || price <= 0) {
        setError(`Precio válido para ${row.branch_name}`)
        return
      }
      const addQty = Number(row.add_qty || 0)
      if (row.add_qty && (!Number.isInteger(addQty) || addQty < 0)) {
        setError(`Piezas a sumar inválidas en ${row.branch_name}`)
        return
      }
    }

    setSaving(true)
    setError("")
    try {
      const payload = {
        sku_group_id: skuGroupId,
        shared: {
          name: form.name,
          description: form.description,
          barcode: form.barcode || null,
          category: form.category,
          image_url: form.image_url || null,
          section: form.section || null,
          days_before_expiry_alert: Number.parseInt(form.days_before_expiry_alert || "30", 10) || 30,
          apply_markup: applyMarkup,
        },
        branches: rows.map((row) => {
          const currentStock = Number.parseInt(row.stock_quantity || "0", 10) || 0
          const addQty = Number.parseInt(row.add_qty || "0", 10) || 0
          return {
            branch_id: row.branch_id,
            product_id: row.product_id || null,
            enabled: row.enabled,
            price: row.enabled ? Number.parseFloat(row.price) : 0,
            cost_price: row.enabled ? Number.parseFloat(row.cost_price || "0") : 0,
            stock_quantity: row.enabled ? currentStock + addQty : 0,
            min_stock_level: row.enabled ? Number.parseInt(row.min_stock_level || "5", 10) : 5,
            promotion_price: row.promotion_price ? Number.parseFloat(row.promotion_price) : null,
            expiration_date: row.expiration_date || null,
            markup_percent: row.markup_percent === "" ? null : Number.parseFloat(row.markup_percent),
          }
        }),
      }

      const res = await fetch("/api/products/branch-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || "No se pudo guardar")
        return
      }

      const added = enabled.reduce((sum, row) => sum + (Number.parseInt(row.add_qty || "0", 10) || 0), 0)
      const label = form.name.trim()
      resetScan(
        isNew
          ? `${label} registrado. Escanea el siguiente.`
          : added > 0
            ? `${label}: +${added} pzas. Escanea el siguiente.`
            : `${label} actualizado. Escanea el siguiente.`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5f3]">
      <AdminPageHeader
        title="Agregado rápido"
        subtitle="Escanea o escribe el código. Si existe, sumas stock. Si no, lo registras."
        backHref="/admin/products"
      />

      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        {notice ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="py-3 text-sm font-medium text-emerald-900">{notice}</CardContent>
          </Card>
        ) : null}
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {mode === "scan" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScanBarcode className="h-5 w-5" />
                Código de barras
              </CardTitle>
              <CardDescription>Escanea con la cámara o escribe y presiona Enter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BarcodeScanner disabled={looking} onScan={(code) => lookup(code)} />
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  lookup(barcode)
                }}
              >
                <Input
                  ref={barcodeRef}
                  className="h-12 text-lg"
                  placeholder="Código de barras"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  autoFocus
                  inputMode="numeric"
                />
                <Button type="submit" className="h-12 px-6" disabled={looking || barcode.trim().length < 1}>
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={save} className="space-y-5">
            <Card className={isNew ? "border-amber-300 bg-amber-50/60" : "border-primary/30"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {isNew ? "No está registrado. Complétalo y se crea." : "Producto encontrado. Suma piezas o ajusta datos."}
                </CardTitle>
                <CardDescription className="font-mono text-sm">{form.barcode}</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardContent className="space-y-4 pt-6">
                <ImageUpload
                  currentImage={form.image_url}
                  onImageUploaded={(url) => setForm({ ...form, image_url: url })}
                />
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus={isNew}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Código de barras</Label>
                    <Input value={form.barcode} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sección</Label>
                    <Input
                      className="uppercase"
                      placeholder="A1, B2..."
                      value={form.section}
                      onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Días de alerta de caducidad</Label>
                    <Input
                      type="number"
                      value={form.days_before_expiry_alert}
                      onChange={(e) => setForm({ ...form, days_before_expiry_alert: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Costo, precio y stock por sucursal</CardTitle>
                <CardDescription>
                  {isNew
                    ? "El stock es el inicial. Activa las sucursales donde entra."
                    : "Stock actual se conserva. Escribe cuántas piezas sumas en cada sucursal."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 overflow-x-auto">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={applyMarkup} onCheckedChange={(checked) => setApplyMarkup(checked === true)} />
                  Calcular precio de venta con markup
                </label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activa</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Precio *</TableHead>
                      <TableHead>Markup %</TableHead>
                      <TableHead>Promo</TableHead>
                      <TableHead>Stock</TableHead>
                      {!isNew ? <TableHead>Sumar</TableHead> : null}
                      <TableHead>Mín.</TableHead>
                      <TableHead>Caducidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.branch_id}>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant={row.enabled ? "default" : "outline"}
                            className="h-8 px-2"
                            onClick={() => updateRow(row.branch_id, { enabled: !row.enabled })}
                          >
                            {row.enabled ? "Sí" : "No"}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.branch_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-24"
                            disabled={!row.enabled}
                            value={row.cost_price}
                            onChange={(e) => updateRow(row.branch_id, { cost_price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-24"
                            disabled={!row.enabled}
                            value={row.price}
                            onChange={(e) => updateRow(row.branch_id, { price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-20"
                            disabled={!row.enabled}
                            value={row.markup_percent}
                            onChange={(e) => updateRow(row.branch_id, { markup_percent: e.target.value })}
                            placeholder="Global"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-24"
                            disabled={!row.enabled}
                            value={row.promotion_price}
                            onChange={(e) => updateRow(row.branch_id, { promotion_price: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="w-20"
                            disabled={!row.enabled || !isNew}
                            value={row.stock_quantity}
                            onChange={(e) => updateRow(row.branch_id, { stock_quantity: e.target.value })}
                          />
                        </TableCell>
                        {!isNew ? (
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              className="w-20"
                              disabled={!row.enabled}
                              value={row.add_qty}
                              placeholder="0"
                              onChange={(e) => updateRow(row.branch_id, { add_qty: e.target.value })}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="w-16"
                            disabled={!row.enabled}
                            value={row.min_stock_level}
                            onChange={(e) => updateRow(row.branch_id, { min_stock_level: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="w-36"
                            disabled={!row.enabled}
                            value={row.expiration_date}
                            onChange={(e) => updateRow(row.branch_id, { expiration_date: e.target.value })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => resetScan()} disabled={saving}>
                Cancelar y escanear otro
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isNew ? "Registrar y seguir" : "Guardar y seguir"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
