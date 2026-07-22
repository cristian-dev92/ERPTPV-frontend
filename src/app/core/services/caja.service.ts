import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';

export interface TurnoCajaResponseDTO {
  id: number;
  empresaId: number;
  nombreUsuarioApertura: string;
  fechaHoraApertura: string;
  fechaHoraCierre: string;
  saldoInicial: number;
  totalVentasEfectivo: number;
  totalVentasTarjeta: number;
  totalVentasBizum: number;
  totalVentasTransferencia: number;
  totalVentasOtros: number;
  totalAnticipos: number;
  totalIngresoExtra: number;
  totalGastoExtra: number;
  totalIngresosManuales: number;
  totalGastos: number;
  totalDevoluciones: number;
  saldoFinalEsperadoEfectivo: number;
  estado: 'ABIERTA' | 'CERRADA';
  saldoFinalReal: number | null;
  descuadre: number;
}

export interface MovimientoManualRequest {
  tipoMovimiento: 'INGRESO' | 'GASTO';
  metodoPago: string;
  importe: number;
  descripcion: string;
  ordenId?: number;
}

@Injectable({ providedIn: 'root' })
export class CajaService {
  private http = inject(HttpClient);
  private apiUrl = '/api/caja';

  // Signals globales de estado compartido (Arregla la reactividad en tpv.ts y el resumen)
  cajaActual = signal<TurnoCajaResponseDTO | null>(null);
  ultimoTurnoCerrado = signal<TurnoCajaResponseDTO | null>(null);

  // Sincroniza el estado con el servidor actualizando el Signal global
  checkEstadoCaja(): Observable<TurnoCajaResponseDTO | null> {
    return this.http.get<TurnoCajaResponseDTO>(`${this.apiUrl}/actual`).pipe(
      tap(caja => this.cajaActual.set(caja || null)),
      catchError(err => {
        this.cajaActual.set(null);
        throw err;
      })
    );
  }

 obtenerCajaActual(): Observable<TurnoCajaResponseDTO> {
    return this.http.get<TurnoCajaResponseDTO>(`${this.apiUrl}/actual`).pipe(
      tap(caja => this.cajaActual.set(caja || null))
    );
  }

  // Requerido por tpv.ts para calcular arqueos sobre la marcha
  obtenerSaldoTeoricoActual(): Observable<number> {
    return this.http.get<TurnoCajaResponseDTO>(`${this.apiUrl}/actual`).pipe(
      map(caja => caja?.saldoFinalEsperadoEfectivo ?? 0),
      catchError(() => of(0))
    );
  }

  abrirCaja(saldoInicial: number): Observable<TurnoCajaResponseDTO> {
    return this.http.post<TurnoCajaResponseDTO>(`${this.apiUrl}/abrir`, { saldoInicial }).pipe(
      tap(caja => this.cajaActual.set(caja))
    );
  }

  cerrarCaja(saldoFinalReal: number): Observable<TurnoCajaResponseDTO> {
    return this.http.post<TurnoCajaResponseDTO>(`${this.apiUrl}/cerrar`, { saldoFinalReal }).pipe(
      tap(caja => {
        this.ultimoTurnoCerrado.set(caja);
        this.cajaActual.set(null);
      })
    );
  }

  // Interfaz puente requerida por el flujo guiado de tpv.ts
  cerrarCajaGuiado(arqueoDTO: any): Observable<TurnoCajaResponseDTO> {
    const saldoReal = arqueoDTO?.saldoFinalReal ?? arqueoDTO?.importe ?? 0;
    return this.cerrarCaja(saldoReal);
  }

  registrarMovimientoManual(movimiento: MovimientoManualRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/movimiento-manual`, movimiento);
  }

  // 🚀 NUEVO: Descarga del informe en formato 80mm (Ticket)
  descargarPdf80mm(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/pdf/80mm`, { responseType: 'blob' });
  }

  // 🚀 NUEVO: Descarga del informe en formato A4 (Folio)
  descargarPdfA4(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/pdf/a4`, { responseType: 'blob' });
  }

  // Recupera el último turno cerrado de la base de datos para no perder el histórico al refrescar
  obtenerUltimoCierreHistorico(): Observable<TurnoCajaResponseDTO | null> {
    return this.http.get<TurnoCajaResponseDTO>(`${this.apiUrl}/ultimo-cierre`).pipe(
      tap(caja => this.ultimoTurnoCerrado.set(caja || null)),
      catchError(() => {
        this.ultimoTurnoCerrado.set(null);
        return of(null);
      })
    );
  }
  
}
