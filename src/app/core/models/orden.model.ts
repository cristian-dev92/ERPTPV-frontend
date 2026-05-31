
export interface LineaOrden {
  articuloId: number;
  nombreArticulo: string; // Para mostrar en el ticket sin volver a consultar la API
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notasReparacion?: string;
}

export interface Orden {
  id?: number;
  numeroTicket?: string;
  fechaCreacion?: string;
  tipo: 'VENTA_DIRECTA' | 'REPARACION';
  estadoPago: 'PENDIENTE' | 'PAGADO' | 'ANTICIPO';
  estadoTaller?: 'EN_TALLER' | 'LISTO' | 'ENTREGADO' | 'NO_APLICA';
  total: number;
  totalBaseImponible?: number;
  totalIva?: number;
  importePagado: number;
  importePendiente?: number;

  /** ID del cliente (opcional para tickets anónimos) */
  clienteId?: number;
  clienteNombre?: string;   
  clienteTelefono?: string;
  empleadoNombre?: string;  
  notasReparacion?: string;  
  detalles?: any[];
  // Mantén esta propiedad temporal SOLO para que los botones viejos del HTML no rompan el tipado
  cliente?: {
    id?: number;
    nombre?: string;
    telefono?: string;
  } | null;
}