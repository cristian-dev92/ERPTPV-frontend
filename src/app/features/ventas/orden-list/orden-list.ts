import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-orden-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, FormsModule],
  templateUrl: './orden-list.html',
  styleUrl: './orden-list.scss'
})
export class OrdenListComponent implements OnInit {
  private ordenService = inject(OrdenService);

  // Signals para el estado
  filtroEstado = signal<string>('PAGADO'); // Valor por defecto
  ordenes = signal<any[]>([]);

  // 👁️ Guarda la orden que queremos ver en el modal. Si es null, el modal se oculta.
  ordenSeleccionada = signal<any | null>(null);

  constructor() {
    // 🔄 Cada vez que 'filtroEstado' cambie en el HTML, se vuelve a llamar automáticamente al backend
    effect(() => {
      this.cargarOrdenes(this.filtroEstado());
    });
  }

  ngOnInit() {
      // Cargar órdenes al iniciar el componente
  }

  // Método para cargar las órdenes desde el servicio
  cargarOrdenes(estado: string) {
    this.ordenService.getOrdenesPorEstado(estado).subscribe({
      next: (data) => {
        console.log('Datos recibidos de Neon:', data);
        this.ordenes.set(data);
      },
      error: (err) => {
        console.error('Error completo del Backend:', err);
        const mensajeError = err.error?.message || err.message || 'Error desconocido';
        alert('Error al cargar historial: ' + mensajeError);
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
}