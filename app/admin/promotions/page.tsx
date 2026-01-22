"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Search,
  Percent,
  DollarSign,
  Calendar,
  Tag,
  Package,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from "lucide-react"

interface Product {
  id: string
  name: string
  price: number
  category: string | null
  image_url: string | null
}

interface Promotion {
  id: string
  name: string
  description: string | null
  discount_type: "percentage" | "fixed"
  discount_value: number
  start_date: string
  end_date: string
  is_active: boolean
  created_at: string
}

interface ProductPromotion {
  promotion_id: string
  product_id: string
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productPromotions, setProductPromotions] = useState<ProductPromotion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchParams = useSearchParams()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    discount_type: "percentage" as "percentage" | "fixed",
    discount_value: 0,
    start_date: "",
    end_date: "",
    is_active: true,
    product_ids: [] as string[],
  })

  const [productSearch, setProductSearch] = useState("")

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [promotionsRes, productsRes, productPromosRes] = await Promise.all([
        supabase.from("promotions").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("id, name, price, category, image_url").order("name"),
        supabase.from("product_promotions").select("*"),
      ])

      if (promotionsRes.data) setPromotions(promotionsRes.data)
      if (productsRes.data) setProducts(productsRes.data)
      if (productPromosRes.data) setProductPromotions(productPromosRes.data)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setSelectedPromotion(null)
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    setFormData({
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: 10,
      start_date: now.toISOString().slice(0, 16),
      end_date: nextWeek.toISOString().slice(0, 16),
      is_active: true,
      product_ids: [],
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(promotion: Promotion) {
    setSelectedPromotion(promotion)
    const promoProductIds = productPromotions
      .filter((pp) => pp.promotion_id === promotion.id)
      .map((pp) => pp.product_id)
    setFormData({
      name: promotion.name,
      description: promotion.description || "",
      discount_type: promotion.discount_type,
      discount_value: promotion.discount_value,
      start_date: promotion.start_date.slice(0, 16),
      end_date: promotion.end_date.slice(0, 16),
      is_active: promotion.is_active,
      product_ids: promoProductIds,
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      alert("El nombre es requerido")
      return
    }
    if (formData.product_ids.length === 0) {
      alert("Selecciona al menos un producto")
      return
    }

    setIsSubmitting(true)
    try {
      const promotionData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_active: formData.is_active,
      }

      let promotionId: string

      if (selectedPromotion) {
        // Update
        const { error } = await supabase
          .from("promotions")
          .update(promotionData)
          .eq("id", selectedPromotion.id)

        if (error) throw error
        promotionId = selectedPromotion.id

        // Delete existing product associations
        await supabase.from("product_promotions").delete().eq("promotion_id", promotionId)
      } else {
        // Create
        const { data, error } = await supabase
          .from("promotions")
          .insert(promotionData)
          .select()
          .single()

        if (error) throw error
        promotionId = data.id
      }

      // Add product associations
      const productPromotionsData = formData.product_ids.map((productId) => ({
        promotion_id: promotionId,
        product_id: productId,
      }))

      const { error: ppError } = await supabase
        .from("product_promotions")
        .insert(productPromotionsData)

      if (ppError) throw ppError

      setIsDialogOpen(false)
      loadData()
    } catch (error) {
      console.error("Error saving promotion:", error)
      alert("Error al guardar la promocion")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!selectedPromotion) return

    setIsSubmitting(true)
    try {
      // Delete product associations first
      await supabase.from("product_promotions").delete().eq("promotion_id", selectedPromotion.id)

      // Delete promotion
      const { error } = await supabase
        .from("promotions")
        .delete()
        .eq("id", selectedPromotion.id)

      if (error) throw error

      setIsDeleteDialogOpen(false)
      loadData()
    } catch (error) {
      console.error("Error deleting promotion:", error)
      alert("Error al eliminar la promocion")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function togglePromotionStatus(promotion: Promotion) {
    try {
      const { error } = await supabase
        .from("promotions")
        .update({ is_active: !promotion.is_active })
        .eq("id", promotion.id)

      if (error) throw error

      setPromotions((prev) =>
        prev.map((p) => (p.id === promotion.id ? { ...p, is_active: !p.is_active } : p))
      )
    } catch (error) {
      console.error("Error toggling status:", error)
    }
  }

  const filteredPromotions = promotions.filter((promo) =>
    promo.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  const getPromoProducts = (promotionId: string) => {
    const productIds = productPromotions
      .filter((pp) => pp.promotion_id === promotionId)
      .map((pp) => pp.product_id)
    return products.filter((p) => productIds.includes(p.id))
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const isPromotionActive = (promo: Promotion) => {
    const now = new Date()
    const start = new Date(promo.start_date)
    const end = new Date(promo.end_date)
    return promo.is_active && now >= start && now <= end
  }

  return (
    <Suspense fallback={<Loading />}>
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link href="/admin/dashboard">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <Image
                  src="/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div>
                  <h1 className="font-bold text-lg text-primary">Promociones</h1>
                  <p className="text-xs text-muted-foreground">Gestiona ofertas y descuentos</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={loadData}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Promocion
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar promociones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Promotions Grid */}
          {filteredPromotions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay promociones</h3>
                <p className="text-muted-foreground mb-4">Crea tu primera promocion para atraer clientes</p>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Promocion
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPromotions.map((promo) => {
                const promoProducts = getPromoProducts(promo.id)
                const isActive = isPromotionActive(promo)

                return (
                  <Card key={promo.id} className={!isActive ? "opacity-60" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {promo.name}
                            {isActive && (
                              <Badge className="bg-green-500 text-white">Activa</Badge>
                            )}
                            {!promo.is_active && (
                              <Badge variant="secondary">Desactivada</Badge>
                            )}
                          </CardTitle>
                          {promo.description && (
                            <CardDescription className="mt-1">{promo.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(promo)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedPromotion(promo)
                              setIsDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Discount */}
                      <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                        {promo.discount_type === "percentage" ? (
                          <Percent className="h-8 w-8 text-primary" />
                        ) : (
                          <DollarSign className="h-8 w-8 text-primary" />
                        )}
                        <div>
                          <p className="text-2xl font-bold text-primary">
                            {promo.discount_type === "percentage"
                              ? `${promo.discount_value}%`
                              : `$${promo.discount_value}`}
                          </p>
                          <p className="text-xs text-muted-foreground">de descuento</p>
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatDate(promo.start_date)} - {formatDate(promo.end_date)}
                        </span>
                      </div>

                      {/* Products */}
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {promoProducts.length} productos
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {promoProducts.slice(0, 3).map((product) => (
                            <Badge key={product.id} variant="outline" className="text-xs">
                              {product.name}
                            </Badge>
                          ))}
                          {promoProducts.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{promoProducts.length - 3} mas
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Toggle */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm">Promocion activa</span>
                        <Switch
                          checked={promo.is_active}
                          onCheckedChange={() => togglePromotionStatus(promo)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </main>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPromotion ? "Editar Promocion" : "Nueva Promocion"}
              </DialogTitle>
              <DialogDescription>
                {selectedPromotion
                  ? "Modifica los detalles de la promocion"
                  : "Crea una nueva promocion para tus productos"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid gap-4">
                <div>
                  <Label>Nombre de la promocion *</Label>
                  <Input
                    placeholder="Ej: Descuento de Verano"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Descripcion</Label>
                  <Textarea
                    placeholder="Describe la promocion..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de descuento</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(value: "percentage" | "fixed") =>
                      setFormData({ ...formData, discount_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>
                    Valor del descuento{" "}
                    {formData.discount_type === "percentage" ? "(%)" : "($)"}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={formData.discount_type === "percentage" ? 100 : undefined}
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({ ...formData, discount_value: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha de inicio</Label>
                  <Input
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha de fin</Label>
                  <Input
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Promocion activa</p>
                  <p className="text-sm text-muted-foreground">
                    La promocion se aplicara automaticamente
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>

              {/* Products Selection */}
              <div>
                <Label className="mb-2 block">Productos aplicables *</Label>
                <div className="border rounded-lg">
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar productos..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {formData.product_ids.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {formData.product_ids.length} productos seleccionados
                      </p>
                    )}
                  </div>
                  <ScrollArea className="h-60">
                    <div className="p-2 space-y-1">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          onClick={() => {
                            const isSelected = formData.product_ids.includes(product.id)
                            setFormData({
                              ...formData,
                              product_ids: isSelected
                                ? formData.product_ids.filter((id) => id !== product.id)
                                : [...formData.product_ids, product.id],
                            })
                          }}
                        >
                          <Checkbox
                            checked={formData.product_ids.includes(product.id)}
                            onCheckedChange={(checked) => {
                              setFormData({
                                ...formData,
                                product_ids: checked
                                  ? [...formData.product_ids, product.id]
                                  : formData.product_ids.filter((id) => id !== product.id),
                              })
                            }}
                          />
                          <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                            {product.image_url ? (
                              <Image
                                src={product.image_url || "/placeholder.svg"}
                                alt={product.name}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">${product.price.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting
                  ? "Guardando..."
                  : selectedPromotion
                  ? "Guardar Cambios"
                  : "Crear Promocion"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Eliminar Promocion
              </DialogTitle>
              <DialogDescription>
                Estas seguro de que deseas eliminar la promocion "{selectedPromotion?.name}"?
                Esta accion no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting ? "Eliminando..." : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Suspense>
  )
}
