import { Component, inject, OnInit, signal, effect } from '@angular/core';
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
  filtroEstado = signal<string>('PAGADO'); // Valor por defecto
  ordenes = signal<any[]>([]);

  // 👁️ Guarda la orden que queremos ver en el modal. Si es null, el modal se oculta.
  ordenSeleccionada = signal<any | null>(null);

  // States para el proceso de cobro
  mostrarModalCobro = signal<boolean>(false);
  metodoPago = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  importeEntregado = signal<string>(''); // Guarda lo que pican en el teclado táctil
  cambioAOfrecer = signal<number>(0);

  constructor() {
    // 🔄 Cada vez que 'filtroEstado' cambie en el HTML, se vuelve a llamar automáticamente al backend
    effect(() => {
      this.cargarOrdenes();
    });
  }

  ngOnInit() {
      // Cargar órdenes al iniciar el componente
  }

  // Método para cargar las órdenes desde el servicio
  cargarOrdenes() {
    const estadoActual = this.filtroEstado();
    this.ordenService.getOrdenesPorEstado(estadoActual).subscribe({
      next: (data) => {
        this.ordenes.set(data);
      },
      error: (err) => {
        console.error('Error completo del Backend:', err);
        const mensajeError = err.error?.message || err.message || 'Error desconocido';
        this.uiService.mostrarToast('Error al cargar historial: ' + mensajeError, 'error');
      }
    });
  }

  // Método para asignar clases de badge según el estado
  getBadgeClass(estado: string): string {
    switch (estado) {
      case 'PAGADO': return 'badge-success';      // Verde
      case 'PENDIENTE': return 'badge-warning';   // Amarillo
      case 'EN_TALLER': return 'badge-info';      // Azul/Cian
      case 'LISTO': return 'badge-success';       // Verde
      case 'ENTREGADO': return 'badge-secondary'; // Gris (puedes añadir .badge-secondary { background-color: #6c757d; } en tu scss)
      case 'CANCELADA': return 'badge-danger';    // Rojo
      default: return 'badge-info';
    }
  }

  // Ahora en vez de un alert rancio, guarda la orden para abrir el modal
  verDetalle(orden: any) {
    this.ordenSeleccionada.set(orden);
  }

  // Para cerrar el modal pinchando fuera o en la 'X'
  cerrarModal() {
    this.ordenSeleccionada.set(null);
  }

  // Abre el panel de cobro inicializando los valores
  abrirPanelCobro() {
    this.importeEntregado.set('');
    this.cambioAOfrecer.set(0);
    this.metodoPago.set('EFECTIVO');
    this.mostrarModalCobro.set(true);
  } 

  cerrarPanelCobro() {
    this.mostrarModalCobro.set(false);
  }

  // ⌨️ Lógica del Teclado Numérico Táctil
  presionarTecla(valor: string) {
    const actual = this.importeEntregado();
  
  if (valor === 'C') {
    this.importeEntregado.set('');
  } else if (valor === '⌫') {
    this.importeEntregado.set(actual.slice(0, -1));
  } else if (valor === '.') {
    if (!actual.includes('.')) {
      this.importeEntregado.set(actual + '.');
    }
  } else {
    // Evitar que metan más de dos decimales
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
    this.importeEntregado.set(actual + valor);
  }

  // Calcular el cambio automáticamente si es efectivo
    this.calcularCambio();
  }

  calcularCambio() {
    const total = this.ordenSeleccionada()?.importePendiente || 0;
    const entregado = parseFloat(this.importeEntregado()) || 0;
  
  if (entregado > total) {
    this.cambioAOfrecer.set(entregado - total);
  } else {
    this.cambioAOfrecer.set(0);
  }
  }

  // Confirmar el cobro y enviar los datos actualizados al Backend
  finalizarEntregaYCobro() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    const totalCobrar = orden.importePendiente;
    const entregado = parseFloat(this.importeEntregado()) || 0;

  // Validación: Si es efectivo, el importe entregado no puede ser menor que el total a cobrar
  if (this.metodoPago() === 'EFECTIVO' && entregado < totalCobrar) {
    this.uiService.mostrarToast(`El importe entregado (${entregado}€) es menor que el total pendiente (${totalCobrar}€)`, 'warning');
    return;
  } 

  // Creamos una función reutilizable para cambiar el estado a ENTREGADO
  const ejecutarCambioEstado = () => {
    this.ordenService.cambiarEstado(orden.id, 'ENTREGADO').subscribe({
      next: (resEstado) => {
        this.uiService.mostrarToast('¡Ticket completado! Orden marcada como ENTREGADO con éxito.', 'success');
        this.cerrarPanelCobro();
        this.cerrarModal(); 
        this.cargarOrdenes(); // Refresca las pestañas
      },
      error: (errEstado) => {
        console.error('Error al cambiar estado a ENTREGADO:', errEstado);
        this.uiService.mostrarToast('Problema al marcar la orden como ENTREGADO. Revisa los filtros CORS de Spring Boot.', 'error');
      }
    });
  };

  // 1️⃣ PASO 1: Llamamos a tu método real 'cobrar' del servicio
  this.ordenService.cobrar(orden.id, this.metodoPago()).subscribe({
    next: (resCobro) => {
      console.log('Cobro registrado con éxito en el backend:', resCobro);
      // 2️⃣ PASO 2: Una vez cobrado con éxito, cambiamos su estado a ENTREGADO
      ejecutarCambioEstado();
    },
    error: (errCobro) => {
      // 🕵️ CONTROL DEL LIMBO: Si el backend dice que ya está cobrado, ¡asumimos que está bien!
      if (errCobro.status === 400 && typeof errCobro.error === 'string' && errCobro.error.includes('ya ha sido cobrado')) {
        console.log('La orden ya estaba pagada en base de datos. Saltamos directo a entregar...');
        ejecutarCambioEstado();
      } else {
        // Si es otro error de verdad, mostramos la alerta
        console.error('Error real al procesar el cobro:', errCobro);
        this.uiService.mostrarToast('Error del backend al procesar el pago: ' + (errCobro.error || errCobro.message), 'error');
      }
    }
  });
 }
}

