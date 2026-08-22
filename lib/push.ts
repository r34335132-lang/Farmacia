import webpush from "web-push"
import type { SupabaseClient } from "@supabase/supabase-js"

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ""
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@farmacia-bienestar.local"

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidConfigured = true
  return true
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC
}

export function isPushConfigured() {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE)
}

export async function canSendAlert(
  supabase: SupabaseClient,
  alertKey: string,
  cooldownMinutes: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("alert_cooldowns")
    .select("last_sent_at")
    .eq("alert_key", alertKey)
    .maybeSingle()

  if (!data?.last_sent_at) return true

  const last = new Date(data.last_sent_at).getTime()
  const elapsed = Date.now() - last
  return elapsed >= cooldownMinutes * 60 * 1000
}

export async function markAlertSent(supabase: SupabaseClient, alertKey: string) {
  await supabase.from("alert_cooldowns").upsert(
    { alert_key: alertKey, last_sent_at: new Date().toISOString() },
    { onConflict: "alert_key" },
  )
}

export async function sendPushToAdmins(supabase: SupabaseClient, payload: PushPayload) {
  if (!ensureVapid()) {
    console.warn("Push no configurado: faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY")
    return { sent: 0, skipped: true as const }
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)

  const adminIds = (admins || []).map((a) => a.id)
  if (adminIds.length === 0) return { sent: 0, skipped: false as const }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", adminIds)

  if (!subs?.length) return { sent: 0, skipped: false as const }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/admin/dashboard",
    tag: payload.tag || "farmacia-alert",
  })

  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      )
      sent += 1
    } catch (err: unknown) {
      const status = typeof err === "object" && err && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 0
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id)
      } else {
        console.error("Error enviando push:", err)
      }
    }
  }

  return { sent, skipped: false as const }
}

export async function sendPushWithCooldown(
  supabase: SupabaseClient,
  alertKey: string,
  cooldownMinutes: number,
  payload: PushPayload,
) {
  const ok = await canSendAlert(supabase, alertKey, cooldownMinutes)
  if (!ok) return { sent: 0, cooldown: true as const }
  const result = await sendPushToAdmins(supabase, payload)
  if (!result.skipped) {
    await markAlertSent(supabase, alertKey)
  }
  return { ...result, cooldown: false as const }
}
