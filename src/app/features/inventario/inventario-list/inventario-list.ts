import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
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

  // Gestión del nuevo modal de creación/edición de familias y subfamilias
  mostrarModalNuevaFamilia = signal<boolean>(false);
  mostrarModalConfigurarFamilias = signal<boolean>(false);
  editandoFamilia = signal<FamiliaDTO | null>(null);
  nuevoNombreFamilia = signal<string>('');
  padreFamiliaIdSeleccionada = signal<number | null>(null);

  // Estado para confirmar eliminación de familia
  mostrarModalConfirmarFamilia = signal<boolean>(false);
  familiaAEliminar = signal<FamiliaDTO | null>(null);

  // Paginación específica para el listado de familias en el modal
  familiaPaginaActual = signal<number>(0);
  familiaItemsPorPagina = signal<number>(5);
  busquedaFamilia = signal<string>('');

  familiasPadreFiltradas = computed(() => {
    const busqueda = this.busquedaFamilia().toLowerCase().trim();
    if (!busqueda) return this.familiasPadre();
    return this.familiasPadre().filter(fam => {
      if (fam.nombre.toLowerCase().startsWith(busqueda)) return true;
      if (fam.subfamilias?.some(sub => sub.nombre.toLowerCase().startsWith(busqueda))) return true;
      return false;
    });
  });

  familiaTotalElementos = computed(() => this.familiasPadreFiltradas().length);
  familiaTotalPaginas = computed(() => Math.max(1, Math.ceil(this.familiaTotalElementos() / this.familiaItemsPorPagina())));
  familiasPadrePaginadas = computed(() => {
    const inicio = this.familiaPaginaActual() * this.familiaItemsPorPagina();
    return this.familiasPadreFiltradas().slice(inicio, inicio + this.familiaItemsPorPagina());
  });

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

  // HELPERS para resolver jerarquía de familias desde familiaId del artículo
  getFamiliaNombre(familiaId: number | null | undefined): string {
    if (!familiaId) return '—';
    const fam = this.todasLasFamilias().find(f => f.id === familiaId);
    if (!fam) return '—';
    if (!fam.familiaPadreId) return fam.nombre;
    return fam.familiaPadreNombre || '—';
  }

  getSubfamiliaNombre(familiaId: number | null | undefined): string {
    if (!familiaId) return '—';
    const fam = this.todasLasFamilias().find(f => f.id === familiaId);
    if (!fam || !fam.familiaPadreId) return '—';
    return fam.nombre;
  }

  subfamiliasDePadre(padreId: number): FamiliaDTO[] {
    return this.todasLasFamilias().filter(f => f.familiaPadreId === padreId);
  }

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
        item.nombre.toLowerCase().startsWith(buscar) || 
        (item.notas && item.notas.toLowerCase().startsWith(buscar)) ||
        (item.codigoBarras && item.codigoBarras.toLowerCase().startsWith(buscar))
      );
    }
    
    return resultado;
  });

  articulosAMostrar = computed(() => {
    const inicio = this.paginaActual() * this.itemsPorPagina();
    return this.articulosFiltrados().slice(inicio, inicio + this.itemsPorPagina());
  });

  constructor() {
    super();
    effect(() => {
      const total = this.articulosFiltrados().length;
      this.totalElementos.set(total);
      if (this.paginaActual() >= Math.ceil(total / this.itemsPorPagina()) && total > 0) {
        this.paginaActual.set(Math.ceil(total / this.itemsPorPagina()) - 1);
      }
    });
  }

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.loading.set(true);
    this.familiaService.obtenerMisFamilias().subscribe({
      next: (fams) => this.todasLasFamilias.set(fams),
      error: () => console.error('Error al precargar familias en catálogo')
    });
    this.articuloService.getArticulos().subscribe({
      next: (data) => {
        this.articulos.set(data);
        this.paginaActual.set(0);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.uiService.mostrarToast('Error al cargar los artículos', 'error');
      }
    });
  }

  override paginaSiguiente(): void {
    if (this.paginaActual() < this.totalPaginas() - 1) {
      this.paginaActual.update(p => p + 1);
    }
  }

  override paginaAnterior(): void {
    if (this.paginaActual() > 0) {
      this.paginaActual.update(p => p - 1);
    }
  }

  override cambiarTamanoPagina(nuevoTamano: number): void {
    this.itemsPorPagina.set(nuevoTamano);
    this.paginaActual.set(0);
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
    this.editandoFamilia.set(null);
    this.nuevoNombreFamilia.set('');
    this.padreFamiliaIdSeleccionada.set(null);
    this.mostrarModalNuevaFamilia.set(true);
  }

  abrirModalConfigurarFamilias(): void {
    this.editandoFamilia.set(null);
    this.nuevoNombreFamilia.set('');
    this.padreFamiliaIdSeleccionada.set(null);
    this.familiaPaginaActual.set(0);
    this.mostrarModalConfigurarFamilias.set(true);
  }

  cerrarModalConfigurarFamilias(): void {
    this.mostrarModalConfigurarFamilias.set(false);
    this.editandoFamilia.set(null);
    this.cerrarTeclado();
  }

  editarFamilia(fam: FamiliaDTO): void {
    this.editandoFamilia.set(fam);
    this.nuevoNombreFamilia.set(fam.nombre);
    this.padreFamiliaIdSeleccionada.set(fam.familiaPadreId);
    this.mostrarModalConfigurarFamilias.set(true);
  }

  eliminarFamilia(fam: FamiliaDTO): void {
    this.familiaAEliminar.set(fam);
    this.mostrarModalConfirmarFamilia.set(true);
  }

  confirmarEliminacionFamilia(): void {
    const fam = this.familiaAEliminar();
    if (!fam) return;

    this.familiaService.eliminarFamilia(fam.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('🗑️ Familia eliminada correctamente', 'success');
        this.todasLasFamilias.update(lista => lista.filter(f => f.id !== fam.id));
        this.cerrarModalConfirmarFamilia();
      },
      error: (err) => {
        console.error('Error al eliminar familia:', err);
        this.uiService.mostrarToast('No se pudo eliminar la familia. Puede que tenga artículos asociados.', 'error');
        this.cerrarModalConfirmarFamilia();
      }
    });
  }

  cerrarModalConfirmarFamilia(): void {
    this.mostrarModalConfirmarFamilia.set(false);
    this.familiaAEliminar.set(null);
  }

  cerrarModalNuevaFamilia(): void {
    this.mostrarModalNuevaFamilia.set(false);
    this.editandoFamilia.set(null);
    this.cerrarTeclado();
  }

  cerrarModalFamiliaActivo(): void {
    this.mostrarModalNuevaFamilia.set(false);
    this.mostrarModalConfigurarFamilias.set(false);
    this.editandoFamilia.set(null);
    this.cerrarTeclado();
  }

  crearNuevaFamilia(): void {
    const nombre = this.nuevoNombreFamilia().trim();
    if (!nombre) {
      this.uiService.mostrarToast('El nombre de la categoría no puede estar vacío', 'error');
      return;
    }

    const editing = this.editandoFamilia();

    if (editing) {
      // MODO EDICIÓN
      const payload: NuevaFamiliaRequest = {
        nombre: nombre,
        descripcion: editing.descripcion,
        familiaPadreId: this.padreFamiliaIdSeleccionada()
      };

      this.familiaService.actualizarFamilia(editing.id, payload).subscribe({
        next: (actualizada) => {
          this.uiService.mostrarToast('📁 Categoría actualizada correctamente', 'success');
          this.todasLasFamilias.update(lista =>
            lista.map(f => f.id === actualizada.id ? actualizada : f)
          );
          this.cerrarModalConfigurarFamilias();
        },
        error: (err) => {
          console.error('Error al actualizar categoría:', err);
          const mensajeError = err?.error || '';
          if (typeof mensajeError === 'string' && mensajeError.includes('duplicate key')) {
            this.uiService.mostrarToast(`Ya existe una categoría con el nombre "${nombre}"`, 'error');
          } else {
            this.uiService.mostrarToast('No se pudo actualizar la categoría.', 'error');
          }
        }
      });
      return;
    }

    // MODO CREACIÓN (código existente)
    const nombreExiste = this.todasLasFamilias().some(
      f => f.nombre.toLowerCase().trim() === nombre.toLowerCase()
    );

    if (nombreExiste) {
      this.uiService.mostrarToast(`Ya existe una categoría llamada "${nombre}"`, 'error');
      return;
    }

    const idPadreRaw: any = this.padreFamiliaIdSeleccionada();
    let idPadreFormateado: number | null = null;

    if (idPadreRaw !== null && idPadreRaw !== undefined && idPadreRaw !== '') {
      idPadreFormateado = Number(idPadreRaw);
    }

    const payload: NuevaFamiliaRequest = {
      nombre: nombre,
      descripcion: 'Categoría autogenerada desde TPV',
      familiaPadreId: idPadreFormateado
    };

    this.familiaService.crearFamilia(payload).subscribe({
      next: (nuevaFam) => {
        this.uiService.mostrarToast('📁 Nueva categoría guardada correctamente', 'success');
        this.todasLasFamilias.update(lista => [...lista, nuevaFam]);
        this.cerrarModalNuevaFamilia();
      },
      error: (err) => {
        console.error('Error al guardar la nueva categoría:', err);
        const mensajeError = err?.error || '';
        if (typeof mensajeError === 'string' && mensajeError.includes('duplicate key')) {
          this.uiService.mostrarToast(`Ya existe una categoría llamada "${this.nuevoNombreFamilia().trim()}"`, 'error');
        } else {
          this.uiService.mostrarToast('No se pudo guardar la familia. Inténtalo de nuevo.', 'error');
        }
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

  // Paginación de familias en el modal
  familiaPaginaSiguiente(): void {
    if (this.familiaPaginaActual() < this.familiaTotalPaginas() - 1) {
      this.familiaPaginaActual.update(p => p + 1);
    }
  }

  familiaPaginaAnterior(): void {
    if (this.familiaPaginaActual() > 0) {
      this.familiaPaginaActual.update(p => p - 1);
    }
  }

  familiaCambiarTamanoPagina(nuevoTamano: number): void {
    this.familiaItemsPorPagina.set(nuevoTamano);
    this.familiaPaginaActual.set(0);
  }

}