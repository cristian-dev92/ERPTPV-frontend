import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { CajaService } from '../../../core/services/caja.service';
import { UiService } from '../../../core/services/ui.service';

@Component({
  selector: 'app-caja-resumen',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, CommonModule],
  templateUrl: './caja-resumen.html',
  styleUrl: './caja-resumen.scss'
})

export class CajaResumenComponent implements OnInit {
  private cajaService = inject(CajaService);
  private UiService = inject(UiService);

  // --- SIGNALS PARA EL CONTROL DEL MODAL Y ARQUEO GUIADO ---
  mostrarModalArqueo = signal<boolean>(false);
  
  // Inicializamos el desglose con todas las monedas y billetes a cero
  desgloseEfectivo = signal<Record<string, number>>({
    b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
    m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
  });

  // Mapeamos el valor real de cada moneda/billete para calcular el total automáticamente
  private valoresEfectivo: Record<string, number> = {
    b500: 500, b200: 200, b100: 100, b50: 50, b20: 20, b10: 10, b5: 5,
    m2: 2, m1: 1, m050: 0.50, m020: 0.20, m010: 0.10, m005: 0.05, m002: 0.02, m001: 0.01
  };

  // El saldo teórico esperado sale directamente de lo que la caja activa dice que tiene en efectivo
  saldoTeoricoCaja = computed(() => {
    return this.turno()?.saldoFinalEsperadoEfectivo ?? 0;
  });

  // 🔄 COMPUTED REACTIVO: Si hay caja activa, muestra esa. Si no, muestra el último cierre.
  // Al usar computed conectado al servicio, reacciona al instante sin hacer F5.
  turno = computed(() => {
    const activa = this.cajaService.cajaActual();
    return activa ? activa : this.cajaService.ultimoTurnoCerrado();
  });

  ngOnInit() {
    // Al cargar la vista de resúmenes, aseguramos que el servicio compruebe el estado real actual por si acaso
    this.cajaService.checkEstadoCaja().subscribe();
  }

  // --- MÉTODOS DEL ARQUEO GUIADO TÁCTIL ---
  
  // Corrige el método de apertura para usar el Signal correcto del arqueo guiado
  abrirCierreCaja() {
    // Reseteamos el desglose a cero para un nuevo recuento limpio
    this.desgloseEfectivo.set({
      b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
      m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
    });
    this.mostrarModalArqueo.set(true); // ¡Abrimos el modal guiado!
  }

  obtenerCantidad(tipo: string): number {
    return this.desgloseEfectivo()[tipo] || 0;
  }

  actualizarCantidadEfectivo(tipo: string, cantidad: number) {
    const valorSeguro = cantidad < 0 ? 0 : cantidad; // Evitamos que metan unidades negativas
    this.desgloseEfectivo.update(desglose => ({
      ...desglose,
      [tipo]: valorSeguro
    }));
  }

  calcularTotalReal(): number {
    const desglose = this.desgloseEfectivo();
    return Object.keys(desglose).reduce((total, key) => {
      const cantidad = desglose[key] || 0;
      const valorUnidad = this.valoresEfectivo[key] || 0;
      return total + (cantidad * valorUnidad);
    }, 0);
  }

  calcularDescuadre(): number {
    return this.calcularTotalReal() - this.saldoTeoricoCaja();
  }

  confirmarArqueo() {
    const arqueoDTO = {
      saldoTeorico: this.saldoTeoricoCaja(),
      saldoReal: this.calcularTotalReal(),
      descuadre: this.calcularDescuadre(),
      desglose: this.desgloseEfectivo()
    };

    console.log('Enviando Arqueo Guiado desde Resumen:', arqueoDTO);

    this.cajaService.cerrarCajaGuiado(arqueoDTO).subscribe({
      next: (response) => {
        console.log('Arqueo procesado con éxito:', response);
        this.mostrarModalArqueo.set(false);
        this.UiService.mostrarToast('🔒 Turno finalizado y caja cerrada con éxito.', 'success');
      },
      error: (err) => {
        console.error('Error al cerrar caja:', err);
        this.UiService.mostrarToast('Error al registrar el cierre de caja.', 'error');
      }
    });
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