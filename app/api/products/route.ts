import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Evita que Next.js guarde esto en caché. Vital para un sistema de inventario.
export const dynamic = 'force-dynamic';

// ==========================================
// 1. OBTENER PRODUCTOS (GET) - Todo el catálogo
// ==========================================
export async function GET() {
  try {
    const supabase = await createClient();

    let allProducts: any[] = [];
    let start = 0;
    const pageSize = 1000; // Obtener 1000 productos por vez
    let hasMore = true;

    // Obtener TODOS los productos haciendo múltiples llamadas si es necesario
    while (hasMore) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name")
        .range(start, start + pageSize - 1);

      if (error) {
        console.error("Error fetching products:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data && data.length > 0) {
        allProducts = [...allProducts, ...data];
        start += pageSize;

        // Si obtuvimos menos productos que el pageSize, ya no hay más
        if (data.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
    });
  } catch (error: any) {
    console.error("Error in products API:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// ==========================================
// 2. ACTUALIZAR STOCK Y REGISTRAR MOVIMIENTO (PATCH)
// ==========================================
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    // Ojo: asegúrate que desde el frontend envías 'stock'. Si tu BD se llama 'stock_quantity', ajústalo.
    const { id, stock, reason = 'Actualización manual desde admin' } = body;

    if (!id || stock === undefined) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (id, stock)" },
        { status: 400 }
      );
    }

    // A. Identificar quién está haciendo el cambio
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // B. Obtener el stock actual antes de sobreescribirlo
    const { data: oldProduct, error: fetchError } = await supabase
      .from("products")
      .select("stock_quantity") // <-- Ajusta esto a tu columna real (ej. stock o stock_quantity)
      .eq("id", id)
      .single();

    if (fetchError || !oldProduct) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const previous_stock = oldProduct.stock_quantity; // <-- Ajusta esto si tu columna se llama diferente
    const difference = stock - previous_stock;

    if (difference === 0) {
      return NextResponse.json({ success: true, message: "El stock es el mismo, no hubo cambios" });
    }

    // Definir si fue entrada o salida para tu restricción (check) en BD
    const movementType = difference > 0 ? 'entrada' : 'salida';
    const quantity = Math.abs(difference); // Guardamos el valor absoluto en quantity

    // C. Actualizar el producto
    const { error: updateError } = await supabase
      .from("products")
      .update({ stock_quantity: stock }) // <-- Ajusta el nombre de la columna si es necesario
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // D. Guardar el movimiento en la bitácora
    const { error: logError } = await supabase
      .from("stock_movements")
      .insert({
        product_id: id,
        user_id: user.id,
        movement_type: movementType,
        quantity: quantity,
        reason: reason
      });

    if (logError) {
      console.error("Error registrando en bitácora:", logError);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Inventario actualizado y registrado correctamente" 
    });

  } catch (error: any) {
    console.error("Error in PATCH products API:", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// ==========================================
// 3. CREAR PRODUCTO (POST) - Registra la entrada inicial
// ==========================================
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Identificar al admin que está creando el producto
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Insertar el nuevo producto en la base de datos
    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert(body)
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Si el producto se creó con un stock mayor a 0, lo registramos en la bitácora
    // Asegúrate de usar la propiedad correcta (ej. stock_quantity)
    const initialStock = newProduct.stock_quantity || newProduct.stock || 0;

    if (newProduct && initialStock > 0) {
      await supabase.from("stock_movements").insert({
        product_id: newProduct.id,
        user_id: user?.id,
        movement_type: 'entrada',
        quantity: initialStock,
        reason: 'Stock inicial por creación de producto',
      });
    }

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: any) {
    console.error("Error al crear producto:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==========================================
// 4. ELIMINAR PRODUCTO (DELETE) - Limpia la base de datos
// ==========================================
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID de producto requerido" }, { status: 400 });
    }

    // PRIMERO: Borramos el historial del producto para evitar errores de llave foránea
    await supabase
      .from("stock_movements")
      .delete()
      .eq("product_id", id);

    // SEGUNDO: Borramos el producto
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ 
      success: true, 
      message: "Producto y su historial eliminados correctamente" 
    });
  } catch (error: any) {
    console.error("Error al eliminar producto:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}