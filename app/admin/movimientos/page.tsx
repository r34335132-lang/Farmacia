"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroDias, setFiltroDias] = useState("7"); // Por defecto últimos 7 días
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  
  const itemsPerPage = 15; // Cantidad de movimientos por página
  const supabase = createClient();

  useEffect(() => {
    fetchMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filtroDias, page]);

  const fetchMovimientos = async () => {
    // Usamos 'stock_movements' y 'products' basados en tu esquema SQL real
    let query = supabase
      .from("stock_movements")
      .select("*, products!inner(name)", { count: "exact" })
      .order("created_at", { ascending: false });

    // 1. Filtro de Búsqueda por Producto (columna 'name')
    if (searchTerm) {
      query = query.ilike("products.name", `%${searchTerm}%`);
    }

    // 2. Filtro por Días
    if (filtroDias !== "todos") {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - parseInt(filtroDias));
      query = query.gte("created_at", fechaLimite.toISOString());
    }

    // 3. Paginación
    const from = page * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error obteniendo movimientos:", error);
      return;
    }

    if (data) setMovimientos(data);
    if (count !== null) setTotalItems(count);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Historial de Movimientos</h1>

      {/* Controles de Filtros y Búsqueda */}
      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0); // Reiniciar a la página 0 al buscar
          }}
          className="max-w-sm"
        />

        <Select
          value={filtroDias}
          onValueChange={(value) => {
            setFiltroDias(value);
            setPage(0); // Reiniciar a la página 0 al cambiar el filtro
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por tiempo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24 horas</SelectItem>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="todos">Todo el historial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla de Resultados */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24">
                  No se encontraron movimientos.
                </TableCell>
              </TableRow>
            ) : (
              movimientos.map((mov) => (
                <TableRow key={mov.id}>
                  <TableCell>
                    {new Date(mov.created_at).toLocaleDateString()}
                  </TableCell>
                  {/* Se mapea a mov.products.name basado en la relación de BD */}
                  <TableCell>{mov.products?.name || "N/A"}</TableCell>
                  <TableCell className="capitalize">{mov.movement_type}</TableCell>
                  <TableCell className="text-right">{mov.quantity}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Controles de Paginación */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Mostrando {page * itemsPerPage + 1} - {Math.min((page + 1) * itemsPerPage, totalItems)} de {totalItems} movimientos
        </p>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
