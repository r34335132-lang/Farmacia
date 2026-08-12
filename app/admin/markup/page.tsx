"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { formatMoney, suggestedSalePrice } from "@/lib/money"

interface HistoryRow {
  id: string
  old_percent: number
  new_percent: number
  note?: string | null
  created_at: string
  profiles?: { full_name: string } | { full_name: string }[] | null
}

export default function MarkupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [percent, setPercent] = useState("0")
  const [note, setNote] = useState("")
  const [apply, setApply] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    loadMarkup()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/pos")
  }

  const loadMarkup = async () => {
    setLoading(true)
    const res = await fetch("/api/markup")
    const json = await res.json()
    if (res.ok) {
      setPercent(String(json.settings?.percent ?? 0))
      setHistory(json.history || [])
    }
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (apply && !confirm("Esto actualizará el precio de venta de productos con costo. ¿Continuar?")) return
    setSaving(true)
    setMessage(null)
    const res = await fetch("/api/markup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        percent: Number(percent),
        note,
        apply_to_products: apply,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMessage(json.error || "No se pudo guardar")
      return
    }
    setMessage(
      apply
        ? `Markup guardado. Precios actualizados en ${json.applied_products || 0} productos.`
        : "Markup guardado. Los precios actuales no se modificaron.",
    )
    setNote("")
    loadMarkup()
  }

  const exampleCost = 100
  const examplePrice = suggestedSalePrice(exampleCost, Number(percent) || 0)
  const userName = (row: HistoryRow) =>
    Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader title="Markup" subtitle="Porcentaje de aumento sobre el costo (no es margen)" />
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuración global</CardTitle>
            <CardDescription>
              Markup = aumento sobre costo. Ejemplo: costo $100 + 30% = precio $130 y ganancia $30.
              El margen sobre $130 sería 23.1%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Cargando...</p>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>Markup %</Label>
                  <Input type="number" min="0" max="1000" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} required />
                </div>
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p>Costo de ejemplo: {formatMoney(exampleCost)}</p>
                  <p>Precio de venta: {formatMoney(examplePrice)}</p>
                  <p>Ganancia: {formatMoney(examplePrice - exampleCost)}</p>
                </div>
                <div className="space-y-2">
                  <Label>Nota del cambio</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo del ajuste" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={apply} onCheckedChange={(v) => setApply(v === true)} />
                  <span>
                    Aplicar ahora a productos con costo. Los que tengan markup propio (excepción) conservan su porcentaje.
                    No altera el costo histórico de ventas anteriores.
                  </span>
                </label>
                {message && <p className="text-sm text-muted-foreground">{message}</p>}
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar markup"}</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial de cambios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cambios registrados.</p>
            ) : (
              history.map((row) => (
                <div key={row.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {row.old_percent}% → {row.new_percent}%
                  </p>
                  <p className="text-muted-foreground">
                    {userName(row) || "Admin"} · {new Date(row.created_at).toLocaleString("es-MX")}
                  </p>
                  {row.note && <p className="mt-1">{row.note}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
