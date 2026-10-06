"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AdminDashboardNav } from "@/components/admin-dashboard-nav"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type AdminShellValue = { openNav: () => void }

const AdminShellContext = createContext<AdminShellValue | null>(null)

export function useAdminShell() {
  return useContext(AdminShellContext)
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push("/auth/login")
  }

  return (
    <AdminShellContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <div className="app-canvas admin-shell flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 p-3 lg:block">
          <div className="rail-dark anim-slide-left flex h-full flex-col overflow-hidden rounded-[28px] shadow-xl shadow-black/10">
            <div className="flex items-center gap-3 px-5 pb-4 pt-5">
              <img
                src="/logo.jpeg"
                alt="Farmacia Bienestar"
                className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/10"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Farmacia Bienestar</p>
                <p className="text-[11px] text-white/50">Panel administrativo</p>
              </div>
            </div>
            <AdminDashboardNav variant="dark" className="min-h-0 flex-1" />
            <div className="p-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5">
                  <LogOut className="h-4 w-4" />
                </span>
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            className="w-[300px] gap-0 border-0 bg-[oklch(0.2_0.045_350)] p-0 text-white sm:max-w-[300px] [&>button]:text-white!"
          >
            <SheetHeader className="flex-row items-center gap-3 space-y-0 px-5 py-5 text-left">
              <img src="/logo.jpeg" alt="" className="h-10 w-10 rounded-2xl object-cover" />
              <SheetTitle className="text-white">Farmacia Bienestar</SheetTitle>
            </SheetHeader>
            <AdminDashboardNav
              variant="dark"
              onNavigate={() => setNavOpen(false)}
              className="h-[calc(100vh-5.5rem)]"
            />
          </SheetContent>
        </Sheet>

        <div className="admin-main min-w-0 flex-1">{children}</div>
      </div>
    </AdminShellContext.Provider>
  )
}
