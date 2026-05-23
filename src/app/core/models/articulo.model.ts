/**
 * Interfaz que define un Artículo dentro del sistema (El Catálogo).
 * Según las reglas del backend, un artículo puede ser un PRODUCTO físico 
 * o un SERVICIO (como una reparación).
 */
export interface Articulo {
  
  /** * ID único del artículo. 
   * Es opcional (?) porque cuando creamos un zapato nuevo en el frontend, 
   * aún no tiene ID hasta que el backend lo guarda y nos lo devuelve.
   */
  id?: number;

  /** Nombre comercial del producto o servicio (ej: "Suela de Goma", "Mocasín") */
  nombre: string;

  /** * Discriminador estricto del backend.
   * PRODUCTO: Se le aplica control de stock.
   * SERVICIO: No tiene stock, es mano de obra.
   */
  tipo: 'PRODUCTO' | 'SERVICIO';

  /** * Cantidad disponible en la tienda. 
   * Solo es relevante si el tipo es 'PRODUCTO'.
   */
  stock?: number | null;
  stockMinimo?: number | null;

  /** Descripción ampliada de los materiales o el trabajo a realizar */
  descripcion?: string;

  // --- NÚCLEO FINANCIERO (B2C Top-Down) ---

  /** Precio Final de venta al público (PVP con IVA incluido) */
  precioFinal: number;      

  /** Porcentaje de IVA aplicado al artículo (Ej: 21, 10, 4, 0) */
  porcentajeIva: number; 

  // --- DATOS DE CONTROL INTERNO ---
  activo?: boolean;
  empresaId?: number;
}