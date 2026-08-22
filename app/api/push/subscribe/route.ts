import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveBranchContext } from "@/lib/branch"
import { getVapidPublicKey, isPushConfigured } from "@/lib/push"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const context = await resolveBranchContext(supabase)
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status })
  }
  if (!context.isAdmin) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
  }

  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey() || null,
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 })
    }

    const body = await request.json()
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : ""
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : ""
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : ""

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Suscripción incompleta" }, { status: 400 })
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: "Ejecuta scripts/029_push_alerts.sql en Supabase",
        },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("push subscribe error:", error)
    return NextResponse.json({ error: "No se pudo guardar la suscripción" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const context = await resolveBranchContext(supabase)
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : ""

    let query = supabase.from("push_subscriptions").delete().eq("user_id", context.userId)
    if (endpoint) query = query.eq("endpoint", endpoint)

    await query
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 500 })
  }
}
