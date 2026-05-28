import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable, tap } from 'rxjs';

// Mapeo exacto de los Schemas de Java para que tu Front vaya sobre seguro
export type TipoOrden = 'VENTA_DIRECTA' | 'REPARACION';

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
  metodoPago: 'EFECTIVO' | 'TARJETA';
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
  cobrar(id: number, metodoPago: string): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/cobrar`, null, {
      params: { metodoPago }
    });
  }

  // 3. Registrar señal/anticipo (Usa RequestParams '?importe=...&metodoPago=...')
  registrarAnticipo(id: number, importe: number, metodoPago: string): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/anticipo`, null, {
      params: { importe, metodoPago }
    });
  }

  // 4. Cambiar estado (Taller, Listo, etc)
  cambiarEstado(id: number, nuevoEstado: string): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/estado`, null, {
      params: new HttpParams().set('nuevoEstado', nuevoEstado)
    });
  }

  // 5. Consultas
  getOrdenesHoy(): Observable<any> {
    return this.http.get(`${this.API_URL}/hoy`);
  }

  // 6. Consulta por estado (PAGADO, PENDIENTE, EN_TALLER)
  getOrdenesPorEstado(estado: string): Observable<any[]> {
  if (estado === 'TODAS' || estado === 'TODOS') {
    // Lanzamos peticiones en paralelo a los estados reales que expone tu Enum en Java
    // Cambia o añade estados si tu Enum 'EstadoTaller' usa otros nombres (ej. PENDIENTE, EN_TALLER, LISTO, ENTREGADO)
    return forkJoin([
      this.http.get<any[]>(`${this.API_URL}/estado/PENDIENTE`),
      this.http.get<any[]>(`${this.API_URL}/estado/EN_TALLER`),
      this.http.get<any[]>(`${this.API_URL}/estado/LISTO`)
    ]).pipe(
      // Juntamos todos los arrays devueltos en un único listado plano para el historial
      map(([pendientes, enTaller, listos]) => [...pendientes, ...enTaller, ...listos])
    );
  }

  // Si pide un estado concreto, hacemos la llamada normal a Java
  return this.http.get<any[]>(`${this.API_URL}/estado/${estado}`);
}

  // Para la pestaña del taller del zapatero, queremos mostrar solo las órdenes que están en estado "EN_TALLER" y de tipo "REPARACION"
  getOrdenesTaller(): Observable<any[]> {
   return this.getOrdenesPorEstado('EN_TALLER');
  }

  // NUEVO: Editar notas o retrasar fecha (Punto 3)
  editarReparacion(id: number, notas: string, fecha: string): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}/reparacion`, null, {
      params: new HttpParams()
        .set('notasReparacion', notas)
        .set('nuevaFecha', fecha) // Formato YYYY-MM-DD
    });
  }

  // Descargar PDF del ticket
  getTicketPdf(ordenId: number): Observable<Blob> {
    return this.http.get(`${this.API_URL}/${ordenId}/ticket`, { responseType: 'blob' });
  }

  // 🔄 Procesar devolución (Vía A y Vía B) - Envía Factura Rectificativa DEV-26
  procesarDevolucion(peticion: DevolucionRequest): Observable<any> {
    return this.http.post(`${this.API_URL}/devolucion`, peticion);
  }
  
  // 🖨️ Descarga el PDF térmico de 80mm en segundo plano y lo manda a la impresora
  imprimirTicket(id: number): Observable<Blob> {
    // Apuntamos al endpoint de tu nuevo OrdenPdfController
    const url = `/api/ordenes/${id}/pdf`;

    return this.http.get(url, { responseType: 'blob' }).pipe(
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
