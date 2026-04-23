import { Component, inject, OnInit, signal } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-inventario-list',
  standalone: true,
  // Usamos CurrencyPipe para mostrar los precios bonitos (€)
  imports: [CurrencyPipe], 
  templateUrl: './inventario-list.html',
  styleUrl: './inventario-list.scss'
})
export class InventarioListComponent implements OnInit {
  private articuloService = inject(ArticuloService);

  // Lista de artículos reactiva
  articulos = signal<Articulo[]>([]);
  // Estado de carga
  loading = signal<boolean>(true);

  ngOnInit(): void {
    this.cargarArticulos();
  }

  /**
   * Llama al servicio para obtener los datos del backend.
   */
  cargarArticulos(): void {
    this.articuloService.getArticulos().subscribe({
      next: (data) => {
        this.articulos.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        // Aquí podrías poner un aviso de error
      }
    });
  }
}