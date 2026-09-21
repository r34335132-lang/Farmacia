import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

export type InventoryAlertItem = {
  id: string
  name: string
  barcode: string | null
  section: string | null
  stock_quantity: number
  min_stock_level: number
  expiration_date: string | null
  days_before_expiry_alert: number | null
  branch_id: string
  branch_name: string
  days_left?: number
}

export type InventoryAlerts = {
  out_of_stock: InventoryAlertItem[]
  low_stock: InventoryAlertItem[]
  expiring: InventoryAlertItem[]
  expired: InventoryAlertItem[]
}

const PRODUCT_SELECT =
  "id, name, barcode, section, stock_quantity, min_stock_level, expiration_date, days_before_expiry_alert, branch_id, branches(id, name)"

function todayMexicoCity(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
}

function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const from = new Date(`${fromIsoDate}T12:00:00`)
  const to = new Date(`${toIsoDate}T12:00:00`)
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function mapRow(row: Record<string, unknown>): InventoryAlertItem {
  const branchRel = row.branches as { id?: string; name?: string } | { id?: string; name?: string }[] | null
  const branch = Array.isArray(branchRel) ? branchRel[0] : branchRel
  return {
    id: String(row.id),
    name: String(row.name || ""),
    barcode: (row.barcode as string | null) || null,
    section: (row.section as string | null) || null,
    stock_quantity: Number(row.stock_quantity) || 0,
    min_stock_level: Number(row.min_stock_level) || 0,
    expiration_date: (row.expiration_date as string | null) || null,
    days_before_expiry_alert: row.days_before_expiry_alert == null ? 30 : Number(row.days_before_expiry_alert),
    branch_id: String(row.branch_id || branch?.id || ""),
    branch_name: branch?.name || "Sin sucursal",
  }
}

function sortByBranchSection(a: InventoryAlertItem, b: InventoryAlertItem) {
  const branchCmp = a.branch_name.localeCompare(b.branch_name, "es")
  if (branchCmp !== 0) return branchCmp
  const sectionCmp = (a.section || "ZZZ").localeCompare(b.section || "ZZZ", "es")
  if (sectionCmp !== 0) return sectionCmp
  return a.name.localeCompare(b.name, "es")
}

function withBranchFilter(query: any, branchId?: string | null) {
  if (branchId && branchId !== "all") return query.eq("branch_id", branchId)
  return query
}

export async function fetchInventoryAlerts(
  supabase: Supabase,
  branchId?: string | null,
  limit = 100,
): Promise<InventoryAlerts> {
  const today = todayMexicoCity()
  const page = Math.min(Math.max(limit, 10), 500)

  const outQuery = withBranchFilter(
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .lte("stock_quantity", 0)
      .order("stock_quantity", { ascending: true })
      .limit(page),
    branchId,
  )

  const lowQuery = withBranchFilter(
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .gt("stock_quantity", 0)
      .order("stock_quantity", { ascending: true })
      .limit(Math.min(page * 3, 500)),
    branchId,
  )

  const dateQuery = withBranchFilter(
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .not("expiration_date", "is", null)
      .order("expiration_date", { ascending: true })
      .limit(Math.min(page * 3, 500)),
    branchId,
  )

  const [outRes, lowRes, dateRes] = await Promise.all([outQuery, lowQuery, dateQuery])
  if (outRes.error) throw new Error(outRes.error.message)
  if (lowRes.error) throw new Error(lowRes.error.message)
  if (dateRes.error) throw new Error(dateRes.error.message)

  const out_of_stock = (outRes.data || []).map((row) => mapRow(row as Record<string, unknown>))
  const low_stock = (lowRes.data || [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((item) => item.stock_quantity <= (item.min_stock_level || 0))
    .sort((a, b) => a.stock_quantity - b.stock_quantity || sortByBranchSection(a, b))

  const expiring: InventoryAlertItem[] = []
  const expired: InventoryAlertItem[] = []
  for (const raw of dateRes.data || []) {
    const item = mapRow(raw as Record<string, unknown>)
    if (!item.expiration_date) continue
    const daysLeft = daysBetween(today, item.expiration_date)
    const alertDays = item.days_before_expiry_alert ?? 30
    if (daysLeft < 0) expired.push({ ...item, days_left: daysLeft })
    else if (daysLeft <= alertDays) expiring.push({ ...item, days_left: daysLeft })
  }

  out_of_stock.sort(sortByBranchSection)
  expiring.sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0) || sortByBranchSection(a, b))
  expired.sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0) || sortByBranchSection(a, b))

  return {
    out_of_stock: out_of_stock.slice(0, page),
    low_stock: low_stock.slice(0, page),
    expiring: expiring.slice(0, page),
    expired: expired.slice(0, page),
  }
}

export function formatAlertLocation(item: { branch_name?: string | null; section?: string | null }) {
  const branch = item.branch_name?.trim() || "Sin sucursal"
  const section = item.section?.trim() || "Sin sección"
  return `${branch} · Sección ${section}`
}
