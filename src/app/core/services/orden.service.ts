import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrdenService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/ordenes';

  // 1. Crear el ticket (Carrito)
  crearOrden(peticion: any): Observable<any> {
    return this.http.post(this.API_URL, peticion);
  }

  // 2. Cobrar ticket completo
  cobrar(id: number, metodoPago: string): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/cobrar`, null, {
      params: { metodoPago }
    });
  }

  // 3. Registrar señal/anticipo
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

  getOrdenesHoy(): Observable<any> {
    return this.http.get(`${this.API_URL}/hoy`);
  }

  getOrdenesPorEstado(estado: string): Observable<any> {
    return this.http.get<any[]>(`${this.API_URL}/estado/${estado}`);
  }
  
}