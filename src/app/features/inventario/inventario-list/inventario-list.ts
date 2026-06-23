import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from "@angular/router";
import { UiService } from "../../../core/services/ui.service";
import { isMobileOrTablet } from '../../../core/utils/device-utils';

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

  // Estado para el término de búsqueda
  terminoBusqueda = signal<string>('');

  // === MAQUINARIA DEL TECLADO TÁCTIL MASTER ===
  mostrarTecladoGeneral = signal<boolean>(false);
  valorTecladoEnConstruccion = signal<string>('');
  mayusculasGeneral = signal<boolean>(true);


  // Estado para mostrar el modal de confirmación de anticipar stock
  mostrarModalConfirmar = signal<boolean>(false);
  articuloAAnticipar = signal<{ id: number, nombre: string } | null>(null);

  // 🎯 FILTRADO EN TIEMPO REAL CON COMPUTED
  articulosFiltrados = computed(() => {
    const buscar = this.terminoBusqueda().toLowerCase().trim();
    if (!buscar) return this.articulos();
    
    return this.articulos().filter(item => 
      item.nombre.toLowerCase().includes(buscar) || 
      (item.notas && item.notas.toLowerCase().includes(buscar))
    );
  });

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

  // === MÉTODOS DEL TECLADO TÁCTIL PARA LA BÚSQUEDA ===
  abrirTecladoBusqueda() {
    // Si están con la tablet en el taller, frenamos vuestro teclado virtual
    if (isMobileOrTablet()) {
      return;
    }
    this.valorTecladoEnConstruccion.set(this.terminoBusqueda());
    this.mostrarTecladoGeneral.set(true);
  }

  pulsarTeclaGeneral(caracter: string) {
    // Procesamos si el carácter es una letra para respetar el estado del Shift
    let valorAInsertar = caracter;
    const esLetra = /^[a-zA-ZÑñ]$/.test(caracter);
    
    if (esLetra) {
      valorAInsertar = this.mayusculasGeneral() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    this.valorTecladoEnConstruccion.update(val => val + valorAInsertar);
  }

  alternarMayusculasGeneral() {
    this.mayusculasGeneral.set(!this.mayusculasGeneral());
  }

  borrarUltimoCaracterGeneral() {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
  }

  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
  }

  aplicarBusqueda() {
    this.terminoBusqueda.set(this.valorTecladoEnConstruccion());
    this.mostrarTecladoGeneral.set(false);
  }

  buscarArticulos() {
    // Se mantiene por compatibilidad si se quita el readonly para PC físico
  }
  
  // Función para borrar un artículo de forma segura
  eliminarProducto(id: number, nombre: string): void {
    // Guardamos los datos del artículo que queremos borrar y abrimos el modal moderno
    this.articuloAAnticipar.set({ id, nombre });
    this.mostrarModalConfirmar.set(true);
  }

  // 🔑 3. Añade la función que se ejecutará cuando el usuario pulse "SÍ, ELIMINAR"
  confirmarEliminacionDefinitiva(): void {
  const articulo = this.articuloAAnticipar();
  if (!articulo) return;

    this.articuloService.eliminarArticulo(articulo.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('📦 Artículo eliminado del catálogo correctamente', 'success');
        
        // Actualizamos la señal reactiva eliminando el ítem de la lista al instante
        this.articulos.update(listaActual => listaActual.filter(item => item.id !== articulo.id));
        this.cerrarModalConfirmar();
      },
      error: (err) => {
        console.error('Error al eliminar producto:', err);
        this.uiService.mostrarToast('No se pudo eliminar el artículo. Es posible que esté asociado a un ticket existente.', 'error');
        this.cerrarModalConfirmar();
      }
    });
  }

  cerrarModalConfirmar(): void {
  this.mostrarModalConfirmar.set(false);
  this.articuloAAnticipar.set(null);
 }

}