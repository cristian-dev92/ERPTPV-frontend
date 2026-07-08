import { Component, inject, OnInit, signal, computed, ViewChild, HostListener } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO, DetalleOrdenDTO } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe, DatePipe, NgClass, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { UiService } from '../../../core/services/ui.service';
import { HttpClient } from "@angular/common/http";
import { ClientesComponent } from '../../clientes/clientes';
import { Router } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { isMobileOrTablet } from '../../../core/utils/device-utils';

// Definición de Tipo Estricto para Métodos de Pago
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO';

// Interfaz para representar clientes en el TPV (puede ser extendida según necesidades)
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email?: string;
}

// Interfaz que extiende NuevaLineaDTO para incluir el nombre y precio del artículo, facilitando la visualización en el TPV
export interface ItemCarrito extends NuevaLineaDTO {
  articuloId: number;
  nombre: string;
  tipo: 'PRODUCTO' | 'SERVICIO';
  cantidad: number;
  precio: number;
  porcentajeDescuento: number;
  notasReparacion?: string | null;
  mostrarBocadilloNota?: boolean;
}

// Interfaz para representar la información que devuelve el back al cerrar un recibo con AEAT, que luego se muestra en el TPV para que el cajero pueda verificarlo
export interface InfoVerifaktu {
  qr: string;
  ref: string;
  total: number;
  fecha: string;
}

export interface OrdenDTO {
  id: number;
  numeroTicket: string;
  total: number;
  tipo?: 'VENTA_DIRECTA' | 'REPARACION' | 'DEVOLUCION';
  
  // === Campos de compatibilidad Front / Fechas ===
  fecha?: Date | string;
  createdAt?: string | Date;       
  fechaCreacion?: string | Date; // LocalDateTime de Java

  // === Campos de Cliente e Historial ===
  cliente?: { nombre: string } | null;
  clienteNombre?: string;     
  clienteTelefono?: string;   
  clienteId?: number | null;
  empleadoNombre?: string;       

  // === Desgloses Económicos y de Caja (Fundamentales de Java) ===
  totalBaseImponible?: number;   // Suma de bases sin IVA
  totalIva?: number;             // Suma de cuotas de IVA
  importePagado?: number;        // Lo que ya ha dejado en caja el cliente
  importePendiente?: number;     // Lo que le queda por pagar (Total - Pagado)

  // === Estados de Negocio ===
  estadoAeat?: 'ENVIADO' | 'PENDIENTE' | string; // Añadimos string por flexibilidad con VeriFactu
  estadoPago?: 'PAGADO' | 'PARCIAL' | 'PENDIENTE' | 'CANCELADO' | 'DEVOLUCION' | string;
  estadoTaller?: 'NO_APLICA' | 'EN_TALLER' | 'LISTO' | 'ENTREGADO' | 'CANCELADO' | string; 

  // === Líneas e Información Taller ===
  notasReparacion?: string;      // Nota rápida para las tarjetas del TPV
  detalles?: DetalleOrdenDTO[];  // La lista de artículos reales del ticket
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, ClientesComponent, NgClass, DecimalPipe],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})

export class TpvComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);
  private clienteService = inject(ClienteService);
  public uiService = inject(UiService);
  private http: HttpClient = inject(HttpClient);
  private bufferCodigoBarras: string = '';
  private ultimaPulsacion: number = 0;
  private router = inject(Router);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  public Math = Math;
  @ViewChild(ClientesComponent) clientesComponent!: ClientesComponent;

  // === SIGNALS DEL TPV ===
  carrito = signal<ItemCarrito[]>([]);
  historialTickets = signal<OrdenDTO[]>([]);
  clienteSeleccionado = signal<Cliente | null>(null);
  clienteSeleccionadoId = signal<number | null>(null);
  busquedaCliente = signal<string>('');
  clientesEncontrados = signal<Cliente[]>([]);
  
  fechaRecogida = signal<string>('');
  sinFechaRecogida = signal<boolean>(false);
  descuentoGlobal = signal<number>(0);
  metodoPagoSeleccionado = signal<MetodoPago>('EFECTIVO');
  mostrarModalMetodosPago = false;
  mostrarModalPreguntaAnticipo = signal<boolean>(false);
  opcionesMetodosPago: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'BIZUM','TRANSFERENCIA', 'OTRO'];
  mostrarHistorial = signal<boolean>(false);

  // Estados de PDF e Impresión
  idOperacionProcesada = signal<number | null>(null);
  numeroTicketActual = signal<string>('TKT-PROVISIONAL');
  horaTicketActual = signal<string>('');
  datosFacturaAeat = signal<any>(null);
  isTicketVisible = signal<boolean>(false);
  cargandoPDF = signal<boolean>(false);
  urlSeguraPdf = signal<SafeResourceUrl>(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
  private rawBlobUrl: string | null = null; // Para liberar memoria

  // Modales y Flujos Especiales
  mostrarModalPedirTicket = false;
  mostrarModalSeleccionDevolucion = false;
  mostrarModalSeleccionPago = signal<boolean>(false); // Modificado para casar con el HTML
  ticketOrigenEncontrado: OrdenDTO | null = null;
  numeroTicketBuscarInput: string = '';
  idOrdenPendienteAnticipo = signal<number | null>(null);
  saldoInicialInput: number = 0;
  valorAnticipoFijo = signal<string>('');
  parseFloat = parseFloat;

  // Estado del modal de teclado virtual / edición unificada de línea
  indiceItemEditandoLinea = signal<number | null>(null);
  modoCampoEdicionActivo = signal<'PRECIO' | 'DESCUENTO'>('PRECIO');
  precioLineaEnConstruccion = signal<string>('');
  descuentoLineaEnConstruccion = signal<string>('');
  notaLineaEnConstruccion = signal<string>('');

  // Variables auxiliares para flujos genéricos heredados
  tipoOrdenSeleccionada = signal<TipoOrden>('VENTA_DIRECTA');

  // Estados del catalogo tactil
  articulos = signal<Articulo[]>([]); // Lista completa de artículos cargada desde el backend
  categoriaSeleccionada = signal<'TODOS' | 'PRODUCTO' | 'SERVICIO'>('TODOS');
  busquedaArticulo = signal<string>('');

  // --- ESTADO PARA MODIFICAR PRECIOS CON EL KEYPAD ---
  indiceItemEditandoPrecio = signal<number | null>(null);
  precioEnConstruccion = signal<string>(''); // Guarda los dígitos que pulsa el usuario (ej:

  // Estado del carrito de compra y caja
  indiceLineaDescuentoActual = signal<number | null>(null); // Para saber a qué línea se le está aplicando un descuento manual específico

  // Comprobación segura de caja abierta (computed reacciona al signal del servicio)
  cajaActual = this.cajaService.cajaActual;
  cajaAbierta = computed(() => !!this.cajaService.cajaActual());

  // === ESTADOS PARA EL TECLADO TÁCTIL GENERAL ===
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>(''); // Aquí meteremos 'ARTICULO', 'CLIENTE', 'NOTAS_REPARACION', etc.
  mayusculas = signal<boolean>(true);
  valorTecladoEnConstruccion = signal<string>('');

  // Distribución de teclas idéntica a tu diseño favorito del TPV
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaAcentos = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];

  // Guardamos estos dos de tu lógica anterior para saber qué línea del carrito se está editando
  indiceLineaTemporal = signal<number | null>(null);
  maxUnidadesPermitidas = 1;

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

  // Estados para el nuevo modal interactivo de devolución parcial
  lineasSeleccionadasParaDevolver: Map<number, { checked: boolean, cantidadADevolver: number }> = new Map();

  // Variables de control añadidas a tu componente para rastrear qué línea de devolución editamos
  idLineaDevolucionActual: number | null = null;;
  maxUnidadesLineaActual: number = 1;
 
  // === COMPUTED SIGNALS ===
  totalTicket = computed(() => {
    let subtotal = this.carrito().reduce((sum, item) => {
      const precioConDtoLinea = item.precio * (1 - (item.porcentajeDescuento / 100));
      return sum + (precioConDtoLinea * item.cantidad);
    }, 0);
    const descGlobal = this.descuentoGlobal();
    return subtotal * (1 - (descGlobal / 100));
  });

  // === MÉTODOS DEL CORE TPV ===
  tieneServicioEnCarrito(): boolean {
    return this.carrito().some(item => item.tipo?.toUpperCase() === 'SERVICIO');
  }

  ajustarCantidad(index: number, cambio: number): void {
    this.carrito.update(items => items.map((item, i) => {
      if (i === index) {
        const nuevaCant = item.cantidad + cambio;
        return { ...item, cantidad: nuevaCant < 1 ? 1 : nuevaCant };
      }
      return item;
    }));
  }

  quitarDelCarrito(index: number): void {
    this.carrito.update(items => items.filter((_, i) => i !== index));
    this.uiService.mostrarToast('Artículo eliminado del carrito.', 'success');
  }

  // Ejecuta la apertura del modal intermedio de selección de pago
  ejecutarProcesarYFacturar(): void {
    if (this.carrito().length === 0) return;

    const tipoActual = this.tipoOrdenSeleccionada();

    // 🛡️ 1. CONTROL DE SEGURIDAD: CLIENTE OBLIGATORIO
    if (tipoActual !== 'VENTA_DIRECTA' && !this.clienteSeleccionado()) {
      this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
      return;
    }

    // 🛡️ 2. CONTROL DE SEGURIDAD: FECHA DE RECOGIDA OBLIGATORIA
    if (tipoActual === 'REPARACION' && !this.sinFechaRecogida() && !this.fechaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
      return;
    }

    this.mostrarModalSeleccionPago.set(true);
  }

  // Al pinchar sobre un método de pago en el modal táctil
  procesarVentaConMetodo(metodo: MetodoPago): void {
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
    if (this.carrito().length > 0) {
      const tipoActual = this.tipoOrdenSeleccionada();

      // 🛡️ 1. CONTROL DE SEGURIDAD: CLIENTE OBLIGATORIO
      if (tipoActual !== 'VENTA_DIRECTA' && !this.clienteSeleccionado()) {
        this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
        return;
      }

      // 🛡️ 2. CONTROL DE SEGURIDAD: FECHA DE RECOGIDA OBLIGATORIA
      if (tipoActual === 'REPARACION' && !this.sinFechaRecogida() && !this.fechaRecogida()) {
        this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
        return;
      }

      this.mostrarModalSeleccionPago.set(true);
    }
  }

  // Filtrado de artículos en tiempo real
  articulosFiltrados = computed(() => {
    const listaOriginal = this.articulos();
    const categoria = this.categoriaSeleccionada();
    const texto = this.busquedaArticulo().toLowerCase().trim();

    return listaOriginal.filter(art => {
      const coincideCategoria = (categoria === 'TODOS') || (art.tipo === categoria);
      const coincideTexto = art.nombre.toLowerCase().includes(texto);
      return coincideCategoria && coincideTexto;
    });
  });

  // Estado para controlar la visibilidad del ticket de venta al finalizar la compra, que se muestra solo en tablets y móviles
  idTicketOrigenDevolucion =signal<number | null>(null);

  // Estados para controlar el proceso de devolución manual sin ticket, que se activa al hacer clic en el botón rojo de "Devolución Manual"
  mostrarModalDevolucion = false;
  mensajeModalDevolucion = '';
  ticketParaDevolver: OrdenDTO | null = null;          

  // Método que se ejecuta al cargar el componente, ideal para cargar los artículos y comprobar el estado de la caja
  ngOnInit() {
    // Cargamos el historial de tickets del día para mostrar en el panel inferior del TPV
    this.ordenService.getOrdenesPorEstado('TODAS').subscribe(data => this.historialTickets.set(data));
    // Cargamos artículos
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
    // Comprobamos si la caja ya estaba abierta
    this.cajaService.checkEstadoCaja().subscribe({
      error: (err: any) => console.error("Error al verificar estado de caja inicial en TPV", err)
    });
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

  // Método para agregar un artículo al carrito, que se ejecuta al hacer clic en el botón "Agregar al Carrito" de cada artículo
  agregarAlCarrito(articulo: Articulo) {
    // 1. Extraemos y aseguramos el ID en una constante local de tipo 'number'
    const idSeguro = articulo.id;
    if (idSeguro === undefined || idSeguro === null) {
      console.error('No se puede añadir un artículo sin ID al carrito');
      return;
    }

    // CONTROL AUTOMÁTICO: Si metemos mano de obra/taller, cambiamos la operación a REPARACIÓN inmediatamente
    if (articulo.tipo === 'SERVICIO') {
      this.tipoOrdenSeleccionada.set('REPARACION');
    }

    this.carrito.update((items: ItemCarrito[]): ItemCarrito[] => {
      // 1. Usamos la constante local que TypeScript ya sabe que es 100% number
      const existe = items.find(item => item.articuloId === idSeguro);
    
      if (existe) {
        return items.map(item => 
          item.articuloId === idSeguro 
            ? { ...item, cantidad: item.cantidad + 1 } 
            : item
        );
      }
    
      // 2. Creamos el nuevo item forzando explícitamente el tipo ItemCarrito
      const nuevoItem: ItemCarrito = {
        articuloId: idSeguro,
        nombre: articulo.nombre,
        cantidad: 1,
        precio: articulo.precioFinal,
        porcentajeDescuento: 0, 
        notasReparacion: null, 
        tipo: articulo.tipo
      };
    
      return [...items, nuevoItem];
    });
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

    // 2. CORREGIDO: VALIDACIÓN ESTRICTA DE CLIENTE (Evita que pase si no es VENTA_DIRECTA)
    const tipoActual = this.tipoOrdenSeleccionada();
    if (tipoActual !== 'VENTA_DIRECTA' && !this.clienteSeleccionado()) {
      this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
      return;
    }

    // 3. Validación de fecha de recogida para reparaciones
    if (tipoActual === 'REPARACION' && !this.sinFechaRecogida() && !this.fechaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
      return;
    }

    // Construimos la petición cumpliendo con la interfaz estricta NuevaOrdenDTO
    const request: NuevaOrdenDTO = {
      empresaId: 1,  
      empleadoId: 2, 
      clienteId: this.clienteSeleccionadoId(),
      tipo: tipoActual,
      fechaPrometidaRecogida: tipoActual === 'REPARACION' && !this.sinFechaRecogida() ? this.fechaRecogida() : null,
      descuentoGlobal: this.descuentoGlobal() || 0,
      lineas: this.carrito().map(item => ({
        articuloId: item.articuloId,
        cantidad: item.cantidad,
        precioUnitario: item.precio, 
        porcentajeDescuento: item.porcentajeDescuento || 0, 
        notasReparacion: item.notasReparacion || null 
      }))
    };

    this.ordenService.crearOrden(request).subscribe({
      next: (ordenGuardada) => {
        // Dependiendo del tipo de orden y la configuración, decidimos el flujo de cobro:
        if (tipoActual === 'VENTA_DIRECTA') {
          this.cobrarTicketCompleto(ordenGuardada.id);
        } else {
          // Guardamos la ID devuelta por Java
          this.idOrdenPendienteAnticipo.set(ordenGuardada.id);
          
          // 🌟 INDEPENDIENTE: Abrimos el modal de la pregunta directamente sin tocar el teclado virtual
          this.mostrarModalPreguntaAnticipo.set(true);
        }
      },
      error: (err) => {
        console.error('Error completo del backend:', err);
        let mensajeDetallado = 'Error desconocido al crear el ticket.';
        if (err.error) {
          if (typeof err.error === 'string') mensajeDetallado = err.error;
          else if (err.error.message) mensajeDetallado = err.error.message;
          else if (err.message) mensajeDetallado = err.message;
        } else if (err.message) {
          mensajeDetallado = err.message;
        }
        this.uiService.mostrarToast('🚫 Fallo en Servidor: ' + mensajeDetallado, 'error');
      }
    });
  }

  // Métodos privados para manejar los flujos de cobro según la selección del cajero
  private cobrarTicketCompleto(id: number) {
    this.ordenService.cobrar(id, this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO').subscribe({
      next: (res) => {
        this.uiService.mostrarToast('💰 ¡Venta cobrada al 100% correctamente en Caja!', 'success');
        // Guardamos la referencia de operación/ID para la llamada del PDF
        this.idOperacionProcesada.set(id);

        // Actualizamos el número de ticket y la hora para mostrarlos en el recibo de venta
        this.numeroTicketActual.set(res.numeroTicket);
        this.horaTicketActual.set(new Date().toLocaleTimeString());

        // === NUEVO: INSERTAR EL TICKET EN EL HISTORIAL INFERIOR ===
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
          next: (ticketsActualizados) => {
            this.historialTickets.set(ticketsActualizados);
          }
        });

          // Módulo Veri*Factu
          this.datosFacturaAeat.set({
            qr: '',
            ref: res.numeroFTicket, 
            total: this.totalTicket(),
            fecha: new Date().toLocaleTimeString()
          });
        // Mostramos el ticket de venta con el PDF previsualizado para que el cajero pueda imprimirlo o revisarlo antes de cerrar el recibo
        this.isTicketVisible.set(true);
        // Lanzamos la generación del PDF ahora que tenemos ID y datos cargados
        this.generarYPrevisualizarTicket();
        // REFRESCAR STOCK: Añadido aquí para ventas directas
        this.cargarCatalogo();
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar el pago: ' + (err.error || err.message), 'error')
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
        fecha: new Date().toISOString() // 🟢 Mejora 3: ISO Estricto para AEAT
      });

      this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
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
          fecha: new Date().toISOString() // 🟢 Mejora 3: ISO Estricto para AEAT
        });
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
          next: (ticketsActualizados: any) => this.historialTickets.set(ticketsActualizados)
        });
        this.isTicketVisible.set(true);
        this.generarYPrevisualizarTicket();
        this.cargarCatalogo();
      },
      error: (err: any) => this.uiService.mostrarToast('Error al registrar el anticipo: ' + (err.error || err.message), 'error')
    });
  }

  /* 🖨️ Función para obtener el PDF del Backend y meterlo en la previsualización */
  generarYPrevisualizarTicket(): void {
    const idOrden = this.idOperacionProcesada();
    if (!idOrden) {
      this.uiService.mostrarToast('No se encontró ninguna ID de operación activa.', 'error');
      return;
    }

    this.cargandoPDF.set(true);
    this.ordenService.getTicketPdf(Number(idOrden)).subscribe({
      next: (blob: Blob) => {
        this.limpiarMemoriaBlobUrl();
        // Creamos una URL segura a partir del binario recibido
        const blobUrl = window.URL.createObjectURL(blob);
        // Blindamos la URL aquí mismo diciéndole a Angular que confíe en este Blob
        const urlSaneada = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
        this.urlSeguraPdf.set(urlSaneada);
        this.cargandoPDF.set(false);
        this.uiService.mostrarToast('📄 Ticket generado. Listo para revisión o impresión.', 'success');
      },
      error: (err) => {
        console.error('Error al generar PDF del ticket:', err);
        this.uiService.mostrarToast('No se pudo generar el documento térmico de 80mm.', 'error');
        this.cargandoPDF.set(false);
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
    const fechaSegura = ticket.fechaCreacion || ticket.fecha || ticket['createdAt'] || new Date();
    this.horaTicketActual.set(new Date(fechaSegura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    this.ordenService.getFacturaPdf(ticket.id).subscribe({
      next: (blob: Blob) => {
        // Generamos la URL del binario recibido y forzamos la descarga del PDF oficial A4
        const blobUrl = window.URL.createObjectURL(blob);
        // Saneamos la URL para que Angular permita incrustarla en el iframe seguro
        const urlSaneada = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
        this.urlSeguraPdf.set(urlSaneada);
        this.cargandoPDF.set(false);
        this.uiService.mostrarToast('📄 Factura A4 generada. Lista para revisión.', 'success');
      },
      error: (err) => {
        console.error('Error al previsualizar A4 desde historial:', err);
        this.uiService.mostrarToast('Error al recuperar la factura oficial del servidor.', 'error');
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

  private limpiarMemoriaBlobUrl() {
    if (this.rawBlobUrl) {
      window.URL.revokeObjectURL(this.rawBlobUrl);
      this.rawBlobUrl = null;
    }
  }

  // === MODAL UNIFICADO DE EDICIÓN DE LÍNEA (HTML MOCKUP) ===

  abrirModalEdicionLinea(index: number) {
    const item = this.carrito()[index];
    this.indiceItemEditandoLinea.set(index);
    this.modoCampoEdicionActivo.set('PRECIO');
    this.precioLineaEnConstruccion.set(item.precio.toString());
    this.descuentoLineaEnConstruccion.set(item.porcentajeDescuento.toString());
    this.notaLineaEnConstruccion.set(item.notasReparacion || '');
  }

  pulsarTeclaEdicionLinea(tecla: string) {
    const modo = this.modoCampoEdicionActivo();
    const signalAEditar = modo === 'PRECIO' ? this.precioLineaEnConstruccion : this.descuentoLineaEnConstruccion;
    const actual = signalAEditar();

    if (tecla === '.' && actual.includes('.')) return;
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;

    signalAEditar.set(actual + tecla);
  }

  borrarUltimoDigitoEdicionLinea() {
    const modo = this.modoCampoEdicionActivo();
    const signalAEditar = modo === 'PRECIO' ? this.precioLineaEnConstruccion : this.descuentoLineaEnConstruccion;
    const actual = signalAEditar();
    if (actual.length > 0) {
      signalAEditar.set(actual.slice(0, -1));
    }
  }

  guardarCambiosLineaUnificada() {
    const index = this.indiceItemEditandoLinea();
    if (index === null) return;

    const nuevoPrecio = parseFloat(this.precioLineaEnConstruccion() || '0');
    let nuevoDto = parseFloat(this.descuentoLineaEnConstruccion() || '0');

    if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
      this.uiService.mostrarToast('El precio introducido no es válido.', 'warning');
      return;
    }
    if (nuevoDto < 0) nuevoDto = 0;
    if (nuevoDto > 100) nuevoDto = 100;

    this.carrito.update(items => {
      const copia = [...items];
      copia[index] = {
        ...copia[index],
        precio: nuevoPrecio,
        porcentajeDescuento: nuevoDto,
        notasReparacion: this.notaLineaEnConstruccion()
      };
      return copia;
    });

    this.uiService.mostrarToast('Línea de artículo actualizada', 'success');
    this.cerrarModalEdicionLinea();
  }

  cerrarModalEdicionLinea() {
    this.indiceItemEditandoLinea.set(null);
    this.precioLineaEnConstruccion.set('');
    this.descuentoLineaEnConstruccion.set('');
    this.notaLineaEnConstruccion.set('');
  }

  /* Acción rápida del historial inferior para cambiar de estado una reparación de taller */
  entregarReparacionHistorial(ticket: OrdenDTO): void {
    this.ordenService.entregarOrden(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('✅ Reparación entregada y saldo liquidado correctamente.', 'success');
        // Refrescamos el historial en caliente
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe(t => this.historialTickets.set(t));
      },
      error: (err) => this.uiService.mostrarToast('No se pudo entregar: ' + (err.error?.message || err.error), 'error')
    });
  }

  /* Acción rápida para anular por completo un ticket erróneo desde el mostrador */
  anularOrdenHistorial(ticket: OrdenDTO): void {
    this.ordenService.cancelarOrden(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('🚫 Ticket anulado por completo. Caja y stock restaurados.', 'success');
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe(t => this.historialTickets.set(t));
      },
      error: (err) => this.uiService.mostrarToast('No se pudo anular la orden: ' + (err.error?.message || err.error), 'error')
    });
  }

  /* Botón de cobro rápido de saldo pendiente directo desde la rejilla del historial */
  liquidarOrdenHistorial(ticket: OrdenDTO): void {
    // Calculamos el saldo restante que le queda por pagar al cliente usando el método de pago activo en el TPV
    const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
    
    this.ordenService.cobrar(ticket.id, metodoPagoSeguro).subscribe({
      next: (res) => {
        this.uiService.mostrarToast(`💰 Saldo de la Orden #${ticket.numeroTicket} liquidado con éxito.`, 'success');
        // Refrescamos la lista para que cambie el badge financiero a PAGADO en caliente
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe(t => this.historialTickets.set(t));
      },
      error: (err) => {
        console.error('Error al liquidar balance pendiente:', err);
        this.uiService.mostrarToast('No se pudo completar el cobro del saldo restante.', 'error');
      }
    });
  }

  /* 🔥 MANDA EL TICKET DIRECTAMENTE A LA IMPRESORA SIN SALIR DEL TPV */
  imprimirIframeTicket(): void {
    const iframe = document.getElementById('iframeTicketPdf') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } else {
      this.uiService.mostrarToast('No se pudo conectar con el visor de impresión.', 'error');
    }
  }
  // === MÉTODOS ADICIONALES REQUERIDOS ===
  // Métodos para manejar la búsqueda y selección de clientes en el TPV (útil para reparaciones)
  buscarClientes(termino: string) {
    this.busquedaCliente.set(termino);
    // Si escribe menos de 2 caracteres, limpiamos el desplegable
    if (termino.trim().length < 2) {
      this.clientesEncontrados.set([]);
      return;
    }

    // Convertimos a MAYÚSCULAS para que coincida con la base de datos
    const terminoLimpio = termino.trim().toUpperCase();

    // Expresión regular para saber si solo está escribiendo números (admite el + del prefijo)
    const esTelefono = /^\+?[0-9\s\-]+$/.test(terminoLimpio);

    if (esTelefono) {
      // Llamada al endpoint de teléfono (/api/clientes/telefono/{telefono})
      this.clienteService.buscarPorTelefono(terminoLimpio).subscribe({
        next: (resultado) => this.clientesEncontrados.set([resultado]), // Envolvemos en array para mantener la consistencia con la búsqueda por nombre
        error: () => this.clientesEncontrados.set([])
      });
    } else {
      // Llamada al endpoint de nombre (/api/clientes/nombre/{nombre})
      this.clienteService.buscarPorNombre(terminoLimpio).subscribe({
        next: (resultado) => this.clientesEncontrados.set(resultado),
        error: () => this.clientesEncontrados.set([])
      });
    }
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
    this.sinFechaRecogida.set(false); // Si selecciona una fecha del calendario, quitamos el "Sin fecha"
   }
  }

  // Cambia el estado para abrir/cerrar el acordeón inferior
  toggleHistorial() {
    this.mostrarHistorial.update(estado => !estado);
  }

  // Lógica para lanzar la reimpresión del ticket seleccionado
  reimprimirTicket(ticket: OrdenDTO) {
    this.uiService.mostrarToast(`🖨️ Reenviando a impresora ticket #${ticket.numeroTicket}...`, 'success');
    
    // Llamamos a tu servicio pasándole la ID del ticket
    this.ordenService.imprimirTicket(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast(`🖨️ Ticket #${ticket.numeroTicket} reimpresso con éxito.`, 'success');
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

  // Método para actualziar las notas del ticket
  actualizarNotaLinea(index: number, nuevoTexto: string) {
  this.carrito.update(items => {
    // Clonamos el array para cambiar la referencia
    const nuevosItems = [...items];
    // Clonamos el objeto de la línea para actualizar su propiedad
    nuevosItems[index] = {
      ...nuevosItems[index],
      notasReparacion: nuevoTexto
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

  // Método para actualizar el descuento global desde el input del HTML, que se aplica sobre el total final del ticket
  actualizarDescuentoGlobal(evento: Event) {
    const input = evento.target as HTMLInputElement;
    let valor = parseFloat(input.value) || 0;
    
    if (valor < 0) valor = 0;
    if (valor > 100) valor = 100;
    
    this.descuentoGlobal.set(valor);
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
        this.uiService.mostrarToast(`🚀 Caja abierta con un fondo de ${caja.saldoInicial}€`, 'success');
        this.saldoInicialInput = 0;
        // Al abrirse, el signal cajaActual del servicio se actualiza y el TPV se desbloquea solo
      },
      error: (err) => this.uiService.mostrarToast('Error al abrir caja: ' + (err.error || err.message), 'error')
    });
  }

  toggleTicket() {
  this.isTicketVisible.update(v => !v);
}

abrirKeypadPrecio(index: number) {
  // Si se usa una tablet Android
  if (isMobileOrTablet()) {
    return;
  }
  this.indiceItemEditandoPrecio.set(index);
  this.precioEnConstruccion.set(this.carrito()[index].precio.toFixed(2));
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
      precio: nuevoPrecio
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

// === GESTIÓN DE FECHAS ===

toggleSinFechaRecogida(): void {
  this.sinFechaRecogida.update(value => !value);
  
  if (this.sinFechaRecogida()) {
    this.fechaRecogida.set(''); 
  } else {
    const hoy = new Date().toISOString().split('T')[0];
    this.fechaRecogida.set(hoy);
  }
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
    const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
    // Cobro de 0€ para imprimir el resguardo físico directo de taller sin pagos previos
    this.cobrarAnticipoTicket(id, 0, metodoPagoSeguro);
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
    const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
    this.cobrarAnticipoTicket(id, numImporte, metodoPagoSeguro);
    this.cerrarTeclado();
    this.idOrdenPendienteAnticipo.set(null);
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
  this.descuentoGlobal.set(0);
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
        this.uiService.mostrarToast('⚠️ Este ticket ya figura como totalmente devuelto.', 'error');
        return;
      }

      this.ticketOrigenEncontrado = ticketDTO;
      const lineas = ticketDTO.detalles || [];
      
      // Inicializamos el Map de checkboxes y cantidades máximas
      this.lineasSeleccionadasParaDevolver.clear();
      lineas.forEach((linea: any) => {
        // Usamos como clave el id del artículo o de la línea
        const idClave = linea.id;
        this.lineasSeleccionadasParaDevolver.set(idClave, {
          checked: false,
          cantidadADevolver: Math.abs(linea.cantidad) // Por defecto la cantidad máxima comprada
        });
      });

      this.mostrarModalSeleccionDevolucion = true; // Abrimos la rejilla interactiva
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

  const lineasTicketOriginal = ticket.detalles || [];
  
  // Filtrar solo las líneas que el zapatero ha marcado con el checkbox
  const lineasFiltradasBody: any[] = [];

  lineasTicketOriginal.forEach((linea: any) => {
    const idClave = linea.id;
    const estadoSeleccion = this.lineasSeleccionadasParaDevolver.get(idClave);

    if (estadoSeleccion && estadoSeleccion.checked) {
      lineasFiltradasBody.push({
        articuloId: linea.articuloId,
        cantidad: estadoSeleccion.cantidadADevolver // Cantidad parcial o total ajustada en pantalla
      });
    }
  });

  if (lineasFiltradasBody.length === 0) {
    this.uiService.mostrarToast('⚠️ Debes seleccionar al menos un artículo para poder emitir el abono.', 'warning');
    return;
  }

  this.uiService.mostrarToast('🚀 Generando abono parcial enlazado (DEV-)...', 'success');

  const requestDevolucion = {
    ordenOrigenId: ticket.id,
    metodoPago: this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' | 'OTRO',
    lineas: lineasFiltradasBody
  };

  this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
    next: (devolucionGuardada) => {
      this.uiService.mostrarToast(`✅ Abono parcial ${devolucionGuardada.numeroTicket} emitido. ¡Abre el cajón!`, 'success');
      
      // Inyectamos las referencias para que el iframe imprima el PDF térmico del DEV-
      this.idOperacionProcesada.set(devolucionGuardada.id);
      this.numeroTicketActual.set(devolucionGuardada.numeroTicket);
      this.horaTicketActual.set(new Date().toLocaleTimeString());

      // Pintamos visualmente el abono generado en tu historial
      const ticketAbonoHistorial: OrdenDTO = {
        id: devolucionGuardada.id,
        numeroTicket: devolucionGuardada.numeroTicket,
        fecha: new Date(),
        clienteNombre: ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General',
        total: devolucionGuardada.total, // Ya viene en negativo calculado de forma nativa por tu back
        estadoAeat: 'PENDIENTE',
        estadoPago: 'DEVOLUCION',
        tipo: 'VENTA_DIRECTA',
        cliente: null
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
    this.fechaRecogida.set('');
    this.sinFechaRecogida.set(false);
    this.descuentoGlobal.set(0);
    this.tipoOrdenSeleccionada.set('VENTA_DIRECTA');
    this.metodoPagoSeleccionado.set('EFECTIVO');
    this.numeroTicketActual.set('TKT-PROVISIONAL');
    this.horaTicketActual.set('');
  }

  // === GESTIÓN DEL TECLADO VIRTUAL ===

abrirTeclado(objetivo: 'PRODUCTO' | 'CLIENTE' | 'DESCUENTO' | 'DESCUENTO_MANUAL' | 'NOTAS_REPARACION' | 'NUMERO_TICKET' | 'NUMERO_CANTIDAD' | 'APERTURA_CAJA' | 'CANTIDAD_ANTICIPO' | 'PREGUNTA_ANTICIPO', index: number | null = null, maxCantidad: number = 1) {
    // Si estás en tablet y no es la pregunta de anticipo, nos saltamos el teclado virtual
    if (objetivo !== 'PREGUNTA_ANTICIPO' && isMobileOrTablet()) return;

    this.inputActivo.set(objetivo);
    this.indiceLineaTemporal.set(index);
    this.maxUnidadesPermitidas = maxCantidad;
    this.mayusculas.set(objetivo !== 'DESCUENTO' && objetivo !== 'DESCUENTO_MANUAL' && objetivo !== 'NUMERO_CANTIDAD' && objetivo !== 'APERTURA_CAJA');

    // Inicializamos el buffer con el valor que ya tenga el campo
    if (objetivo === 'PRODUCTO') this.valorTecladoEnConstruccion.set(this.busquedaArticulo());
    else if (objetivo === 'CLIENTE') this.valorTecladoEnConstruccion.set(this.busquedaCliente());
    else if (objetivo === 'DESCUENTO') this.valorTecladoEnConstruccion.set(this.descuentoGlobal().toString());
    else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item ? item.porcentajeDescuento.toString() : '');
    } else if (objetivo === 'NOTAS_REPARACION' && index !== null) {
      const item = this.carrito()[index];
      this.valorTecladoEnConstruccion.set(item?.notasReparacion || '');
    } else if (objetivo === 'NUMERO_TICKET') this.valorTecladoEnConstruccion.set(this.numeroTicketBuscarInput);
    else if (objetivo === 'NUMERO_CANTIDAD' && index !== null) {
      const control = this.lineasSeleccionadasParaDevolver.get(index);
      this.valorTecladoEnConstruccion.set(control ? control.cantidadADevolver.toString() : '1');
    } else {
      this.valorTecladoEnConstruccion.set(''); // Para anticipos o aperturas de caja vacíos
    }

    this.mostrarTeclado.set(true);
  }

  escribirTeclado(tecla: string) {
    const actual = this.valorTecladoEnConstruccion();
    const objetivo = this.inputActivo();

    // Filtros numéricos para dinero o porcentajes
    if (['DESCUENTO', 'DESCUENTO_MANUAL', 'CANTIDAD_ANTICIPO', 'APERTURA_CAJA', 'NUMERO_TICKET', 'NUMERO_CANTIDAD'].includes(objetivo)) {
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
    else if (objetivo === 'NUMERO_TICKET') this.numeroTicketBuscarInput = valor;
    else if (objetivo === 'DESCUENTO') {
      let num = parseFloat(valor) || 0;
      this.descuentoGlobal.set(num > 100 ? 100 : num);
    } 
    // Volcado directo al Carrito (Descuentos y Notas de Reparación del zapatero)
    else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
      let num = parseFloat(valor) || 0;
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, porcentajeDescuento: num > 100 ? 100 : num } : item));
    } else if (objetivo === 'NOTAS_REPARACION') {
    const index = this.indiceLineaTemporal();
    if (index !== null) {
      this.carrito.update(items => items.map((item, i) => i === index ? { ...item, notasReparacion: valor } : item));
    } else {
      // Actualiza el estado temporal del modal unificado para que se vea reflejado en el textarea
      this.notaLineaEnConstruccion.set(valor);
      }
    }
    // Volcado de Cantidades para Devoluciones Parciales
    else if (objetivo === 'NUMERO_CANTIDAD' && index !== null) {
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