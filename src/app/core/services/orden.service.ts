import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable, tap } from 'rxjs';

// Mapeo exacto de los Schemas de Java para que tu Front vaya sobre seguro
export type TipoOrden = 'VENTA_DIRECTA' | 'REPARACION' | 'DEVOLUCION';

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO';

export interface NuevaLineaDTO {
  articuloId: number;
  cantidad: number;
  notasReparacion?: string | null; // Opcional ("Tapas rojas", etc.)
}

export interface NuevaOrdenDTO {
  empresaId: number;
  empleadoId: number;
  clienteId: number | null; // null si es venta anónima
  lineas: NuevaLineaDTO[];   // El carrito de la compra
  tipo?: TipoOrden;          // Opcional, por defecto VENTA_DIRECTA
  fechaPrometidaRecogida?: string | null; // Mapea el LocalDate (YYYY-MM-DD)
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
  private readonly API_URL = 'http://localhost:8080/api/ordenes';

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
  getOrdenesPorEstado(estado: string): Observable<any[]> {
  if (estado === 'TODAS' || estado === 'TODOS') {
    // Lanzamos peticiones en paralelo a los estados reales que expone tu Enum en Java
    // Cambia o añade estados si tu Enum 'EstadoTaller' usa otros nombres (ej. PENDIENTE, EN_TALLER, LISTO, ENTREGADO)
    return forkJoin([
      this.http.get<any[]>(`${this.API_URL}/estado/EN_TALLER`), // Solo las que están en taller
      this.http.get<any[]>(`${this.API_URL}/estado/LISTO`),     // Solo las que ya están listas
      this.http.get<any[]>(`${this.API_URL}/estado/ENTREGADO`),
      this.http.get<any[]>(`${this.API_URL}/estado/NO_APLICA`) // Si tienes un estado específico para ventas directas sin taller, etc.
    ]).pipe(
      // Juntamos todos los arrays devueltos en un único listado plano para el historial
      map(([enTaller, listos, entregados]) => [...enTaller, ...listos, ...entregados])
    );
  }

  // Si pide un estado concreto, hacemos la llamada normal a Java
  return this.http.get<any[]>(`${this.API_URL}/estado/${estado}`);
}

  // 8. Para el panel del zapatero: muestra las órdenes que están operativas en "EN_TALLER" 
  getOrdenesTaller(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API_URL}/estado/EN_TALLER`);
  }

  // 9. Editar notas de reparación o la fecha prometida de recogida
  editarReparacion(id: number, nuevasNotas: string, nuevaFecha: string): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}/reparacion`, null, {
      params: new HttpParams()
        .set('notasReparacion', nuevasNotas)
        .set('nuevaFecha', nuevaFecha) // Formato YYYY-MM-DD
    });
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

        // 3. Cargamos el PDF dentro del iframe
        iframe.src = blobUrl;

        // 4. En cuanto el archivo termine de cargar por detrás, disparamos el menú de impresión física
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
      })
    );
  }
  
}
