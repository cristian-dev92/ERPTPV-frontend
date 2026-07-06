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

  // ESTADOS PARA EL TECLADO TÁCTIL EN EL BUSCADOR
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  mayusculas = signal<boolean>(true);
  valorTecladoEnConstruccion = signal<string>('');

  // Listas de caracteres fijas para el renderizado consistente del teclado
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
  lineaAcentos = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];
  lineaEspecialDinamica = ['@', ',', '.', '_', '/', '-'];

  // Estado para mostrar el modal de confirmación de anticipar stock
  mostrarModalConfirmar = signal<boolean>(false);
  articuloAAnticipar = signal<{ id: number, nombre: string } | null>(null);

  // FILTRADO EN TIEMPO REAL CON COMPUTED
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
  abrirTecladoBusqueda(objetivo: string) {
    if (isMobileOrTablet()) {
      return;
    }
    this.inputActivo.set(objetivo);
    this.mostrarTeclado.set(true);
  }

  sincronizarTecladoFisico(valor: string) {
    this.terminoBusqueda.set(valor);
  }

  escribirTeclado(caracter: string) {
    let letraFormateada = caracter;
    if (/^[a-zA-ZÑñÁÉÍÓÚÜáéíóúü]$/.test(caracter)) {
      letraFormateada = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }
    this.terminoBusqueda.update(actual => actual + letraFormateada);
  }

  insertarEspacio() {
    this.terminoBusqueda.update(actual => actual + ' ');
  }

  borrarUltimoCaracter() {
    this.terminoBusqueda.update(actual => actual.slice(0, -1));
  }

  limpiarTeclado() {
    this.terminoBusqueda.set('');
  }

  alternarMayusculas() {
    this.mayusculas.set(!this.mayusculas());
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
  }

  aplicarBusqueda() {
    this.terminoBusqueda.set(this.valorTecladoEnConstruccion());
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