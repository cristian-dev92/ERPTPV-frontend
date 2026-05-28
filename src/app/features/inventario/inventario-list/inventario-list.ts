import { Component, inject, OnInit, signal } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from "@angular/router";
import {UiService} from "../../../core/services/ui.service";

@Component({
  selector: 'app-inventario-list',
  standalone: true,
  // Usamos CurrencyPipe para mostrar los precios bonitos (€)
  imports: [CurrencyPipe, RouterLink], 
  templateUrl: './inventario-list.html',
  styleUrl: './inventario-list.scss'
})
export class InventarioListComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);

  // Lista de artículos reactiva
  articulos = signal<Articulo[]>([]);
  // Estado de carga
  loading = signal<boolean>(true);

  ngOnInit(): void {
    this.cargarArticulos();
  }

  // Función para cargar los artículos desde el backend
  cargarArticulos(): void {
    this.articuloService.getArticulos().subscribe({
      next: (data) => {
        this.articulos.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.uiService.mostrarToast('Error al cargar los artículos', 'error');
      }
    });
  }
  // Función para borrar un artículo de forma segura
  
  eliminarProducto(id: number, nombre: string): void {
    const seguro = confirm(`¿Estás seguro de que deseas eliminar el artículo "${nombre}" del catálogo?`);
    if (!seguro) return;

    this.articuloService.eliminarArticulo(id).subscribe({
      next: () => {
        this.uiService.mostrarToast('📦 Artículo eliminado del catálogo correctamente', 'success');
        
        // Actualizamos la señal reactiva eliminando el ítem de la lista al instante
        this.articulos.update(listaActual => listaActual.filter(item => item.id !== id));
      },
      error: (err) => {
        console.error('Error al eliminar producto:', err);
        this.uiService.mostrarToast('No se pudo eliminar el artículo. Es posible que esté asociado a un ticket existente.', 'error');
      }
    });
  }

}