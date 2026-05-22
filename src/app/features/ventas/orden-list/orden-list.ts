import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';

@Component({
  selector: 'app-orden-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, FormsModule],
  templateUrl: './orden-list.html',
  styleUrl: './orden-list.scss'
})
export class OrdenListComponent implements OnInit {
  private ordenService = inject(OrdenService);
  private uiService = inject(UiService);
  
  // Signals para el estado
  filtroEstado = signal<string>('EN_TALLER'); // He puesto EN_TALLER por defecto
  ordenes = signal<any[]>([]);

  // 🛡️ NUEVO: Límite de líneas para no petar el sistema con 300 tickets
  ordenesAMostrar = computed(() => {
    const maxLineas = 50; // Puedes subirlo a 100 si quieres
    return this.ordenes().slice(0, maxLineas);
  });

  // 👁️ Guarda la orden que queremos ver en el modal.
  ordenSeleccionada = signal<any | null>(null);

  // --- SIGNALS DE EDICIÓN ---
  editandoNotas = signal<string>('');
  editandoFecha = signal<string>('');

  // Signals para el panel de cobro
  mostrarModalCobro = signal<boolean>(false);
  metodoPago = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  importeEntregado = signal<string>(''); 
  cambioAOfrecer = computed(() => {
    if (this.metodoPago() === 'TARJETA') return 0;
    const total = this.ordenSeleccionada()?.importePendiente || 0;
    const entregado = parseFloat(this.importeEntregado()) || 0;
    return entregado > total ? entregado - total : 0;
  });

  // Carga inicial de datos y recarga cada vez que cambia el filtro
  constructor() {
    effect(() => {
      this.cargarDatos(this.filtroEstado());
    });
  }

  // Carga inicial de datos al montar el componente
  ngOnInit() {
      this.cargarDatos(this.filtroEstado());
  }

  // Método para cargar datos según la pestaña seleccionada
  cargarDatos(pestana: string) {
    if (pestana === 'EN_TALLER') {
      this.ordenService.getOrdenesTaller().subscribe({
        next: (data) => this.ordenes.set(data),
        error: (err) => this.uiService.mostrarToast('Error en el taller: ' + (err.error?.message || err.message), 'error')
      });
    } else {
      this.ordenService.getOrdenesPorEstado(pestana).subscribe({
        next: (data) => this.ordenes.set(data),
        error: (err) => this.uiService.mostrarToast('Error al cargar historial: ' + (err.error?.message || err.message), 'error')
      });
    }
  }

  // Método para asignar clases CSS según el estado de la orden
  getBadgeClass(estado: string): string {
    switch (estado) {
      case 'PAGADO': return 'badge-success';
      case 'PENDIENTE': return 'badge-warning';
      case 'EN_TALLER': return 'badge-info';
      case 'LISTO': return 'badge-success';
      case 'ENTREGADO': return 'badge-secondary';
      case 'CANCELADA': return 'badge-danger';
      default: return 'badge-info';
    }
  }

  // Método para abrir el modal de detalles de la orden
  verDetalle(orden: any) {
    this.ordenSeleccionada.set(orden);
    this.editandoNotas.set(orden.notasReparacion || '');
    if (orden.fechaEntrega) {
      this.editandoFecha.set(orden.fechaEntrega.substring(0, 10));
    } else {
      this.editandoFecha.set('');
    }
  }

  // Método para cerrar el modal de detalles
  cerrarModal() {
    this.ordenSeleccionada.set(null);
  }

  // Métodos para cambiar el estado de la orden
  empezarTrabajo(ordenId: number) {
    this.ordenService.cambiarEstado(ordenId, 'EN_TALLER').subscribe({
      next: () => {
        this.uiService.mostrarToast('¡Trabajo iniciado! El ticket ya está en taller.', 'success');
        this.cargarDatos(this.filtroEstado());
        if (this.ordenSeleccionada()?.id === ordenId) this.cerrarModal();
      },
      error: (err) => this.uiService.mostrarToast('Error al iniciar trabajo: ' + (err.error?.message || err.message), 'error')
    });
  }

  // Método para marcar la reparación como finalizada (pasar a LISTO)
  finalizarReparacion(ordenId: number) {
    this.ordenService.cambiarEstado(ordenId, 'LISTO').subscribe({
      next: () => {
        this.uiService.mostrarToast('Reparación finalizada. Pasada a "Listos para recoger".', 'success');
        this.cargarDatos(this.filtroEstado());
        if (this.ordenSeleccionada()?.id === ordenId) this.cerrarModal();
      },
      error: (err) => this.uiService.mostrarToast('Error al finalizar reparación', 'error')
    });
  }

  // Método para cancelar la orden
  guardarCambiosReparacion() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    this.ordenService.editarReparacion(orden.id, this.editandoNotas(), this.editandoFecha()).subscribe({
      next: (ordenActualizada) => {
        this.uiService.mostrarToast('Ticket actualizado correctamente.', 'success');
        this.cargarDatos(this.filtroEstado());
        this.cerrarModal();
      },
      error: (err) => this.uiService.mostrarToast('Error al actualizar el ticket', 'error')
    });
  }

  // --- MÉTODOS DE COBRO ---
  abrirPanelCobro() {
    this.importeEntregado.set('');
    this.metodoPago.set('EFECTIVO');
    this.mostrarModalCobro.set(true);
  } 

  cerrarPanelCobro() {
    this.mostrarModalCobro.set(false);
  }

  presionarTecla(valor: string) {
    const actual = this.importeEntregado();
    if (valor === 'C') { this.importeEntregado.set(''); return; }
    if (valor === '⌫') { this.importeEntregado.set(actual.slice(0, -1)); return; }
    if (valor === '.') {
      if (!actual.includes('.')) this.importeEntregado.set(actual === '' ? '0.' : actual + '.');
      return;
    }
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
    if (actual === '0' && valor !== '.') {
      this.importeEntregado.set(valor);
    } else {
      this.importeEntregado.set(actual + valor);
    }
  }

   seleccionarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA') {
    this.metodoPago.set(metodo);
    if (metodo === 'TARJETA') this.importeEntregado.set('');
  }

  finalizarEntregaYCobro() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    const totalCobrar = orden.importePendiente;
    const entregado = this.metodoPago() === 'TARJETA' 
    ? totalCobrar 
    : (parseFloat(this.importeEntregado()) || 0);

  if (this.metodoPago() === 'EFECTIVO' && entregado < totalCobrar) {
    this.uiService.mostrarToast(`El importe entregado (${entregado}€) es menor que el total pendiente (${totalCobrar}€)`, 'warning');
    return;
  } 

  // NUEVO COMPORTAMIENTO: Solo cerramos a ENTREGADO si el zapato ya estaba LISTO.
  const ejecutarCambioEstado = () => {
    if (orden.estado === 'LISTO') {
        // Estaba listo, cobramos y cerramos el ciclo
        this.ordenService.cambiarEstado(orden.id, 'ENTREGADO').subscribe({
        next: () => {
            this.uiService.mostrarToast('¡Ticket completado! Orden cobrada y ENTREGADA.', 'success');
            this.cerrarPanelCobro();
            this.cerrarModal(); 
            this.cargarDatos(this.filtroEstado());
        },
        error: (errEstado) => this.uiService.mostrarToast('Problema al marcar como ENTREGADO.', 'error')
        });
    } else {
        // Estaba en taller o pendiente. Es un pago por adelantado. NO cerramos el ticket.
        this.uiService.mostrarToast('¡Pago adelantado registrado! El ticket sigue en proceso.', 'success');
        this.cerrarPanelCobro();
        this.cerrarModal(); 
        this.cargarDatos(this.filtroEstado());
    }
  };

  this.ordenService.cobrar(orden.id, this.metodoPago()).subscribe({
    next: (resCobro) => {
      ejecutarCambioEstado();
    },
    error: (errCobro) => {
      if (errCobro.status === 400 && typeof errCobro.error === 'string' && errCobro.error.includes('ya ha sido cobrado')) {
        ejecutarCambioEstado();
      } else {
        this.uiService.mostrarToast('Error al procesar el pago: ' + (errCobro.error || errCobro.message), 'error');
      }
    }
  });
 }
}
