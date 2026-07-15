import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { ComponentePaginado } from '../../../core/utils/paginado-base';

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
  ordenes = signal<any[]>([]);
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
    super(); // Llama al constructor de la clase base
    
    // Escuchamos el canal reactivo del OrdenService mediante un efecto
    effect(() => {
      // Accedemos a la signal de forma reactiva invocándola con ()
      this.ordenService.ticketProcesado();
      
      // Recargamos silenciosamente los datos
      this.cargarDatos();
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  // =========================================================================
  // Cargador Unificado de Datos (Respeta la Base de Paginación)
  // =========================================================================
  cargarDatos(): void {
    this.cargando.set(true);
    
    this.ordenService.getOrdenesPaginadas(this.paginaActual(), this.itemsPorPagina())
      .subscribe({
        next: (data: any) => {
          const listaDeOrdenes = data.content || data || [];
          this.ordenes.set(listaDeOrdenes);
          
          this.totalElementos.set(data.totalElements || data.total || 0);
          
          this.cargando.set(false);
        },
        error: (err) => {
          console.error('Error cargando órdenes:', err);
          this.uiService.mostrarToast('Error al cargar la gestión de tickets: ' + (err.error || err.message), 'error');
          this.cargando.set(false);
        }
      });
  }

  // =========================================================================
  // Filtro Reactivo Computado (Corregido y sin cierres de llave rotos)
  // =========================================================================
  ordenesAMostrar = computed(() => {
    const lista = this.ordenes();
    const tipo = this.filtroTipo();     // 'TALLER' | 'LISTO_RECOGER' | 'CERRADOS'
    const estado = this.filtroEstado(); // 'TODOS' | ...
    const busqueda = this.terminoBusqueda().toLowerCase().trim();

    // 1. Filtrado inteligente por término de búsqueda
    let filtradas = lista;
    if (busqueda) {
      filtradas = filtradas.filter(o => {
        const numTicket = (o.numeroTicket || o.id || '').toString().toLowerCase();
        const numFactura = (o.numeroFactura || '').toLowerCase();
        const cliente = (o.clienteNombre || o.cliente?.nombre || '').toLowerCase();
        return numTicket.includes(busqueda) || cliente.includes(busqueda) || numFactura.includes(busqueda);
      });
    }

    // 2. Filtrar por Pestaña Principal
    if (tipo === 'TALLER') {
      filtradas = filtradas.filter(o => 
        o.tipo === 'REPARACION' && 
        o.estadoTaller !== 'LISTO' && 
        o.estadoTaller !== 'ENTREGADO'
      );
    } 
    else if (tipo === 'LISTO_RECOGER') {
      filtradas = filtradas.filter(o => 
        o.tipo === 'REPARACION' && 
        o.estadoTaller === 'LISTO'
      );
    } 
    else if (tipo === 'CERRADOS') {
      filtradas = filtradas.filter(o => 
        o.tipo === 'VENTA_DIRECTA' || 
        o.tipo === 'DEVOLUCION' || 
        (o.tipo === 'REPARACION' && o.estadoTaller === 'ENTREGADO')
      );
    }

    // 3. Filtrar por los Sub-filtros
    if (estado !== 'TODOS') {
      if (tipo === 'CERRADOS') {
        filtradas = filtradas.filter(o => o.tipo === estado);
      } else {
        filtradas = filtradas.filter(o => o.estadoPago === estado);
      }
    }

    // Retorna las órdenes filtradas y limita la renderización de la lista por rendimiento (p. ej. a 50)
    return filtradas.slice(0, 50);
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

    const lineas = orden.detalles || orden.lineas || [];
    this.detallesEditados = lineas.map((linea: any, index: number) => {
      let fechaFormateada = '';
      const fechaBase = linea.fechaPrometidaRecogida || orden.fechaPrometidaRecogida;
      if (fechaBase) {
        fechaFormateada = new Date(fechaBase).toISOString().split('T')[0];
      }

      const precioUnitario = linea.precioUnitario || linea.precioUnidad || linea.precio || 0;
      const cantidad = linea.cantidad || 1;
      const subtotalLinea = linea.subtotal || linea.total || (cantidad * precioUnitario);
      const notaExistente = linea.notas || linea.notasReparacion || '';

      return {
        id: linea.id || index, 
        articuloId: linea.articuloId || linea.articulo?.id,
        nombre: linea.articuloNombre || linea.articulo?.nombre || 'Artículo/Servicio',
        cantidad: cantidad,
        precio: precioUnitario,
        subtotal: subtotalLinea,
        esServicio: linea.esServicio || linea.articulo?.tipo === 'SERVICIO' || orden.tipo === 'REPARACION',
        notas: notaExistente,
        notasReparacion: notaExistente,
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

  finalizarReparacion(trabajoId: number) {
    this.uiService.mostrarToast('⚡ Marcando trabajo como completado...', 'warning');
    
    this.ordenService.avanzarEstadoTrabajoTaller(trabajoId, 'LISTO').subscribe({
      next: () => {
        this.uiService.mostrarToast('Reparación finalizada. Pasado a "Listos para recoger". 📦', 'success');
        this.cargarDatos();
        this.cerrarModal();
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('Error al terminar la reparación del bulto', 'error');
      }
    });
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

  finalizarEntregaYCobro() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    const totalCobrar = orden.importePendiente || 0;

    if (totalCobrar === 0) {
      if (orden.estadoTaller === 'LISTO') {
        this.uiService.mostrarToast('📦 Registrando entrega de pedido ya pagado...', 'warning');
        
        this.ordenService.avanzarEstadoTrabajoTaller(orden.id, 'ENTREGADO').subscribe({
          next: () => {
            this.uiService.mostrarToast('¡Pedido entregado con éxito! ✔️', 'success');
            this.cerrarModal(); 
            this.cargarDatos();
          },
          error: (err) => {
            console.error(err);
            this.uiService.mostrarToast('Error al marcar el pedido como ENTREGADO', 'error');
          }
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

    const ejecutarCambioEstado = () => {
      if (orden.estadoTaller === 'LISTO') {
        this.ordenService.avanzarEstadoTrabajoTaller(orden.id, 'ENTREGADO').subscribe({
          next: () => {
            this.uiService.mostrarToast('¡Ticket completado! Orden cobrada y ENTREGADA.', 'success');
            this.cerrarPanelCobro();
            this.cerrarModal(); 
            this.cargarDatos();
          },
          error: () => this.uiService.mostrarToast('El pago se guardó, pero hubo un problema al marcar como ENTREGADO.', 'error')
        });
      } else {
        this.uiService.mostrarToast('¡Pago adelantado registrado! El ticket sigue en proceso.', 'success');
        this.cerrarPanelCobro();
        this.cerrarModal(); 
        this.cargarDatos();
      }
    };

    this.ordenService.cobrar(orden.id, this.metodoPago()).subscribe({
      next: () => ejecutarCambioEstado(),
      error: (errCobro) => {
        if (errCobro.status === 400 && typeof errCobro.error === 'string' && errCobro.error.includes('ya ha sido cobrado')) {
          ejecutarCambioEstado();
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

    const detallesOriginales = orden.detalles || [];
    const lineasDev = detallesOriginales.map((l: any) => {
      return {
        articuloId: l.articuloId || l.articulo?.id,
        cantidad: l.cantidad
      }
    }).filter((l: any) => l.articuloId != null);

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

  descargarFacturaA4(ordenId: number) {
    this.uiService.mostrarToast('Generando Factura A4...');
    this.ordenService.getFacturaPdf(ordenId).subscribe({
      next: (blob: Blob) => this.abrirBlobEnNuevaPestana(blob),
      error: () => this.uiService.mostrarToast('Error al generar la factura A4. ¡REVISA SI LLEVA CLIENTE!', 'error')
    });
  }

  private abrirBlobEnNuevaPestana(blob: Blob) {
    const urlDescarga = window.URL.createObjectURL(blob);
    window.open(urlDescarga, '_blank');
    window.URL.revokeObjectURL(urlDescarga);
  } 

  getBadgeClass(orden: any): string {
    if (!orden) return 'badge-secondary';
    if (orden.estadoPago === 'CANCELADO' || (orden.tipoOrden || orden.tipo) === 'DEVOLUCION' || orden.total < 0 || (orden.importeTotal ?? 0) < 0) {
      return 'badge-danger';
    }
    if (orden.tipo === 'VENTA_DIRECTA') {
      return 'badge-success';
    }
    if (orden.estadoTaller === 'ENTREGADO'){ 
      return 'badge-entregado';
    }
    if (orden.estadoTaller === 'LISTO'){ 
      return 'badge-warning';
    }
    if (orden.estadoTaller === 'EN_TALLER') {
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
      if (!this.detallesEditados[idx].notasReparacion) this.detallesEditados[idx].notasReparacion = '';
      if (!this.detallesEditados[idx].notas) this.detallesEditados[idx].notas = '';

      this.detallesEditados[idx].notasReparacion += caracterProcesado;
      this.detallesEditados[idx].notas += caracterProcesado;
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
      const actualRep = this.detallesEditados[idx].notasReparacion || '';
      this.detallesEditados[idx].notasReparacion = actualRep.slice(0, -1);
      
      const actualNot = this.detallesEditados[idx].notas || '';
      this.detallesEditados[idx].notas = actualNot.slice(0, -1);
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
      if (!this.detallesEditados[idx].notasReparacion) this.detallesEditados[idx].notasReparacion = '';
      if (!this.detallesEditados[idx].notas) this.detallesEditados[idx].notas = '';

      this.detallesEditados[idx].notasReparacion += ' ';
      this.detallesEditados[idx].notas += ' ';
    } else if (campo === 'precio-linea' && idx !== null) {
      if (!this.detallesEditados[idx].nuevoPrecioInput) this.detallesEditados[idx].nuevoPrecioInput = '';
      this.detallesEditados[idx].nuevoPrecioInput += ' ';
    }
  } 
}