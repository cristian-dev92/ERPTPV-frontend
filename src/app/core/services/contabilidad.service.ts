import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ResumenContableDTO {
  totalFacturado: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalAnticipos: number;
  totalGastos: number;
  ivaEstimado: number;
  cantidadVentas: number;
  cantidadReparaciones: number; // 🌟 Brutal para medir el volumen del taller
  movimientos: any[];           // Mapea con la estructura de MovimientoCaja de tu backend
}

@Injectable({ providedIn: 'root' })
export class ContabilidadService {
  private http = inject(HttpClient);
  private readonly API_CONTABILIDAD = '/api/contabilidad';
  private readonly API_ORDENES   = '/api/ordenes';

  // 1. Obtiene los datos de la tabla + los contadores de las tarjetas en una sola petición
 obtenerResumenKpis(fechaInicio: string, fechaFin: string): Observable<ResumenContableDTO> {
    const params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.http.get<ResumenContableDTO>(`${this.API_CONTABILIDAD}/resumen`, { params });
  }

  // 2. Endpoint para obtener los tickets contables con filtro opcional (TODOS, EFECTIVO, TARJETA, ANTICIPOS)
  obtenerTicketsContables(fechaInicio: string, fechaFin: string, filtro?: string): Observable<any[]> {
    let params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    
    if (filtro && filtro !== 'TODOS') {
      params = params.set('filtro', filtro);
    }
    
    return this.http.get<any[]>(`${this.API_ORDENES}/contabilidad`, { params });
  }

  // Endpoint de descarga del CSV para la gestoría
  exportarCsv(fechaInicio: string, fechaFin: string): Observable<Blob> {
    const params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    return this.http.get(`${this.API_CONTABILIDAD}/exportar-csv`, { params, responseType: 'blob' });
  }

  //NUEVO: Endpoint de descarga del PDF filtrado (Libro Mayor)
  exportarPdf(fechaInicio: string, fechaFin: string, filtro?: string): Observable<Blob> {
    let params = new HttpParams().set('fechaInicio', fechaInicio).set('fechaFin', fechaFin);
    if (filtro && filtro !== 'TODOS') params = params.set('filtro', filtro);
    return this.http.get(`${this.API_CONTABILIDAD}/exportar-pdf`, { params, responseType: 'blob' });
  }
  
}