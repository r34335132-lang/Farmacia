import type { SupabaseClient } from "@supabase/supabase-js"

export async function logAudit(
  supabase: SupabaseClient,
  action: string,
  entityType: string,
  entityId?: string | null,
  branchId?: string | null,
  details?: Record<string, unknown>,
) {
  try {
    const { error } = await supabase.rpc("log_audit", {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId ?? null,
      p_branch_id: branchId ?? null,
      p_details: details ?? {},
    })
    if (error) {
      console.error("log_audit error:", error.message)
    }
  } catch (error) {
    console.error("log_audit failed:", error)
  }
}
