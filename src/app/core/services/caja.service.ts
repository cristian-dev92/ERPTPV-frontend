import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CajaService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/caja';

  // Signal para saber si hay una caja abierta ahora mismo
  cajaActual = signal<any | null>(null);

  // NUEVO: Guardamos el informe del turno que se acaba de cerrar para poder imprimirlo/verlo
  ultimoTurnoCerrado = signal<any | null>(null);

  checkEstadoCaja(): Observable<any> {
    return this.http.get<any | null>(`${this.API_URL}/actual`).pipe(
      tap(res => {
        this.cajaActual.set(res);
      }),
      catchError(() => {
        this.cajaActual.set(null);
        return of(null);
      })
    );
  }

  abrirCaja(saldoInicial: number): Observable<any> {
    return this.http.post(`${this.API_URL}/abrir`, { saldoInicial }).pipe(
      tap(res => {
        this.cajaActual.set(res);
        this.ultimoTurnoCerrado.set(null); // Limpiamos el último cierre al abrir nueva caja
      })
    );
  }

  cerrarCaja(saldoFinalReal: number): Observable<any> {
    return this.http.post(`${this.API_URL}/cerrar`, { saldoFinalReal }).pipe(
      tap(res => {
        this.ultimoTurnoCerrado.set(res); // 👈 GUARDAMOS el informe de cierre de Javi aquí
        this.cajaActual.set(null); // Bloqueamos el TPV
      })
    );
  }

  registrarMovimientoManual(tipo: 'INGRESO_MANUAL' | 'GASTO', importe: number, descripcion: string): Observable<any> {
    return this.http.post(`${this.API_URL}/movimiento-manual`, {
      tipoMovimiento: tipo,
      importe,
      descripcion
    });
  }

  obtenerTurnoActual(): Observable<any> {
    return this.http.get(`${this.API_URL}/actual`).pipe(
      catchError(() => of(null))
    );
  }
}