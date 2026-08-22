import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { formatMoney } from "@/lib/money"
import { markAlertSent, sendPushToAdmins } from "@/lib/push"

export const dynamic = "force-dynamic"

function mexicoNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date())

  const get = (type: string) => parts.find((p) => p.type === type)?.value || ""
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  }
}

function mexicoDateOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    const { searchParams } = new URL(request.url)
    const force = searchParams.get("force") === "1"

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { date, hour } = mexicoNowParts()

    if (!force && hour !== 22) {
      return NextResponse.json({ ok: true, skipped: true, reason: `Hora CDMX ${hour}, se espera 22` })
    }

    const supabase = createServiceClient()
    const alertKey = `daily-sales-${date}`

    const { data: cooldown } = await supabase
      .from("alert_cooldowns")
      .select("last_sent_at")
      .eq("alert_key", alertKey)
      .maybeSingle()

    if (cooldown?.last_sent_at && !force) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Ya enviado hoy" })
    }

    const { data: salesWide, error } = await supabase
      .from("sales")
      .select("id, total_amount, branch_id, created_at, status, branches(name)")
      .gte("created_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString())
      .lte("created_at", new Date().toISOString())

    if (error) console.error("daily sales query:", error.message)

    const rows = (salesWide || []).filter((s) => {
      if (s.status && s.status !== "completed") return false
      return mexicoDateOf(s.created_at) === date
    })

    const total = rows.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
    const count = rows.length

    const byBranch = new Map<string, { name: string; total: number; count: number }>()
    for (const sale of rows) {
      const branchRel = sale.branches as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(branchRel) ? branchRel[0]?.name : branchRel?.name
      const key = sale.branch_id || "sin"
      const current = byBranch.get(key) || { name: name || "Sucursal", total: 0, count: 0 }
      current.total += Number(sale.total_amount) || 0
      current.count += 1
      byBranch.set(key, current)
    }

    const branchLines = [...byBranch.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((b) => `${b.name}: ${formatMoney(b.total)} (${b.count})`)
      .join(" · ")

    const body =
      count === 0
        ? `Hoy ${date}: sin ventas registradas.`
        : `Hoy ${date}: ${formatMoney(total)} en ${count} venta${count === 1 ? "" : "s"}.${branchLines ? ` ${branchLines}` : ""}`

    const result = await sendPushToAdmins(supabase, {
      title: "Resumen del día · 10 pm",
      body,
      url: "/admin/sales",
      tag: alertKey,
    })

    await markAlertSent(supabase, alertKey)

    return NextResponse.json({ ok: true, date, total, count, push: result })
  } catch (error) {
    console.error("cron daily sales error:", error)
    return NextResponse.json({ error: "Error en resumen diario" }, { status: 500 })
  }
}
