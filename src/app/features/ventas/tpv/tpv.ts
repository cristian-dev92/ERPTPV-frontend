import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})
export class TpvComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);

  // Datos
  articulos = signal<Articulo[]>([]);
  filtro = signal('');
  carrito = signal<any[]>([]); // Aquí guardaremos { articuloId, nombre, cantidad, precio, notas }

  // UI State
  cajaAbierta = computed(() => !!this.cajaService.cajaActual());
  
  // Totales automáticos
  totalTicket = computed(() => {
    return this.carrito().reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  });

  articulosFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.articulos().filter(a => a.nombre.toLowerCase().includes(f));
  });

  ngOnInit() {
    // 1. Cargamos artículos
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
    // 2. Comprobamos si la caja ya estaba abierta
    this.cajaService.checkEstadoCaja().subscribe();
  }

  agregarAlCarrito(articulo: Articulo) {
    const actual = this.carrito();
    const existe = actual.find(item => item.articuloId === articulo.id);

    if (existe) {
      existe.cantidad++;
      this.carrito.set([...actual]);
    } else {
      this.carrito.set([...actual, {
        articuloId: articulo.id,
        nombre: articulo.nombre,
        cantidad: 1,
        precio: articulo.precioBase * (1 + articulo.porcentajeIva / 100), // Precio PVP
        notasReparacion: ''
      }]);
    }
  }

  quitarDelCarrito(index: number) {
    const actual = this.carrito();
    actual.splice(index, 1);
    this.carrito.set([...actual]);
  }

  // EL MOMENTO DE LA VERDAD: Enviar al Backend
  finalizarVenta() {
    if (!this.cajaAbierta()) {
      alert('¡Atención! Debes abrir la caja antes de realizar una venta.');
      return;
    }

    const request = {
      clienteId: null, // De momento anónimo
      tipo: 'VENTA_DIRECTA',
      lineas: this.carrito().map(item => ({
        articuloId: item.articuloId,
        cantidad: item.cantidad,
        notasReparacion: item.notasReparacion
      }))
    };

    this.ordenService.crearOrden(request).subscribe({
      next: (ordenGuardada) => {
        // Una vez creada la orden, la cobramos inmediatamente (Venta Directa)
        this.cobrarTicket(ordenGuardada.id);
      },
      error: (err) => alert('Error al crear ticket: ' + err.error)
    });
  }

  private cobrarTicket(id: number) {
    this.ordenService.cobrar(id, 'EFECTIVO').subscribe(() => {
      alert('Venta finalizada con éxito');
      this.carrito.set([]); // Limpiamos TPV
    });
  }

  // Añadir esto dentro de la clase TpvComponent
  ajustarCantidad(index: number, cambio: number) {
  const actual = this.carrito();
  const item = actual[index];
  
  item.cantidad += cambio;

  if (item.cantidad <= 0) {
    this.quitarDelCarrito(index);
  } else {
    // Actualizamos el signal para que la UI reaccione
    this.carrito.set([...actual]);
  }
 }
}