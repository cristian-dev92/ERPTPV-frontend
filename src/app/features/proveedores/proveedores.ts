import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProveedorService, ProveedorDTO, NuevoProveedorRequest } from '../../core/services/proveedor.service';
import { UiService } from '../../core/services/ui.service';
import { isMobileOrTablet } from '../../core/utils/device-utils';
import { ComponentePaginado } from '../../core/utils/paginado-base';

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.scss'
})
export class ProveedoresComponent extends ComponentePaginado implements OnInit { 
  private proveedorService = inject(ProveedorService);
  private uiService = inject(UiService);

  // === ESTADOS REACTIVOS ===
  proveedores = signal<ProveedorDTO[]>([]);
  mostrarModalRegistro = signal<boolean>(false);
  modoEdicion = signal<boolean>(false);                
  proveedorSeleccionadoId = signal<number | null>(null);
  cargando = signal<boolean>(false);

  // ESTADOS DE BÚSQUEDA Y TECLADO
  filtroBusqueda = signal<string>('');
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<string>('');
  valorTecladoEnConstruccion = signal<string>('');
  mayusculasGeneral = signal<boolean>(true);

  // Modal de confirmación para eliminación
  mostrarModalBorrar = signal<boolean>(false);
  proveedorABorrarId = signal<number | null>(null);
  proveedorABorrarNombre = signal<string>('');

  // Molde vacío para el formulario
  nuevoProveedor = signal<NuevoProveedorRequest>({
    nombre: '',
    cif: '',
    emailPedidos: '',
    telefono: '',
    direccion: ''
  });

  // 🎯 FILTRADO AUTOMÁTICO EN TIEMPO REAL (Client-side con Signals)
  proveedoresFiltrados = computed(() => {
    const filtro = this.filtroBusqueda().toLowerCase().trim();
    if (!filtro) return this.proveedores();
    
    return this.proveedores().filter(p => 
      p.nombre.toLowerCase().includes(filtro) ||
      (p.cif && p.cif.toLowerCase().includes(filtro)) ||
      (p.telefono && p.telefono.includes(filtro)) ||
      (p.emailPedidos && p.emailPedidos.toLowerCase().includes(filtro)) ||
      (p.direccion && p.direccion.toLowerCase().includes(filtro))
    );
  });

  proveedoresAMostrar = computed(() => {
    const inicio = this.paginaActual() * this.itemsPorPagina();
    return this.proveedoresFiltrados().slice(inicio, inicio + this.itemsPorPagina());
  });

  constructor() {
    super();
    effect(() => {
      const total = this.proveedoresFiltrados().length;
      this.totalElementos.set(total);
      if (this.paginaActual() >= Math.ceil(total / this.itemsPorPagina()) && total > 0) {
        this.paginaActual.set(Math.ceil(total / this.itemsPorPagina()) - 1);
      }
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.cargando.set(true);
    this.proveedorService.obtenerMisProveedores().subscribe({
      next: (data) => {
        this.proveedores.set(data);
        this.paginaActual.set(0);
        this.cargando.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al cargar proveedores: ' + (err.error || err.message), 'error');
        this.cargando.set(false);
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

  buscarProveedores() {
    // Nota: Gracias al 'computed' (proveedoresFiltrados), la lista se actualiza sola.
    // Dejamos este método por consistencia con la barra de búsqueda.
  }

  // === LÓGICA DEL TECLADO TÁCTIL VIRTUAL ===
  abrirTecladoGeneralForm(
    objetivo: 'NOMBRE' | 'TELEFONO' | 'CIF' | 'EMAIL' | 'DIRECCION' | 'BUSQUEDA', 
    index?: number | null, 
    valorActualForm: string = ''
  ) {
    if (isMobileOrTablet()) {
    return;
  }
    this.inputObjetivoTeclado.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActualForm || '');
    this.mostrarTecladoGeneral.set(true);
  }

  sincronizarTecladoFisico(objetivo: string, valor: string) {
    this.valorTecladoEnConstruccion.set(valor);
    this.actualizarPropiedadFormulario(objetivo, valor);
  }

  pulsarTeclaGeneral(caracter: string) {
   // Comprobamos si es una letra para transformarla según el estado del Shift
    let valorAInsertar = caracter;
    const esLetra = /^[a-zA-ZÑñ]$/.test(caracter);
    
    if (esLetra) {
      valorAInsertar = this.mayusculasGeneral() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    this.valorTecladoEnConstruccion.update(val => {
      const nuevoValor = val + valorAInsertar;
      // 🎯 Sincronizamos sobre la marcha con el formulario/filtro
      this.actualizarPropiedadFormulario(this.inputObjetivoTeclado(), nuevoValor);
      return nuevoValor;
    });
  }

  alternarMayusculasGeneral() {
    this.mayusculasGeneral.set(!this.mayusculasGeneral());
  }

  borrarUltimoCaracterGeneral() {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
  }

  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
    this.actualizarPropiedadFormulario(this.inputObjetivoTeclado(), '');
  }

  private actualizarPropiedadFormulario(objetivo: string, valor: string) {
    if (objetivo === 'BUSQUEDA') {
      this.filtroBusqueda.set(valor);
    } else {
      this.nuevoProveedor.update(prov => {
        const actualizado = { ...prov };
        if (objetivo === 'NOMBRE') actualizado.nombre = valor;
        if (objetivo === 'CIF') actualizado.cif = valor;
        if (objetivo === 'TELEFONO') actualizado.telefono = valor;
        if (objetivo === 'EMAIL') actualizado.emailPedidos = valor.toLowerCase();
        if (objetivo === 'DIRECCION') actualizado.direccion = valor;
        return actualizado;
      });
    }
  }

  aplicarTextoAlFormulario() {
    const objetivo = this.inputObjetivoTeclado();
    const valor = this.valorTecladoEnConstruccion();

    if (objetivo === 'BUSQUEDA') {
      this.filtroBusqueda.set(valor);
    } else {
      this.nuevoProveedor.update(prov => {
        const actualizado = { ...prov };
        if (objetivo === 'NOMBRE') actualizado.nombre = valor;
        if (objetivo === 'CIF') actualizado.cif = valor;
        if (objetivo === 'TELEFONO') actualizado.telefono = valor;
        if (objetivo === 'EMAIL') actualizado.emailPedidos = valor.toLowerCase();
        if (objetivo === 'DIRECCION') actualizado.direccion = valor;
        return actualizado;
      });
    }
    
    this.mostrarTecladoGeneral.set(false);
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
  }

  abrirModal() {
    this.modoEdicion.set(false);
    this.proveedorSeleccionadoId.set(null);
    this.nuevoProveedor.set({
      nombre: '',
      cif: '',
      emailPedidos: '',
      telefono: '',
      direccion: ''
    });
    this.mostrarModalRegistro.set(true);
  }

  cerrarModal() {
    this.mostrarModalRegistro.set(false);
  }

  abrirModalEdicion(p: ProveedorDTO) {
    this.modoEdicion.set(true);
    this.proveedorSeleccionadoId.set(p.id);
    this.nuevoProveedor.set({
      nombre: p.nombre,
      cif: p.cif || '',
      emailPedidos: p.emailPedidos || '',
      telefono: p.telefono || '',
      direccion: p.direccion || ''
    });
    this.mostrarModalRegistro.set(true);
  }

  guardarProveedor() {
    const datos = this.nuevoProveedor();
    
    if (!datos.nombre.trim()) {
      this.uiService.mostrarToast('El nombre del proveedor es obligatorio', 'warning');
      return;
    }

    if (this.modoEdicion()) {
      // Flujo de Edición / Modificación en Backend (PUT)
      const idProv = this.proveedorSeleccionadoId();
      if (!idProv) return;

    this.proveedorService.actualizarProveedor(idProv, datos).subscribe({
      next: (proveedorModificado) => {
        this.uiService.mostrarToast(`📦 Proveedor "${proveedorModificado.nombre}" actualizado con éxito`, 'success');
        // Actualizamos la lista local añadiendo el nuevo al principio
        this.proveedores.update(list => list.map(p => p.id === idProv ? proveedorModificado : p));
        this.cerrarModal();
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al crear proveedor: ' + (err.error || err.message), 'error');
      }
    });
    } else {
      // Flujo de Creación Tradicional (POST)
      this.proveedorService.crearProveedor(datos).subscribe({
        next: (proveedorCreado) => {
          this.uiService.mostrarToast(`📦 Proveedor "${proveedorCreado.nombre}" registrado con éxito`, 'success');
          this.proveedores.update(list => [proveedorCreado, ...list]);
          this.cerrarModal();
        },
        error: (err) => {
          this.uiService.mostrarToast('Error al crear proveedor: ' + (err.error || err.message), 'error');
        }
      });
    }
   }

  eliminarProveedor(id: number) {
    this.uiService.mostrarToast('Procesando baja en el archivo...', 'warning');

    this.proveedorService.eliminarProveedor(id).subscribe({
      next: () => {
        this.uiService.mostrarToast(`📦 Proveedor eliminado con éxito`, 'success');
        this.proveedores.update(list => list.filter(p => p.id !== id));
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('Error al eliminar proveedor: ' + (err.error || err.message), 'error');
      }
    });
   }

   // Cambiamos el método original por este para que primero "pregunte"
  solicitarConfirmacionBorrar(p: ProveedorDTO) {
    this.proveedorABorrarId.set(p.id);
    this.proveedorABorrarNombre.set(p.nombre);
    this.mostrarModalBorrar.set(true);
  }

  cerrarModalBorrar() {
    this.mostrarModalBorrar.set(false);
    this.proveedorABorrarId.set(null);
    this.proveedorABorrarNombre.set('');
  }

  // Este método se ejecutará solo cuando pulse "Sí, Eliminar" en el modal
  confirmarEliminar() {
    const id = this.proveedorABorrarId();
    if (!id) return;

    this.uiService.mostrarToast('Procesando baja en el archivo...', 'warning');

    this.proveedorService.eliminarProveedor(id).subscribe({
      next: () => {
        this.uiService.mostrarToast(`📦 Proveedor eliminado con éxito`, 'success');
        this.proveedores.update(list => list.filter(p => p.id !== id));
        this.cerrarModalBorrar();
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('Error al eliminar proveedor: ' + (err.error || err.message), 'error');
        this.cerrarModalBorrar();
      }
    });
  }

}