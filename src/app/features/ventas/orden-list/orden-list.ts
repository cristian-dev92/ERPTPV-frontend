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
  terminoBusqueda = signal<string>('');
  ordenes = signal<any[]>([]);

  // 🛡️ Filtra primero por el buscador y luego limita a un máximo de 50 registros
  ordenesAMostrar = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase().trim();
    const listaOriginal = this.ordenes();

    if (!busqueda) {
      return listaOriginal.slice(0, 50);
    }

    // Filtra dinámicamente por ID del ticket o por Nombre del Cliente
    const listaFiltrada = listaOriginal.filter(orden => {
      const cumpleId = orden.id?.toString().includes(busqueda);
      const cumpleCliente = orden.clienteNombre?.toLowerCase().includes(busqueda);
      return cumpleId || cumpleCliente;
    });

    return listaFiltrada.slice(0, 50);
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

  // --- SIGNALS PARA DEVOLUCIONES (VÍA A) ---
  mostrarModalDevolucion = signal<boolean>(false);
  metodoDevolucion = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');

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
    this.ordenService.getOrdenesPorEstado(pestana).subscribe({
      next: (data) => this.ordenes.set(data),
      error: (err) => this.uiService.mostrarToast('Error al cargar el listado: ' + (err.error?.message || err.message), 'error')
    });
  }

  // 📄 NUEVO: Método para descargar/imprimir el PDF desde el Backend de Javi
  descargarPdfTicket(ordenId: number) {
    this.uiService.mostrarToast('Generando PDF del ticket...');
    
    this.ordenService.getTicketPdf(ordenId).subscribe({
      next: (blob: Blob) => {
        // Creamos una URL local con los bytes del PDF que escupió Spring Boot
        const urlDescarga = window.URL.createObjectURL(blob);
        
        // Opción A: Abrirlo en una pestaña nueva listo para imprimir directamente en el TPV
        window.open(urlDescarga, '_blank');

        // Opción B (Comentada por si prefieres descarga directa):
        // const a = document.createElement('a');
        // a.href = urlDescarga;
        // a.download = `ticket-${ordenId}.pdf`;
        // a.click();
        
        window.URL.revokeObjectURL(urlDescarga);
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al generar el archivo PDF en el servidor.', 'error');
      }
    });
  }

  // Limpiar el buscador con un clic táctil
  limpiarBuscador() {
    this.terminoBusqueda.set('');
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

 // Abre el selector de método de devolución
  abrirPanelDevolucion() {
    this.metodoDevolucion.set('EFECTIVO');
    this.mostrarModalDevolucion.set(true);
  }

  cerrarPanelDevolucion() {
    this.mostrarModalDevolucion.set(false);
  }

  // Lanza la petición al nuevo endpoint de Javi
  confirmarDevolucionTicket() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    // Mapeamos las líneas del ticket original tal y como el backend las espera (IDs y cantidades en positivo)
    // Nota: Si en tu objeto orden las líneas vienen como 'lineas', adáptalo. 
    // Si devuelves el ticket entero, mapeamos sus artículos:
    const lineasDev = (orden.lineas || []).map((l: any) => ({
      articuloId: l.articuloId || l.id, // Según cómo te devuelva Javi el campo en el DTO
      cantidad: l.cantidad
    }));

    if (lineasDev.length === 0) {
      this.uiService.mostrarToast('No hay artículos válidos en este ticket para devolver', 'warning');
      return;
    }

    const peticion = {
      ordenOrigenId: orden.id,
      metodoPago: this.metodoDevolucion(),
      lineas: lineasDev
    };

    this.ordenService.procesarDevolucion(peticion).subscribe({
      next: (res) => {
        this.uiService.mostrarToast(`¡Devolución registrada! Factura Rectificativa generada con éxito.`, 'success');
        this.cerrarPanelDevolucion();
        this.cerrarModal();
        this.cargarDatos(this.filtroEstado()); // Recarga la pestaña actual
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error || err.message), 'error');
      }
    });
  }

}
