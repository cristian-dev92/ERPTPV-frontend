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
  stock: number;

  /** Descripción ampliada de los materiales o el trabajo a realizar */
  descripcion?: string;

  //Lo que pide el backend
  precioBase: number;       // Precio antes de impuestos
  porcentajeIva: number;    // Ej: 21

  /** Precio final */
  precio: number;

  activo?: boolean;
  empresaId?: number;
}