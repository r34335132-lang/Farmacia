export type CashSession = {
  id: string
  branch_id: string
  cashier_id: string
  status: "open" | "closed"
  opened_at: string
  closed_at: string | null
  opening_float: number
  notes?: string | null
  branches?: { id: string; name: string } | { id: string; name: string }[] | null
  profiles?: { id: string; full_name: string } | { id: string; full_name: string }[] | null
}

export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}

/** Formatea milisegundos o un par de fechas a "2h 15m". */
export function formatSessionDuration(
  openedAt: string | Date,
  closedAt?: string | Date | null,
): string {
  const start = openedAt instanceof Date ? openedAt : new Date(openedAt)
  const end = closedAt ? (closedAt instanceof Date ? closedAt : new Date(closedAt)) : new Date()
  const ms = Math.max(0, end.getTime() - start.getTime())
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}

export function sessionElapsedMs(openedAt: string | Date, closedAt?: string | Date | null): number {
  const start = openedAt instanceof Date ? openedAt : new Date(openedAt)
  const end = closedAt ? (closedAt instanceof Date ? closedAt : new Date(closedAt)) : new Date()
  return Math.max(0, end.getTime() - start.getTime())
}
