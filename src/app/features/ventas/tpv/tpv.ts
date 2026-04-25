import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { Orden, LineaOrden } from '../../../core/models/orden.model';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

  // Datos
  articulos = signal<Articulo[]>([]);
  carrito = signal<LineaOrden[]>([]);
  tipoOrden = signal<'VENTA' | 'REPARACION'>('VENTA');
  importePagado = signal<number>(0);

  // Cálculos automáticos (Signals)
  totalTicket = computed(() => 
    this.carrito().reduce((acc, item) => acc + item.subtotal, 0)
  );

  // Calcula el cambio a devolver
  cambio = computed(() => {
  const entrega = this.importePagado();
  const total = this.totalTicket();
  return entrega > total ? entrega - total : 0;
  });

  ngOnInit() {
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
  }

  agregarAlCarrito(art: Articulo) {
    const existe = this.carrito().find(l => l.articuloId === art.id);
    if (existe) {
      this.carrito.update(items => items.map(l => 
        l.articuloId === art.id ? { ...l, cantidad: l.cantidad + 1, subtotal: (l.cantidad + 1) * l.precioUnitario } : l
      ));
    } else {
      const nuevaLinea: LineaOrden = {
        articuloId: art.id!,
        nombreArticulo: art.nombre,
        cantidad: 1,
        precioUnitario: art.precio,
        subtotal: art.precio
      };
      this.carrito.update(items => [...items, nuevaLinea]);
    }
  }

  eliminarLinea(index: number) {
    this.carrito.update(items => items.filter((_, i) => i !== index));
  }

  finalizarVenta() {
    const nuevaOrden: Orden = {
      tipo: this.tipoOrden(),
      estado: this.importePagado() >= this.totalTicket() ? 'PAGADO' : 'PENDIENTE',
      total: this.totalTicket(),
      importePagado: this.importePagado(),
      lineas: this.carrito()
    };

    this.ordenService.crearOrden(nuevaOrden).subscribe(() => {
      alert('Venta realizada con éxito');
      this.carrito.set([]);
      this.importePagado.set(0);
    });
  }
}