"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Banknote,
  BarChart3,
  Calendar,
  Clock,
  CreditCard,
  DollarSign,
  Moon,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Sigma,
  Store,
  Sun,
  Sunset,
  Trash2,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin-page-header"
import { CountUp, Magnetic, Reveal, stagger } from "@/components/motion"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface Sale {
  id: string
  total_amount: number
  payment_method: string
  created_at: string
  status?: string
  branch_id?: string
  profiles: {
    full_name: string
  }
  branches?: {
    id: string
    name: string
  } | {
    id: string
    name: string
  }[] | null
  sale_items: {
    quantity: number
    unit_price: number
    products: {
      name: string
      section?: string
    }
  }[]
}

interface PaymentStats {
  total: number
  totalCash: number
  totalCard: number
  countCash: number
  countCard: number
}

export default function SalesReports() {
  const [sales, setSales] = useState<Sale[]>([])
  const [filteredSales, setFilteredSales] = useState<Sale[]>([])
  const [salesByDay, setSalesByDay] = useState<{ [key: string]: Sale[] }>({})
  const [chartData, setChartData] = useState<any[]>([])
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [showDateDialog, setShowDateDialog] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [deletedSales, setDeletedSales] = useState<Sale[]>([])
  const [showDeletedSales, setShowDeletedSales] = useState(false)
  const [loadingDeleted, setLoadingDeleted] = useState(false)
  const [branchFilter, setBranchFilter] = useState("all")
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const router = useRouter()
  const supabase = createClient()

  const totalRevenue = () => {
    return filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
  }

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  useEffect(() => {
    loadSales()
    loadPaymentStats()
  }, [branchFilter])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const data = await res.json()
      setBranches(data.branches || [])
    }
  }

  const getSaleBranchName = (sale: Sale) => {
    if (Array.isArray(sale.branches)) return sale.branches[0]?.name
    if (sale.branches && "name" in sale.branches) return sale.branches.name
    const branch = branches.find((b) => b.id === sale.branch_id)
    return branch?.name || "Sin sucursal"
  }

  const getBranchSummaries = () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return branches.map((branch) => {
      const branchSales = sales.filter((sale) => sale.branch_id === branch.id)
      const todaySales = branchSales.filter((sale) => new Date(sale.created_at) >= todayStart)
      const monthSales = branchSales.filter((sale) => new Date(sale.created_at) >= monthStart)
      const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
      const monthTotal = monthSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)

      return {
        ...branch,
        todayCount: todaySales.length,
        todayTotal,
        monthCount: monthSales.length,
        monthTotal,
        avgTicket: monthSales.length > 0 ? monthTotal / monthSales.length : 0,
      }
    })
  }

  const checkAuth = async () => {
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
  }

  const loadSales = async () => {
    try {
      const branchQuery = branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""
      const response = await fetch(`/api/sales${branchQuery}`)
      if (!response.ok) throw new Error("Failed to fetch sales")

      const data = await response.json()
      const salesArray = data.sales || []
      const activeSales = salesArray.filter((sale: Sale) => sale.status !== "cancelled")
      setSales(activeSales)
    } catch (error) {
      console.error("Error loading sales:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadDeletedSales = async () => {
    setLoadingDeleted(true)
    try {
      const response = await fetch("/api/sales?status=cancelled")
      if (!response.ok) throw new Error("Failed to fetch sales")

      const data = await response.json()
      const salesArray = data.sales || []
      const cancelled = salesArray.filter((sale: Sale) => sale.status === "cancelled")
      setDeletedSales(cancelled)
    } catch (error) {
      console.error("Error loading deleted sales:", error)
    } finally {
      setLoadingDeleted(false)
    }
  }

  const toggleDeletedSalesView = () => {
    if (!showDeletedSales) {
      loadDeletedSales()
    }
    setShowDeletedSales(!showDeletedSales)
  }

  const loadPaymentStats = async () => {
    try {
      const branchQuery = branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""
      const response = await fetch(`/api/payments${branchQuery}`)
      if (!response.ok) throw new Error("Failed to fetch payment stats")

      const data = await response.json()
      setPaymentStats(data)
    } catch (error) {
      console.error("Error loading payment stats:", error)
    }
  }

  const filterSales = useCallback(() => {
    let filtered = [...sales]

    const now = new Date()
    if (dateFilter === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

      filtered = filtered.filter((sale) => {
        const saleDate = new Date(sale.created_at)
        return saleDate >= today && saleDate < tomorrow
      })
    } else if (dateFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= weekAgo)
    } else if (dateFilter === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter((sale) => new Date(sale.created_at) >= monthAgo)
    }

    if (paymentFilter !== "all") {
      filtered = filtered.filter((sale) => sale.payment_method === paymentFilter)
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (sale) =>
          (sale.profiles?.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (sale.id || "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    setFilteredSales(filtered)

    const grouped = filtered.reduce((acc: { [key: string]: Sale[] }, sale) => {
      const date = new Date(sale.created_at).toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(sale)
      return acc
    }, {})

    setSalesByDay(grouped)

    const chartDataMap = filtered.reduce(
      (acc: { [key: string]: { date: string; isoDate: string; ventas: number; total: number; count: number } }, sale) => {
        const dateKey = new Date(sale.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        })

        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            isoDate: sale.created_at,
            ventas: 0,
            total: 0,
            count: 0,
          }
        }

        acc[dateKey].ventas += Number(sale.total_amount)
        acc[dateKey].total += Number(sale.total_amount)
        acc[dateKey].count += 1

        return acc
      },
      {},
    )

    const chartDataArray = Object.values(chartDataMap).sort((a, b) => {
      return new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime()
    })

    setChartData(chartDataArray)
  }, [sales, dateFilter, paymentFilter, searchTerm])

  // AQUÍ ESTÁ EL ARREGLO PARA QUE LAS VENTAS APAREZCAN
  useEffect(() => {
    filterSales()
  }, [filterSales])

  const getAverageTicket = () => {
    if (filteredSales.length === 0) return 0
    return totalRevenue() / filteredSales.length
  }

  // --- LÓGICA: Calcular Desglose por Turnos ---
  const getShiftStats = () => {
    let shift1Total = 0;
    let shift1Count = 0;
    let shift2Total = 0;
    let shift2Count = 0;
    let otherTotal = 0;
    let otherCount = 0;

    filteredSales.forEach((sale) => {
      const date = new Date(sale.created_at);
      const hours = date.getHours(); 

      if (hours >= 9 && hours < 15) {
        shift1Total += Number(sale.total_amount);
        shift1Count++;
      } else if (hours >= 15 && hours < 21) {
        shift2Total += Number(sale.total_amount);
        shift2Count++;
      } else {
        otherTotal += Number(sale.total_amount);
        otherCount++;
      }
    });

    return { shift1Total, shift1Count, shift2Total, shift2Count, otherTotal, otherCount };
  };

  const shiftStats = getShiftStats();
  // ----------------------------------------------------

  const generateSalesReport = () => {
    setShowDateDialog(true)
  }

  const handleGenerateReportForDate = () => {
    if (selectedDate) {
      const dateStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000)

      const daySales = sales.filter((sale) => {
        const saleDate = new Date(sale.created_at)
        return saleDate >= dateStart && saleDate < dateEnd
      })

      const salesBySection: Record<string, number> = {}
      daySales.forEach(sale => {
        if (sale.status === "cancelled") return;
        sale.sale_items?.forEach(item => {
          const sectionName = item.products?.section || 'GENERAL';
          if (!salesBySection[sectionName]) {
            salesBySection[sectionName] = 0;
          }
          salesBySection[sectionName] += (item.quantity * item.unit_price);
        });
      });

      const totalCash = daySales
        .filter((s) => s.payment_method === "cash" || s.payment_method === "efectivo")
        .reduce((sum, s) => sum + Number(s.total_amount), 0)

      const totalCard = daySales
        .filter((s) => s.payment_method === "card" || s.payment_method === "tarjeta")
        .reduce((sum, s) => sum + Number(s.total_amount), 0)

      const countCash = daySales.filter((s) => s.payment_method === "cash" || s.payment_method === "efectivo").length
      const countCard = daySales.filter((s) => s.payment_method === "card" || s.payment_method === "tarjeta").length

      const totalRevenueValue = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
      const reportNumber = Math.floor(Math.random() * 1000) + 1

      const getFilterDescription = () => {
        return selectedDate.toLocaleDateString("es-ES", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      }

      const reportContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Corte del Turno - Farmacia Bienestar</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0 !important; padding: 0 !important; width: 55mm; max-width: 55mm; background: white; color: #000; line-height: 1.4; }
        .content { width: 100%; max-width: 55mm; margin: 0; padding: 2mm; box-sizing: border-box; }
        .center { text-align: center; margin-bottom: 5px; width: 100%; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 5px; width: 100%; }
        .line { border-bottom: 1px solid #000; margin: 8px 0; width: 100%; }
        .double-line { border-bottom: 2px solid #000; margin: 10px 0; width: 100%; }
        .dashed-line { border-bottom: 1px dashed #000; margin: 5px 0; width: 100%; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; width: 100%; }
        .section-title { text-align: center; font-weight: bold; margin: 15px 0 10px 0; padding: 0 2px; font-size: 13px; width: 100%; }
        .section-title::before, .section-title::after { content: "== "; }
        .section-title::after { content: " =="; }
        .right-align { text-align: right; }
        .bold { font-weight: bold; }
        .small { font-size: 10px; }
        .footer-logo { margin-top: 10px; text-align: center; width: 100%; }
        .footer-logo img { width: 100%; max-width: 51mm; height: auto; display: block; margin: 0 auto; }
        @media print {
            * { margin: 0 !important; padding: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 55mm !important; max-width: 55mm !important; }
            .content { width: 55mm !important; max-width: 55mm !important; margin: 0 !important; padding: 2mm !important; box-sizing: border-box !important; }
            @page { size: 55mm auto; margin: 0 !important; }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="center title">CORTE DEL TURNO</div>
        <div class="center">CORTE DE TURNO #${reportNumber}</div>
        
        <div class="line"></div>
        
        <div class="row">
            <span> REALIZADO:</span>
            <span>${new Date().toLocaleDateString("es-ES")} ${new Date().toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>ADMINISTRADOR</span>
        </div>
        <div class="row">
            <span>VENTAS TOTALES:</span>
            <span class="right-align">$${totalRevenueValue.toFixed(2)}</span>
        </div>
        
        <div class="center" style="margin: 15px 0;">
            <strong>${daySales.length} VENTAS EN EL TURNO.</strong>
        </div>
        
        <div class="section-title">DINERO EN CAJA</div>
        
        <div class="row">
            <span>FONDO DE CAJA:</span>
            <span class="right-align">$500.00</span>
        </div>
        <div class="row">
            <span>VENTAS EN EFECTIVO:</span>
            <span class="right-align">+ $${totalCash.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>ABONOS EN EFECTIVO:</span>
            <span class="right-align">+ $0.00</span>
        </div>
        <div class="row">
            <span>ENTRADAS:</span>
            <span class="right-align">+ $0.00</span>
        </div>
        <div class="row">
            <span>SALIDAS:</span>
            <span class="right-align">- $0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>EFECTIVO EN CAJA =</span>
            <span class="right-align">$${(500 + totalCash).toFixed(2)}</span>
        </div>
        
        <div class="section-title">VENTAS</div>
        
        <div class="row">
            <span>EN EFECTIVO</span>
            <span class="right-align">$${totalCash.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>CON TARJETA</span>
            <span class="right-align">$${totalCard.toFixed(2)}</span>
        </div>
        <div class="row">
            <span>A CREDITO</span>
            <span class="right-align">$0.00</span>
        </div>
        <div class="dashed-line"></div>
        <div class="row bold">
            <span>TOTAL VENTAS</span>
            <span class="right-align">$${totalRevenueValue.toFixed(2)}</span>
        </div>
        
        <div class="section-title">VENTAS POR DEPTO</div>
        
        ${Object.entries(salesBySection).length > 0 
          ? Object.entries(salesBySection).map(([section, total]) => `
              <div class="row">
                  <span>${section.toUpperCase()}</span>
                  <span class="right-align">$${Number(total).toFixed(2)}</span>
              </div>
            `).join('')
          : `
             <div class="row">
                 <span>SIN DEPARTAMENTOS</span>
                 <span class="right-align">$0.00</span>
             </div>
            `
        }
        
        <div class="double-line"></div>
        
        <div class="center small" style="margin-top: 15px;">
            <div><strong>FARMACIA BIENESTAR</strong></div>
            <div>Tu salud es nuestro compromiso</div>
            <div>Tel: (555) 123-4567</div>
            <div style="margin-top: 8px;">
                Período: ${getFilterDescription()}<br>
                ${countCash} ventas efectivo, ${countCard} ventas tarjeta
            </div>
            <div style="margin-top: 8px; font-size: 9px;">
                Ticket generado el ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Bienestar v1.0
            </div>
        </div>
    </div>
</body>
</html>
      `

      const printWindow = window.open("", "_blank", "width=400,height=600")
      if (printWindow) {
        printWindow.document.write(reportContent)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
        }, 250)
      }

      setShowDateDialog(false)
    }
  }

  const cancelSale = async (saleId: string) => {
    if (!confirm("¿Estás seguro de que quieres cancelar esta venta? Esta acción no se puede deshacer.")) {
      return
    }

    try {
      const { data: saleItems, error: fetchError } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", saleId)

      if (fetchError) throw fetchError

      const {
        data: { user },
      } = await supabase.auth.getUser()

      for (const item of saleItems || []) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single()

        await supabase
          .from("products")
          .update({
            stock_quantity: (product?.stock_quantity || 0) + item.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.product_id)

        await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          movement_type: "entrada",
          quantity: item.quantity,
          reason: `Devolución por cancelación de Venta #${saleId.slice(-8)}`,
          user_id: user?.id,
        })
      }

      await supabase.from("sales").update({ status: "cancelled" }).eq("id", saleId)

      loadSales()
      alert("Venta cancelada exitosamente y stock restaurado")
    } catch (error) {
      console.error("Error canceling sale:", error)
      alert("Error al cancelar la venta")
    }
  }

  const reprintTicket = (sale: Sale) => {
    const ticketContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Ticket de Venta - Farmacia Bienestar</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 13px; margin: 0 !important; padding: 0 !important; width: 55mm; max-width: 55mm; background: white; color: #000; line-height: 1.4; }
        .content { width: 100%; max-width: 55mm; margin: 0; padding: 2mm; box-sizing: border-box; }
        .center { text-align: center; margin-bottom: 5px; width: 100%; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 5px; width: 100%; }
        .line { border-bottom: 1px solid #000; margin: 8px 0; width: 100%; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; width: 100%; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 11px; width: 100%; }
        .right-align { text-align: right; }
        .bold { font-weight: bold; }
        .small { font-size: 10px; }
        @media print {
            * { margin: 0 !important; padding: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 55mm !important; max-width: 55mm !important; }
            .content { width: 55mm !important; max-width: 55mm !important; margin: 0 !important; padding: 2mm !important; box-sizing: border-box !important; }
            @page { size: 55mm auto; margin: 0 !important; }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="center title">FARMACIA BIENESTAR</div>
        <div class="center small">Tu salud es nuestro compromiso</div>
        <div class="center small">Tel: (555) 123-4567</div>
        
        <div class="line"></div>
        
        <div class="row">
            <span>TICKET:</span>
            <span>#${sale.id.slice(-8)}</span>
        </div>
        <div class="row">
            <span>FECHA:</span>
            <span>${new Date(sale.created_at).toLocaleDateString("es-ES")}</span>
        </div>
        <div class="row">
            <span>HORA:</span>
            <span>${new Date(sale.created_at).toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>${sale.profiles?.full_name || "N/A"}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small bold">PRODUCTOS</div>
        
        ${
          sale.sale_items
            ?.map(
              (item) => `
        <div class="item-row">
            <span>${item.products?.name || "Producto"}</span>
            <span></span>
        </div>
        <div class="item-row">
            <span>  ${item.quantity} x $${item.unit_price.toFixed(2)}</span>
            <span class="right-align">$${(item.quantity * item.unit_price).toFixed(2)}</span>
        </div>
        `,
            )
            .join("") || ""
        }
        
        <div class="line"></div>
        
        <div class="row bold">
            <span>TOTAL:</span>
            <span class="right-align">$${Number(sale.total_amount).toFixed(2)}</span>
        </div>
        
        <div class="row">
            <span>PAGO:</span>
            <span class="right-align">${sale.payment_method.toUpperCase()}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small" style="margin-top: 10px;">
            <div><strong>¡GRACIAS POR SU COMPRA!</strong></div>
            <div>Conserve su ticket</div>
            <div style="margin-top: 8px; font-size: 9px;">
                REIMPRESION - ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Bienestar v1.0
            </div>
        </div>
    </div>
</body>
</html>
    `

    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (printWindow) {
      printWindow.document.write(ticketContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }

  const renderSaleItem = (sale: Sale, index: number) => {
    const cash = isCashMethod(sale.payment_method)
    const itemsCount = sale.sale_items?.length || 0
    return (
      <div
        key={sale.id}
        className="anim-rise-sm group flex flex-col gap-3 rounded-2xl border border-foreground/[0.06] bg-card p-3 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(60_10_30/0.35)] sm:flex-row sm:items-center sm:justify-between sm:p-4"
        style={stagger(Math.min(index, 10))}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:scale-110",
              cash ? "bg-emerald-500/10 text-emerald-700" : "bg-sky-500/10 text-sky-700",
            )}
          >
            {cash ? <Banknote className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">#{sale.id.slice(-8)}</span>
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full border-0 text-[11px]",
                  cash ? "bg-emerald-500/10 text-emerald-700" : "bg-sky-500/10 text-sky-700",
                )}
              >
                {paymentLabel(sale.payment_method)}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {new Date(sale.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {sale.profiles?.full_name || "N/A"}
              {" · "}
              {getSaleBranchName(sale)}
              {" · "}
              {itemsCount} {itemsCount === 1 ? "producto" : "productos"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-lg font-bold tabular-nums">{formatMoney(sale.total_amount)}</span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="press h-9 w-9 rounded-xl"
              onClick={() => reprintTicket(sale)}
              title="Reimprimir ticket"
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="press h-9 w-9 rounded-xl hover:border-destructive/40 hover:bg-destructive/5"
              onClick={() => cancelSale(sale.id)}
              title="Cancelar venta"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            Cargando ventas...
          </div>
        </div>
      </div>
    )
  }

  const revenue = totalRevenue()
  const avgTicket = getAverageTicket()
  const shiftsTotal = shiftStats.shift1Total + shiftStats.shift2Total + shiftStats.otherTotal
  const bestDay = chartData.reduce<{ date: string; ventas: number; count: number } | null>(
    (best, day) => (!best || day.ventas > best.ventas ? day : best),
    null,
  )
  const payTotal = Number(paymentStats?.total ?? 0)
  const payCash = Number(paymentStats?.totalCash ?? 0)
  const payCard = Number(paymentStats?.totalCard ?? 0)
  const cashShare = payCash + payCard > 0 ? (payCash / (payCash + payCard)) * 100 : 0
  const branchSummaries = branchFilter === "all" ? getBranchSummaries() : []
  const maxBranchMonth = Math.max(1, ...branchSummaries.map((b) => b.monthTotal))

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Reportes de Ventas"
        subtitle="Historial, cortes y ventas eliminadas"
        icon={TrendingUp}
        actions={
          <>
            {!showDeletedSales ? (
              <Button variant="outline" className="press hidden rounded-xl sm:inline-flex" onClick={generateSalesReport}>
                <Printer className="mr-2 h-4 w-4" />
                Corte de caja
              </Button>
            ) : null}
            <Button
              variant={showDeletedSales ? "default" : "outline"}
              className="press rounded-xl"
              onClick={toggleDeletedSalesView}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {showDeletedSales ? "Ver Ventas Activas" : "Ver Ventas Eliminadas"}
            </Button>
          </>
        }
      />

      <div className="space-y-5 p-4 sm:p-6 lg:px-8">
        {showDeletedSales ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>Ventas Eliminadas</CardTitle>
                  <CardDescription>Historial de ventas canceladas con fecha y hora</CardDescription>
                </div>
              </div>
              {!loadingDeleted && deletedSales.length > 0 ? (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{deletedSales.length} canceladas</p>
                  <p className="text-xl font-bold text-destructive tabular-nums">
                    {formatMoney(deletedSales.reduce((sum, s) => sum + Number(s.total_amount), 0))}
                  </p>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {loadingDeleted ? (
                <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
                  <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                  Cargando ventas eliminadas...
                </div>
              ) : deletedSales.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <span className="pattern-hatch flex h-16 w-16 items-center justify-center rounded-3xl">
                    <Receipt className="h-7 w-7 text-primary" />
                  </span>
                  <p className="text-muted-foreground">No hay ventas eliminadas</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-foreground/[0.06]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Venta</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Método de Pago</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Productos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deletedSales.map((sale) => {
                        const saleDate = new Date(sale.created_at)
                        const dateStr = saleDate.toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                        const timeStr = saleDate.toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                        return (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono text-sm">{sale.id.slice(0, 8)}</TableCell>
                            <TableCell>{dateStr}</TableCell>
                            <TableCell>{timeStr}</TableCell>
                            <TableCell>{sale.profiles?.full_name || "Desconocido"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="rounded-full">
                                {paymentLabel(sale.payment_method)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-destructive tabular-nums">
                              {formatMoney(sale.total_amount)}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="space-y-0.5 text-sm">
                                {sale.sale_items?.map((item, idx) => (
                                  <div key={idx}>
                                    {item.products?.name} <span className="text-muted-foreground">x{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="bento anim-rise-sm flex flex-col gap-3 p-3 sm:p-4 xl:flex-row xl:items-center">
              <div className="flex flex-wrap gap-2">
                <Segmented
                  value={dateFilter}
                  onChange={setDateFilter}
                  options={[
                    ["today", "Hoy"],
                    ["week", "Semana"],
                    ["month", "Mes"],
                    ["all", "Todas"],
                  ]}
                />
                <Segmented
                  value={paymentFilter}
                  onChange={setPaymentFilter}
                  options={[
                    ["all", "Todos"],
                    ["efectivo", "Efectivo"],
                    ["tarjeta", "Tarjeta"],
                  ]}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="h-10 w-full rounded-2xl border-0 bg-muted px-4 sm:w-[220px]">
                    <Store className="mr-1 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sucursales</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por vendedor o ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-2xl border-0 bg-muted pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div
                className="bento-accent anim-rise relative overflow-hidden p-5 sm:p-6 lg:col-span-2"
                style={stagger(1)}
              >
                <div aria-hidden="true" className="pattern-rings pointer-events-none absolute inset-0" />
                <div className="relative flex h-full flex-col gap-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white/70">Ingresos · {DATE_FILTER_LABEL[dateFilter] || "Periodo"}</p>
                      <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
                        <CountUp key={`${dateFilter}-${paymentFilter}-${branchFilter}`} value={revenue} format={formatMoney} />
                      </p>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                      <DollarSign className="h-6 w-6" />
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-white/70">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Ventas
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        <CountUp value={filteredSales.length} />
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-white/70">
                        <Receipt className="h-3.5 w-3.5" />
                        Ticket promedio
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        <CountUp value={avgTicket} format={formatMoney} />
                      </p>
                    </div>
                    <div className="col-span-2 flex items-center rounded-2xl bg-white/10 p-3 sm:col-span-1">
                      <Magnetic strength={0.15} className="w-full">
                        <Button
                          onClick={generateSalesReport}
                          className="shine press h-11 w-full rounded-xl bg-white font-semibold text-primary hover:bg-white/90"
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Corte de caja
                        </Button>
                      </Magnetic>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bento anim-rise flex flex-col gap-4 p-5" style={stagger(2)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Métodos de pago</p>
                    <p className="text-xs text-muted-foreground">Todas las ventas</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Wallet className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total general</p>
                  <p className="text-2xl font-bold tabular-nums">
                    <CountUp value={payTotal} format={formatMoney} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(paymentStats?.countCash ?? 0) + (paymentStats?.countCard ?? 0)} ventas
                  </p>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  <div className="anim-grow-x h-full bg-emerald-500" style={{ width: `${cashShare}%` }} />
                  <div
                    className="anim-grow-x h-full bg-sky-500"
                    style={{ width: `${100 - cashShare}%`, ...stagger(1) }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-emerald-500/10 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <Banknote className="h-3.5 w-3.5" />
                      Efectivo
                    </p>
                    <p className="mt-1 font-bold tabular-nums text-emerald-900">{formatMoney(payCash)}</p>
                    <p className="text-[11px] text-emerald-700">{paymentStats?.countCash ?? 0} ventas</p>
                  </div>
                  <div className="rounded-2xl bg-sky-500/10 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-sky-700">
                      <CreditCard className="h-3.5 w-3.5" />
                      Tarjeta
                    </p>
                    <p className="mt-1 font-bold tabular-nums text-sky-900">{formatMoney(payCard)}</p>
                    <p className="text-[11px] text-sky-700">{paymentStats?.countCard ?? 0} ventas</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bento anim-rise p-5 sm:p-6" style={stagger(3)}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">Ventas por turno</p>
                    <p className="text-xs text-muted-foreground">Matutino 9am–3pm · Vespertino 3pm–9pm</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <ShiftTile
                  icon={Sun}
                  label="Matutino"
                  range="9:00 AM – 3:00 PM"
                  total={shiftStats.shift1Total}
                  count={shiftStats.shift1Count}
                  share={shiftsTotal > 0 ? (shiftStats.shift1Total / shiftsTotal) * 100 : 0}
                  tone="amber"
                />
                <ShiftTile
                  icon={Sunset}
                  label="Vespertino"
                  range="3:00 PM – 9:00 PM"
                  total={shiftStats.shift2Total}
                  count={shiftStats.shift2Count}
                  share={shiftsTotal > 0 ? (shiftStats.shift2Total / shiftsTotal) * 100 : 0}
                  tone="indigo"
                />
                <ShiftTile
                  icon={Sigma}
                  label="Ambos turnos"
                  range={`${shiftStats.shift1Count + shiftStats.shift2Count} ventas conjuntas`}
                  total={shiftStats.shift1Total + shiftStats.shift2Total}
                  count={shiftStats.shift1Count + shiftStats.shift2Count}
                  share={shiftsTotal > 0 ? ((shiftStats.shift1Total + shiftStats.shift2Total) / shiftsTotal) * 100 : 0}
                  tone="primary"
                />
              </div>
              {shiftStats.otherCount > 0 ? (
                <div className="mt-3 flex items-start gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
                  <Moon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Hay {shiftStats.otherCount} venta(s) fuera de estos horarios por un total de{" "}
                    <strong className="text-foreground">{formatMoney(shiftStats.otherTotal)}</strong>.
                  </span>
                </div>
              ) : null}
            </div>

            {branchSummaries.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {branchSummaries.map((summary, i) => (
                  <Reveal key={summary.id} index={i} className="bento bento-hover group p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:rotate-6 group-hover:scale-110">
                          <Store className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{summary.name}</p>
                          <p className="text-xs text-muted-foreground">Resumen por sucursal</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground">Hoy</p>
                        <p className="font-bold tabular-nums">{formatMoney(summary.todayTotal)}</p>
                        <p className="text-[11px] text-muted-foreground">{summary.todayCount} ventas</p>
                      </div>
                      <div className="rounded-2xl bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground">Mes</p>
                        <p className="font-bold tabular-nums">{formatMoney(summary.monthTotal)}</p>
                        <p className="text-[11px] text-muted-foreground">{summary.monthCount} ventas</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="anim-grow-x h-full rounded-full bg-primary"
                          style={{ width: `${(summary.monthTotal / maxBranchMonth) * 100}%`, ...stagger(i) }}
                        />
                      </div>
                      <p className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>Ticket promedio (mes)</span>
                        <span className="font-semibold text-foreground">{formatMoney(summary.avgTicket)}</span>
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            ) : null}

            {chartData.length > 0 ? (
              <Reveal className="bento p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <BarChart3 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Ventas por día</p>
                      <p className="text-xs text-muted-foreground">Los días más altos son tus días fuertes</p>
                    </div>
                  </div>
                  {bestDay ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-primary/5 px-3 py-2 text-sm">
                      <Trophy className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Mejor día:</span>
                      <span className="font-semibold">{bestDay.date}</span>
                      <span className="font-bold text-primary tabular-nums">{formatMoney(bestDay.ventas)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesBarFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B1538" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#8B1538" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: "#78716c" }}
                        minTickGap={12}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={70}
                        tick={{ fontSize: 12, fill: "#78716c" }}
                        tickFormatter={(value) => `$${Number(value).toLocaleString("es-MX")}`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(139,21,56,0.06)", radius: 10 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-2xl border border-foreground/[0.06] bg-card p-3 shadow-xl">
                                <p className="mb-1 text-sm font-semibold">{payload[0].payload.date}</p>
                                <p className="text-xs text-muted-foreground">{payload[0].payload.count} ventas</p>
                                <p className="text-lg font-bold text-primary">{formatMoney(Number(payload[0].value))}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar
                        dataKey="ventas"
                        fill="url(#salesBarFill)"
                        name="Total de Ventas"
                        radius={[10, 10, 4, 4]}
                        maxBarSize={48}
                        animationBegin={150}
                        animationDuration={900}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Reveal>
            ) : null}

            {Object.keys(salesByDay).length === 0 || filteredSales.length === 0 ? (
              <div className="bento anim-pop flex flex-col items-center justify-center gap-3 py-14 text-center">
                <span className="pattern-hatch flex h-16 w-16 items-center justify-center rounded-3xl">
                  <Calendar className="h-7 w-7 text-primary" />
                </span>
                <p className="text-lg font-semibold">No hay ventas</p>
                <p className="text-sm text-muted-foreground">No se encontraron ventas con los filtros seleccionados</p>
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(salesByDay)
                  .sort((a, b) => {
                    const timeB = new Date(b[1][0]?.created_at || 0).getTime()
                    const timeA = new Date(a[1][0]?.created_at || 0).getTime()
                    return timeB - timeA
                  })
                  .map(([date, daySales]) => {
                    const dayTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
                    const shift1Sales = daySales.filter((s) => {
                      const h = new Date(s.created_at).getHours()
                      return h >= 9 && h < 15
                    })
                    const shift2Sales = daySales.filter((s) => {
                      const h = new Date(s.created_at).getHours()
                      return h >= 15 && h < 21
                    })
                    const otherSales = daySales.filter((s) => {
                      const h = new Date(s.created_at).getHours()
                      return h < 9 || h >= 21
                    })
                    const dayDate = new Date(daySales[0]?.created_at || Date.now())

                    return (
                      <Reveal key={date} className="bento overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/[0.06] bg-muted/30 px-4 py-4 sm:px-6">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary leading-none text-primary-foreground shadow-sm">
                              <span className="text-[10px] font-medium uppercase opacity-80">
                                {dayDate.toLocaleDateString("es-ES", { month: "short" })}
                              </span>
                              <span className="text-lg font-bold">{dayDate.getDate()}</span>
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold capitalize sm:text-lg">{date}</p>
                              <p className="text-xs text-muted-foreground">
                                {daySales.length} {daySales.length === 1 ? "venta en total" : "ventas en total este día"}
                              </p>
                            </div>
                          </div>
                          <p className="text-2xl font-bold tabular-nums">{formatMoney(dayTotal)}</p>
                        </div>

                        <div className="space-y-5 p-4 sm:p-6">
                          {shift1Sales.length > 0 ? (
                            <div>
                              <ShiftHeader
                                icon={Sun}
                                label="Turno Matutino"
                                range="9:00 AM – 3:00 PM"
                                total={shift1Sales.reduce((acc, s) => acc + Number(s.total_amount), 0)}
                                count={shift1Sales.length}
                                tone="amber"
                              />
                              <div className="space-y-2.5">{shift1Sales.map(renderSaleItem)}</div>
                            </div>
                          ) : null}

                          {shift2Sales.length > 0 ? (
                            <div>
                              <ShiftHeader
                                icon={Sunset}
                                label="Turno Vespertino"
                                range="3:00 PM – 9:00 PM"
                                total={shift2Sales.reduce((acc, s) => acc + Number(s.total_amount), 0)}
                                count={shift2Sales.length}
                                tone="indigo"
                              />
                              <div className="space-y-2.5">{shift2Sales.map(renderSaleItem)}</div>
                            </div>
                          ) : null}

                          {otherSales.length > 0 ? (
                            <div>
                              <ShiftHeader
                                icon={Moon}
                                label="Otros horarios"
                                range="Antes de 9 AM o después de 9 PM"
                                total={otherSales.reduce((acc, s) => acc + Number(s.total_amount), 0)}
                                count={otherSales.length}
                                tone="slate"
                              />
                              <div className="space-y-2.5">{otherSales.map(renderSaleItem)}</div>
                            </div>
                          ) : null}
                        </div>
                      </Reveal>
                    )
                  })}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={showDateDialog} onOpenChange={setShowDateDialog}>
        <DialogContent className="rounded-3xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Printer className="h-4 w-4" />
              </span>
              Seleccionar Fecha del Corte
            </DialogTitle>
            <DialogDescription>Elige el día para generar el reporte de corte de caja</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              className="rounded-2xl border"
            />
          </div>
          {selectedDate ? (
            <p className="text-center text-sm capitalize text-muted-foreground">
              {selectedDate.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDateDialog(false)}>
              Cancelar
            </Button>
            <Button className="shine press rounded-xl" onClick={handleGenerateReportForDate}>
              Generar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const DATE_FILTER_LABEL: Record<string, string> = {
  today: "Hoy",
  week: "Últimos 7 días",
  month: "Últimos 30 días",
  all: "Todo el historial",
}

function isCashMethod(method: string) {
  return method === "efectivo" || method === "cash"
}

function paymentLabel(method: string) {
  if (isCashMethod(method)) return "Efectivo"
  if (method === "tarjeta" || method === "card") return "Tarjeta"
  return method
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-2xl bg-muted p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "press whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-300",
            value === key
              ? "bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const SHIFT_TONES = {
  amber: { tile: "bg-amber-500/10 text-amber-700", bar: "bg-amber-500", text: "text-amber-900" },
  indigo: { tile: "bg-indigo-500/10 text-indigo-700", bar: "bg-indigo-500", text: "text-indigo-900" },
  primary: { tile: "bg-primary/10 text-primary", bar: "bg-primary", text: "text-primary" },
  slate: { tile: "bg-slate-500/10 text-slate-700", bar: "bg-slate-500", text: "text-slate-900" },
} as const

type ShiftTone = keyof typeof SHIFT_TONES

function ShiftTile({
  icon: Icon,
  label,
  range,
  total,
  count,
  share,
  tone,
}: {
  icon: LucideIcon
  label: string
  range: string
  total: number
  count: number
  share: number
  tone: ShiftTone
}) {
  const t = SHIFT_TONES[tone]
  return (
    <div className="group rounded-2xl border border-foreground/[0.06] bg-card p-4 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:rotate-12 group-hover:scale-110",
            t.tile,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{Math.round(share)}%</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="text-[11px] text-muted-foreground">{range}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", t.text)}>
        <CountUp value={total} format={formatMoney} />
      </p>
      <p className="text-xs text-muted-foreground">{count} ventas</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("anim-grow-x h-full rounded-full", t.bar)} style={{ width: `${share}%` }} />
      </div>
    </div>
  )
}

function ShiftHeader({
  icon: Icon,
  label,
  range,
  total,
  count,
  tone,
}: {
  icon: LucideIcon
  label: string
  range: string
  total: number
  count: number
  tone: ShiftTone
}) {
  const t = SHIFT_TONES[tone]
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", t.tile)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {range} · {count} {count === 1 ? "venta" : "ventas"}
          </p>
        </div>
      </div>
      <span className={cn("font-bold tabular-nums", t.text)}>{formatMoney(total)}</span>
    </div>
  )
}
