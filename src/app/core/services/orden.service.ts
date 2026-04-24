import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Orden } from '../models/orden.model';

@Injectable({ providedIn: 'root' })
export class OrdenService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/ordenes';

  crearOrden(orden: Orden): Observable<Orden> {
    return this.http.post<Orden>(this.API_URL, orden);
  }

  // Para el historial de ventas o cierres de caja
  getOrdenesHoy(): Observable<Orden[]> {
    return this.http.get<Orden[]>(`${this.API_URL}/hoy`);
  }
}