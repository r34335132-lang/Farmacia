import type { SupabaseClient } from "@supabase/supabase-js"

export interface Branch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  is_active: boolean
  created_at?: string
}

export interface BranchContext {
  userId: string
  role: "admin" | "cajero"
  isAdmin: boolean
  activeBranchId: string | null
  activeBranch: Branch | null
  assignedBranches: Branch[]
}

type BranchError = { error: string; status: number }

export async function getUserProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, is_active, full_name, email")
    .eq("id", userId)
    .single()

  if (error || !data?.is_active) {
    return null
  }

  return data as {
    id: string
    role: "admin" | "cajero"
    is_active: boolean
    full_name: string
    email: string
  }
}

export async function getAllBranches(supabase: SupabaseClient): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .order("name")

  if (error) {
    console.error("getAllBranches error:", error.message)
    return []
  }

  return (data as Branch[]) || []
}

export function formatBranchDbError(message: string): string {
  if (message.includes("does not exist") || message.includes("no existe")) {
    return "La tabla branches no existe. Ejecuta scripts/017_multi_branch.sql en Supabase."
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Sin permisos en la tabla branches. Ejecuta scripts/019_branches_permissions.sql en Supabase."
  }
  return message
}

export async function getUserAssignedBranches(
  supabase: SupabaseClient,
  userId: string,
): Promise<Branch[]> {
  const { data } = await supabase
    .from("user_branches")
    .select("branch_id, branches(*)")
    .eq("user_id", userId)
    .eq("is_active", true)

  if (!data) return []

  return data
    .map((row: { branches: Branch | Branch[] | null }) => {
      if (Array.isArray(row.branches)) return row.branches[0]
      return row.branches
    })
    .filter(Boolean) as Branch[]
}

export async function resolveBranchContext(
  supabase: SupabaseClient,
  requestedBranchId?: string | null,
): Promise<BranchContext | BranchError> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: "No autorizado", status: 401 }
  }

  const profile = await getUserProfile(supabase, user.id)
  if (!profile) {
    return { error: "Usuario inactivo o sin perfil", status: 403 }
  }

  const isAdmin = profile.role === "admin"

  if (isAdmin) {
    const branches = await getAllBranches(supabase)
    const activeBranch = requestedBranchId
      ? branches.find((b) => b.id === requestedBranchId) || null
      : null

    return {
      userId: user.id,
      role: profile.role,
      isAdmin: true,
      activeBranchId: activeBranch?.id || null,
      activeBranch,
      assignedBranches: branches,
    }
  }

  const assignedBranches = await getUserAssignedBranches(supabase, user.id)
  if (assignedBranches.length === 0) {
    return { error: "Cajero sin sucursal asignada", status: 403 }
  }

  const activeBranch = assignedBranches[0]

  return {
    userId: user.id,
    role: profile.role,
    isAdmin: false,
    activeBranchId: activeBranch.id,
    activeBranch,
    assignedBranches,
  }
}

export function applyBranchFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  branchContext: BranchContext,
  column = "branch_id",
): T {
  if (branchContext.isAdmin) {
    if (branchContext.activeBranchId) {
      return query.eq(column, branchContext.activeBranchId)
    }
    return query
  }

  if (branchContext.activeBranchId) {
    return query.eq(column, branchContext.activeBranchId)
  }

  return query
}

export function resolveEffectiveBranchId(
  branchContext: BranchContext,
  requestedBranchId?: string | null,
): string | null {
  if (!branchContext.isAdmin) {
    return branchContext.activeBranchId
  }

  return requestedBranchId || branchContext.activeBranchId
}
