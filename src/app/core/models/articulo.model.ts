/**
 * Interfaz que define un Artículo dentro del sistema (El Catálogo).
 * Sincronizado al 100% con el DTO de producción ArticuloCatalogoDTO del backend.
 */
export interface Articulo {
  /** ID único del artículo en el catálogo */
  id?: number;
  /** Código interno de referencia o SKU (ej: "CRE-TAR-NE") */
  codigoReferencia: string;
  /** Nombre comercial del producto o servicio (ej: "Suela de Goma") */
  nombre: string;
  /** Precio base con IVA ya incluido (PVP final en mostrador) */
  precioFinal: number;      
  /** Porcentaje de IVA aplicado al artículo (Ej: 21.00, 10.00) */
  porcentajeIva: number; 
  /** Precio de compra / coste para la empresa (opcional) */
  precioCompra?: number;
  /** ID del proveedor asociado (opcional) */
  proveedorId?: number | null;
  /** Nombre del proveedor asociado (opcional) */
  proveedorNombre?: string | null;
  /** Cantidad disponible en la tienda. Solo relevante si tipo es 'PRODUCTO' */
  stock?: number | null;
  /** Stock mínimo para alertas de reposición */
  stockMinimo?: number | null;
  /** Indica si el artículo está activo para su uso en el sistema (Borrado lógico) */
  activo: boolean; 
  /** Notas internas de inventario/almacén (ej: ubicación de estantería) */
  notas?: string | null;
  /** Porcentaje de descuento por defecto del catálogo */
  porcentajeDescuento?: number;
  
  // --- ASOCIACIÓN DE CATEGORÍAS / FAMILIAS ---
  /** ID de la familia a la que pertenece */
  familiaId?: number | null;
  /** Mapeado directo del backend para usar como categorías en el TPV */
  familiaNombre?: string | null; 
  
  // --- LECTURA DE CÓDIGO DE BARRAS ---
  /** Código de barras para escáner integrado */
  codigoBarras?: string | null;   
}

/**
 * Payload específico para la creación de nuevos artículos.
 * Clona exactamente la estructura del NuevoArticuloRequest de Java.
 */
export interface NuevoArticuloRequest {
  nombre: string;
  codigoReferencia: string;
  precioFinal: number;
  porcentajeIva: number;
  precioCompra?: number;
  proveedorId?: number | null;
  stock?: number | null;
  stockMinimo?: number | null;
  notas?: string | null;
  porcentajeDescuento?: number;
  familiaId?: number | null;
  codigoBarras?: string | null;
}