export type TipoOrden = 'VENTA_DIRECTA' | 'REPARACION' | 'DEVOLUCION';
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO';
export type EstadoTaller = 'EN_TALLER' | 'LISTO' | 'ENTREGADO';

// ====== DTOs DE ENTRADA (PAYLOADS HACIA EL BACKEND) ======

export interface LineaVentaDirectaDTO {
  articuloId: number;
  cantidad: number;
  porcentajeDescuento: number;
}

export interface TrabajoTallerDTO {
  descripcionTrabajo: string;       // El servicio (ej: "Cambio de tapas")
  precioFinalTrabajo: number;       // Forzado o editado en el mostrador
  notasMostrador: string | null;    // Notas específicas (ej: "Diente de oro")
  fechaPrometidaRecogida: string;   // Formato YYYY-MM-DD
  articuloBaseId: number | null;    // ID del artículo de stock consumido (null si es manual)
  cantidadMaterial: number | null;  // Cantidad consumida del stock
  descripcionBulto: string;         // Descripción física del zapato (ej: "Botas altas negras")
}

export interface NuevaOrdenDTO {
  clienteId: number | null;         // null para ventas de paso/anónimas
  descuentoGlobal: number;
  notasGenerales: string;           // Nota general a nivel de ticket
  importePagado: number;            // 0 = PRE- (Presupuesto) / >0 = TCK- (Ticket)
  lineasVentaDirecta: LineaVentaDirectaDTO[];
  trabajosTaller: TrabajoTallerDTO[];
}

export interface LineaDevolucionDTO {
  articuloId: number;
  cantidad: number;                 // Siempre en positivo desde el Front
}

export interface DevolucionRequest {
  ordenOrigenId: number | null;
  metodoPago: MetodoPago;
  lineas: LineaDevolucionDTO[];
}

// ====== DTOs DE SALIDA (LECTURA DESDE EL BACKEND) ======

export interface LineaVentaDirectaSalidaDTO {
  id: number;
  articuloCodigo: string;
  articuloId: number;
  articuloNombre: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeDescuento: number;
  porcentajeIva: number;
  subtotal: number;
}

export interface TrabajoTallerSalidaDTO {
  id: number;
  articuloBaseCodigo: string | null;
  codigoEtiqueta: string;
  descripcion: string;
  notasMostrador: string;
  articuloBaseNombre: string | null;
  cantidadMaterial: number | null;
  precioFinalTrabajo: number;
  estadoTaller: EstadoTaller;
  fechaPrometidaRecogida: string;
  descripcionBulto: string;
}

export interface OrdenDTO {
  id: number;
  numeroTicket: string;
  fechaCreacion: string;
  total: number;
  totalBaseImponible: number;
  totalIva: number;
  importePagado: number;
  importePendiente: number;
  estadoPago: 'PENDIENTE' | 'ANTICIPO' | 'PAGADO' | 'DEVUELTO' | 'CANCELADO';
  descuentoGlobal: number;
  notasGenerales: string;
  ordenOrigenId: number | null;
  clienteId: number | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  empleadoNombre: string;
  lineasVentaDirecta: LineaVentaDirectaSalidaDTO[];
  trabajosTaller: TrabajoTallerSalidaDTO[];
  
  // Temporal para compatibilidad con botones viejos de tus templates HTML
  cliente?: {
    id?: number;
    nombre?: string;
    telefono?: string;
  } | null;
}