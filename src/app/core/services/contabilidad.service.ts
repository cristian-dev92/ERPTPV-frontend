import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// 1. Estructura exacta y oficial que devuelve Javi desde Spring Boot (ResumenContableDTO.java)
export interface ResumenContableDTO {
  totalIngresos: number;
  totalGastos: number;
  beneficioNeto: number;
  impuestosIva: number;
}

// 2. Estructura de tu OrdenDTO de siempre para evitar el tipo genérico 'any[]'
export interface OrdenDTO {
  id?: number;
  numeroTicket: string;
  fechaHora: string;
  fechaCreacion?: string;
  total: number;
  estadoPago: string;
  nombreCliente?: string;
  // Añade aquí propiedades adicionales de tu OrdenDTO si las necesitas pintar en la tabla
}

@Injectable({ providedIn: 'root' })
export class ContabilidadService {
  private http = inject(HttpClient);
  private readonly API_CONTABILIDAD = '/api/contabilidad';
  private readonly API_ORDENES   = '/api/ordenes';

  /**
   * 1. Obtiene las sumas de los KPIs superiores mapeados directamente desde la BD
   */
 obtenerResumenKpis(fechaInicio: string, fechaFin: string): Observable<ResumenContableDTO> {
    const params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.http.get<ResumenContableDTO>(`${this.API_CONTABILIDAD}/resumen`, { params });
  }

  /**
   * 2. Obtiene las órdenes reales (OrdenDTO[]) para rellenar la tabla inferior
   */
  obtenerTicketsContables(fechaInicio: string, fechaFin: string, filtro?: string): Observable<any[]> {
    let params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    
    if (filtro && filtro !== 'TODOS') {
      params = params.set('filtro', filtro);
    }
    
    return this.http.get<any[]>(`${this.API_ORDENES}/contabilidad`, { params });
  }

  /**
   * 3. Descarga del libro contable en CSV para mandárselo a la gestoría
   */
  exportarCsv(fechaInicio: string, fechaFin: string): Observable<Blob> {
    const params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.http.get(`${this.API_CONTABILIDAD}/exportar-csv`, { params, responseType: 'blob' });
  }

  /**
   * 4. Descarga del Libro Mayor unificado en formato PDF
   */
  exportarPdf(fechaInicio: string, fechaFin: string, filtro?: string): Observable<Blob> {
    let params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    if (filtro && filtro !== 'TODOS') params = params.set('filtro', filtro);
    return this.http.get(`${this.API_CONTABILIDAD}/exportar-pdf`, { params, responseType: 'blob' });
  }
  
}