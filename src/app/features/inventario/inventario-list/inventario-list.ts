import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from "@angular/router";
import { UiService } from "../../../core/services/ui.service";
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { FamiliaDTO, FamiliaService } from '../../../core/services/familia.service';

@Component({
  selector: 'app-inventario-list',
  standalone: true,
  imports: [CurrencyPipe, RouterLink], 
  templateUrl: './inventario-list.html',
  styleUrl: './inventario-list.scss'
})
export class InventarioListComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);
  private familiaService = inject(FamiliaService);

  // // Listas de datos reactivas
  articulos = signal<Articulo[]>([]);
  loading = signal<boolean>(true);
  todasLasFamilias = signal<FamiliaDTO[]>([]);

  // Filtros activos en pantalla
  terminoBusqueda = signal<string>('');
  familiaFiltroId = signal<number | null>(null);
  subfamiliaFiltroId = signal<number | null>(null);

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

  // 🎯 COMPUTED: Filtra familias principales para el selector del buscador
  familiasPadre = computed(() => {
    return this.todasLasFamilias().filter(f => !f.familiaPadreId);
  });

  // 🎯 COMPUTED: Filtra subfamilias según la familia padre seleccionada en el filtro
  subfamiliasFiltradas = computed(() => {
    const padreId = this.familiaFiltroId();
    if (!padreId) return [];
    return this.todasLasFamilias().filter(f => f.familiaPadreId === padreId);
  });

  // 🎯 COMPUTED MOTOR DE FILTRADO UNIFICADO (Filtra por Texto, Código de Barras y Familias)
  articulosFiltrados = computed(() => {
    let resultado = this.articulos();
    const buscar = this.terminoBusqueda().toLowerCase().trim();
    const famId = this.familiaFiltroId();
    const subId = this.subfamiliaFiltroId();

    // 1. Filtrado por Jerarquía de Familias (Si hay subfamilia tiene prioridad, si no la familia raíz)
    if (subId) {
      resultado = resultado.filter(item => item.familiaId === subId);
    } else if (famId) {
      // Si seleccionas una familia raíz, queremos ver sus artículos directos Y TAMBIÉN los de sus subfamilias
      const idsSubfamilias = this.todasLasFamilias()
        .filter(f => f.familiaPadreId === famId)
        .map(f => f.id);
      
      resultado = resultado.filter(item => 
        item.familiaId === famId || (item.familiaId && idsSubfamilias.includes(item.familiaId))
      );
    }

    // 2. Filtrado por Entrada de Texto o Lector de Barras
    if (buscar) {
      resultado = resultado.filter(item => 
        item.nombre.toLowerCase().includes(buscar) || 
        (item.notas && item.notas.toLowerCase().includes(buscar)) ||
        (item.codigoBarras && item.codigoBarras.toLowerCase().includes(buscar))
      );
    }
    
    return resultado;
  });

  ngOnInit(): void {
    this.cargarDatosIniciales();
  }

  cargarDatosIniciales(): void {
    // Cargamos familias e inventario en paralelo
    this.familiaService.obtenerMisFamilias().subscribe({
      next: (fams) => this.todasLasFamilias.set(fams),
      error: () => console.error('Error al precargar familias en catálogo')
    });

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

  onFamiliaFiltroChange(id: number): void {
    this.familiaFiltroId.set(id ? id : null);
    this.subfamiliaFiltroId.set(null); // Reseteamos la subfamilia al cambiar de rama principal
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