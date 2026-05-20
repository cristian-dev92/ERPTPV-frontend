import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class OrdenService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/ordenes';

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
      params: { nuevoEstado }
    });
  }

  // 5. Consultas
  getOrdenesHoy(): Observable<any> {
    return this.http.get(`${this.API_URL}/hoy`);
  }

  // 6. Consulta por estado (PAGADO, PENDIENTE, EN_TALLER)
  getOrdenesPorEstado(estado: string): Observable<any> {
    return this.http.get<any[]>(`${this.API_URL}/estado/${estado}`);
  }
  
}