import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService, TurnoCajaResponseDTO } from '../../../core/services/caja.service';
import { UiService } from '../../../core/services/ui.service';

@Component({
  selector: 'app-caja-resumen',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, CommonModule, FormsModule],
  templateUrl: './caja-resumen.html',
  styleUrl: './caja-resumen.scss'
})
export class CajaResumenComponent implements OnInit {
  private cajaService = inject(CajaService);
  private uiService = inject(UiService);

  // Enlazamos directamente con el Signal globalizado del servicio
  cajaActual = this.cajaService.cajaActual;
  cargando = signal<boolean>(true);

  // Modales táctiles (Signals)
  mostrarModalMovimiento = signal<boolean>(false);
  mostrarModalCierre = signal<boolean>(false);
  mostrarModalPdf = signal<boolean>(false);

  // Variables de control de datos
  idCajaCerrada = signal<number | null>(null); // 🚀 Corregido a Signal
  montoMovimiento: number = 0;
  descripcionMovimiento: string = '';
  tipoMovimientoSeleccionado: 'INGRESO_MANUAL' | 'GASTO' = 'INGRESO_MANUAL';
  
  saldoFinalRealContado: number = 0;

  // 🚀 Vinculamos 'turno()' al estado dinámico que exige tu HTML
  turno = computed(() => this.cajaActual()); 
  movimientos = signal<any[]>([]); // Inicializado como array reactivo vacío para evitar fallos en el @for

  // 🚀 Completados los stubs mapeando las propiedades reales del DTO de Caja
  totalVentasEfectivo = computed(() => this.cajaActual()?.totalVentasEfectivo ?? 0);
  totalVentasTarjeta = computed(() => this.cajaActual()?.totalVentasTarjeta ?? 0);
  totalAnticipos = computed(() => this.cajaActual()?.totalAnticipos ?? 0);
  totalIngresos = computed(() => this.cajaActual()?.totalIngresosManuales ?? 0);
  totalGastos = computed(() => this.cajaActual()?.totalGastos ?? 0);
  totalDevoluciones = computed(() => this.cajaActual()?.totalDevoluciones ?? 0);

  claseMovimiento(tipo: string): string {
    return tipo === 'INGRESO_MANUAL' ? 'badge-ingreso' : 'badge-gasto';
  }

  iconoMovimiento(tipo: string): string {
    return tipo === 'INGRESO_MANUAL' ? '📥' : '📤';
  }

  ngOnInit(): void {
    this.cargarCaja();
  }

  cargarCaja() {
    this.cargando.set(true);
    // Usamos checkEstadoCaja para que se actualice sincrónicamente tanto aquí como en el TPV
    this.cajaService.checkEstadoCaja().subscribe({
      next: () => this.cargando.set(false),
      error: (err: any) => { // 🚀 Tipado explícito para evitar TS7006
        console.error("Error al recuperar la caja", err);
        this.uiService.mostrarToast('Error al conectar con la caja física.', 'error');
        this.cargando.set(false);
      }
    });
  }

  guardarMovimientoManual() {
    if (this.montoMovimiento <= 0 || !this.descripcionMovimiento.trim()) {
      this.uiService.mostrarToast('Por favor, completa todos los campos obligatorios.', 'warning');
      return;
    }

    const payload = {
      tipoMovimiento: this.tipoMovimientoSeleccionado,
      importe: this.montoMovimiento,
      descripcion: this.descripcionMovimiento
    };

    this.cajaService.registrarMovimientoManual(payload).subscribe({
      next: () => {
        this.mostrarModalMovimiento.set(false);
        this.montoMovimiento = 0;
        this.descripcionMovimiento = '';
        this.uiService.mostrarToast('Movimiento registrado en el cajón.', 'success');
        this.cargarCaja();
      },
      error: (err: any) => this.uiService.mostrarToast("Error al registrar movimiento: " + err.error, 'error')
    });
  }

  ejecutarCierreCaja() {
    if (this.saldoFinalRealContado === null || this.saldoFinalRealContado < 0) {
      this.uiService.mostrarToast("Introduce un arqueo de efectivo válido.", 'warning');
      return;
    }

    this.cajaService.cerrarCaja(this.saldoFinalRealContado).subscribe({
      next: (cajaCerrada) => {
        this.idCajaCerrada.set(cajaCerrada.id);
        this.mostrarModalCierre.set(false);
        
        this.uiService.mostrarToast('Turno de caja cerrado correctamente.', 'success');
        this.mostrarModalPdf.set(true); // Abre el selector del reporte post-cierre
        
        this.cargarCaja();
      },
      error: (err: any) => this.uiService.mostrarToast("Error al cerrar: " + err.error, 'error')
    });
  }

  verPdf(id: number, formato: '80mm' | 'a4') {
    const peticion = formato === '80mm' 
      ? this.cajaService.descargarPdf80mm(id) 
      : this.cajaService.descargarPdfA4(id);

    peticion.subscribe({
      next: (blob: Blob) => { // 🚀 Tipado de parámetro
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.uiService.mostrarToast("No se pudo escupir el reporte PDF.", 'error')
    });
  }

  imprimirInformeFinal(formato: '80mm' | 'a4') {
    const id = this.idCajaCerrada();
    if (id) {
      this.verPdf(id, formato);
    }
    this.mostrarModalPdf.set(false);
    this.idCajaCerrada.set(null);
  }
  
}