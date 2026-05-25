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
  cantidadReparaciones: number;
  movimientos: any[];
}

@Injectable({ providedIn: 'root' })
export class ContabilidadService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/contabilidad';

  obtenerResumen(fechaInicio: string, fechaFin: string): Observable<ResumenContableDTO> {
    const params = new HttpParams()
      .set('fechaInicio', fechaInicio)
      .set('fechaFin', fechaFin);

    return this.http.get<ResumenContableDTO>(`${this.API_URL}/resumen`, { params });
  }
}