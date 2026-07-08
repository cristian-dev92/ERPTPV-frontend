/**
 * Interfaz que define un Artículo dentro del sistema (El Catálogo).
 * Sincronizado con el nuevo ArticuloCatalogoDTO del backend de producción.
 */
export interface Articulo {
  /** ID único. Opcional solo en creación local antes de persistir en BD */
  id?: number;
  /** Nombre comercial del producto o servicio (ej: "Suela de Goma", "Mocasín") */
  nombre: string;
  /** Discriminador estricto del backend. PRODUCTO: Control de stock. SERVICIO: Mano de obra */
  tipo: 'PRODUCTO' | 'SERVICIO';
  /** Cantidad disponible en la tienda. Solo relevante si tipo es 'PRODUCTO' */
  stock?: number | null;
  stockMinimo?: number | null;
  /** Descripción ampliada de los materiales o el trabajo a realizar */
  descripcion?: string;
  // --- NÚCLEO FINANCIERO (PVP con IVA incluido) ---
  precioFinal: number;      
  /** Porcentaje de IVA aplicado al artículo (Ej: 21, 10, 4, 0) */
  porcentajeIva: number; 
  /** Porcentaje de descuento por defecto del catálogo */
  porcentajeDescuento?: number;
  // --- DATOS DE CONTROL INTERNO Y PRODUCCIÓN ---
  activo: boolean; // 🚫 Borrado lógico global (Obligatorio en producción)
  empresaId?: number;
  // --- CAMPOS ADICIONALES PARA REPARACIONES ---
  notasReparacion?: string | null;
  // --- NOTAS INTERNAS DE INVENTARIO/ALMACÉN ---
  notas?: string | null;
  // --- CAMPOS PARA ASOCIACIÓN DE CATEGORÍAS ---
  familiaId?: number | null;
  familiaNombre?: string | null; // 🏷️ Nuevo: Traído del backend para optimizar lecturas/selects
  // --- LECTURA DE CÓDIGO DE BARRAS ---
  codigoBarras?: string | null;   // Ya integrado en el DTO oficial de producción
}