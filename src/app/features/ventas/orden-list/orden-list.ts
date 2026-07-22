import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { ComponentePaginado } from '../../../core/utils/paginado-base';
import { EstadoTaller } from '../../../core/models/orden.model';

type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO';

@Component({
  selector: 'app-orden-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, FormsModule],
  templateUrl: './orden-list.html',
  styleUrl: './orden-list.scss'
})
export class OrdenListComponent extends ComponentePaginado implements OnInit {
  private ordenService = inject(OrdenService);
  private uiService = inject(UiService);
  
  // Signals para el estado de los filtros
  filtroTipo = signal<string>('TALLER');           
  filtroEstado = signal<string>('TODOS');       
  terminoBusqueda = signal<string>('');
  todasLasOrdenes = signal<any[]>([]);
  ordenSeleccionada = signal<any | null>(null);
  cargando = signal<boolean>(false);

  // Notas generales y de mostrador
  notasMostrador = signal<string>('');
  notasGenerales = signal<string>('');

  // Modales, Cobros y Devoluciones
  detallesEditados: any[] = [];
  idDetalleDesplegado: number | null = null;

  mostrarModalCobro = signal<boolean>(false);
  metodoPago = signal<MetodoPago>('EFECTIVO');
  importeEntregado = signal<string>('');

  mostrarModalDevolucion = signal<boolean>(false);
  metodoDevolucion = signal<MetodoPago>('EFECTIVO');
  ordenesDevueltas = signal<Set<number>>(new Set());

  // CONFIGURACIÓN TECLADO TÁCTIL
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>(''); 
  mayusculas = signal<boolean>(true); 
  indiceLineaActiva: number | null = null;

  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ', '.'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', 'com'];

  // =========================================================================
  // Sincronización en Tiempo Real con el TPV (Constructor)
  // =========================================================================
  constructor() {
    super();

    // totalElementos se actualiza reactivamente según el filtro aplicado
    effect(() => {
      this.totalElementos.set(this.ordenesFiltradas().length);
    });

    // Recarga completa cuando el TPV procesa un ticket
    effect(() => {
      this.ordenService.ticketProcesado();
      this.cargarDatos();
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  // =========================================================================
  // Carga TODAS las órdenes (sin paginación servidor)
  // La paginación se hace del lado cliente para que los filtros por pestaña
  // (TALLER / LISTO_RECOGER / CERRADOS) funcionen correctamente.
  // =========================================================================
  cargarDatos(): void {
    this.cargando.set(true);

    this.ordenService.getOrdenes()
      .subscribe({
        next: (data: any[]) => {
          this.todasLasOrdenes.set(data || []);
          this.paginaActual.set(0);
          this.cargando.set(false);
        },
        error: (err) => {
          console.error('Error cargando órdenes:', err);
          this.uiService.mostrarToast('Error al cargar la gestión de tickets: ' + (err.error || err.message), 'error');
          this.cargando.set(false);
        }
      });
  }

  // Paginación 100% cliente — no llamamos al backend al cambiar de página
  override paginaSiguiente() {
    if (this.paginaActual() < this.totalPaginas() - 1) {
      this.paginaActual.update(p => p + 1);
    }
  }

  override paginaAnterior() {
    if (this.paginaActual() > 0) {
      this.paginaActual.update(p => p - 1);
    }
  }

  override cambiarTamanoPagina(nuevoTamano: number) {
    this.itemsPorPagina.set(nuevoTamano);
    this.paginaActual.set(0);
  }

  // =========================================================================
  // Filtro completo + paginación cliente
  // =========================================================================
  ordenesFiltradas = computed(() => {
    const lista = this.todasLasOrdenes();
    const tipo = this.filtroTipo();
    const estado = this.filtroEstado();
    const busqueda = this.terminoBusqueda().toLowerCase().trim();

    let filtradas = lista;

    // 1. Filtro por búsqueda
    if (busqueda) {
      filtradas = filtradas.filter(o => {
        const numTicket = (o.numeroTicket || o.id || '').toString().toLowerCase();
        const numFactura = (o.numeroFactura || '').toLowerCase();
        const cliente = (o.clienteNombre || o.cliente?.nombre || '').toLowerCase();
        return numTicket.includes(busqueda) || cliente.includes(busqueda) || numFactura.includes(busqueda);
      });
    }

    // 2. Filtro por pestaña principal
    if (tipo === 'TALLER') {
      filtradas = filtradas.filter(o => {
        const estadoT = this.getEstadoTaller(o);
        return this.esReparacion(o) && estadoT !== 'LISTO' && estadoT !== 'ENTREGADO';
      });
    } else if (tipo === 'LISTO_RECOGER') {
      filtradas = filtradas.filter(o =>
        this.esReparacion(o) && this.getEstadoTaller(o) === 'LISTO'
      );
    } else if (tipo === 'CERRADOS') {
      filtradas = filtradas.filter(o =>
        this.esVentaDirecta(o) ||
        this.esDevolucion(o) ||
        (this.esReparacion(o) && this.getEstadoTaller(o) === 'ENTREGADO')
      );
    }

    // 3. Sub-filtros
    if (estado !== 'TODOS') {
      if (tipo === 'CERRADOS') {
        if (estado === 'VENTA_DIRECTA') filtradas = filtradas.filter(o => this.esVentaDirecta(o));
        else if (estado === 'REPARACION') filtradas = filtradas.filter(o => this.esReparacion(o) && this.getEstadoTaller(o) === 'ENTREGADO');
        else if (estado === 'DEVOLUCION') filtradas = filtradas.filter(o => this.esDevolucion(o));
      } else if (estado === 'PENDIENTE_PAGO') {
        filtradas = filtradas.filter(o => o.estadoPago === 'PENDIENTE' || o.estadoPago === 'ANTICIPO');
      } else if (estado === 'PAGADO') {
        filtradas = filtradas.filter(o => o.estadoPago === 'PAGADO');
      } else {
        filtradas = filtradas.filter(o => o.estadoPago === estado);
      }
    }

    return filtradas;
  });

  // =========================================================================
  // Helper: determina tipo de orden según datos del backend
  // =========================================================================
  private esReparacion(o: any): boolean {
    return o.trabajosTaller && o.trabajosTaller.length > 0;
  }
  private esVentaDirecta(o: any): boolean {
    // Si también tiene trabajos de taller, es REPARACION (orden mixta), no VENTA_DIRECTA
    return o.lineasVentaDirecta && o.lineasVentaDirecta.length > 0 && !this.esReparacion(o);
  }
  private esDevolucion(o: any): boolean {
    return o.numeroTicket?.startsWith('DEV-') || o.tipo === 'DEVOLUCION' || o.tipoOrden === 'DEVOLUCION';
  }
  getTipoOrden(o: any): string {
    if (this.esDevolucion(o)) return 'DEVOLUCION';
    if (this.esReparacion(o)) return 'REPARACION';
    if (this.esVentaDirecta(o)) return 'VENTA_DIRECTA';
    return o.tipo || o.tipoOrden || 'VENTA_DIRECTA';
  }
  codigosEtiqueta(trabajos: any[]): string {
    return trabajos.map((t: any) => '#' + t.codigoEtiqueta).join(', ');
  }
  convertirFechaISO(fecha: string): string {
    if (!fecha) return '';
    const partes = fecha.split('-');
    if (partes.length === 3 && partes[0].length === 2 && partes[1].length === 2 && partes[2].length === 4) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    const d = new Date(fecha);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }
  getEstadoTaller(o: any): string {
    if (o.estadoTaller) return o.estadoTaller;
    if (this.esReparacion(o)) {
      const estados: string[] = [...new Set<string>(o.trabajosTaller.map((t: any) => t.estadoTaller as string))];
      if (estados.length === 1) return estados[0];
      if (estados.every(e => e === 'ENTREGADO')) return 'ENTREGADO';
      if (estados.some(e => e === 'EN_TALLER')) return 'EN_TALLER';
      return estados[0] || 'PENDIENTE';
    }
    return '';
  }

  // =========================================================================
  // Filtro Reactivo Computado (Corregido y sin cierres de llave rotos)
  // =========================================================================
  ordenesAMostrar = computed(() => {
    const filtradas = this.ordenesFiltradas();
    const inicio = this.paginaActual() * this.itemsPorPagina();
    return filtradas.slice(inicio, inicio + this.itemsPorPagina());
  });

  cambioAOfrecer = computed(() => {
    if (this.metodoPago() === 'TARJETA') return 0;
    const total = this.ordenSeleccionada()?.importePendiente || 0;
    const entregado = parseFloat(this.importeEntregado()) || 0;
    return entregado > total ? entregado - total : 0;
  });

  // =========================================================================
  // Controladores de Vista y Modales
  // =========================================================================
  verDetalle(orden: any) {
    this.notasGenerales.set(orden.notasGenerales || orden.observaciones || '');
    this.ordenSeleccionada.set(orden);
    this.idDetalleDesplegado = null;

    const lineasTaller: any[] = (orden.trabajosTaller || []).map((t: any) => ({
      ...t,
      esServicio: true,
      articuloNombre: t.descripcion || t.articuloBaseNombre || 'Servicio de taller',
      precioUnitario: t.precioFinalTrabajo,
      cantidad: t.cantidadMaterial || 1,
      notas: t.notasMostrador || '',
      notasMostrador: t.notasMostrador || '',
      descripcionBulto: t.descripcionBulto || '',
      codigoEtiqueta: t.codigoEtiqueta || '',
      fechaPrometidaRecogida: t.fechaPrometidaRecogida || orden.fechaPrometidaRecogida,
    }));

    const lineasVenta: any[] = (orden.lineasVentaDirecta || []).map((l: any) => ({
      ...l,
      esServicio: false,
      articuloNombre: l.articuloNombre || 'Artículo',
      precioUnitario: l.precioUnitario,
      cantidad: l.cantidad,
      notasMostrador: '',
      descripcionBulto: '',
    }));

    const lineas = [...lineasTaller, ...lineasVenta];

    this.detallesEditados = lineas.map((linea: any, index: number) => {
      let fechaFormateada = '';
      const fechaBase = linea.fechaPrometidaRecogida || orden.fechaPrometidaRecogida;
      if (fechaBase) {
        fechaFormateada = this.convertirFechaISO(fechaBase);
      }

      const precioUnitario = linea.precioUnitario || linea.precio || 0;
      const cantidad = linea.cantidad || 1;
      const subtotalLinea = cantidad * precioUnitario;

      return {
        id: linea.id || index, 
        articuloId: linea.articuloId || linea.articuloBaseId,
        nombre: linea.articuloNombre || 'Artículo/Servicio',
        cantidad: cantidad,
        precio: precioUnitario,
        subtotal: subtotalLinea,
        esServicio: linea.esServicio,
        notas: linea.notas || '',
        notasMostrador: linea.notasMostrador || '',
        descripcionBulto: linea.descripcionBulto || '',
        codigoEtiqueta: linea.codigoEtiqueta || '',
        fechaEntrega: fechaFormateada,
        nuevoPrecioInput: '' 
      };
    });
  }

  toggleDesplegableServicio(id: number | null) {
    this.idDetalleDesplegado = this.idDetalleDesplegado === id ? null : id;
  }

  cerrarModal() { 
    this.ordenSeleccionada.set(null);
    this.detallesEditados = [];
    this.idDetalleDesplegado = null;
    this.cerrarTeclado();
  }

  limpiarBuscador() { 
    this.terminoBusqueda.set('');
    this.cerrarTeclado();
  }

  // =========================================================================
  // Acciones de Taller
  // =========================================================================
  empezarTrabajo(trabajoId: number) {
    this.uiService.mostrarToast('⚙️ Iniciando trabajo en el taller...', 'warning');
    
    this.ordenService.avanzarEstadoTrabajoTaller(trabajoId, 'EN_TALLER').subscribe({
      next: () => {
        this.uiService.mostrarToast('¡Trabajo iniciado en taller! 🛠️', 'success');
        this.cargarDatos();
        this.cerrarModal();
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('No se pudo iniciar el trabajo', 'error');
      }
    });
  }

  finalizarReparacion(orden: any) {
    const trabajos = orden.trabajosTaller || [];
    const pendientes = trabajos.filter((t: any) => t.estadoTaller === 'EN_TALLER' || !t.estadoTaller);

    if (pendientes.length === 0) {
      this.uiService.mostrarToast('No hay trabajos pendientes en esta orden.', 'warning');
      return;
    }

    this.uiService.mostrarToast(`⚡ Finalizando ${pendientes.length} trabajo(s)...`, 'warning');

    let completados = 0;
    pendientes.forEach((trabajo: any) => {
      this.ordenService.avanzarEstadoTrabajoTaller(trabajo.id, 'LISTO').subscribe({
        next: () => {
          completados++;
          if (completados === pendientes.length) {
            this.uiService.mostrarToast('Reparación finalizada. Pasado a "Listos para recoger". 📦', 'success');
            this.cargarDatos();
            this.cerrarModal();
          }
        },
        error: (err) => {
          console.error(err);
          const msg = err.error?.message || err.message || `Error al finalizar trabajo #${trabajo.id}`;
          this.uiService.mostrarToast(msg, 'error');
        }
      });
    });
  }

  entregarAlCliente(orden: any) {
    if (orden.importePendiente && orden.importePendiente > 0) {
      this.ordenSeleccionada.set(orden);
      this.verDetalle(orden);
      this.abrirPanelCobro();
    } else {
      this.marcarTrabajosComo(orden, 'ENTREGADO', () => {
        this.uiService.mostrarToast('📦 Pedido entregado al cliente.', 'success');
        this.cargarDatos();
      });
    }
  }

  // =========================================================================
  // Pasarela de Cobro Simple (Teclado Numérico)
  // =========================================================================
  abrirPanelCobro() {
    this.importeEntregado.set('');
    this.metodoPago.set('EFECTIVO');
    this.mostrarModalCobro.set(true);
  } 

  cerrarPanelCobro() { 
    this.mostrarModalCobro.set(false); 
  }

  presionarTecla(valor: string) {
    const actual = this.importeEntregado();
    if (valor === 'C') { this.importeEntregado.set(''); return; }
    if (valor === '⌫') { this.importeEntregado.set(actual.slice(0, -1)); return; }
    if (valor === '.') {
      if (!actual.includes('.')) this.importeEntregado.set(actual === '' ? '0.' : actual + '.');
      return;
    }
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
    if (actual === '0' && valor !== '.') {
      this.importeEntregado.set(valor);
    } else {
      this.importeEntregado.set(actual + valor);
    }
  }

  seleccionarMetodoPago(metodo: MetodoPago) {
    this.metodoPago.set(metodo);
    if (metodo === 'EFECTIVO') this.importeEntregado.set('');
  }

  private marcarTrabajosComo(orden: any, nuevoEstado: EstadoTaller, onCompletado: () => void) {
    const trabajos = orden.trabajosTaller?.filter((t: any) => t.estadoTaller !== 'ENTREGADO') || [];
    if (trabajos.length === 0) { onCompletado(); return; }

    let completados = 0;
    trabajos.forEach((trabajo: any) => {
      this.ordenService.avanzarEstadoTrabajoTaller(trabajo.id, nuevoEstado).subscribe({
        next: () => {
          completados++;
          if (completados === trabajos.length) onCompletado();
        },
        error: (err) => {
          completados++;
          console.error(err);
          if (completados === trabajos.length) onCompletado();
        }
      });
    });
  }

  finalizarEntregaYCobro() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    const totalCobrar = orden.importePendiente || 0;

    if (totalCobrar === 0) {
      if (this.getEstadoTaller(orden) === 'LISTO') {
        this.uiService.mostrarToast('📦 Registrando entrega de pedido ya pagado...', 'warning');
        this.marcarTrabajosComo(orden, 'ENTREGADO', () => {
          this.uiService.mostrarToast('¡Pedido entregado con éxito! ✔️', 'success');
          this.cerrarModal();
          this.cargarDatos();
        });
      } else {
        this.uiService.mostrarToast('Este ticket ya está completado y cobrado.', 'success');
        this.cerrarModal();
      }
      return;
    }

    const entregado = this.metodoPago() !== 'EFECTIVO' ? totalCobrar : (parseFloat(this.importeEntregado()) || 0);

    if (this.metodoPago() === 'EFECTIVO' && entregado < totalCobrar) {
      this.uiService.mostrarToast(`El importe entregado (${entregado}€) es menor que el total pendiente (${totalCobrar}€)`, 'warning');
      return;
    }

    this.ordenService.cobrar(orden.id, this.metodoPago()).subscribe({
      next: () => {
        if (this.getEstadoTaller(orden) === 'LISTO') {
          this.marcarTrabajosComo(orden, 'ENTREGADO', () => {
            this.uiService.mostrarToast('¡Ticket completado! Orden cobrada y ENTREGADA.', 'success');
            this.cerrarPanelCobro();
            this.cerrarModal();
            this.cargarDatos();
          });
        } else {
          this.uiService.mostrarToast('¡Pago adelantado registrado! El ticket sigue en proceso.', 'success');
          this.cerrarPanelCobro();
          this.cerrarModal();
          this.cargarDatos();
        }
      },
      error: (errCobro) => {
        if (errCobro.status === 400 && typeof errCobro.error === 'string' && errCobro.error.includes('ya ha sido cobrado')) {
          if (this.getEstadoTaller(orden) === 'LISTO') {
            this.marcarTrabajosComo(orden, 'ENTREGADO', () => {
              this.uiService.mostrarToast('¡Ticket completado! Orden cobrada y ENTREGADA.', 'success');
              this.cerrarPanelCobro();
              this.cerrarModal();
              this.cargarDatos();
            });
          } else {
            this.uiService.mostrarToast('¡Pago adelantado registrado! El ticket sigue en proceso.', 'success');
            this.cerrarPanelCobro();
            this.cerrarModal();
            this.cargarDatos();
          }
        } else {
          this.uiService.mostrarToast('Error al procesar el pago: ' + (errCobro.error || errCobro.message), 'error');
        }
      }
    });
  }

  // =========================================================================
  // Gestión de Devoluciones
  // =========================================================================
  abrirPanelDevolucion() {
    this.metodoDevolucion.set('EFECTIVO');
    this.mostrarModalDevolucion.set(true);
  }

  puedeDevolverse(orden: any): boolean {
    if (!orden) return false;
    if (this.ordenesDevueltas().has(orden.id)) return false;
    if (orden.estadoPago === 'DEVOLUCION' || orden.estadoPago === 'DEVUELTO') return false;
    if (this.getTipoOrden(orden) === 'DEVOLUCION') return false;
    return orden.estadoPago === 'PAGADO' || this.getEstadoTaller(orden) === 'ENTREGADO';
  }

  cerrarPanelDevolucion() { 
    this.mostrarModalDevolucion.set(false); 
  }

  confirmarDevolucionTicket() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    if (orden.estadoPago === 'DEVOLUCION' || orden.estadoPago === 'DEVUELTO') {
      this.uiService.mostrarToast('Este ticket ya ha sido devuelto.', 'warning');
      return;
    }

    const lineasProducto: any[] = (orden.lineasVentaDirecta || []).map((l: any) => ({
      articuloId: l.articuloId,
      cantidad: l.cantidad
    })).filter((l: any) => l.articuloId != null);

    const lineasTaller: any[] = (orden.trabajosTaller || []).map((t: any) => ({
      trabajoId: t.id,
      cantidad: t.cantidadMaterial || 1
    })).filter((l: any) => l.trabajoId != null);

    const lineasDev = [...lineasProducto, ...lineasTaller];

    if (lineasDev.length === 0) {
      this.uiService.mostrarToast('Este ticket no contiene ningún detalle o artículo para devolver', 'warning');
      return;
    }

    const peticion = {
      ordenOrigenId: orden.id,
      metodoPago: this.metodoDevolucion(),
      lineas: lineasDev
    };

    this.ordenService.procesarDevolucion(peticion).subscribe({
      next: () => {
        this.uiService.mostrarToast(`¡Devolución registrada! Factura Rectificativa generada.`, 'success');
        this.ordenesDevueltas.update(s => new Set(s).add(orden.id));
        this.cerrarPanelDevolucion();
        this.cerrarModal();
        this.cargarDatos();
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error || err.message), 'error')
    });
  }

  // =========================================================================
  // Descargas de PDF
  // =========================================================================
  descargarPdfTicket(ordenId: number) {
    this.uiService.mostrarToast('Generando PDF del ticket...');
    this.ordenService.getTicketPdf(ordenId).subscribe({
      next: (blob: Blob) => this.abrirBlobEnNuevaPestana(blob),
      error: () => this.uiService.mostrarToast('Error al generar el archivo PDF en el servidor.', 'error')
    });
  }

  descargarFacturaA4(orden: any) {
    const nombreCliente = orden.clienteNombre || orden.cliente?.nombre;
    if (!nombreCliente || nombreCliente === 'Cliente General') {
      this.uiService.mostrarToast('No se puede generar factura A4 sin un cliente registrado.', 'warning');
      return;
    }
    this.uiService.mostrarToast('Generando Factura A4...');
    this.ordenService.getFacturaPdf(orden.id).subscribe({
      next: (blob: Blob) => this.abrirBlobEnNuevaPestana(blob),
      error: (err) => {
        const msg = err.error?.message || err.message || 'Error del servidor';
        this.uiService.mostrarToast('Error al generar la factura A4: ' + msg, 'error');
      }
    });
  }

  private abrirBlobEnNuevaPestana(blob: Blob) {
    const urlDescarga = window.URL.createObjectURL(blob);
    window.open(urlDescarga, '_blank');
    window.URL.revokeObjectURL(urlDescarga);
  } 

  getBadgeClass(orden: any): string {
    if (!orden) return 'badge-secondary';
    if (orden.estadoPago === 'CANCELADO' || this.getTipoOrden(orden) === 'DEVOLUCION' || orden.total < 0 || (orden.importeTotal ?? 0) < 0) {
      return 'badge-danger';
    }
    if (this.getTipoOrden(orden) === 'VENTA_DIRECTA') {
      return 'badge-success';
    }
    if (this.getEstadoTaller(orden) === 'ENTREGADO'){ 
      return 'badge-entregado';
    }
    if (this.getEstadoTaller(orden) === 'LISTO'){ 
      return 'badge-warning';
    }
    if (this.getEstadoTaller(orden) === 'EN_TALLER') {
      return 'badge-taller';
    }
    if (orden.estadoPago === 'PAGADO') {
      return 'badge-success';
    }
    return 'badge-secondary';
  }

  // =========================================================================
  // LÓGICA DEL TECLADO VIRTUAL TÁCTIL
  // =========================================================================
  activarTeclado(campo: string, indexLinea?: number | null) {
    if (isMobileOrTablet()) {
      return;
    }
    this.inputActivo.set(campo);
    this.indiceLineaActiva = indexLinea !== undefined ? indexLinea : null;
    this.mostrarTeclado.set(true);
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
    this.inputActivo.set('');
  }

  alternarMayusculas() {
    this.mayusculas.set(!this.mayusculas());
  }

  escribirTeclado(caracter: string) {
    const campo = this.inputActivo();
    const idx = this.indiceLineaActiva;

    let caracterProcesado = caracter;
    if (caracter === 'com') {
      caracterProcesado = '.com';
    } else if (isNaN(Number(caracter))) {
      caracterProcesado = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }
    
    if (campo === 'busqueda') {
      this.terminoBusqueda.set(this.terminoBusqueda() + caracterProcesado);
    } else if (campo === 'notas-generales') {
      this.notasGenerales.set(this.notasGenerales() + caracterProcesado);
    } else if ((campo === 'notas-mostrador' || campo === 'notas-linea') && idx !== null) {
      if (!this.detallesEditados[idx].notasMostrador) this.detallesEditados[idx].notasMostrador = '';

      this.detallesEditados[idx].notasMostrador += caracterProcesado;
    } else if (campo === 'precio-linea' && idx !== null) {  
      if (!this.detallesEditados[idx].nuevoPrecioInput) this.detallesEditados[idx].nuevoPrecioInput = '';
      this.detallesEditados[idx].nuevoPrecioInput += caracterProcesado;
    }
  }

  borrarUltimoCaracter() {
    const campo = this.inputActivo();
    const idx = this.indiceLineaActiva;
    
    if (campo === 'busqueda') {
      const actual = this.terminoBusqueda();
      this.terminoBusqueda.set(actual.slice(0, -1));
    } else if (campo === 'notas-generales') {
      const actual = this.notasGenerales();
      this.notasGenerales.set(actual.slice(0, -1));
    } else if ((campo === 'notas-mostrador' || campo === 'notas-linea') && idx !== null) {
      const actualRep = this.detallesEditados[idx].notasMostrador || '';
      this.detallesEditados[idx].notasMostrador = actualRep.slice(0, -1);
    } else if (campo === 'precio-linea' && idx !== null) {
      const actual = this.detallesEditados[idx].nuevoPrecioInput || '';
      this.detallesEditados[idx].nuevoPrecioInput = actual.slice(0, -1);  
    }
  }

  insertarEspacio() {
    const campo = this.inputActivo();
    const idx = this.indiceLineaActiva;
    
    if (campo === 'busqueda') {
      this.terminoBusqueda.set(this.terminoBusqueda() + ' ');
    } else if (campo === 'notas-generales') {
      this.notasGenerales.set(this.notasGenerales() + ' ');
    } else if ((campo === 'notas-mostrador' || campo === 'notas-linea') && idx !== null) {
      if (!this.detallesEditados[idx].notasMostrador) this.detallesEditados[idx].notasMostrador = '';

      this.detallesEditados[idx].notasMostrador += ' ';
    } else if (campo === 'precio-linea' && idx !== null) {
      if (!this.detallesEditados[idx].nuevoPrecioInput) this.detallesEditados[idx].nuevoPrecioInput = '';
      this.detallesEditados[idx].nuevoPrecioInput += ' ';
    }
  } 
}