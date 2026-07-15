import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { NuevaOrdenDTO, OrdenDTO, DevolucionRequest, MetodoPago, EstadoTaller } from '../models/orden.model'; // Ajusta la ruta a tus modelos

@Injectable({ providedIn: 'root' })
export class OrdenService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/ordenes';
  public ticketProcesado = signal<number>(0);

  // 1. Crear el ticket unificado (El motor central del TPV)
  crearOrden(peticion: NuevaOrdenDTO): Observable<OrdenDTO> {
    return this.http.post<OrdenDTO>(this.API_URL, peticion).pipe(tap(() => this.notificarCambio()) // <-- Avisamos de que se ha creado algo
    );
  }

  // 2. Cobrar una orden pendiente de liquidar (muta PRE- a TCK-)
  cobrar(id: number, metodoPago: MetodoPago): Observable<OrdenDTO> {
    return this.http.post<OrdenDTO>(`${this.API_URL}/${id}/cobrar`, null, {
      params: { metodoPago }
    }).pipe(tap(() => this.notificarCambio()) // <-- Avisamos de que se ha cobrado algo
   );
  }

  // 3. Registrar un anticipo / entrega a cuenta
  registrarAnticipo(id: number, importe: number, metodoPago: MetodoPago): Observable<OrdenDTO> {
    return this.http.post<OrdenDTO>(`${this.API_URL}/${id}/anticipo`, null, {
      params: { 
        importe: importe.toString(), 
        metodoPago 
      }
    });
  }

  // 4. Cancelar / Anular una orden (Soft Delete en Back - solo si está PENDIENTE)
  cancelarOrden(id: number): Observable<OrdenDTO> {
    return this.http.post<OrdenDTO>(`${this.API_URL}/${id}/cancelar`, null);
  }

  // 5. CONTROL INDIVIDUALIZADO DEL TALLER (Avanzar estado del bulto)
  avanzarEstadoTrabajoTaller(trabajoId: number, nuevoEstado: EstadoTaller): Observable<OrdenDTO> {
    return this.http.patch<OrdenDTO>(`${this.API_URL}/taller/${trabajoId}/estado`, null, {
      params: { nuevoEstado }
    });
  }

  // 6. Panel del Zapatero: Listar órdenes con trabajos activos (que no estén ENTREGADOS)
  getOrdenesConTrabajosActivos(): Observable<OrdenDTO[]> {
    return this.http.get<OrdenDTO[]>(`${this.API_URL}/taller`);
  }

  // 7. Buscador selectivo de tickets para iniciar flujo de devoluciones
  buscarTicketParaDevolucion(numeroTicket: string): Observable<OrdenDTO> {
    return this.http.get<OrdenDTO>(`${this.API_URL}/buscar-devolucion`, {
      params: { numeroTicket }
    });
  }

  // 8. Procesar devolución (Genera Factura Rectificativa DEV-)
  procesarDevolucion(peticion: DevolucionRequest): Observable<OrdenDTO> {
    return this.http.post<OrdenDTO>(`${this.API_URL}/devolucion`, peticion).pipe(
      tap(() => this.notificarCambio()) // <-- Avisamos de que se ha devuelto algo
    );
  }

  // 9. Descargar PDF térmico del ticket (80mm)
  getTicketPdf(ordenId: number): Observable<Blob> {
    return this.http.get(`${this.API_URL}/${ordenId}/pdf`, { responseType: 'blob' });
  }

  // 10. Descargar Factura oficial en formato A4
  getFacturaPdf(ordenId: number): Observable<Blob> {
    return this.http.get(`${this.API_URL}/${ordenId}/factura-pdf`, { responseType: 'blob' });
  }

  // 11. Lanzar impresión desatendida del ticket de 80mm
  imprimirTicket(id: number): Observable<Blob> {
    return this.getTicketPdf(id).pipe(
      tap((blob: Blob) => this.ejecutarImpresionSilenciosa(blob))
    );
  }

  // 12. Lanzar impresión desatendida de la Factura A4
  imprimirFacturaA4(id: number): Observable<Blob> {
    return this.getFacturaPdf(id).pipe(
      tap((blob: Blob) => this.ejecutarImpresionSilenciosa(blob))
    );
  }

  // 13. Obtiene el histórico completo de órdenes/tickets para el TPV
  getOrdenes(): Observable<OrdenDTO[]> {
    return this.http.get<OrdenDTO[]>(this.API_URL);
  }

  // 14. Obtiene el histórico de órdenes de manera paginada para evitar sobrecargar el TPV
  getOrdenesPaginadas(pagina: number, cantidad: number): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/paginado`, {
      params: {
        page: pagina.toString(),
        size: cantidad.toString()
      }
    });
  }

   // Método auxiliar higiénico de impresión mediante iframe oculto
  private ejecutarImpresionSilenciosa(blob: Blob): void {
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
    iframe.src = blobUrl;
  }

  // Incrementa el valor del signal para forzar que cualquier componente "escuchando" se entere
  public notificarCambio(): void {
    this.ticketProcesado.update(val => val + 1);
  }

}