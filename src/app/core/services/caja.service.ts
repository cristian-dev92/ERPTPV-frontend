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

  // Al iniciar el servicio, comprobamos si hay una caja abierta y actualizamos la señal
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

  // Para abrir una nueva caja con un saldo inicial
  abrirCaja(saldoInicial: number): Observable<any> {
    return this.http.post(`${this.API_URL}/abrir`, { saldoInicial }).pipe(
      tap(res => {
        this.cajaActual.set(res);
        this.ultimoTurnoCerrado.set(null); // Limpiamos el último cierre al abrir una nueva caja
      })
    );
  }

  /*Obtiene el saldo teórico acumulado en el turno actual desde el backend (Suma de efectivo inicial + ventas directas + pagos de taller - gastos) */
  obtenerSaldoTeoricoActual(): Observable<number> {
    return this.http.get<number>(`${this.API_URL}/saldo-teorico`).pipe(
      catchError(() => of(0)) // Si hay un error, devolvemos 0 de seguridad
    );
  }

  /* Ahora envía el DTO del arqueo guiado completo al backend */
  cerrarCajaGuiado(arqueoDTO: {
    saldoTeorico: number;
    saldoReal: number;
    descuadre: number;
    desglose: Record<string, number>;
  }): Observable<any> {
    return this.http.post(`${this.API_URL}/cerrar`, arqueoDTO).pipe(
      tap(res => {
        this.ultimoTurnoCerrado.set(res); // Guardamos el informe de cierre devuelto por el backend
        this.cajaActual.set(null);        // Bloqueamos el TPV
      })
    );
  }

  // Para registrar un movimiento manual (ingreso o gasto) durante el turno actual
  registrarMovimientoManual(tipo: 'INGRESO_MANUAL' | 'GASTO', importe: number, descripcion: string): Observable<any> {
    return this.http.post(`${this.API_URL}/movimiento-manual`, {
      tipoMovimiento: tipo,
      importe,
      descripcion
    });
  }

  // Para obtener el turno actual (si hay uno abierto) y mostrar su información en el TPV
  obtenerTurnoActual(): Observable<any> {
    return this.http.get(`${this.API_URL}/actual`).pipe(
      catchError(() => of(null))
    );
  }
}