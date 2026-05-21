import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class CajaService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/caja';

  // Signal para saber el estado de la caja en toda la App
  cajaActual = signal<any | null>(null);

  // NUEVO: Método para recuperar la caja abierta al iniciar la app
  checkEstadoCaja(): Observable<any> {
    return this.http.get<any | null>(`${this.API_URL}/actual`).pipe(
      tap(res => {
      // Si responde 200, res tendrá el JSON. Si responde 204, res será null.
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

   obtenerTurnoActual(): Observable<any> {
  return this.http.get(`${this.API_URL}/actual`).pipe(
    catchError(() => of(null))
  );
 }
 
}