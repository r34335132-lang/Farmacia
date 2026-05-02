import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Forzamos el renderizado dinámico
export const dynamic = 'force-dynamic';

export default async function MovimientosPage() {
  const supabase = await createClient();

  // Consultar usando tu tabla stock_movements y sus columnas reales
  const { data: movimientos, error } = await supabase
    .from("stock_movements")
    .select(`
      id,
      quantity,
      movement_type,
      reason,
      created_at,
      products ( name ),
      profiles ( full_name, email )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error cargando movimientos:", error);
  }

  // Formato de fecha
  const formatearFecha = (fechaString: string) => {
    const fecha = new Date(fechaString);
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(fecha);
  };

  // Asignar color basado en tus 3 tipos permitidos ('entrada', 'salida', 'ajuste')
  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'entrada': 
        return 'bg-green-500 hover:bg-green-600';
      case 'salida': 
        return 'bg-red-500 hover:bg-red-600';
      case 'ajuste': 
        return 'bg-orange-500 hover:bg-orange-600';
      default: 
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Bitácora de Inventario</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos Movimientos</CardTitle>
          <CardDescription>
            Historial de auditoría de entradas, salidas y ajustes de stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Razón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos && movimientos.length > 0 ? (
                  movimientos.map((mov: any) => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {formatearFecha(mov.created_at)}
                      </TableCell>
                      
                      <TableCell>
                        {mov.products?.name || "Producto eliminado"}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {mov.profiles?.full_name || "Desconocido"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {mov.profiles?.email || ""}
                          </span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge className={`text-white uppercase ${getBadgeColor(mov.movement_type)}`}>
                          {mov.movement_type}
                        </Badge>
                      </TableCell>
                      
                      <TableCell className="text-right font-bold">
                        {mov.movement_type === 'entrada' ? '+' : mov.movement_type === 'salida' ? '-' : ''}
                        {mov.quantity}
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm">
                        {mov.reason || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No hay movimientos registrados en la base de datos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}