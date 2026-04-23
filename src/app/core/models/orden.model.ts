import { Articulo } from './articulo.model';

/**
 * Representa una línea individual dentro de un ticket.
 */
export interface LineaOrden {
  articuloId: number;
  nombreArticulo: string; // Para mostrar en el ticket sin volver a consultar la API
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/**
 * Interfaz principal para las Ventas y Reparaciones.
 * Es el "Contrato" que sigue los Flujos A y B del README técnico.
 */
export interface Orden {
  id?: number;
  fecha?: Date;
  
  /** * Tipo de operación:
   * VENTA: Venta directa de productos/servicios.
   * REPARACION: Requiere gestión de entrega y posibles anticipos.
   */
  tipo: 'VENTA' | 'REPARACION';

  /** * Estado actual de la orden:
   * PENDIENTE: Creada pero no pagada totalmente.
   * PAGADO: Cobro completado.
   * CANCELADA: El stock se devuelve y se anula la venta.
   */
  estado: 'PENDIENTE' | 'PAGADO' | 'CANCELADA';

  /** Total acumulado de la suma de las líneas */
  total: number;

  /** * Cantidad ya entregada por el cliente. 
   * Si es menor al total y tipo es REPARACION, es un "Anticipo".
   */
  importePagado: number;

  /** El desglose de los productos o arreglos que se cobran */
  lineas: LineaOrden[];

  /** ID del cliente (opcional para tickets anónimos) */
  clienteId?: number;

  /** Nombre del empleado que realizó la venta (extraído del token) */
  vendedor?: string;
}