"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, Loader2, RefreshCw, Store, Timer, Users, type LucideIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CountUp, stagger } from "@/components/motion"
import { formatDurationMs, formatSessionDuration, type CashSession } from "@/lib/cash-session"
import { cn } from "@/lib/utils"

type Filter = "all" | "open" | "closed"

export default function CashSessionsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState("all")
  const [filter, setFilter] = useState<Filter>("all")
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (profile?.role !== "admin") {
        router.push("/pos")
        return
      }
      const res = await fetch("/api/branches")
      if (res.ok) {
        const json = await res.json()
        setBranches(json.branches || [])
      }
      loadSessions()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, filter])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30000)
    return () => window.clearInterval(id)
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "120" })
      if (branchId !== "all") params.set("branch_id", branchId)
      if (filter !== "all") params.set("status", filter)
      const res = await fetch(`/api/cash-sessions?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las sesiones")
      setSessions(json.sessions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const open = sessions.filter((s) => s.status === "open")
    const closed = sessions.filter((s) => s.status === "closed")
    const totalMs = closed.reduce((sum, s) => {
      if (!s.closed_at) return sum
      return sum + Math.max(0, new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime())
    }, 0)
    const avgMs = closed.length ? totalMs / closed.length : 0
    return { open: open.length, closed: closed.length, avgLabel: closed.length ? formatDurationMs(avgMs) : "—" }
  }, [sessions, tick])

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Sesiones de caja"
        subtitle="Tiempo activo de cajeras entre apertura y corte"
        icon={Timer}
        actions={
          <Button size="sm" variant="outline" className="rounded-xl" onClick={loadSessions} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
            Recargar
          </Button>
        }
      />

      <div className="space-y-5 p-4 sm:p-6 lg:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <StatTile icon={Users} label="Cajas abiertas ahora" value={stats.open} tone="emerald" index={1} />
          <StatTile icon={Clock} label="Cortes en la lista" value={stats.closed} tone="amber" index={2} />
          <div className="bento anim-rise-sm flex min-h-[8.5rem] flex-col justify-between p-4" style={stagger(3)}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
              <Timer className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-none">{stats.avgLabel}</p>
              <p className="mt-1 text-sm font-semibold">Promedio por turno cerrado</p>
            </div>
          </div>
        </section>

        <section className="bento anim-rise-sm flex flex-col gap-3 p-3 sm:flex-row sm:items-center" style={stagger(4)}>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-11 w-full rounded-xl sm:w-64">
              <Store className="h-4 w-4 text-muted-foreground" />
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
          <div className="inline-flex h-11 rounded-xl bg-muted/60 p-1">
            {(
              [
                { value: "all", label: "Todas" },
                { value: "open", label: "Abiertas" },
                { value: "closed", label: "Cerradas" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "rounded-lg px-3 text-sm font-medium transition-all",
                  filter === opt.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bento grid place-items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Cargando sesiones…
          </div>
        ) : sessions.length === 0 ? (
          <div className="bento py-16 text-center text-sm text-muted-foreground">
            Aún no hay sesiones de caja. Se crean al entrar al POS.
          </div>
        ) : (
          <div className="bento overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px_minmax(0,0.8fr)] gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
              <span>Cajera</span>
              <span>Sucursal</span>
              <span>Apertura</span>
              <span>Cierre</span>
              <span>Tiempo activa</span>
            </div>
            <div className="divide-y">
              {sessions.map((s) => {
                const branchName =
                  (Array.isArray(s.branches) ? s.branches[0]?.name : s.branches?.name) || "—"
                const cashierName =
                  (Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name) || "—"
                const open = s.status === "open"
                return (
                  <div
                    key={s.id}
                    className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_140px_minmax(0,0.8fr)] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{cashierName}</p>
                      <div className="mt-0.5 md:hidden">
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {branchName}
                        </Badge>
                      </div>
                    </div>
                    <p className="hidden truncate text-sm md:block">{branchName}</p>
                    <p className="text-sm tabular-nums">
                      {new Date(s.opened_at).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-sm tabular-nums">
                      {s.closed_at
                        ? new Date(s.closed_at).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                    <div className="flex items-center gap-2">
                      {open ? (
                        <Badge className="rounded-full bg-emerald-600 hover:bg-emerald-600">
                          Activa · {formatSessionDuration(s.opened_at)}
                        </Badge>
                      ) : (
                        <span className="font-semibold tabular-nums">
                          {formatSessionDuration(s.opened_at, s.closed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  index,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: "emerald" | "amber"
  index: number
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  }
  return (
    <div className="bento anim-rise-sm flex min-h-[8.5rem] flex-col justify-between p-4" style={stagger(index)}>
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">
          <CountUp value={value} />
        </p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
      </div>
    </div>
  )
}
