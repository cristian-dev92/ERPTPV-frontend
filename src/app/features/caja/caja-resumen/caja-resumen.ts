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

  // 🔄 COMPUTED REACTIVO: Si hay caja activa, muestra esa. Si no, muestra el último cierre.
  // Al usar computed conectado al servicio, reacciona al instante sin hacer F5.
  turno = computed(() => {
    const activa = this.cajaService.cajaActual();
    if (activa) {
      return activa;
    }
    return this.cajaService.ultimoTurnoCerrado();
  });

  ngOnInit() {
    // Al cargar la vista de resúmenes, aseguramos que el servicio compruebe el estado real actual por si acaso
    this.cajaService.checkEstadoCaja().subscribe();
  }

  // --- CÁLCULOS REACTIVOS BASADOS EN LOS MOVIMIENTOS ---
  movimientos = computed(() => this.turno()?.movimientos ?? []);

  ventasEfectivo = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'VENTA' && m.metodoPago === 'EFECTIVO')
  );
  ventasTarjeta = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'VENTA' && m.metodoPago === 'TARJETA')
  );
  anticipos = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'ANTICIPO')
  );
  ingresos = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'INGRESO_MANUAL' || m.tipoMovimiento === 'INGRESO')
  );
  gastos = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'RETIRO_MANUAL' || m.tipoMovimiento === 'GASTO')
  );
  devoluciones = computed(() =>
    this.movimientos().filter((m: any) => m.tipoMovimiento === 'DEVOLUCION')
  );

  totalVentasEfectivo = computed(() =>
    this.ventasEfectivo().reduce((acc: number, m: any) => acc + m.importe, 0)
  );
  totalVentasTarjeta = computed(() =>
    this.ventasTarjeta().reduce((acc: number, m: any) => acc + m.importe, 0)
  );
  totalAnticipos = computed(() =>
    this.anticipos().reduce((acc: number, m: any) => acc + m.importe, 0)
  );
  totalIngresos = computed(() =>
    this.ingresos().reduce((acc: number, m: any) => acc + m.importe, 0)
  );
  totalGastos = computed(() =>
    this.gastos().reduce((acc: number, m: any) => acc + m.importe, 0)
  );
  totalDevoluciones = computed(() =>
    this.devoluciones().reduce((acc: number, m: any) => acc + m.importe, 0)
  );

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