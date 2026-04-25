import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class CajaService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/caja';

  // Signal para saber el estado de la caja en toda la App
  cajaActual = signal<any | null>(null);

  abrirCaja(saldoInicial: number): Observable<any> {
    return this.http.post(`${this.API_URL}/abrir`, { saldoInicial }).pipe(
      tap(res => this.cajaActual.set(res))
    );
  }

  cerrarCaja(saldoFinalReal: number): Observable<any> {
    return this.http.post(`${this.API_URL}/cerrar`, { saldoFinalReal }).pipe(
      tap(() => this.cajaActual.set(null))
    );
  }

  registrarMovimientoManual(tipo: 'INGRESO_MANUAL' | 'GASTO', importe: number, descripcion: string): Observable<any> {
    return this.http.post(`${this.API_URL}/movimiento-manual`, {
      tipoMovimiento: tipo,
      importe,
      descripcion
    });
  }
}