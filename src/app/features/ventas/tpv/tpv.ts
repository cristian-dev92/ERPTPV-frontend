import { Component, OnInit, signal, computed, inject, ViewChild, effect } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { ComponentePaginado } from '../../../core/utils/paginado-base';

// SERVICIOS
import { ArticuloService } from '../../../core/services/articulo.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { OrdenService } from '../../../core/services/orden.service';
import { CajaService } from '../../../core/services/caja.service';
import { UiService } from '../../../core/services/ui.service';
import { AuthService } from '../../../core/services/auth.service';
import { FamiliaService } from '../../../core/services/familia.service';

// MODELOS / DTOS / INTERFACES NUEVOS
import { Articulo } from '../../../core/models/articulo.model';
import { ClientesComponent } from '../../clientes/clientes';
import { NuevaOrdenDTO, OrdenDTO, DevolucionRequest, MetodoPago, LineaVentaDirectaDTO, TrabajoTallerDTO } from '../../../core/models/orden.model';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface FamiliaDTO {
  id: number;
  nombre: string;
  descripcion: string;
  familiaPadreId: number | null;
  familiaPadreNombre: string | null;
  subfamilias?: FamiliaDTO[];
}

export interface NuevaFamiliaRequest {
  nombre: string;
  descripcion?: string;
  familiaPadreId?: number | null;
}

// Interfaz para representar la información que devuelve el back al cerrar un recibo con AEAT, que luego se muestra en el TPV para que el cajero pueda verificarlo
export interface InfoVerifaktu {
  qr: string;
  ref: string;
  total: number;
  fecha: string;
}

// Interfaz interna para manejar el carrito unificado en la vista antes de empaquetar el DTO
interface LineaCarritoMostrador {
  articulo: Articulo;
  cantidad: number;
  precioEditado: number;
  porcentajeDescuento: number;
  notasMostrador: string;
  descripcionBulto: string; // Exclusivo si se trata como trabajo de reparación
  destino: 'TIENDA' | 'TALLER';
  busquedaArticulo: string;
  mostrarResultados: boolean;
  resultadosBusqueda: Articulo[];
}

// Interfaz para representar clientes en el TPV (puede ser extendida según necesidades)
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email?: string;
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, ClientesComponent, NgClass, DecimalPipe],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})

export class TpvComponent extends ComponentePaginado implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);
  private clienteService = inject(ClienteService);
  public uiService = inject(UiService);
  private router = inject(Router);
  private familiaService = inject(FamiliaService);
  private authService = inject(AuthService);
  private http: HttpClient = inject(HttpClient);
  private bufferCodigoBarras: string = '';
  private ultimaPulsacion: number = 0;
  private sanitizer = inject(DomSanitizer);
  public Math = Math;
  @ViewChild(ClientesComponent) clientesComponent!: ClientesComponent;

  // === SIGNALS DE ESTADO PRINCIPALES ===
  carrito = signal<LineaCarritoMostrador[]>([]);
  categorias = signal<string[]>(['TODOS', 'CALZADO', 'REPARACION', 'COMPLEMENTOS', 'LIMPIEZA']);
  categoriaSeleccionada = signal<string>('TODOS');
  historialTickets = signal<OrdenDTO[]>([]);
  tipoOrdenSeleccionada = signal<'VENTA_DIRECTA' | 'REPARACION'>('VENTA_DIRECTA');
  metodoPagoSeleccionado = signal<MetodoPago>('EFECTIVO');
  metodoPagoAnticipo = signal<MetodoPago>('EFECTIVO');
  importeAnticipo = 0;
  cargando = signal<boolean>(false);

  // Clientes y Taller
  clienteSeleccionado = signal<Cliente | null>(null);
  clienteSeleccionadoId = signal<number | null>(null);
  busquedaCliente = signal<string>('');
  clientesEncontrados = signal<Cliente[]>([]);
  fechaRecogida = signal<string>('');
  sinFechaRecogida = signal<boolean>(false);
  notasGenerales = signal<string>('');

  // Modales e interfaces
  mostrarHistorial = signal<boolean>(false);
  isTicketVisible = signal<boolean>(false);
  cartPanelAbierto = signal<boolean>(false);
  mostrarModalPedirTicket = false;
  mostrarModalSeleccionDevolucion = false;
  mostrarModalMetodosPago = false;
  opcionesMetodosPago: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'BIZUM','TRANSFERENCIA', 'OTRO'];

  // Control de Caja
  cajaActual = this.cajaService.cajaActual;
  cajaAbierta = computed(() => this.cajaActual() !== null);
  saldoInicialInput: number = 0;

  // Edición unificada de línea
  mostrarModalEdicion = signal<boolean>(false);
  indiceLineaEnEdicion = signal<number | null>(null);
  precioLineaEnConstruccion = signal<string>('');
  descuentoLineaEnConstruccion = signal<string>('0');
  notaLineaEnConstruccion = signal<string>('');
  bultoLineaEnConstruccion = signal<string>('');
  busquedaArticulo = signal<string>('');
  busquedaArticuloTaller = signal<string>('');
  filaBuscadorAbierto = signal<number | null>(null);
  articulosTallerEncontrados = computed(() => {
    const termino = this.busquedaArticuloTaller().toLowerCase().trim();
    if (!termino) return [];
    return this.articulosTotales().filter(a =>
      a.nombre.toLowerCase().includes(termino) ||
      (a.codigo && a.codigo.toLowerCase().includes(termino))
    ).slice(0, 20);
  });

  // Devoluciones enlazadas
  numeroTicketBuscarInput: string = '';
  ticketOrigenEncontrado: OrdenDTO | null = null;
  lineasSeleccionadasParaDevolver: Map<number, { checked: boolean, cantidadADevolver: number }> = new Map();

  // Anticipos
  mostrarModalPreguntaAnticipo = signal<boolean>(false);
  idOrdenPendienteAnticipo = signal<number | null>(null);
  valorAnticipoFijo = signal<string>('');

  // Veri*Factu / Impresión
  numeroTicketActual = signal<string>('TKT-PROVISIONAL');
  horaTicketActual = signal<string>('');
  idOperacionProcesada = signal<number | null>(null);
  ticketIframeUrl = signal<string | null>(null);
  datosFacturaAeat = signal<InfoVerifaktu | null>(null);

  // Estados de PDF e Impresión
  cargandoPDF = signal<boolean>(false);
  urlSeguraPdf = signal<SafeResourceUrl>(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
  private rawBlobUrl: string | null = null; // Para liberar memoria

  // Modales y Flujos Especiales
  mostrarModalCliente = signal<boolean>(false);
  mostrarModalSeleccionPago = signal<boolean>(false); // Modificado para casar con el HTML
  parseFloat = parseFloat;

  // Estado del modal de teclado virtual / edición unificada de línea
  indiceItemEditandoLinea = signal<number | null>(null);
  modoCampoEdicionActivo = signal<'PRECIO' | 'DESCUENTO'>('PRECIO');

  // Lista de familias obtenidas (puedes inicializarla vacía o con datos de prueba)
  listaFamilias = signal<FamiliaDTO[]>([]);

  // Señales de selección para la navegación de categorías
  familiaSeleccionada = signal<FamiliaDTO | null>(null);
  subfamiliaSeleccionada = signal<any | null>(null);

  // Almacén local con todos los artículos cargados de golpe de la base de datos
  articulosTotales = signal<any[]>([]);

  // Estados intermedios para la construcción de bultos/taller
  descripcionBultoEnConstruccion = signal<string>('');
  fechaPrevistaEntrega = signal<string>('');

  // Control para abrir/cerrar el modal principal de taller
  mostrarModalGestionServicios = signal<boolean>(false);

  // Estados del catalogo tactil
  articulos = signal<Articulo[]>([]); // Lista completa de artículos cargada desde el backend

  // --- ESTADO PARA MODIFICAR PRECIOS CON EL KEYPAD ---
  indiceItemEditandoPrecio = signal<number | null>(null);
  precioEnConstruccion = signal<string>(''); // Guarda los dígitos que pulsa el usuario (ej:

  // === ESTADOS PARA EL TECLADO TÁCTIL GENERAL ===
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>(''); // Aquí meteremos 'ARTICULO', 'CLIENTE', 'NOTAS_REPARACION', etc.
  mayusculas = signal<boolean>(true);
  valorTecladoEnConstruccion = signal<string>('');
  maxUnidadesPermitidas: number = 1;
  indiceLineaTemporal = signal<number | null>(null);

  // Distribución de teclas idéntica a tu diseño favorito del TPV
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaAcentos = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];

   // Estado para controlar la visibilidad del ticket de venta al finalizar la compra, que se muestra solo en tablets y móviles
  idTicketOrigenDevolucion =signal<number | null>(null);

  // Estados para controlar el proceso de devolución manual sin ticket, que se activa al hacer clic en el botón rojo de "Devolución Manual"
  mostrarModalDevolucion = false;
  mensajeModalDevolucion = '';
  ticketParaDevolver: OrdenDTO | null = null;   

  // Fila variable inteligente según el input
  get lineaEspecialDinamica(): string[] {
    const input = this.inputActivo().toLowerCase();
    
    if (input.includes('email') || input.includes('correo')) {
      return ['@', '.', '-', '_', '.com', '.es', '.net'];
    }
    if (input.includes('pass') || input.includes('password') || input.includes('clave')) {
      return ['@', '.', '_', '-', '!', '#', '$', '%'];
    }
    // Para notas de taller, buscadores o cantidades
    return ['@', ',', '.', '_', '/', '%', '&', '"', '(', ')', '¡', '!', '¿', '?'];
  }

  // === SIGNALS COMPUTED ===
  subtotalTicket = computed(() => {
    return this.carrito().reduce((acc, item) => acc + (item.precioEditado * item.cantidad), 0);
  });

  descuentoTotalTicket = computed(() => {
    return this.carrito().reduce((acc, item) => {
      const bruto = item.precioEditado * item.cantidad;
      return acc + (bruto * (item.porcentajeDescuento / 100));
    }, 0);
  });

  totalTicket = computed(() => {
    const res = this.subtotalTicket() - this.descuentoTotalTicket();
    return res < 0 ? 0 : Math.round(res * 100) / 100;
  });

  cantidadArticulosCarrito = computed(() => {
    return this.carrito().reduce((acc, item) => acc + item.cantidad, 0);
  });

  articulosFiltrados = computed(() => {
    const busqueda = this.busquedaArticulo().toLowerCase().trim();
    const familia = this.familiaSeleccionada();
    const subfamilia = this.subfamiliaSeleccionada();

    return this.articulosTotales().filter(articulo => {
      // 1. Filtro de búsqueda por texto
      const coincideTexto = !busqueda || 
        articulo.nombre.toLowerCase().includes(busqueda) || 
        (articulo.codigo && articulo.codigo.toLowerCase().includes(busqueda));

      // 2. Filtro por Familia (Padre) o sus Subfamilias hijas
      let coincideFamilia = true;
      if (familia) {
        // Obtenemos una lista de todos los IDs válidos para esta categoría (el padre + sus hijos)
        const idsFamiliaValidos = [
          familia.id, 
          ...(familia.subfamilias?.map(sub => sub.id) || [])
        ];
        
        // El artículo cumple si su familiaId está dentro de los IDs válidos
        coincideFamilia = idsFamiliaValidos.includes(articulo.familiaId);
      }

      // 3. Filtro por Subfamilia concreta (si el cajero ha pulsado una píldora de subfamilia)
      const coincideSubfamilia = !subfamilia || articulo.familiaId === subfamilia.id;

      return coincideTexto && coincideFamilia && coincideSubfamilia;
    });
  });

  historialTicketsAMostrar = computed(() => {
    const inicio = this.paginaActual() * this.itemsPorPagina();
    return this.historialTickets().slice(inicio, inicio + this.itemsPorPagina());
  });

  abrirModalNuevoCliente() {
    this.mostrarModalCliente.set(true);
    if (this.clientesComponent) {
      this.clientesComponent.abrirModal();
    }
  }
  // Método que se ejecutará cuando el componente de clientes termine de guardar e inserte automáticamente el nuevo cliente en el TPV
  onClienteRegistradoDelModal(cliente: any) {
  this.seleccionarCliente(cliente); // Lo dejas ya seleccionado en el ticket
  this.mostrarModalCliente.set(false); // Cierras el modal
  }

  constructor() {
    super();
    effect(() => {
      const total = this.historialTickets().length;
      this.totalElementos.set(total);
      if (this.paginaActual() >= Math.ceil(total / this.itemsPorPagina()) && total > 0) {
        this.paginaActual.set(Math.ceil(total / this.itemsPorPagina()) - 1);
      }
    });
  }

  ngOnInit(): void {
    this.cargarDatos();
    this.cargarArticulos();
    this.obtenerFamiliasConJerarquia();
    this.refrescarHistorialTrabajosActivos();
    this.cajaService.checkEstadoCaja().subscribe({
      error: (err: any) => console.error("Error al verificar estado de caja inicial en TPV", err)
    });
  }

  override cargarDatos(): void {
    this.cargando.set(true);
    this.ordenService.getOrdenes().subscribe({
      next: (tickets: OrdenDTO[]) => {
        this.historialTickets.set(tickets);
        this.paginaActual.set(0);
        this.cargando.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al cargar historial: ' + (err.error || err.message), 'error');
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

  refrescarHistorialTrabajosActivos(): void {
    this.ordenService.getOrdenesConTrabajosActivos().subscribe({
      next: (tickets) => this.historialTickets.set(tickets),
      error: (err) => console.error('Error cargando trabajos activos:', err)
    });
  }

  // Añadir una línea en blanco para trabajos que no correspondan a un producto del catálogo
  agregarTrabajoManualSinProducto(): void {
  const nuevoTrabajo: LineaCarritoMostrador = {
    articulo: {
      id: null as any,
      nombre: '',
      precioFinal: 0,  // Usamos el campo correcto de tu entidad de artículos
      codigoBarras: '',
      categoria: 'SERVICIOS'
    } as any,
    cantidad: 1,
    precioEditado: 0,
    porcentajeDescuento: 0,
    notasMostrador: '',
    descripcionBulto: '',
    destino: 'TALLER',
    busquedaArticulo: '',
    mostrarResultados: false,
    resultadosBusqueda: []
  };
  // Usamos .update() que es más limpio y seguro para los Signals de Angular
    this.carrito.update(items => [...items, nuevoTrabajo]);
    
  // Abrimos el modal de edición para que el zapatero le ponga precio y notas al momento
  this.abrirModalEdicionLinea(this.carrito().length - 1);
 }

 // Funciones de Familia
 seleccionarFamilia(familia: FamiliaDTO | null): void {
  // Si es null es "Todas", si es un objeto es la familia seleccionada
  this.familiaSeleccionada.set(familia);
  // Limpiamos subfamilia al cambiar de familia padre
  this.subfamiliaSeleccionada.set(null); 
  this.uiService.mostrarToast(familia ? `Categoría: ${familia.nombre}` : 'Mostrando todas las familias', 'success');
 }

 seleccionarSubfamilia(sub: FamiliaDTO | null): void {
    // Si vuelve a pulsar en la misma subfamilia, la desactivamos para ver todo el padre
    if (this.subfamiliaSeleccionada()?.id === sub?.id) {
      this.subfamiliaSeleccionada.set(null);
    } else {
      this.subfamiliaSeleccionada.set(sub);
      if (sub) {
        this.uiService.mostrarToast(`Subcategoría: ${sub.nombre}`, 'success');
      }
    }
  }

  obtenerFamiliasConJerarquia() {
  this.familiaService.obtenerMisFamilias().subscribe(data => {
    // 1. Separamos padres de hijos
    const padres = data.filter(f => f.familiaPadreId === null);
    const hijos = data.filter(f => f.familiaPadreId !== null);

    // 2. Inyectamos los hijos en sus respectivos padres
    const arbol = padres.map(padre => ({
      ...padre,
      subfamilias: hijos.filter(hijo => hijo.familiaPadreId === padre.id)
    }));

    this.listaFamilias.set(arbol);
  });
 }

  // Alternar el destino de la línea (⚙️ Taller / 🛍️ Tienda)
  toggleDestinoLinea(index: number): void {
    this.carrito.update(items => {
    const copia = [...this.carrito()];
    if (copia[index]) {
      const destinoActual = copia[index].destino || 'TIENDA';
      const nuevoDestino = destinoActual === 'TALLER' ? 'TIENDA' : 'TALLER';
      
      copia[index] = {
          ...copia[index],
          destino: nuevoDestino,
          // Si pasa a tienda, limpiamos notas de taller y descripción de bulto
          notasMostrador: nuevoDestino === 'TIENDA' ? '' : copia[index].notasMostrador,
          descripcionBulto: nuevoDestino === 'TIENDA' ? '' : copia[index].descripcionBulto
        };
      }
      return copia;
    });
  }

  // Control de apertura y cierre del gestor de taller
  abrirGestorTallerYServicios(): void {
    this.busquedaCliente.set('');
    this.clientesEncontrados.set([]);
    this.importeAnticipo = 0;
    this.metodoPagoAnticipo.set('EFECTIVO');
    this.indiceLineaEnEdicion.set(null);
    const hoy = new Date();
    hoy.setDate(hoy.getDate() + 7);
    const fechaStr = hoy.toISOString().split('T')[0];
    this.fechaPrevistaEntrega.set(fechaStr);
    this.fechaRecogida.set(fechaStr);
    this.sinFechaRecogida.set(false);
    
    this.mostrarModalGestionServicios.set(true);
  }

  cerrarModalServicios(): void {
    this.mostrarModalGestionServicios.set(false);
    this.indiceLineaEnEdicion.set(null);
    this.filaBuscadorAbierto.set(null);
    this.busquedaArticuloTaller.set('');
  }

  confirmarTallerYServicios() {
    if (this.carrito().length === 0) {
      this.cerrarModalServicios();
      return;
    }
    if (this.tieneServicioEnCarrito() && !this.clienteSeleccionadoId()) {
      this.uiService.mostrarToast('Taller: Es obligatorio asignar un cliente para guardar el bulto.', 'warning');
      return;
    }
    if (this.tieneServicioEnCarrito() && !this.sinFechaRecogida() && !this.fechaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
      return;
    }
    const lineaSinPrecio = this.carrito().findIndex(item => item.destino === 'TALLER' && item.precioEditado <= 0);
    if (lineaSinPrecio !== -1) {
      this.uiService.mostrarToast('El trabajo manual tiene precio 0. Debes asignar un precio antes de confirmar.', 'warning');
      return;
    }
    this.cerrarModalServicios();
    if (this.tieneServicioEnCarrito()) {
      this.tipoOrdenSeleccionada.set('REPARACION');
    }
    this.finalizarVenta();
  }

  // === LOGICA DE ARTICULOS ===
  cargarArticulos(): void {
    this.articuloService.getArticulos().subscribe({
      next: (articulos) => this.articulosTotales.set(articulos),
      error: () => this.uiService.mostrarToast('No se pudieron cargar los artículos.', 'error')
    });
  }

  // === GESTIÓN DEL CARRITO ===
  agregarAlCarrito(articulo: Articulo): void {
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast(' Operación denegada. Debe realizar la apertura de caja primero.', 'error');
      return;
    }

    // Determinamos el destino inicial: Si la orden general ya está en modo REPARACION, asumimos que va a TALLER. Si no, por defecto va a TIENDA (Venta Directa).
    const destinoInicial = this.tipoOrdenSeleccionada() === 'REPARACION' ? 'TALLER' : 'TIENDA';

    this.carrito.update(items => {
      const existe = items.findIndex(i => i.articulo.id === articulo.id && i.destino === destinoInicial);
      
      if (existe !== -1) {
        // Si ya existe en el carrito con el mismo destino, incrementamos cantidad
        const nuevos = [...items];
        nuevos[existe] = { ...nuevos[existe], cantidad: nuevos[existe].cantidad + 1 };
        return nuevos;
      } else {
        // Si es nuevo, lo añadimos estableciendo por defecto sus propiedades de taller vacías
        return [...items, {
          articulo: articulo,
          cantidad: 1,
          precioEditado: articulo.precioFinal,
          porcentajeDescuento: 0,
          notasMostrador: '',
          descripcionBulto: destinoInicial === 'TALLER' ? `Par de ${articulo.nombre.toLowerCase()}` : '',
          destino: destinoInicial,
          busquedaArticulo: '',
          mostrarResultados: false,
          resultadosBusqueda: []
        }];
      }
    });
    this.uiService.mostrarToast(`🛒 ${articulo.nombre} añadido al mostrador.`, 'success');
  }

  buscarArticuloEnLinea(index: number): void {
    const items = [...this.carrito()];
    const item = items[index];
    if (!item) return;
    const termino = item.busquedaArticulo.toLowerCase().trim();
    if (!termino) {
      item.mostrarResultados = false;
      item.resultadosBusqueda = [];
      this.carrito.set(items);
      return;
    }
    item.resultadosBusqueda = this.articulosTotales().filter(a =>
      a.nombre.toLowerCase().includes(termino) ||
      (a.codigo && a.codigo.toLowerCase().includes(termino))
    ).slice(0, 15);
    item.mostrarResultados = item.resultadosBusqueda.length > 0;
    this.carrito.set(items);
  }

  sustituirArticuloLinea(index: number, articulo: Articulo): void {
    this.carrito.update(items => {
      const nuevos = [...items];
      const item = { ...nuevos[index] };
      item.articulo = articulo;
      item.precioEditado = articulo.precioFinal;
      item.busquedaArticulo = '';
      item.mostrarResultados = false;
      item.resultadosBusqueda = [];
      nuevos[index] = item;
      return nuevos;
    });
    this.uiService.mostrarToast(`Artículo sustituido por ${articulo.nombre}`, 'success');
  }

  cerrarResultadosLinea(index: number): void {
    this.carrito.update(items => {
      const nuevos = [...items];
      nuevos[index] = { ...nuevos[index], mostrarResultados: false, resultadosBusqueda: [] };
      return nuevos;
    });
  }

  incrementarCantidad(index: number): void {
    this.carrito.update(items => items.map((item, i) => i === index ? { ...item, cantidad: item.cantidad + 1 } : item));
  }

  decrementarCantidad(index: number): void {
    this.carrito.update(items => {
      const item = items[index];
      if (item.cantidad > 1) {
        return items.map((item, i) => i === index ? { ...item, cantidad: item.cantidad - 1 } : item);
      }
      return items.filter((_, i) => i !== index);
    });
  }

  eliminarLinea(index: number): void {
    this.carrito.update(items => items.filter((_, i) => i !== index));
    this.uiService.mostrarToast('Línea eliminada.', 'warning');
  }
  
  // === MODAL DE EDICIÓN UNIFICADA DE LÍNEA ===
  abrirModalEdicionLinea(index: number): void {
    const item = this.carrito()[index];
    if (!item) return;

    this.indiceLineaEnEdicion.set(index);
    this.precioLineaEnConstruccion.set(item.precioEditado.toFixed(2));
    this.descuentoLineaEnConstruccion.set(item.porcentajeDescuento.toString());
    this.notaLineaEnConstruccion.set(item.notasMostrador || '');
    this.bultoLineaEnConstruccion.set(item.descripcionBulto || '');
    this.mostrarModalEdicion.set(true);
  }

  guardarCambiosLineaUnificada(): void {
    const index = this.indiceLineaEnEdicion();
    if (index === null) return;

    const nuevoPrecio = parseFloat(this.precioLineaEnConstruccion());
    let nuevoDesc = parseFloat(this.descuentoLineaEnConstruccion() || '0');

    if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
      this.uiService.mostrarToast('El precio introducido no es válido.', 'warning');
      return;
    }
    if (nuevoDesc < 0) nuevoDesc = 0;
    if (nuevoDesc > 100) nuevoDesc = 100;

    this.carrito.update(items => {
      const copia = [...items];
      copia[index] = {
        ...copia[index],
        precioEditado: Number(this.precioLineaEnConstruccion()),
        porcentajeDescuento: Number(this.descuentoLineaEnConstruccion() || '0'),
        notasMostrador: this.notaLineaEnConstruccion(),
        descripcionBulto: this.bultoLineaEnConstruccion()
      };
      return copia;
    });

    this.uiService.mostrarToast('Línea del mostrador actualizada.', 'success');
    this.cerrarModalEdicionLinea();
  }

  cerrarModalEdicionLinea(): void {
    this.mostrarModalEdicion.set(false);
    this.indiceLineaEnEdicion.set(null);
    this.precioLineaEnConstruccion.set('');
    this.descuentoLineaEnConstruccion.set('0');
    this.notaLineaEnConstruccion.set('');
    this.bultoLineaEnConstruccion.set('');
  }

  // === MÉTODOS DEL CORE TPV ===
  tieneServicioEnCarrito(): boolean {
    return this.carrito().some(item => item.destino === 'TALLER');
  }

  ajustarCantidad(index: number, cambio: number): void {
  // Obtenemos el artículo actual del carrito
  const item = this.carrito()[index]; 
  
  if (!item) return;

  // Si la cantidad actual es 1 y el usuario pulsa el menos (-1)
  if (item.cantidad === 1 && cambio === -1) {
    this.quitarDelCarrito(index);
    return; // Cortamos la ejecución aquí para que no reste a 0 o números negativos
  }
    this.carrito.update(items => items.map((item, i) => {
      if (i === index) {
        const nuevaCant = item.cantidad + cambio;
        return { ...item, cantidad: nuevaCant < 1 ? 1 : nuevaCant };
      }
      return item;
    }));
  }

  quitarDelCarrito(index: number): void {
    const items = [...this.carrito()];
    items.splice(index, 1);
    this.carrito.update(items => items.filter((_, i) => i !== index));
    this.uiService.mostrarToast('Artículo eliminado del carrito.', 'success');
  }

  // Ejecuta la apertura del modal intermedio de selección de pago
  ejecutarProcesarYFacturar(): void {
    // CONTROL DE CAJA ABIERTA
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('¡Atención! Debes abrir la caja antes de realizar una venta u operación.', 'warning');
      return;
    }

    if (this.carrito().length === 0) return;

    // CONTROL DE SEGURIDAD: CLIENTE OBLIGATORIO (si hay artículos de taller)
    if (this.tieneServicioEnCarrito() && !this.clienteSeleccionado()) {
      this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
      return;
    }

    // CONTROL DE SEGURIDAD: FECHA DE RECOGIDA OBLIGATORIA
    if (this.tieneServicioEnCarrito() && !this.sinFechaRecogida() && !this.fechaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
      return;
    }

    this.mostrarModalSeleccionPago.set(true);
  }

  // Al pinchar sobre un método de pago en el modal táctil
  procesarVentaConMetodo(metodo: MetodoPago): void {
    // RE-CHECK POR SEGURIDAD
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('Operación cancelada: La caja está cerrada.', 'warning');
      this.mostrarModalSeleccionPago.set(false);
      return;
    }
    this.metodoPagoSeleccionado.set(metodo);
    this.mostrarModalSeleccionPago.set(false);
    this.finalizarVenta();
    // Aquí disparas tu lógica real de guardado hacia el backend. Ejemplo analógico:
    this.uiService.mostrarToast(`Procesando cobro en ${metodo}...`, 'success');
    // ... tu llamada HTTP a backend para registrar la venta directa o la orden de taller
  }

  obtenerIconoPago(metodo: MetodoPago): string {
    const iconos: Record<MetodoPago, string> = {
      EFECTIVO: '💵',
      TARJETA: '💳',
      BIZUM: '💸',
      TRANSFERENCIA: '🏦',
      OTRO: '📲'
    };
    return iconos[metodo] || '💰';
  }

  abrirModalMetodosPago(): void {
    // CONTROL DE SEGURIDAD PREVIO: Caja abierta
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('¡Atención! Debes abrir la caja antes de procesar cualquier operación.', 'warning');
      return;
    }

    if (this.carrito().length > 0) {
      // CONTROL DE SEGURIDAD: CLIENTE OBLIGATORIO (si hay artículos de taller)
      if (this.tieneServicioEnCarrito() && !this.clienteSeleccionado()) {
        this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
        return;
      }

      // CONTROL DE SEGURIDAD: FECHA DE RECOGIDA OBLIGATORIA
      if (this.tieneServicioEnCarrito() && !this.sinFechaRecogida() && !this.fechaRecogida()) {
        this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
        return;
      }

      this.mostrarModalSeleccionPago.set(true);
    }
  }   

  // Método para cargar el catálogo de artículos desde el backend, que se ejecuta al hacer clic en el botón "Recargar Catálogo"
  cargarCatalogo() {
    this.articuloService.getArticulos().subscribe({
      next: (data) => this.articulos.set(data),
      error: (err) => console.error('Error al cargar artículos', err)
    });
  }

  // Método para cambiar la categoría seleccionada, que se ejecuta al hacer clic en los botones de categoría del HTML
  seleccionarCategoria(cat: 'TODOS' | 'PRODUCTO' | 'SERVICIO') {
    this.categoriaSeleccionada.set(cat);
  }

  // ==================================================
  // 💰 FLUJO ORDINARIO: VENTAS DIRECTAS Y REPARACIONES
  // ==================================================
  finalizarVenta() {
    // 1. Validación de caja abierta (Primer muro)
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('¡Atención! Debes abrir la caja antes de realizar una venta.', 'warning');
      return;
    }

    if (this.carrito().length === 0) {
      this.uiService.mostrarToast('El carrito está vacío.', 'warning');
      return;
    }

    if (this.tieneServicioEnCarrito() && !this.clienteSeleccionadoId()) {
      this.uiService.mostrarToast('Taller: Es obligatorio asignar un cliente para guardar el bulto.', 'warning');
      return;
    }

    const lineaSinPrecio = this.carrito().findIndex(item => item.destino === 'TALLER' && item.precioEditado <= 0);
    if (lineaSinPrecio !== -1) {
      this.uiService.mostrarToast('El trabajo manual tiene precio 0. Debes asignar un precio antes de confirmar.', 'warning');
      return;
    }

    // Segmentación exacta requerida por NuevaOrdenDTO
    const lineasVentaDirecta: LineaVentaDirectaDTO[] = [];
    const trabajosTaller: TrabajoTallerDTO[] = [];

    const fechaPrometida = this.sinFechaRecogida() 
      ? null 
      : (this.fechaRecogida() || new Date().toISOString().split('T')[0]);

    this.carrito().forEach(item => {
      if (item.destino === 'TALLER') {
        trabajosTaller.push({
          descripcionTrabajo: item.articulo.nombre,
          precioFinalTrabajo: item.precioEditado,
          notasMostrador: item.notasMostrador || null,
          fechaPrometidaRecogida: fechaPrometida,
          articuloBaseId: item.articulo.id ?? null,
          cantidadMaterial: item.cantidad,
          descripcionBulto: item.descripcionBulto || `Bulto de ${item.articulo.nombre}`
        });
      } else {
        lineasVentaDirecta.push({
          articuloId: item.articulo.id ?? 0,
          cantidad: item.cantidad,
          porcentajeDescuento: item.porcentajeDescuento
        });
      }
    });

    const nuevaOrden: NuevaOrdenDTO = {
      clienteId: this.clienteSeleccionadoId() ?? null,
      descuentoGlobal: 0, 
      notasGenerales: this.notasGenerales(),
      importePagado: this.tipoOrdenSeleccionada() === 'VENTA_DIRECTA' ? this.totalTicket() : 0, 
      lineasVentaDirecta,
      trabajosTaller
    };

    this.uiService.mostrarToast('Guardando orden en el motor central...', 'success');

    this.ordenService.crearOrden(nuevaOrden).subscribe({
      next: (ordenProcesada) => {
        this.idOperacionProcesada.set(ordenProcesada.id);
        
        if (this.tipoOrdenSeleccionada() === 'REPARACION') {
          this.idOperacionProcesada.set(ordenProcesada.id);
          const anticipo = parseFloat(String(this.importeAnticipo)) || 0;
          this.cobrarAnticipoTicket(ordenProcesada.id, anticipo, this.metodoPagoAnticipo());
          this.ordenService.getOrdenes().subscribe({
            next: (ticketsActualizados: OrdenDTO[]) => {
              this.historialTickets.set(ticketsActualizados);
            },
            error: (err) => {
              this.uiService.mostrarToast('Error al actualizar el historial de ventas: ' + (err.message || 'Error desconocido'), 'error');
            }
          });
          this.limpiarCarrito();
        } else {
          // 💡 SOLUCIÓN: Si es venta directa, el backend ya la cobra al crearla 
          // porque le mandamos el 'importePagado'. No llames a cobrarTicketCompleto()!
          this.uiService.mostrarToast(`💰 Venta #${ordenProcesada.numeroTicket || ordenProcesada.id} correcta.`, 'success');
          // Ejecutamos exactamente los mismos pasos de limpieza y actualización de pantalla:
          this.procesarPostCobroCompleto(ordenProcesada);
          // Actualizamos los datos del ticket para la vista y Veri*Factu
          this.numeroTicketActual.set(ordenProcesada.numeroTicket);
          this.horaTicketActual.set(new Date().toLocaleTimeString());
          // Actualizar el historial inferior de tickets
          this.ordenService.getOrdenes().subscribe({
            next: (ticketsActualizados: OrdenDTO[]) => {
              this.historialTickets.set(ticketsActualizados);
            },
            error: (err) => {
              this.uiService.mostrarToast('Error al actualizar el historial de ventas: ' + (err.message || 'Error desconocido'), 'error');
            }
          });

          // Módulo Veri*Factu (usamos el número de ticket procesado)
          this.datosFacturaAeat.set({
            qr: '',
            ref: ordenProcesada.numeroTicket, 
            total: this.totalTicket(),
            fecha: new Date().toLocaleTimeString()
          });

          // Mostrar visor/modal de ticket y lanzar previsualización PDF
          this.isTicketVisible.set(true);
          // La previsualización ya la lanza procesarPostCobroCompleto()
          
          // Refrescamos stock de la tienda
          this.cargarCatalogo();
        }
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('Error al procesar la venta: ' + (err.error?.message || 'Rechazado'), 'error');
      }
    });
  }

  // === FLUJO COBROS, ANTICIPOS Y VERI*FACTU ===

  private cobrarAnticipoTicket(id: number, importe: number, metodoPago: MetodoPago) {
    if (importe === 0) {
      this.uiService.mostrarToast(`📋 Resguardo de depósito generado con éxito (Sin anticipo).`, 'success');
      this.idOperacionProcesada.set(id);
      this.numeroTicketActual.set(`REP-${id}`); 
      this.horaTicketActual.set(new Date().toLocaleTimeString());
      
      this.datosFacturaAeat.set({
        qr: '',
        ref: `REP-${id}`,
        total: 0,
        fecha: new Date().toISOString() // ISO Estricto para AEAT
      });

      this.ordenService.getOrdenes().subscribe({
        next: (ticketsActualizados: any) => this.historialTickets.set(ticketsActualizados)
      });

      this.isTicketVisible.set(true);
      this.generarYPrevisualizarTicket();
      this.cargarCatalogo();
      return;
    }

    this.ordenService.registrarAnticipo(id, importe, metodoPago).subscribe({
      next: (res: any) => {
        this.uiService.mostrarToast(`📉 ¡Anticipo de ${importe}€ registrado con éxito!`, 'success');
        this.idOperacionProcesada.set(id);
        this.numeroTicketActual.set(res.numeroTicket);
        this.horaTicketActual.set(new Date().toLocaleTimeString());
        this.datosFacturaAeat.set({
          qr: '',
          ref: res.numeroTicket,
          total: importe,
          fecha: new Date().toISOString() // Mejora 3: ISO Estricto para AEAT
        });
        this.ordenService.getOrdenes().subscribe({
          next: (ticketsActualizados: any) => this.historialTickets.set(ticketsActualizados)
        });
        this.isTicketVisible.set(true);
        this.generarYPrevisualizarTicket();
        this.cargarCatalogo();
      },
      error: (err: any) => this.uiService.mostrarToast('Error al registrar el anticipo: ' + (err.error || err.message), 'error')
    });
  }

  private procesarPostCobroCompleto(res: OrdenDTO): void {
    this.limpiarMemoriaBlobUrl();
    this.numeroTicketActual.set(res.numeroTicket);
    this.horaTicketActual.set(new Date().toLocaleTimeString());

    this.datosFacturaAeat.set({
      qr: (res as any).qrVerifaktu || '', 
      ref: res.numeroTicket,
      total: res.total,
      fecha: new Date().toLocaleTimeString()
    });

    this.refrescarHistorialTrabajosActivos();
    this.isTicketVisible.set(true);
    this.generarYPrevisualizarTicket();
    this.limpiarCarrito();
  }

  /* 🖨️ Función para obtener el PDF del Backend y meterlo en la previsualización */
  generarYPrevisualizarTicket(): void {
    const id = this.idOperacionProcesada();
    if (!id) {
      this.uiService.mostrarToast('No se encontró ninguna ID de operación activa.', 'error');
      return;
    }

    this.cargandoPDF.set(true);

    // 1. Buscamos en el historial o en el ticket origen si es un abono/devolución
    const peticionPdf$ = this.ordenService.getTicketPdf(id);

    peticionPdf$.subscribe({
      next: (blob: Blob) => {
        // Liberamos memoria de URLs de blobs anteriores del navegador
        if (this.rawBlobUrl) {
          URL.revokeObjectURL(this.rawBlobUrl);
        }

        // Creamos la nueva URL temporal para el binario del PDF
        this.rawBlobUrl = URL.createObjectURL(blob);
        
        // Sanitizamos para el [src] del iframe del HTML
        this.urlSeguraPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.rawBlobUrl));
        this.cargandoPDF.set(false);
        this.uiService.mostrarToast('📄 Ticket generado. Listo para revisión o impresión.', 'success');
      },
      error: (err) => {
        console.error('Error al generar PDF del ticket:', err);
        this.uiService.mostrarToast('No se pudo generar la vista de impresión.', 'error');
        this.cargandoPDF.set(false);
      }
    });
  }

  imprimirIframeFisico(): void {
    const id = this.idOperacionProcesada();
    if (id) {
      this.ordenService.imprimirTicket(id).subscribe();
    }
  }

  private limpiarMemoriaBlobUrl(): void {
    const actual = this.ticketIframeUrl();
    if (actual) {
      URL.revokeObjectURL(actual);
      this.ticketIframeUrl.set(null);
    }
  }

  // Método que se conecta a tu servicio de órdenes para rellenar la barra inferior con los tickets de hoy o del turno
  cargarHistorialTurno(): void {
    this.ordenService.getOrdenes().subscribe({
      next: (tickets: OrdenDTO[]) => {
        // Guardamos los tickets reales de la base de datos en tu señal
        this.historialTickets.set(tickets);
      },
      error: (err) => {
        console.error('Error al recuperar las ventas del turno:', err);
      }
    });
  }

  /* Acción del historial inferior para descargar el PDF oficial A4 regulado */
  previsualizarFacturaA4(ticket: OrdenDTO): void {
    // Extraemos el nombre del cliente EXACTAMENTE igual que lo haces en tu HTML
    const nombreCliente = ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General';
    // Verificación obligatoria de cliente (idéntica a tu lógica)
    if (nombreCliente === 'Cliente General') {
      this.uiService.mostrarToast('No se puede generar una factura formal A4 para una venta anónima. Debe registrar un cliente.', 'warning');
      return;
    }
    // Activamos los estados de carga y abrimos la pantalla del visor
    this.cargandoPDF.set(true);
    this.isTicketVisible.set(true); // Abre el modal donde está tu iframe
    // Seteamos los textos informativos en el encabezado del recibo
    this.idOperacionProcesada.set(ticket.id);
    this.numeroTicketActual.set(ticket.numeroTicket);
    // Controlamos la fecha por si viene en formato String o Date del back
    const fechaSegura = ticket.fechaCreacion ?? new Date();
    this.horaTicketActual.set(new Date(fechaSegura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    this.ordenService.getFacturaPdf(ticket.id).subscribe({
      next: (blob: Blob) => {
        this.limpiarMemoriaBlobUrl(); // Limpieza del puntero previo antes de reservar el nuevo
        this.rawBlobUrl = URL.createObjectURL(blob);
        this.urlSeguraPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.rawBlobUrl));
        this.cargandoPDF.set(false);
        this.uiService.mostrarToast('📄 Factura A4 generada. Lista para revisión.', 'success');
      },
      error: (err) => {
        this.cargandoPDF.set(false);
        this.isTicketVisible.set(false); // Cerramos el modal si falla el servidor
        // Si el error es un Blob de tipo JSON, lo "desenterramos" para leerlo
        if (err.error instanceof Blob && err.error.type === 'application/json') {
          const lector = new FileReader();
          lector.onload = () => {
            const mensajeErrorJava = JSON.parse(lector.result as string);
            this.uiService.mostrarToast('Error en servidor: ' + (mensajeErrorJava.message || 'Fallo al renderizar A4'), 'error');
          };
          lector.readAsText(err.error);
        } else {
          this.uiService.mostrarToast('Error al recuperar la factura oficial.', 'error');
        }
      }
    });
  }

  cerrarReciboAeat(): void {
    this.isTicketVisible.set(false);
    this.limpiarMemoriaBlobUrl(); 
    this.urlSeguraPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
    this.datosFacturaAeat.set(null);
    this.idOperacionProcesada.set(null);
    this.idOrdenPendienteAnticipo.set(null);
    this.limpiarCarrito();
  }

  /* MANDA EL TICKET DIRECTAMENTE A LA IMPRESORA SIN SALIR DEL TPV */
  imprimirIframeTicket(): void {
    const iframe = document.getElementById('iframeTicketPdf') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } else {
      this.uiService.mostrarToast('No se pudo conectar con el visor de impresión.', 'error');
    }
  }

  // === HISTORIAL / ACCIONES DE NUEVOS ENDPOINTS ===
  anularOrdenHistorial(ticket: OrdenDTO): void {
    this.ordenService.cancelarOrden(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('🚫 Ticket anulado correctamente.', 'success');
        this.refrescarHistorialTrabajosActivos();
      },
      error: (err) => this.uiService.mostrarToast('No se puede anular: ' + (err.error?.message || err.message), 'error')
    });
  }

  liquidarOrdenHistorial(ticket: OrdenDTO): void {
    this.ordenService.cobrar(ticket.id, this.metodoPagoSeleccionado()).subscribe({
      next: () => {
        this.uiService.mostrarToast(`💰 Balance de la Orden #${ticket.numeroTicket} saldado.`, 'success');
        this.refrescarHistorialTrabajosActivos();
      },
      error: (err) => this.uiService.mostrarToast('No se pudo completar el cobro pendiente.', 'error')
    });
  }

  avanzarEstadoTrabajo(trabajoId: number, estadoSiguiente: any): void {
    this.ordenService.avanzarEstadoTrabajoTaller(trabajoId, estadoSiguiente).subscribe({
      next: () => {
        this.uiService.mostrarToast('⚙️ Estado del bulto actualizado en taller.', 'success');
        this.refrescarHistorialTrabajosActivos();
      },
      error: (err) => this.uiService.mostrarToast('Fallo al cambiar estado.', 'error')
    });
  }

  // === MODAL UNIFICADO DE EDICIÓN DE LÍNEA (HTML MOCKUP) ===

  pulsarTeclaEdicionLinea(tecla: string) {
    const modo = this.modoCampoEdicionActivo();
  
  // 1. Gestionamos la edición si estamos tocando el PRECIO
  if (modo === 'PRECIO') {
    const actual = this.precioLineaEnConstruccion();
    if (tecla === '.' && actual.includes('.')) return;
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
    this.precioLineaEnConstruccion.set(actual + tecla);
  } 
  // 2. Gestionamos la edición si estamos tocando el DESCUENTO
  else if (modo === 'DESCUENTO') { // Adapta el string a tu 'modoCampoEdicionActivo'
    const actual = this.descuentoLineaEnConstruccion();
    if (tecla === '.') return; // Un descuento en una zapatería suele ser entero, si usas decimales quita esta línea
    this.descuentoLineaEnConstruccion.set(actual === '0' ? tecla : actual + tecla);
  }
 }

  borrarUltimoDigitoEdicionLinea() {
    const modo = this.modoCampoEdicionActivo();
    if (modo === 'PRECIO') {
      const actual = this.precioLineaEnConstruccion();
      this.precioLineaEnConstruccion.set(actual.length > 0 ? actual.slice(0, -1) : '');
    } else {
      const actual = this.descuentoLineaEnConstruccion();
      this.descuentoLineaEnConstruccion.set(actual.length > 0 ? actual.slice(0, -1) : '0');
    }
  }

  /* Acción rápida del historial inferior para cambiar de estado una reparación de taller */
  entregarReparacionHistorial(ticket: OrdenDTO): void {
    this.ordenService.avanzarEstadoTrabajoTaller(ticket.id, 'ENTREGADO').subscribe({
      next: () => {
        this.uiService.mostrarToast('✅ Reparación entregada y saldo liquidado correctamente.', 'success');
        // Refrescamos el historial en caliente
        this.ordenService.getOrdenes().subscribe(t => this.historialTickets.set(t));
      },
      error: (err) => this.uiService.mostrarToast('No se pudo entregar: ' + (err.error?.message || err.error), 'error')
    });
  }

  // Cache local de todos los clientes para búsqueda por nombre y teléfono
  clientesCache = signal<Cliente[]>([]);

  // === BÚSQUEDA Y MANEJO DE CLIENTES ===
  buscarClientes(termino: string) {
    this.busquedaCliente.set(termino);
    const limpio = termino.trim().toLowerCase();
    if (limpio.length < 2) {
      this.clientesEncontrados.set([]);
      return;
    }

    const filtrar = (clientes: Cliente[]) =>
      clientes.filter(c =>
        c.nombre.toLowerCase().includes(limpio) ||
        c.telefono.includes(limpio)
      );

    if (this.clientesCache().length > 0) {
      this.clientesEncontrados.set(filtrar(this.clientesCache()));
      return;
    }

    this.clienteService.obtenerMisClientes().subscribe({
      next: (clientes) => {
        this.clientesCache.set(clientes);
        this.clientesEncontrados.set(filtrar(clientes));
      },
      error: () => this.clientesEncontrados.set([])
    });
  }

  seleccionarCliente(cliente: Cliente) {
    // Al seleccionar un cliente, guardamos su ID para asociarlo al DTO de la orden y mostrar su nombre en el TPV
    this.clienteSeleccionado.set(cliente);
    // Guardamos el ID del cliente seleccionado para luego enviarlo al backend en la creación de la orden
    this.clienteSeleccionadoId.set(cliente.id);
    // Limpiamos la búsqueda y los resultados para que el cajero vea claramente que ya hay un cliente seleccionado
    this.busquedaCliente.set('');
    this.clientesEncontrados.set([]);
  }

  deseleccionarCliente() {
    // Reseteamos el cliente seleccionado a null para volver a la venta anónima
    this.clienteSeleccionado.set(null);
    this.clienteSeleccionadoId.set(null);
    this.busquedaCliente.set('');
    this.clientesEncontrados.set([]);
  }

  // Método que se ejecuta al cambiar la fecha en el input type="date" del HTML, para actualizar el signal fechaRecogida con el nuevo valor seleccionado por el cajero
  onFechaRecogidaChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
    this.fechaRecogida.set(input.value);
    this.fechaPrevistaEntrega.set(input.value);
    this.sinFechaRecogida.set(false);
   }
  }

  // Gestion sin fecha de recogida
  toggleSinFechaRecogida(): void {
    this.sinFechaRecogida.update(value => !value);
    if (this.sinFechaRecogida()) {
      this.fechaRecogida.set('');
      this.fechaPrevistaEntrega.set('');
    } else {
      const hoy = new Date().toISOString().split('T')[0];
      this.fechaRecogida.set(hoy);
      this.fechaPrevistaEntrega.set(hoy);
    }
  }

  // Cambia el estado para abrir/cerrar el acordeón inferior
  toggleHistorial() {
    this.mostrarHistorial.update(estado => !estado);
  }

  // === FLUJO DE ANTICIPOS (MODAL CENTRADO INTERACTIVO) ===

  responderSiAnticipo() {
  // 1. Buscamos el input que ya está renderizado en la pantalla actual
  const inputCebo = document.querySelector('.cebo-tactil-fijo') as HTMLInputElement;
  
  if (inputCebo) {
    inputCebo.focus();
    inputCebo.click();
  }

  // 2. Cambiamos inmediatamente el estado para mutar la interfaz al teclado numérico
  this.abrirTeclado('CANTIDAD_ANTICIPO');
}

  responderNoAnticipo() {
  const id = this.idOrdenPendienteAnticipo();
  
  if (id !== null) {
    // Cobro de 0€ para imprimir el resguardo físico directo de taller sin pagos previos
    this.cobrarAnticipoTicket(id, 0, this.metodoPagoSeleccionado());
    this.cerrarTeclado();
    this.idOrdenPendienteAnticipo.set(null);
  } else {
    this.uiService.mostrarToast('No hay ninguna orden pendiente para procesar.', 'error');
  }
}

  aplicarCantidadAnticipo() {
  const valor = this.valorTecladoEnConstruccion();
  const numImporte = parseFloat(valor) || 0;
  const id = this.idOrdenPendienteAnticipo();

  if (id !== null && numImporte > 0 && numImporte <= this.totalTicket()) {
    this.cobrarAnticipoTicket(id, numImporte, this.metodoPagoSeleccionado());
    this.cerrarTeclado();
    this.idOrdenPendienteAnticipo.set(null);
    this.mostrarModalPreguntaAnticipo.set(false);
  } else {
    this.uiService.mostrarToast(`Importe no válido. El máximo permitido es ${this.totalTicket()}€.`, 'warning');
  }
}

  ejecutarCobroDesdeTablet(event: Event) {
  // Evitamos que el formulario haga cosas raras por defecto
  event.preventDefault();

  // 1. Ocultamos el teclado nativo quitando el foco del input
  const inputCebo = document.querySelector('.cebo-tactil-fijo') as HTMLInputElement;
  if (inputCebo) {
    inputCebo.blur();
  }

  // 2. Llamamos exactamente a la misma función que tiene tu botón verde/azul
  // Viendo tu HTML anterior, la función es 'aplicarCantidadAnticipo()'
  this.aplicarCantidadAnticipo();
}


  // Lógica para lanzar la reimpresión del ticket seleccionado
  reimprimirTicket(ticket: OrdenDTO) {
    this.uiService.mostrarToast(`🖨️ Reenviando a impresora ticket #${ticket.numeroTicket}...`, 'success');
    
    // Llamamos a tu servicio pasándole la ID del ticket
    this.ordenService.imprimirTicket(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast(`🖨️ Reimprimiendo ticket térmico #${ticket.numeroTicket}`, 'success');
      },
      error: (err: any) => {
        console.error('Error al reimprimir:', err);
        this.uiService.mostrarToast('No se pudo recuperar el documento para imprimir.', 'error');
      }
    });
  }

  // Lógica para lanzar la reimpresión de la factura A4 oficial del ticket seleccionado
  reimprimirFacturaA4(ticket: OrdenDTO) {
    //VALIDACIÓN OBLIGATORIA: Evitamos facturas A4 a clientes anónimos
    const nombreCliente = ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General';
    if (nombreCliente === 'Cliente General') {
      this.uiService.mostrarToast('No se puede generar una factura formal A4 para una venta anónima. Debe registrar un cliente.', 'warning');
      return;
    }
    this.uiService.mostrarToast(`🖨️ Reenviando a impresora factura A4 del ticket #${ticket.numeroTicket}...`, 'success');
    this.ordenService.imprimirFacturaA4(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast(`🖨️ Factura A4 del ticket #${ticket.numeroTicket} reimpresa con éxito.`, 'success');
      },
      error: (err: any) => {
        console.error('Error al reimprimir factura A4:', err);
        this.uiService.mostrarToast('No se pudo recuperar el documento para imprimir.', 'error');
      }
    });
  }

  // Métodos para editar campos desde el modal de gestión de taller
  actualizarDescripcionLinea(index: number, nuevoTexto: string) {
    this.carrito.update(items => {
      const nuevosItems = [...items];
      nuevosItems[index] = {
        ...nuevosItems[index],
        articulo: { ...nuevosItems[index].articulo, nombre: nuevoTexto }
      };
      return nuevosItems;
    });
  }

  buscarArticuloTaller(index: number, texto: string) {
    this.carrito.update(items => {
      const nuevosItems = [...items];
      nuevosItems[index] = {
        ...nuevosItems[index],
        articulo: { ...nuevosItems[index].articulo, nombre: texto }
      };
      return nuevosItems;
    });
    this.busquedaArticuloTaller.set(texto);
    if (texto.trim().length >= 2) {
      this.filaBuscadorAbierto.set(index);
    } else {
      this.filaBuscadorAbierto.set(null);
    }
  }

  cerrarBuscadorTallerConDelay() {
    setTimeout(() => this.filaBuscadorAbierto.set(null), 200);
  }

  seleccionarArticuloTaller(index: number, articulo: any) {
    this.carrito.update(items => {
      const nuevosItems = [...items];
      nuevosItems[index] = {
        ...nuevosItems[index],
        articulo: { ...articulo },
        precioEditado: articulo.precioFinal
      };
      return nuevosItems;
    });
    this.filaBuscadorAbierto.set(null);
  }

  actualizarCantidadLinea(index: number, cambio: number) {
    this.ajustarCantidad(index, cambio);
  }

  actualizarPrecioLinea(index: number, evento: any) {
    const input = evento.target as HTMLInputElement;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor < 0) return;
    this.carrito.update(items => {
      const nuevosItems = [...items];
      nuevosItems[index] = { ...nuevosItems[index], precioEditado: valor };
      return nuevosItems;
    });
  }

  // Método para actualziar las notas del ticket
  actualizarNotaLinea(index: number, nuevoTexto: string) {
  this.carrito.update(items => {
    // Clonamos el array para cambiar la referencia
    const nuevosItems = [...items];
    // Clonamos el objeto de la línea para actualizar su propiedad
    nuevosItems[index] = {
      ...nuevosItems[index],
      notasMostrador: nuevoTexto
    };
    return nuevosItems;
  });
 }

  // Método para actualizar el descuento de una línea específica desde el input del HTML, que se aplica solo a esa línea
  actualizarDescuentoLinea(index: number, evento: any) {
    const input = evento.target as HTMLInputElement;
    let valor = parseFloat(input.value) || 0;
    
    // Validamos que el descuento esté entre 0 y 100
    if (valor < 0) valor = 0;
    if (valor > 100) valor = 100;

    this.carrito.update(items => 
      items.map((item, i) => i === index ? { ...item, porcentajeDescuento: valor } : item)
    );
  }

  // Abrir el modal de arqueo
  abrirCierreCaja(): void {
    this.router.navigate(['/caja']); 
  }

  // Aquí el método para abrir la caja, que se ejecuta al hacer clic en el botón "Abrir Caja"
  ejecutarAperturaCaja() {
    if (this.saldoInicialInput < 0) {
      this.uiService.mostrarToast('El saldo inicial no puede ser negativo', 'warning');
      return;
    }

    this.cajaService.abrirCaja(this.saldoInicialInput).subscribe({
      next: (caja) => {
        this.uiService.mostrarToast(`Caja abierta con un fondo de ${caja.saldoInicial}€`, 'success');
        this.saldoInicialInput = 0;
        // Al abrirse, el signal cajaActual del servicio se actualiza y el TPV se desbloquea solo
      },
      error: (err) => this.uiService.mostrarToast('Error al abrir caja: ' + (err.error || err.message), 'error')
    });
  }

  toggleTicket() {
  this.isTicketVisible.update(v => !v);
}

toggleCartPanel() {
  this.cartPanelAbierto.update(v => !v);
}

abrirKeypadPrecio(index: number) {
  // Si se usa una tablet Android
    if (isMobileOrTablet()) {
      return;
  }
  this.indiceItemEditandoPrecio.set(index);
  this.precioEnConstruccion.set(this.carrito()[index].precioEditado.toFixed(2));
}

pulsarTeclaPrecio(tecla: string) {
  const actual = this.precioEnConstruccion();
  if (tecla === '.' && actual.includes('.')) return; 
  if (actual.includes('.') && actual.split('.')[1].length >= 2) return;

  this.precioEnConstruccion.set(actual + tecla);
}

borrarUltimoDigitoPrecio() {
  const actual = this.precioEnConstruccion();
  if (actual.length > 0) {
    this.precioEnConstruccion.set(actual.slice(0, -1));
  }
}

guardarPrecioModificado() {
  const index = this.indiceItemEditandoPrecio();
  if (index === null) return;

  const nuevoPrecio = parseFloat(this.precioEnConstruccion() || '0');

  if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
    this.uiService.mostrarToast('El precio introducido no es válido.', 'warning');
    return;
  }

  this.carrito.update(items => {
    const copia = [...items];
    copia[index] = {
      ...copia[index],
      precioEditado: nuevoPrecio
    };
    return copia;
  });

  this.uiService.mostrarToast('Precio actualizado en el ticket', 'success');
  this.cerrarKeypadPrecio();
}

cerrarKeypadPrecio() {
  this.indiceItemEditandoPrecio.set(null);
  this.precioEnConstruccion.set('');
}

// === COMPONENTES EXTERNOS ===

abrirModal() {
  if (this.clientesComponent) {
    this.clientesComponent.abrirModal();
  } else {
    console.error('No se ha encontrado la referencia de <app-clientes> en la vista.');
  }
}

 limpiarFormularioMostrador() {
  this.carrito.set([]); // Vaciamos el carrito
  this.deseleccionarCliente(); // Volvemos a cliente general / anónimo
  this.tipoOrdenSeleccionada.set('VENTA_DIRECTA');
  this.metodoPagoSeleccionado.set('EFECTIVO');
 }

 asignarClienteEnMostrador(cliente: Cliente) {
  // Reutilizamos toda la lógica (guarda objeto, guarda ID y limpia búsquedas)
  this.seleccionarCliente(cliente);
  this.clienteSeleccionadoId.set(cliente.id);
 }

 // === MODO DEVOLUCION ===

 buscarTicketOriginal(): void {
  if (!this.numeroTicketBuscarInput.trim()) {
    this.uiService.mostrarToast('Introduce un número de ticket válido (ej. TCK-2600004).', 'warning');
    return;
  }

  this.uiService.mostrarToast('🔍 Buscando ticket en el sistema...', 'success');

  this.ordenService.buscarTicketParaDevolucion(this.numeroTicketBuscarInput.trim()).subscribe({
    next: (ticketDTO) => {
      if (ticketDTO.estadoPago === 'DEVUELTO') {
        this.uiService.mostrarToast(' Este ticket ya figura como totalmente devuelto.', 'error');
        return;
      }

      this.ticketOrigenEncontrado = ticketDTO;
      this.lineasSeleccionadasParaDevolver.clear();
      
      // 1. Mapeamos líneas de venta directa usando su 'articuloId'
      if (ticketDTO.lineasVentaDirecta) {
        ticketDTO.lineasVentaDirecta.forEach(linea => {
          const clave = linea.articuloId;
          this.lineasSeleccionadasParaDevolver.set(linea.articuloId, {
            checked: false,
            cantidadADevolver: linea.cantidad
          });
        });
      }
      // 2. Mapeamos trabajos de taller (usamos su ID de línea si no tienen articuloId)
      if (ticketDTO.trabajosTaller) {
        ticketDTO.trabajosTaller.forEach(trabajo => {
          this.lineasSeleccionadasParaDevolver.set(trabajo.id, {
            checked: false,
            cantidadADevolver: trabajo.cantidadMaterial || 1
          });
        });
      }
      this.mostrarModalSeleccionDevolucion = true;
    },
    error: (err) => {
      console.error(err);
      this.uiService.mostrarToast('No se encontró el ticket original o no es válido para abonar.', 'error');
    }
  });
 }

 ejecutarDevolucionSeleccionada(): void {
  const ticket = this.ticketOrigenEncontrado;
  if (!ticket) return;

  const lineasDevolucionPayload: any[] = [];

  this.lineasSeleccionadasParaDevolver.forEach((control, clave) => {
    if (control.checked && control.cantidadADevolver > 0) {
      
      // 1. Comprobamos si la clave corresponde a una línea de venta directa (articuloId)
      const esVentaDirecta = ticket.lineasVentaDirecta?.some(l => l.articuloId === clave);

      if (esVentaDirecta) {
        lineasDevolucionPayload.push({
          articuloId: clave, // Es el ID del artículo físico
          cantidad: control.cantidadADevolver
        });
      } else {
        // 2. Si no es venta, asumimos que es un servicio o trabajo de taller usando su ID de línea
        lineasDevolucionPayload.push({
          trabajoId: clave,
          cantidad: control.cantidadADevolver
        });
      }
    }
  });

  if (lineasDevolucionPayload.length === 0) {
    this.uiService.mostrarToast('Selecciona algún elemento para el abono.', 'warning');
    return;
  }

  this.uiService.mostrarToast('Generando abono parcial enlazado (DEV-)...', 'success');

  const requestDevolucion: DevolucionRequest = {
    ordenOrigenId: ticket.id,
    metodoPago: this.metodoPagoSeleccionado(),
    lineas: lineasDevolucionPayload
  };

  this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
    next: (res: OrdenDTO) => {
      this.uiService.mostrarToast(`✅ Abono rectificativo ${res.numeroTicket} emitido.`, 'success');
      
      // HIGIENE DE MEMORIA ANTES DE ASIGNAR NUEVO BLOB
      this.limpiarMemoriaBlobUrl();
      
      // Inyectamos las referencias para que el iframe imprima el PDF térmico del DEV-
      this.idOperacionProcesada.set(res.id);
      this.procesarPostCobroCompleto(res);
      this.mostrarModalSeleccionDevolucion = false;
      this.ticketOrigenEncontrado = null;
      this.horaTicketActual.set(new Date().toLocaleTimeString());

      // Pintamos visualmente el abono generado en tu historial
      const ticketAbonoHistorial: OrdenDTO = {
        ...res,
        clienteNombre: res.clienteNombre || ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General'
      };

      this.historialTickets.update(tickets => [ticketAbonoHistorial, ...tickets]);

      // Abrimos visor térmico
      this.isTicketVisible.set(true);
      this.generarYPrevisualizarTicket();

      // Resetear estados del flujo y limpiar mostrador
      this.mostrarModalSeleccionDevolucion = false;
      this.ticketOrigenEncontrado = null;
      this.numeroTicketBuscarInput = '';
      this.limpiarFormularioMostrador();
      this.cargarHistorialTurno();
    },
    error: (err) => {
      console.error(err);
      this.uiService.mostrarToast('Error legal al registrar el abono: ' + (err.error?.message || 'Rechazado por el servidor'), 'error');
    }
  });
}

 // Al pulsar el botón de la cabecera, abrimos el minimodal
 pedirNumeroTicketDevolucion() {
  this.numeroTicketBuscarInput = ''; // Se lo dejamos preescrito para ahorrar clics
  this.mostrarModalPedirTicket = true;
 }

 // Nueva función puente para cuando el zapatero pincha directamente en un ticket de la lista
seleccionarTicketDirecto(ticket: any) {
  if (!ticket.numeroTicket) return;
  
  // 1. Seteamos el input con el número del ticket seleccionado
  this.numeroTicketBuscarInput = ticket.numeroTicket;
  
  // 2. Cerramos este modal de selección intermedia
  this.mostrarModalPedirTicket = false;
  
  // 3. Ejecutamos tu método nativo de búsqueda para que valide y abra el modal de abono parcial
  this.buscarTicketOriginal();
 }

// Al darle a "Buscar" o pulsar Enter, cerramos este paso y llamamos al buscador real
confirmarTicketIntroducido() {
 let valorInput = this.numeroTicketBuscarInput.trim();

  if (valorInput) {
    // Si el zapatero NO ha escrito "TCK-", se lo añadimos nosotros automáticamente por código
    if (!valorInput.toUpperCase().startsWith('TCK-')) {
      valorInput = `TCK-${valorInput}`;
    }

    // Guardamos el valor completo con el prefijo en la variable para que tu backend lo entienda
    this.numeroTicketBuscarInput = valorInput.toUpperCase();

    // Cerramos el modal y lanzamos tu buscador original nativo del TPV
    this.mostrarModalPedirTicket = false;
    this.buscarTicketOriginal();
  }
 }

 // Método para limpiar el carrito y resetear estados después de finalizar una venta o reparación
  private limpiarCarrito() {
    this.carrito.set([]);
    this.deseleccionarCliente();
    this.clienteSeleccionado.set(null);
    this.clienteSeleccionadoId.set(null);
    this.busquedaCliente.set('');
    this.clientesEncontrados.set([]);
    this.fechaRecogida.set('');
    this.sinFechaRecogida.set(false);
    this.notasGenerales.set('');
    this.tipoOrdenSeleccionada.set('VENTA_DIRECTA');
    this.categoriaSeleccionada.set('TODOS');
    this.metodoPagoSeleccionado.set('EFECTIVO');
    this.numeroTicketActual.set('TKT-PROVISIONAL');
    this.horaTicketActual.set('');
  }

  // === GESTIÓN DEL TECLADO VIRTUAL ===

  abrirTeclado(objetivo: any, index: number | null = null, maxCantidad: number = 1) {
   // Si estás en tablet y no es la pregunta de anticipo, nos saltamos el teclado virtual
   if (objetivo !== 'PREGUNTA_ANTICIPO' && isMobileOrTablet()) return;

    this.inputActivo.set(objetivo);
    this.indiceLineaTemporal.set(index);
    this.maxUnidadesPermitidas = maxCantidad;
    this.mayusculas.set(objetivo !== 'DESCUENTO' && objetivo !== 'DESCUENTO_MANUAL' && objetivo !== 'NUMERO_CANTIDAD' && objetivo !== 'APERTURA_CAJA' && objetivo !== 'PRECIO_LINEA' && objetivo !== 'CANTIDAD_ANTICIPO');

    // Inicializamos el buffer con el valor que ya tenga el campo
    if (objetivo === 'PRODUCTO') this.valorTecladoEnConstruccion.set(this.busquedaArticulo());
    else if (objetivo === 'CLIENTE') this.valorTecladoEnConstruccion.set(this.busquedaCliente());
    else if (objetivo === 'NOTAS_GENERALES') this.valorTecladoEnConstruccion.set(this.notasGenerales());
    else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item ? item.porcentajeDescuento.toString() : '');
    } else if (objetivo === 'NOTAS_MOSTRADOR' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item?.notasMostrador || '');
    } else if (objetivo === 'NUMERO_TICKET') this.valorTecladoEnConstruccion.set(this.numeroTicketBuscarInput);
    else if (objetivo === 'NUMERO_CANTIDAD' && index !== null) {
      const control = this.lineasSeleccionadasParaDevolver.get(index);
      this.valorTecladoEnConstruccion.set(control ? control.cantidadADevolver.toString() : '1');
    } else if (objetivo === 'CANTIDAD_ANTICIPO') {
      this.valorTecladoEnConstruccion.set(this.importeAnticipo.toString());
    } else if (objetivo === 'PRECIO_LINEA' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item ? (item.precioEditado || 0).toString() : '0');
    } else if (objetivo === 'DESCRIPCION_LINEA' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item?.articulo?.nombre || '');
    } else if (objetivo === 'DESCRIPCION_BULTO_LINEA' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item?.descripcionBulto || '');
    } else {
      this.valorTecladoEnConstruccion.set(''); // Para anticipos o aperturas de caja vacíos
    }

    this.mostrarTeclado.set(true);
  }

  escribirTeclado(tecla: string) {
    const actual = this.valorTecladoEnConstruccion();
    const objetivo = this.inputActivo();

    // Filtros numéricos para dinero o porcentajes
    if (['DESCUENTO', 'DESCUENTO_MANUAL', 'CANTIDAD_ANTICIPO', 'APERTURA_CAJA', 'NUMERO_TICKET', 'NUMERO_CANTIDAD', 'PRECIO_LINEA'].includes(objetivo)) {
      if (tecla === '.' && actual.includes('.')) return;
      if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
      if (tecla !== '.' && isNaN(Number(tecla))) return;
    }

    // Procesar mayúsculas/minúsculas si es texto
    let teclaProcesada = tecla;
    if (tecla !== '.' && isNaN(Number(tecla))) {
      teclaProcesada = this.mayusculas() ? tecla.toUpperCase() : tecla.toLowerCase();
    }

    this.valorTecladoEnConstruccion.set(actual + teclaProcesada);
    this.actualizarCamposEnTiempoReal();
  }

  borrarUltimoCaracter() {
    const actual = this.valorTecladoEnConstruccion();
    if (actual.length > 0) {
      this.valorTecladoEnConstruccion.set(actual.slice(0, -1));
      this.actualizarCamposEnTiempoReal();
    }
  }

  limpiarTeclado() {
    this.valorTecladoEnConstruccion.set('');
    this.actualizarCamposEnTiempoReal();
  }

  insertarEspacio() { // Mapeado a (click)="insertarEspacio()" en tu HTML
    this.valorTecladoEnConstruccion.set(this.valorTecladoEnConstruccion() + ' ');
    this.actualizarCamposEnTiempoReal();
  }

  alternarMayusculas() {
    this.mayusculas.update(m => !m);
  }

  cerrarTeclado() {
    const objetivo = this.inputActivo();
    const resultado = this.valorTecladoEnConstruccion();

    // Acciones especiales al pulsar "ACEPTAR" o cerrar
    if (objetivo === 'CANTIDAD_ANTICIPO') {
      this.aplicarCantidadAnticipo();
      this.mostrarTeclado.set(false);
      this.inputActivo.set('PRODUCTO');
      this.valorTecladoEnConstruccion.set('');
    } else if (objetivo === 'APERTURA_CAJA') {
      this.saldoInicialInput = parseFloat(resultado) || 0;
      this.ejecutarAperturaCaja();
    } else if (objetivo === 'NUMERO_TICKET') {
      this.numeroTicketBuscarInput = resultado;
      this.confirmarTicketIntroducido();
    }

    // Resetear estados del teclado
    this.mostrarTeclado.set(false);
    this.inputActivo.set('');
    this.valorTecladoEnConstruccion.set('');
    this.indiceLineaTemporal.set(null);
  }

  private actualizarCamposEnTiempoReal() {
    const valor = this.valorTecladoEnConstruccion();
    const objetivo = this.inputActivo();
    const index = this.indiceLineaTemporal();

    if (objetivo === 'PRODUCTO') this.busquedaArticulo.set(valor);
    else if (objetivo === 'CLIENTE') this.buscarClientes(valor);
    else if (objetivo === 'NOTAS_GENERALES') this.notasGenerales.set(valor);
    else if (objetivo === 'NUMERO_TICKET') this.numeroTicketBuscarInput = valor;
    // Volcado directo al Carrito (Descuentos y Notas de Reparación del zapatero)
    else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
      let num = parseFloat(valor) || 0;
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, porcentajeDescuento: num > 100 ? 100 : num } : item));
    } else if (objetivo === 'NOTAS_MOSTRADOR' && index !== null) {
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, notasMostrador: valor } : item));
    } else if (objetivo === 'NOTAS_REPARACION') {
      this.notaLineaEnConstruccion.set(valor);
    } else if (objetivo === 'DESCRIPCION_BULTO') {
      this.descripcionBultoEnConstruccion.set(valor);
    } else if (objetivo === 'DESCRIPCION_LINEA' && index !== null) {
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, articulo: { ...item.articulo, nombre: valor } } : item));
    } else if (objetivo === 'DESCRIPCION_BULTO_LINEA' && index !== null) {
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, descripcionBulto: valor } : item));
    } else if (objetivo === 'PRECIO_LINEA' && index !== null) {
      let num = parseFloat(valor) || 0;
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, precioEditado: num < 0 ? 0 : num } : item));
    } else if (objetivo === 'CANTIDAD_ANTICIPO') {
      const num = parseFloat(valor) || 0;
      this.importeAnticipo = num < 0 ? 0 : num;
    } else if (objetivo === 'NUMERO_CANTIDAD' && index !== null) {
      let num = parseInt(valor, 10) || 0;
      if (num > this.maxUnidadesPermitidas) {
        num = this.maxUnidadesPermitidas;
        this.valorTecladoEnConstruccion.set(num.toString());
      }
      const control = this.lineasSeleccionadasParaDevolver.get(index);
      if (control) control.cantidadADevolver = num;
    }
  }

  pulsarNumpadAnticipo(digito: string): void {
  const actual = this.valorAnticipoFijo();

  // Evitar meter más de un punto decimal
  if (digito === '.' && actual.includes('.')) return;
  // Limitar a un máximo de 2 decimales para dinero (céntimos)
  if (actual.includes('.') && actual.split('.')[1].length >= 2) return;

  // Evitar meter números ridículamente grandes que superen el total del ticket
  const nuevoValor = actual + digito;
  if (parseFloat(nuevoValor) > this.totalTicket()) {
    this.uiService.mostrarToast(`El anticipo no puede superar el total del ticket (${this.totalTicket()}€).`, 'warning');
    return;
  }

  this.valorAnticipoFijo.set(nuevoValor);
}

borrarNumpadAnticipo(): void {
  const actual = this.valorAnticipoFijo();
  if (actual.length > 0) {
    this.valorAnticipoFijo.set(actual.slice(0, -1));
  }
}

limpiarNumpadAnticipo(): void {
  this.valorAnticipoFijo.set('');
}

// Acción del botón verde "CONFIRMAR ANTICIPO"
confirmarAnticipoConNumpad(): void {
  const id = this.idOrdenPendienteAnticipo();
  const importe = parseFloat(this.valorAnticipoFijo() || '0');

  if (id !== null && importe > 0) {
    const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
    
    // Procesamos el cobro real hacia Java
    this.cobrarAnticipoTicket(id, importe, metodoPagoSeguro);
    
    // Reseteamos y cerramos todo
    this.mostrarModalPreguntaAnticipo.set(false);
    this.valorAnticipoFijo.set('');
    this.idOrdenPendienteAnticipo.set(null);
  } else {
    this.uiService.mostrarToast('Por favor, introduce un importe válido.', 'warning');
  }
 }

}