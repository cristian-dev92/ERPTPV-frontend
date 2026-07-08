import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable, tap } from 'rxjs';

// Mapeo exacto de los Schemas de Java para que tu Front vaya sobre seguro
export type TipoOrden = 'VENTA_DIRECTA' | 'REPARACION' | 'DEVOLUCION';

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO';

export interface DetalleOrdenDTO {
  id: number;
  articuloId: number;
  articuloNombre: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  notasReparacion?: string;
  subtotal: number;
  baseImponible: number;
  cuotaIva: number;
  porcentajeDescuento: number;
}

// Interfaz para representar la Orden/Ticket completo que viene de la BD
export interface OrdenDTO {
  id: number;
  numeroTicket: string;
  fechaCreacion: string;
  total: number;
  totalBaseImponible: number;
  totalIva: number;
  importePagado: number;      
  importePendiente: number;  
  tipo: TipoOrden;
  estadoPago: string;         
  estadoTaller: string;       
  ordenOrigenId?: number;     
  clienteId?: number;        
  clienteNombre?: string;
  clienteTelefono?: string;   
  empleadoNombre: string;     
  notasReparacion?: string;   
  fechaPrometidaRecogida?: string; 
  fechaEntregaReal?: string;       
  detalles: DetalleOrdenDTO[]; 
}

export interface NuevaLineaDTO {
  articuloId: number;
  cantidad: number;
  notasReparacion?: string | null;
  porcentajeDescuento?: number;
}

export interface NuevaOrdenDTO {
  empresaId: number;
  empleadoId: number;
  clienteId: number | null; // null si es venta anónima
  lineas: NuevaLineaDTO[];   // El carrito de la compra
  tipo?: TipoOrden;          // Opcional, por defecto VENTA_DIRECTA
  fechaPrometidaRecogida?: string | null; // Mapea el LocalDate (YYYY-MM-DD)
  descuentoGlobal: number;
  notasGenerales?: string;
}

export interface LineaDevolucionDTO {
  articuloId: number;
  cantidad: number; // ⚠️ Se la mandemos siempre en POSITIVO
}

export interface DevolucionRequest {
  ordenOrigenId: number | null; // null si es devolución manual sin ticket
  metodoPago: MetodoPago;
  lineas: LineaDevolucionDTO[];
}


@Injectable({ providedIn: 'root' })
export class OrdenService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/ordenes';

  // 1. Crear el ticket (Carrito) - Ahora tipado con NuevaOrdenDTO
  crearOrden(peticion: NuevaOrdenDTO): Observable<any> {
    return this.http.post(this.API_URL, peticion);
  }

  // 2. Cobrar ticket completo (Usa RequestParams '?metodoPago=...')
  cobrar(id: number, metodoPago: MetodoPago): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/cobrar`, null, {
      params: { metodoPago }
    });
  }

  // 3. Registrar señal/anticipo (Usa RequestParams '?importe=...&metodoPago=...')
  registrarAnticipo(id: number, importe: number, metodoPago: MetodoPago): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/anticipo`, null, {
      params: { 
        importe: importe.toString(), // Convertimos a string para los params
        metodoPago }
    });
  }

  // 4. Acción ultra rápida: Terminar en taller (Botón verde del operario)
  terminarReparacion(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/terminar`, null);
  }

  // 5. Marcar como entregado en el mostrador (Acción rápida)
  entregarOrden(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/entregar`, null);
  }

  // 6. Cancelar/Anular una orden por completo (Solo si no se ha cobrado nada o solo tiene un anticipo registrado)
  cancelarOrden(id: number): Observable<any> {
  return this.http.post(`${this.API_URL}/${id}/cancelar`, null);
  }

  // 7. Consulta por estado (PAGADO, PENDIENTE, EN_TALLER)
  getOrdenesPorEstado(estado: string): Observable<OrdenDTO[]> {
  if (estado === 'TODAS' || estado === 'TODOS') {
    // Lanzamos peticiones en paralelo a los estados reales que expone tu Enum en Java. Cambia o añade estados si tu Enum 'EstadoTaller' usa otros nombres (ej. PENDIENTE, EN_TALLER, LISTO, ENTREGADO)
    return forkJoin([
      this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/EN_TALLER`), // Solo las que están en taller
      this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/LISTO`),     // Solo las que ya están listas
      this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/ENTREGADO`),
      this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/NO_APLICA`) // Si tienes un estado específico para ventas directas sin taller, etc.
    ]).pipe(
      // Juntamos todos los arrays devueltos en un único listado plano para el historial
      map(([enTaller, listos, entregados, noAplica]) => [...enTaller, ...listos, ...entregados, ...noAplica])
    );
  }

  // Si pide un estado concreto, hacemos la llamada normal a Java
  return this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/${estado}`);
}

  // 8. Para el panel del zapatero: muestra las órdenes que están operativas en "EN_TALLER" 
  getOrdenesTaller(): Observable<OrdenDTO[]> {
    return this.http.get<OrdenDTO[]>(`${this.API_URL}/estado/EN_TALLER`);
  }

  // 9. Editar notas de reparación o la fecha prometida de recogida
  editarReparacion(id: number, nuevasNotas: string, nuevaFecha: string, detalleId: number): Observable<any> {
   let params = new HttpParams()
    .set('notasReparacion', nuevasNotas)
    .set('nuevaFecha', nuevaFecha); // Formato YYYY-MM-DD

  // Si la línea tiene un ID válido de base de datos, se lo mandamos a 'detalleId'
  if (detalleId !== null && detalleId !== undefined) {
    params = params.set('detalleId', detalleId.toString());
  }

  return this.http.put(`${this.API_URL}/${id}/reparacion`, null, { params });
 }

  // 10.Descargar PDF del ticket
  getTicketPdf(ordenId: number): Observable<Blob> {
    return this.http.get(`${this.API_URL}/${ordenId}/pdf`, { responseType: 'blob' });
  }

  // 11. Descargar Factura oficial en formato A4
  getFacturaPdf(ordenId: number): Observable<Blob> {
  return this.http.get(`${this.API_URL}/${ordenId}/factura-pdf`, { responseType: 'blob' });
  } 

  // 12. Procesar devolución (Vía A y Vía B) - Envía Factura Rectificativa DEV-26
  procesarDevolucion(peticion: DevolucionRequest): Observable<any> {
    return this.http.post(`${this.API_URL}/devolucion`, peticion);
  }
  
  // 13. Descarga el PDF térmico de 80mm en segundo plano y lo manda a la impresora
  imprimirTicket(id: number): Observable<Blob> {
    return this.getTicketPdf(id).pipe(
      tap((blob: Blob) => {
        // 1. Creamos la URL temporal en la memoria del navegador
        const blobUrl = window.URL.createObjectURL(blob);

        // 2. Buscamos o creamos un iframe oculto en el documento para lanzar la impresión
        let iframe = document.getElementById('iframeImpresionSilenciosa') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'iframeImpresionSilenciosa';
          iframe.style.display = 'none'; // Completamente invisible para el usuario
          document.body.appendChild(iframe);
        }
        // 3. En cuanto el archivo termine de cargar por detrás, disparamos el menú de impresión física
        iframe.onload = () => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            
            // Limpieza higiénica de memoria un minuto después
            setTimeout(() => {
              window.URL.revokeObjectURL(blobUrl);
            }, 60000);
          }
        };
         // 4. Cargamos el PDF dentro del iframe
            iframe.src = blobUrl;
      })
    );
  }

  // 14. Descarga el PDF térmico de factura A4 en segundo plano y lo manda a la impresora
  imprimirFacturaA4(id: number): Observable<Blob> {
    return this.getFacturaPdf(id).pipe(
      tap((blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        let iframe = document.getElementById('iframeImpresionSilenciosa') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'iframeImpresionSilenciosa';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }
        iframe.onload = () => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              window.URL.revokeObjectURL(blobUrl);
            }, 60000);
          }
        };
        // CARGAMOS EL FUENTE (Dispara el onload de forma segura)
         iframe.src = blobUrl;
      })
    );
  }

  // 15. Botón del pánico que soporta cambio de precio por línea/artículo específico
  cambiarPrecioOrden(id: number, nuevoPrecio: number, lineaOArticuloId: number): Observable<any> {
    // Enviamos 'nuevoPrecio' y el id de la línea afectada para que tu controlador de Spring Boot recalcule de forma exacta
    return this.http.put(`${this.API_URL}/${id}/precio`, null, {
      params: { 
        nuevoPrecio: nuevoPrecio.toString(),
        detalleId: lineaOArticuloId.toString() // Ajusta el nombre de este parámetro según reciba tu @RequestParam en Java (ej. articuloId, lineaId)
      }
    });
  }

  // 16. Eliminar productos en la gestiond e tickets antes de pasarlo a entregado
  eliminarLineaOrden(id: number, detalleId: number): Observable<any> {
   return this.http.delete(`${this.API_URL}/${id}/lineas/${detalleId}`);
  }

  // 17. Para devolver un ticket en el tpv tenemos que poder elegir cual devolver
  buscarTicketParaDevolucion(numeroTicket: string): Observable<OrdenDTO> {
   return this.http.get<OrdenDTO>(`${this.API_URL}/buscar-devolucion`, {
     params: { numeroTicket }
   });
  }

}
