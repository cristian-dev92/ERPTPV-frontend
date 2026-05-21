import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { CajaService } from '../../../core/services/caja.service';

@Component({
  selector: 'app-caja-resumen',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, CommonModule],
  templateUrl: './caja-resumen.html',
  styleUrl: './caja-resumen.scss'
})
export class CajaResumenComponent implements OnInit {

  private cajaService = inject(CajaService);

  turno = signal<any | null>(null);

  ngOnInit() {
    this.cargarTurno();
  }

  cargarTurno() {
    this.cajaService.obtenerTurnoActual().subscribe(res => {
      this.turno.set(res);
    });
  }

   movimientos = computed(() => this.turno()?.movimientos ?? []);

  ventasEfectivo = computed(() =>
    this.movimientos().filter((m: { tipo: string; metodoPago: string; }) => m.tipo === 'VENTA' && m.metodoPago === 'EFECTIVO')
  );
  ventasTarjeta = computed(() =>
    this.movimientos().filter((m: { tipo: string; metodoPago: string; }) => m.tipo === 'VENTA' && m.metodoPago === 'TARJETA')
  );
  anticipos = computed(() =>
    this.movimientos().filter((m: { tipo: string; }) => m.tipo === 'ANTICIPO')
  );
  ingresos = computed(() =>
    this.movimientos().filter((m: { tipo: string; }) => m.tipo === 'INGRESO_MANUAL' || m.tipo === 'INGRESO')
  );
  gastos = computed(() =>
    this.movimientos().filter((m: { tipo: string; }) => m.tipo === 'RETIRO_MANUAL' || m.tipo === 'GASTO')
  );
  devoluciones = computed(() =>
    this.movimientos().filter((m: { tipo: string; }) => m.tipo === 'DEVOLUCION')
  );

  totalVentasEfectivo = computed(() =>
    this.ventasEfectivo().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );
  totalVentasTarjeta = computed(() =>
    this.ventasTarjeta().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );
  totalAnticipos = computed(() =>
    this.anticipos().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );
  totalIngresos = computed(() =>
    this.ingresos().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );
  totalGastos = computed(() =>
    this.gastos().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );
  totalDevoluciones = computed(() =>
    this.devoluciones().reduce((acc: any, m: { importe: any; }) => acc + m.importe, 0)
  );

  // helpers para icono/clase
  iconoMovimiento(tipo: string): string {
    switch (tipo) {
      case 'VENTA': return '💵';
      case 'ANTICIPO': return '🟡';
      case 'INGRESO':
      case 'INGRESO_MANUAL': return '🟢';
      case 'RETIRO_MANUAL':
      case 'GASTO': return '🔴';
      case 'DEVOLUCION': return '🔁';
      case 'CIERRE': return '🔒';
      default: return '📌';
    }
  }

  claseMovimiento(tipo: string): string {
    switch (tipo) {
      case 'VENTA': return 'mov-venta';
      case 'ANTICIPO': return 'mov-anticipo';
      case 'INGRESO':
      case 'INGRESO_MANUAL': return 'mov-ingreso';
      case 'RETIRO_MANUAL':
      case 'GASTO': return 'mov-gasto';
      case 'DEVOLUCION': return 'mov-devolucion';
      case 'CIERRE': return 'mov-cierre';
      default: return 'mov-otro';
    }
  }
}