import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from "@angular/router";
import { UiService } from "../../../core/services/ui.service";
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { FamiliaDTO, FamiliaService, NuevaFamiliaRequest } from '../../../core/services/familia.service';
import { ComponentePaginado } from '../../../core/utils/paginado-base';

@Component({
  selector: 'app-inventario-list',
  standalone: true,
  imports: [CurrencyPipe, RouterLink], 
  templateUrl: './inventario-list.html',
  styleUrl: './inventario-list.scss'
})
export class InventarioListComponent extends ComponentePaginado implements OnInit {
  private articuloService = inject(ArticuloService);
  private uiService = inject(UiService);
  private familiaService = inject(FamiliaService);

  // // Listas de datos reactivas
  articulos = signal<Articulo[]>([]);
  loading = signal<boolean>(true);
  todasLasFamilias = signal<FamiliaDTO[]>([]);

  // Filtros activos en pantalla
  filtroBusqueda = signal<string>('');
  terminoBusqueda = signal<string>('');
  familiaFiltroId = signal<number | null>(null);
  subfamiliaFiltroId = signal<number | null>(null);

  // ESTADOS PARA EL TECLADO TÁCTIL EN EL BUSCADOR
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  mayusculas = signal<boolean>(true);
  valorTecladoEnConstruccion = signal<string>('');

  // Gestión del nuevo modal de creación de familias y subfamilias
  mostrarModalNuevaFamilia = signal<boolean>(false);
  nuevoNombreFamilia = signal<string>('');
  padreFamiliaIdSeleccionada = signal<number | null>(null);

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

  // COMPUTED: Filtra familias principales para el selector del buscador
  familiasPadre = computed(() => {
    return this.todasLasFamilias().filter(f => !f.familiaPadreId);
  });

  // COMPUTED: Filtra subfamilias según la familia padre seleccionada en el filtro
  subfamiliasFiltradas = computed(() => {
    const padreId = this.familiaFiltroId();
    if (!padreId) return [];
    return this.todasLasFamilias().filter(f => f.familiaPadreId === padreId);
  });

  // COMPUTED MOTOR DE FILTRADO UNIFICADO (Filtra por Texto, Código de Barras y Familias)
  articulosFiltrados = computed(() => {
    let resultado = this.articulos().filter(item => item.activo !== false);
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

  constructor() {
    super(); // Llama al constructor de la clase base
  }

  ngOnInit(): void {
    this.cargarDatos();
    this.cargarDatosIniciales();
  }

  // Obligatorio implementar este método (lo pide la clase base)
  cargarDatos(): void {
    this.loading.set(true);
    this.articuloService.getArticulosPaginados(this.paginaActual(), this.itemsPorPagina)
      .subscribe({
        next: (data: any) => {
          // data.content contiene la lista de artículos para la página actual
          this.articulos.set(data.content);
          this.totalElementos = data.totalElements;
          this.totalPaginas = data.totalPages;
          this.loading.set(false);
        },
        error: (err) => {
          this.uiService.mostrarToast('Error al cargar artículos paginados: ' + (err.error || err.message), 'error');
          this.loading.set(false);
        }
      });
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

  // Sincroniza la entrada del teclado físico de PC en el modal de familias
  sincronizarTecladoFisicoFamily(objetivo: string, valor: string) {
    if (objetivo === 'NUEVA_FAMILIA') {
      this.nuevoNombreFamilia.set(valor);
    }
  }

  escribirTeclado(caracter: string) {
    let letraFormateada = caracter;
    if (/^[a-zA-ZÑñÁÉÍÓÚÜáéíóúü]$/.test(caracter)) {
      letraFormateada = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }
    // Comprueba de forma reactiva cuál es el input activo en pantalla
    if (this.inputActivo() === 'BUSCADOR') {
      this.terminoBusqueda.update(actual => actual + letraFormateada);
    } else if (this.inputActivo() === 'NUEVA_FAMILIA') {
      this.nuevoNombreFamilia.update(actual => actual + letraFormateada);
    }
  }

  insertarEspacio() {
    if (this.inputActivo() === 'BUSCADOR') {
      this.terminoBusqueda.update(actual => actual + ' ');
    } else if (this.inputActivo() === 'NUEVA_FAMILIA') {
      this.nuevoNombreFamilia.update(actual => actual + ' ');
    }
  }

  borrarUltimoCaracter() {
    if (this.inputActivo() === 'BUSCADOR') {
      this.terminoBusqueda.update(actual => actual.slice(0, -1));
    } else if (this.inputActivo() === 'NUEVA_FAMILIA') {
      this.nuevoNombreFamilia.update(actual => actual.slice(0, -1));
    }
  }

  limpiarTeclado() {
    if (this.inputActivo() === 'BUSCADOR') {
      this.terminoBusqueda.set('');
    } else if (this.inputActivo() === 'NUEVA_FAMILIA') {
      this.nuevoNombreFamilia.set('');
    }
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

  // Acciones y ciclo de vida de la ventana de familias
  abrirModalNuevaFamilia(): void {
    this.nuevoNombreFamilia.set('');
    this.padreFamiliaIdSeleccionada.set(null);
    this.mostrarModalNuevaFamilia.set(true);
  }

  cerrarModalNuevaFamilia(): void {
    this.mostrarModalNuevaFamilia.set(false);
    this.cerrarTeclado();
  }

  crearNuevaFamilia(): void {
    const nombre = this.nuevoNombreFamilia().trim();
    if (!nombre) {
      this.uiService.mostrarToast('El nombre de la categoría no puede estar vacío', 'error');
      return;
    }

    // VALIDACIÓN PREVENTIVA: Comprobamos si ya existe una categoría con ese nombre exacto
    const nombreExiste = this.todasLasFamilias().some(
      f => f.nombre.toLowerCase().trim() === nombre.toLowerCase()
    );

    if (nombreExiste) {
      this.uiService.mostrarToast(`Ya existe una categoría llamada "${nombre}"`, 'error');
      return;
    }

    // 1. Forzamos la obtención del id del padre limpiando cualquier residuo del DOM
    const idPadreRaw: any = this.padreFamiliaIdSeleccionada();
    let idPadreFormateado: number | null = null;
    
    if (idPadreRaw !== null && idPadreRaw !== undefined && idPadreRaw !== '') {
      idPadreFormateado = Number(idPadreRaw);
    }

    // 2. Construimos el JSON mapeando explícitamente cada campo que el DTO de Spring espera
    const payload: NuevaFamiliaRequest = {
      nombre: nombre,
      descripcion: 'Categoría autogenerada desde TPV', // Mandamos un string por si el backend valida vacíos
      familiaPadreId: idPadreFormateado // Enviará el número entero limpio o un null explícito para ramas raíz
    };

    this.familiaService.crearFamilia(payload).subscribe({
      next: (nuevaFam) => {
        this.uiService.mostrarToast('📁 Nueva categoría guardada correctamente', 'success');
        // Actualizamos de forma reactiva la lista de familias para refrescar los selectores al instante
        this.todasLasFamilias.update(lista => [...lista, nuevaFam]);
        this.cerrarModalNuevaFamilia();
      },
      error: (err) => {
        console.error('Error al guardar la nueva categoría:', err);
        this.uiService.mostrarToast('No se pudo guardar la familia. Inténtalo de nuevo.', 'error');
      }
    });
  }
  
  // Función para borrar un artículo de forma segura
  eliminarProducto(id: number, nombre: string): void {
    this.articuloAAnticipar.set({ id, nombre });
    this.mostrarModalConfirmar.set(true);
  }

  //  Añade la función que se ejecutará cuando el usuario pulse "SÍ, ELIMINAR"
  confirmarEliminacionDefinitiva(): void {
  const articulo = this.articuloAAnticipar();
  if (!articulo) return;

    this.articuloService.eliminarArticulo(articulo.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('📦 Artículo eliminado del catálogo correctamente', 'success');
        // En vez de destruir el registro, actualizamos su flag a false reactivamente. Como el computed "articulosFiltrados" excluye los inactivos, desaparecerá visualmente al instante.
        this.articulos.update(listaActual => 
          listaActual.map(item => item.id === articulo.id ? { ...item, activo: false } : item)
        );
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