"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { EXPENSE_CATEGORIES, expenseCategoryLabel, formatMoney } from "@/lib/money"
import { todayLocalISODate } from "@/lib/periods"
import { Plus, Trash2 } from "lucide-react"

interface Expense {
  id: string
  concept: string
  category: string
  amount: number
  expense_date: string
  description?: string | null
  branches?: { name: string } | { name: string }[] | null
  profiles?: { full_name: string } | { full_name: string }[] | null
}

export default function GastosPage() {
  const router = useRouter()
  const supabase = createClient()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchFilter, setBranchFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    concept: "",
    category: "salarios",
    amount: "",
    expense_date: todayLocalISODate(),
    branch_id: "",
    description: "",
  })

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadExpenses()
  }, [branchFilter, categoryFilter, page])

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
      if (json.branches?.[0]) setForm((prev) => ({ ...prev, branch_id: json.branches[0].id }))
    }
  }

  const loadExpenses = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), page_size: "25" })
    if (branchFilter !== "all") params.set("branch_id", branchFilter)
    if (categoryFilter !== "all") params.set("category", categoryFilter)
    const res = await fetch(`/api/expenses?${params}`)
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || "No se pudieron cargar los gastos")
      setLoading(false)
      return
    }
    setExpenses(json.expenses || [])
    setTotal(json.total || 0)
    setLoading(false)
  }

  const branchName = (expense: Expense) =>
    Array.isArray(expense.branches) ? expense.branches[0]?.name : expense.branches?.name
  const userName = (expense: Expense) =>
    Array.isArray(expense.profiles) ? expense.profiles[0]?.full_name : expense.profiles?.full_name

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      alert(json.error || "No se pudo guardar el gasto")
      return
    }
    setDialogOpen(false)
    setForm((prev) => ({
      ...prev,
      concept: "",
      amount: "",
      description: "",
      expense_date: todayLocalISODate(),
    }))
    setPage(0)
    loadExpenses()
    alert(`Gasto guardado (${json.expense?.expense_date}). Ábrelo en Finanzas con filtro Semana o Mes.`)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return
    const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      const json = await res.json()
      alert(json.error || "No se pudo eliminar")
      return
    }
    loadExpenses()
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Gastos"
        subtitle="Pago semanal, renta, servicios y más"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/finanzas"><Button variant="outline">Ver en Finanzas</Button></Link>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Nuevo gasto</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar gasto</DialogTitle>
                  <DialogDescription>
                    Usa la fecha real del pago. En Finanzas elige Semana/Mes para verlo en utilidad neta.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Concepto</Label>
                    <Input
                      value={form.concept}
                      onChange={(e) => setForm({ ...form, concept: e.target.value })}
                      placeholder="Ej. Pago semanal nómina"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Categoría</Label>
                      <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
                      <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Fecha</Label>
                      <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Sucursal</Label>
                      <Select value={form.branch_id} onValueChange={(value) => setForm({ ...form, branch_id: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={branchFilter} onValueChange={(v) => { setPage(0); setBranchFilter(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => { setPage(0); setCategoryFilter(v) }}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Gastos registrados</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Cargando gastos...</p>
            ) : expenses.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay gastos en este filtro.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.expense_date}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{expense.concept}</p>
                          {expense.description && <p className="text-xs text-muted-foreground">{expense.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{expenseCategoryLabel(expense.category)}</TableCell>
                      <TableCell>{branchName(expense) || "—"}</TableCell>
                      <TableCell>{formatMoney(expense.amount)}</TableCell>
                      <TableCell>{userName(expense) || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(expense.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {total > 25 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <span className="text-sm text-muted-foreground">{page + 1}</span>
                <Button variant="outline" disabled={(page + 1) * 25 >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
