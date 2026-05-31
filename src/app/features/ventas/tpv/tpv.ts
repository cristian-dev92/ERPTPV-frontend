import { Component, inject, OnInit, signal, computed, ViewChild, HostListener } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO, MetodoPago } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe, DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { UiService } from '../../../core/services/ui.service';
import { HttpClient } from "@angular/common/http";
import { ClientesComponent } from '../../clientes/clientes';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
  cantidad: number;
  precio: number;
  descuentoPorcentaje?: number;
  notasReparacion?: string | null;
}

// Interfaz para representar la información que devuelve el back al cerrar un recibo con AEAT, que luego se muestra en el TPV para que el cajero pueda verificarlo
export interface InfoVerifaktu {
  qr: string;
  ref: string;
  total: number;
  fecha: string;
}

export interface TicketHistorial {
  id: number;
  numeroTicket: string;
  fecha: Date;
  createdAt?: string | Date;       // 🌟 Añadido como opcional para soportar el backend
  fechaCreacion?: string | Date; // 🌟 Añadido como opcional para soportar el backend
  cliente: { nombre: string } | null;
  clienteNombre?: string;     
  clienteTelefono?: string;   
  clienteId?: number | null;
  total: number;
  estadoAeat: 'ENVIADO' | 'PENDIENTE';
  estadoPago?: 'PAGADO' | 'PARCIAL' | 'PENDIENTE' | 'CANCELADO' | 'DEVOLUCION';
  estadoTaller?: 'EN_TALLER' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';
  tipo?: 'VENTA_DIRECTA' | 'REPARACION';
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, DecimalPipe, ClientesComponent, NgClass],
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
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private bufferCodigoBarras: string = '';
  private ultimaPulsacion: number = 0;
  @ViewChild('componenteClientes') componenteClientes!: ClientesComponent;

  // Estados del catalogo tactil
  articulos = signal<Articulo[]>([]); // Lista completa de artículos cargada desde el backend
  categoriaSeleccionada = signal<'TODOS' | 'PRODUCTO' | 'SERVICIO'>('TODOS');
  busquedaArticulo = signal<string>('');

  // === ESTADOS DEL PANEL DE HISTORIAL INFERIOR ===
  mostrarHistorial = signal<boolean>(false); // Empieza cerrado por defecto
  historialTickets = signal<TicketHistorial[]>([]); // Aquí guardaremos los tickets del día para mostrar en el historial inferior

  // --- ESTADO PARA MODIFICAR PRECIOS CON EL KEYPAD ---
  indiceItemEditandoPrecio = signal<number | null>(null);
  precioEnConstruccion = signal<string>(''); // Guarda los dígitos que pulsa el usuario (ej:

  // Estado del carrito de compra y caja
  carrito = signal<ItemCarrito[]>([]); // Aquí guardaremos { articuloId, nombre, cantidad, precio, notas }
  saldoInicialInput: number = 150; // 150€ por defecto para cambio
  descuentoGlobal = signal<number>(0); // Descuento global en porcentaje
  indiceLineaDescuentoActual = signal<number | null>(null); // Para saber a qué línea se le está aplicando un descuento manual específico

  // Para controlar el flujo de Reparación en el TPV
  tipoOrdenSeleccionada = signal<TipoOrden>('VENTA_DIRECTA'); // Por defecto, el TPV arranca en modo Venta Directa
  sinFechaRecogida = signal<boolean>(false); // Nuevo estado para controlar el toggle de "Sin Fecha de Recogida" en reparaciones
  fechaRecogida = signal<string>(''); // Guardamos la fecha prometida de recogida como string para que sea fácil de bindear con el input type="date"

  // Métodos de pago ampliados con tipado estricto
  metodoPagoSeleccionado = signal<string>('EFECTIVO');

  // Para la búsqueda de clientes en el TPV
  clienteSeleccionadoId = signal<number | null>(null); // null para ventas anónimas
  busquedaCliente = signal(''); // El término que el cajero escribe para buscar clientes
  clientesEncontrados = signal<Cliente[]>([]); // Resultados de la búsqueda de clientes
  clienteSeleccionado = signal<Cliente | null>(null); // El cliente seleccionado en el TPV

  // === MODULO DE COMPROBACIÓN VERI*FACTU ===
  datosFacturaAeat = signal<InfoVerifaktu | null>(null);

  // Comprobación segura de caja abierta (computed reacciona al signal del servicio)
  cajaAbierta = computed(() => !!this.cajaService.cajaActual());

  // === ESTADOS PARA EL ARQUEO GUIADO ===
  mostrarModalArqueo = signal<boolean>(false);
  saldoTeoricoCaja = signal<number>(0); // Sustituir por el valor real que venga de tu servicio/caja
  descuadreInput = signal<number>(0); 

  // Desglose de monedas y billetes introducidos por el usuario
  desgloseEfectivo = signal({
    b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
    m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
  });

  // === ESTADOS PARA EL CIERRE DE CAJA ===
  mostrarModalCierre = signal<boolean>(false);
  saldoContadoInput: number | null = null; // Lo que el cajero cuenta físicamente

  // Señal reactiva para guardar la URL segura del PDF y cargarla en el iframe
  idOperacionProcesada = signal<number | string | null>(null);
  cargandoPDF = signal<boolean>(false);
  urlSeguraPdf = signal<SafeResourceUrl | null>(null);

  // === ESTADOS PARA EL TECLADO TÁCTIL GENERAL ===
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<'ARTICULO' | 'CLIENTE' | 'DESCUENTO' | 'DESCUENTO_MANUAL' |'PREGUNTA_ANTICIPO' | 'CANTIDAD_ANTICIPO' | null>(null);
  valorTecladoEnConstruccion = signal<string>('');

  // Variable para recordar la orden que se acaba de crear mientras se responde al flujo táctil
  idOrdenPendienteAnticipo = signal<number | null>(null);

  // Estado para controlar si el TPV opera en modo devolución manual sin ticket
  modoDevolucion = signal<boolean>(false);
 
  // Totales automáticos
  totalTicket = computed(() => {
    // 1. Calculamos la suma de todas las líneas aplicando sus respectivos descuentos individuales
    const totalLineasConDescuento = this.carrito().reduce((acc, item) => {
      const descLinea = item.descuentoPorcentaje || 0;
      const precioConDescuento = item.precio * (1 - descLinea / 100);
      return acc + (precioConDescuento * item.cantidad);
    }, 0);

    // 2. Aplicamos el descuento global sobre la suma total de las líneas
    const descGlobal = this.descuentoGlobal();
    const totalFinal = totalLineasConDescuento * (1 - descGlobal / 100);
    const totalSeguro = totalFinal > 0 ? totalFinal : 0;

  // Si está activo el modo devolución, el total pasa a ser negativo para restar de caja
  return this.modoDevolucion() ? -totalSeguro : totalSeguro;
  });

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
  isTicketVisible = signal(false);
  idTicketOrigenDevolucion =signal<number | null>(null);

  // Variables para mostrar el número de ticket y la hora en el recibo de venta
  numeroTicketActual = signal<string>('TKT-PROVISIONAL');
  horaTicketActual = signal<string>('');


  // Método que se ejecuta al cargar el componente, ideal para cargar los artículos y comprobar el estado de la caja
  ngOnInit() {
    // 1. Cargamos artículos
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
    // 2. Comprobamos si la caja ya estaba abierta
    this.cajaService.checkEstadoCaja().subscribe();
    // 3. Cargamos el historial de tickets del día para mostrar en el panel inferior
    this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
    next: (tickets) => {
      this.historialTickets.set(tickets);
    },
    error: (err) => {
      console.error('Error cargando historial inicial:', err);
      this.uiService.mostrarToast('No se pudo inicializar el historial de órdenes', 'error');
    }
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
        precio: articulo.precioFinal, // Usamos el precio final del artículo como precio base en el carrito
        descuentoPorcentaje: 0, // Por defecto sin descuento
        notasReparacion: null // Usamos null para que machee perfecto con el DTO
      };
    
      return [...items, nuevoItem];
    });
  }

  // El método que controla los botones + y - que pusimos en el HTML
  ajustarCantidad(index: number, cambio: number) {
  const actual = this.carrito();
  const item = actual[index];
  
  item.cantidad += cambio;

  if (item.cantidad <= 0) {
    this.quitarDelCarrito(index);
  } else {
    // Actualizamos el signal para que la UI reaccione
    this.carrito.set([...actual]);
  }
}

  // Método para eliminar un artículo del carrito al hacer clic en el icono de la papelera
  quitarDelCarrito(index: number) {
    const actual = this.carrito();
    actual.splice(index, 1);
    this.carrito.set([...actual]);
  }

  // Método para finalizar la venta, que se ejecuta al hacer clic en el botón "Finalizar Venta" del HTML
  finalizarVenta() {
    //1. Validacion de caja abierta antes de permitir finalizar la venta
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('¡Atención! Debes abrir la caja antes de realizar una venta.', 'warning');
      return;
    }

    // 2. VALIDACIÓN DE ÓRDENES DE TALLER (Control de seguridad frente a olvidos)
    if (this.tipoOrdenSeleccionada() && this.tipoOrdenSeleccionada() !== 'VENTA_DIRECTA' && !this.clienteSeleccionado()) {
      this.uiService.mostrarToast('Debes asignar un cliente para guardar la orden de taller.', 'warning');
      return;
   }

  // =========================================================================
  // 🔄 MODO DEVOLUCIÓN / ABONO ACTIVO
  // =========================================================================
  if (this.modoDevolucion && this.modoDevolucion()) {
    
    // Construimos el DTO mapeando exactamente a DevolucionRequest de Java
    const requestDevolucion = {
      // Si tenéis guardado el ID del ticket que se está devolviendo, se pone aquí. Si es anónimo/sin ticket, va null.
      ordenOrigenId: (this.idTicketOrigenDevolucion ? this.idTicketOrigenDevolucion() : null), 
      metodoPago: this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO', // EFECTIVO, TARJETA, etc.
      lineas: this.carrito().map(item => ({
        articuloId: item.articuloId,
        cantidad: Math.abs(item.cantidad) // Javi pide la cantidad en POSITIVO, nos aseguramos con Math.abs
      }))
    };

    this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
      next: (devolucionGuardada) => {
        this.uiService.mostrarToast(`✅ Devolución procesada con éxito. Abono de ${this.totalTicket()}€ registrado.`, 'success');
        
        // Guardamos la referencia para el PDF del ticket de abono/devolución
        this.idOperacionProcesada.set(devolucionGuardada.id);

        // Insertamos la devolución en el historial inferior (en negativo para que cuadre visualmente)
        const ticketAbonoHistorial: TicketHistorial = {
          id: devolucionGuardada.id,
          numeroTicket: devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`, 
          fecha: new Date(),
          cliente: this.clienteSeleccionado() ? { nombre: this.clienteSeleccionado()!.nombre } : null,
          total: -Math.abs(this.totalTicket()), // Lo pintamos en negativo en la lista
          estadoAeat: 'PENDIENTE',
          estadoPago: 'DEVOLUCION', 
          tipo: 'VENTA_DIRECTA'
        };

        this.historialTickets.update(tickets => [ticketAbonoHistorial, ...tickets]);
        this.limpiarCarrito(); // Limpiamos el carrito para que no quede la devolución ahí

        // Si el backend devolviera QR de VeriFactu para el abono, lo preparamos
        if (devolucionGuardada.aeatQrUrl || devolucionGuardada.aeatIdentificador) {
          this.datosFacturaAeat.set({
            qr: devolucionGuardada.aeatQrUrl,
            ref: devolucionGuardada.aeatIdentificador,
            total: -Math.abs(this.totalTicket()),
            fecha: new Date().toLocaleTimeString()
          });
        }

        // Limpiamos el estado de la devolución y el carrito
        if (this.desactivarModoDevolucion) this.desactivarModoDevolucion(); // Función tuya para apagar el botón rojo si la tienes
        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => {
        console.error('Error en devolución:', err);
        this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error?.message || err.error || 'Error desconocido'), 'error');
      }
    });

    return; // Salimos de la función para que no ejecute el flujo de venta ordinaria
  }

    // ==================================================
    // 💰 FLUJO ORDINARIO: VENTAS DIRECTAS Y REPARACIONES
    // ==================================================
    // Si es reparación, obligamos a que pongan una fecha de recogida
    if (this.tipoOrdenSeleccionada() === 'REPARACION' && !this.sinFechaRecogida() && !this.fechaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha de recogida para la reparación.', 'warning');
      return;
    }

    // Construimos la petición cumpliendo con la interfaz estricta NuevaOrdenDTO
    const request: NuevaOrdenDTO = {
      empresaId: 1,  // Reemplazar por el ID real de tu sesión si cambia
      empleadoId: 2, // Reemplazar por el ID real del empleado logueado si cambia
      clienteId: this.clienteSeleccionadoId(),
      tipo: this.tipoOrdenSeleccionada(),
      fechaPrometidaRecogida: this.tipoOrdenSeleccionada() === 'REPARACION' && !this.sinFechaRecogida() ? this.fechaRecogida() : null,
      lineas: this.carrito().map(item => ({
          articuloId: item.articuloId,
          cantidad: item.cantidad,
          precioManual: item.precio,
          notasReparacion: item.notasReparacion || null
        }))
    };

    this.ordenService.crearOrden(request).subscribe({
      next: (ordenGuardada) => {
          // Dependiendo del tipo de orden y la configuración, decidimos el flujo de cobro:
          if (this.tipoOrdenSeleccionada() === 'VENTA_DIRECTA') {
          this.cobrarTicketCompleto(ordenGuardada.id);
            } else {
          // En vez de un confirm() nativo, guardamos la ID y abrimos el paso de la pregunta SÍ/NO
          this.idOrdenPendienteAnticipo.set(ordenGuardada.id);
          this.abrirTecladoGeneral('PREGUNTA_ANTICIPO');
        }
      },
      error: (err) => this.uiService.mostrarToast('Error al crear ticket: ' + (err.error?.message || err.error || 'Error desconocido'), 'error')
    });
  }

  // Métodos privados para manejar los flujos de cobro según la selección del cajero
  private cobrarTicketCompleto(id: number) {
    this.ordenService.cobrar(id, this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO').subscribe({
      next: (res) => {
        this.uiService.mostrarToast('💰 ¡Venta cobrada al 100% correctamente en Caja!', 'success');
        // Guardamos la referencia de operación/ID para la llamada del PDF
        this.idOperacionProcesada.set(id);

        // Actualizamos el número de ticket y la hora para mostrarlos en el recibo de venta
        this.numeroTicketActual.set(res.numeroTicket);
        this.horaTicketActual.set(new Date().toLocaleTimeString());

        // === NUEVO: INSERTAR EL TICKET EN EL HISTORIAL INFERIOR ===
        const nuevoTicket: TicketHistorial = {
          id: id,
          numeroTicket: res.numeroTicket, 
          fecha: new Date(),
          cliente: this.clienteSeleccionado() ? { nombre: this.clienteSeleccionado()!.nombre } : null,
          clienteNombre: this.clienteSeleccionado()?.nombre || 'Cliente General',
          clienteTelefono: this.clienteSeleccionado()?.telefono || '',
          clienteId: this.clienteSeleccionado()?.id || null,
          total: this.totalTicket(),
          // Como la AEAT está pausada en el back, lo marcamos como PENDIENTE de envío por ahora
          estadoAeat: 'PENDIENTE',
          estadoPago: 'PAGADO',
          tipo: this.tipoOrdenSeleccionada() === 'VENTA_DIRECTA' ? 'VENTA_DIRECTA' : 'REPARACION',
          estadoTaller: this.tipoOrdenSeleccionada() === 'REPARACION' ? 'EN_TALLER' : 'CANCELADO'
        };

        // Lo metemos al principio de la lista usando .update() para que sea reactivo
        this.historialTickets.update(tickets => [nuevoTicket, ...tickets]);

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
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar el pago: ' + (err.error || err.message), 'error')
    });
  }

  // Método para registrar un anticipo en una reparación
  private cobrarAnticipoTicket(id: number, importe: number, metodoPago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO') {
    // 🚀 CAMINO A: SI EL IMPORTE ES ZERO (No deja señal)
  if (importe === 0) {
    this.uiService.mostrarToast(`📋 Resguardo de depósito generado con éxito (Sin anticipo).`, 'success');

    this.idOperacionProcesada.set(id);
    
    // Aquí usamos el ID de la orden para el número de ticket/resguardo
    // Si tu backend genera otro código, puedes adaptarlo
    this.numeroTicketActual.set(`REP-${id}`); 
    this.horaTicketActual.set(new Date().toLocaleTimeString());
    
    this.datosFacturaAeat.set({
      qr: '', // Los resguardos sin cobro no suelen requerir QR de VeriFactu inmediatamente
      ref: `REP-${id}`,
      total: 0,
      fecha: new Date().toLocaleTimeString()
    });

    // Abrimos tu nueva ventana modal SCSS de previsualización
    this.isTicketVisible.set(true);
    
    // Disparamos la generación del PDF. Tu backend recibirá el ID de la orden 
    // y verá que al no tener anticipos asociados, debe pintar el "Resguardo de Taller" estándar.
    this.generarYPrevisualizarTicket();
    return; // Cortamos la ejecución aquí para que NO llame al servicio del backend erróneo
  }
    this.ordenService.registrarAnticipo(id, importe, metodoPago).subscribe({
      next: (res: any) => {
        this.uiService.mostrarToast(`📉 ¡Anticipo de ${importe}€ registrado con éxito! El ticket queda pendiente del resto.`, 'success');
        // Seteamos datos para que salte tu modal VeriFactu y permita sacar el ticket/resguardo con el anticipo
        this.idOperacionProcesada.set(id);
        this.numeroTicketActual.set(res.numeroTicket);
        this.horaTicketActual.set(new Date().toLocaleTimeString());
        this.datosFacturaAeat.set({
          qr: '',
          ref: res.numeroTicket,
          total: importe,
          fecha: new Date().toLocaleTimeString()
        });
        // Mostramos el ticket de anticipo con el PDF previsualizado para que el cajero pueda imprimirlo o revisarlo antes de cerrar el recibo
        this.isTicketVisible.set(true);
        // Después de registrar el anticipo, previsualizamos el ticket con el importe del anticipo y dejamos la orden abierta para que el cajero pueda cobrar el resto más tarde.
        this.generarYPrevisualizarTicket();
      },
      error: (err) => this.uiService.mostrarToast('Error al registrar el anticipo: ' + (err.error || err.message), 'error')
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
  descargarFacturaA4(ticket: TicketHistorial): void {
    if (!ticket.cliente) {
      this.uiService.mostrarToast('⚠️ No se puede generar una factura formal A4 para una venta anónima. Debe registrar un cliente.', 'warning');
      return;
    }

    this.uiService.mostrarToast(`📄 Descargando Factura A4 de ${ticket.cliente.nombre}...`, 'success');
    this.ordenService.getFacturaPdf(ticket.id).subscribe({
      next: (blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Factura_${ticket.numeroTicket}.pdf`;
        link.click();
        window.URL.revokeObjectURL(blobUrl);
      },
      error: (err) => {
        console.error('Error descargando A4:', err);
        this.uiService.mostrarToast('Error al recuperar la factura oficial del servidor.', 'error');
      }
    });
  }

  /* Acción rápida del historial inferior para cambiar de estado una reparación de taller */
  entregarReparacionHistorial(ticket: TicketHistorial): void {
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
  anularOrdenHistorial(ticket: TicketHistorial): void {
    this.ordenService.cancelarOrden(ticket.id).subscribe({
      next: () => {
        this.uiService.mostrarToast('🚫 Ticket anulado por completo. Caja y stock restaurados.', 'success');
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe(t => this.historialTickets.set(t));
      },
      error: (err) => this.uiService.mostrarToast('No se pudo anular la orden: ' + (err.error?.message || err.error), 'error')
    });
  }

  /* Botón de cobro rápido de saldo pendiente directo desde la rejilla del historial */
  liquidarOrdenHistorial(ticket: TicketHistorial): void {
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

   /* ➔ ACCIÓN DE CONTINUAR: Limpia todo el TPV y lo prepara para la siguiente venta */
  cerrarReciboAeat(): void {
    this.isTicketVisible.set(false);
    this.urlSeguraPdf.set(null);
    this.datosFacturaAeat.set(null);
    this.idOperacionProcesada.set(null);
    this.idOrdenPendienteAnticipo.set(null);
    this.limpiarCarrito();
    this.deseleccionarCliente();
  }

  // Método para limpiar el carrito y resetear estados después de finalizar una venta o reparación
  private limpiarCarrito() {
    this.carrito.set([]); // Vaciamos el carrito para la siguiente venta
    this.fechaRecogida.set(''); // Reseteamos la fecha de recogida prometida para la siguiente venta
    this.sinFechaRecogida.set(false); // Reseteamos el toggle de "Sin fecha de recogida" para la siguiente venta normal
    this.deseleccionarCliente(); // Reseteamos el cliente seleccionado a null para la siguiente venta anónima
    this.descuentoGlobal.set(0); // Reseteamos el descuento global para la siguiente venta
    this.modoDevolucion.set(false); // Reseteamos el modo devolución para la siguiente venta normal
    this.tipoOrdenSeleccionada.set('VENTA_DIRECTA'); // Reseteamos el tipo de orden a venta directa para la siguiente venta
    this.metodoPagoSeleccionado.set('EFECTIVO'); // Reseteamos el método de pago a efectivo para la siguiente venta
    this.seleccionarCategoria('TODOS'); // Reseteamos el filtro de categoría para mostrar todo el catálogo en la siguiente venta
    this.cargandoPDF.set(false); // Reseteamos el estado de carga del PDF para la siguiente venta
    this.indiceItemEditandoPrecio.set(null); // Cerramos el keypad de precio por si acaso quedó abierto
    this.precioEnConstruccion.set(''); // Reseteamos el valor en construcción del precio para la siguiente venta
    this.numeroTicketActual.set('TKT-PROVISIONAL'); // Reseteamos el número de ticket para la siguiente venta
    this.horaTicketActual.set(''); // Reseteamos la hora del ticket para la siguiente venta
  }
  
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
  reimprimirTicket(ticket: TicketHistorial) {
    this.uiService.mostrarToast(`🖨️ Reenviando a impresora ticket #${ticket.numeroTicket}...`, 'success');
    
    // 🚀 Llamamos a tu servicio pasándole la ID del ticket
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
  
  // Método para actualizar el descuento de una línea específica desde el input del HTML, que se aplica solo a esa línea
  actualizarDescuentoLinea(index: number, evento: any) {
    const input = evento.target as HTMLInputElement;
    let valor = parseFloat(input.value) || 0;
    
    // Validamos que el descuento esté entre 0 y 100
    if (valor < 0) valor = 0;
    if (valor > 100) valor = 100;

    this.carrito.update(items => 
      items.map((item, i) => i === index ? { ...item, descuentoPorcentaje: valor } : item)
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
  abrirCierreCaja() {
   // Reseteamos el desglose a cero para un nuevo recuento limpio
    this.desgloseEfectivo.set({
      b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
      m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
    });
    this.mostrarModalArqueo.set(true);  
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
        // Al abrirse, el signal cajaActual del servicio se actualiza y el TPV se desbloquea solo
      },
      error: (err) => this.uiService.mostrarToast('Error al abrir caja: ' + (err.error || err.message), 'error')
    });
  }

  toggleTicket() {
  this.isTicketVisible.update(v => !v);
}

// Abre el teclado para la línea seleccionada
abrirKeypadPrecio(index: number) {
  this.indiceItemEditandoPrecio.set(index);
  // Inicializamos el teclado con el precio actual del ítem convertido a string
  this.precioEnConstruccion.set(this.carrito()[index].precio.toFixed(2));
}

// Se ejecuta cada vez que el zapatero pulsa un número o el punto en tu Keypad en pantalla
pulsarTeclaPrecio(tecla: string) {
  const actual = this.precioEnConstruccion();
  
  if (tecla === '.' && actual.includes('.')) return; // Evitar doble punto decimal
  
  // Limitar a 2 decimales para que no escriban burradas
  if (actual.includes('.') && actual.split('.')[1].length >= 2) return;

  this.precioEnConstruccion.set(actual + tecla);
}

// Botón de borrar un dígito (Retroceso) en el Keypad
borrarUltimoDigitoPrecio() {
  const actual = this.precioEnConstruccion();
  if (actual.length > 0) {
    this.precioEnConstruccion.set(actual.slice(0, -1));
  }
}

// Botón "ACEPTAR" o "GUARDAR" del Keypad
guardarPrecioModificado() {
  const index = this.indiceItemEditandoPrecio();
  if (index === null) return;

  const nuevoPrecio = parseFloat(this.precioEnConstruccion() || '0');

  if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
    this.uiService.mostrarToast('El precio introducido no es válido.', 'warning');
    return;
  }

  // Modificamos el precio en el Signal del carrito
  this.carrito.update(items => {
    const copia = [...items];
    copia[index] = {
      ...copia[index],
      precio: nuevoPrecio // Sobrescribimos el precio final calculado
    };
    return copia;
  });

  this.uiService.mostrarToast('Precio actualizado en el ticket', 'success');
  this.cerrarKeypadPrecio();
}

// Cierra el modal/contenedor del teclado
cerrarKeypadPrecio() {
  this.indiceItemEditandoPrecio.set(null);
  this.precioEnConstruccion.set('');
}

// Añade este método para gestionar el comportamiento del botón
toggleSinFechaRecogida(): void {
  // Invertimos el estado del toggle
  this.sinFechaRecogida.update(value => !value);
  
  // Si se activa "Sin fecha", limpiamos la fecha recogida guardada
  if (this.sinFechaRecogida()) {
    this.fechaRecogida.set(''); 
  } else {
    // Si se desactiva, puedes asignar por defecto el día de hoy o dejarlo vacío para obligar a marcar una
    const hoy = new Date().toISOString().split('T')[0];
    this.fechaRecogida.set(hoy);
  }
}

/* Abre el teclado en pantalla para un input específico */
  abrirTecladoGeneral(objetivo: 'ARTICULO' | 'CLIENTE' | 'DESCUENTO'| 'DESCUENTO_MANUAL' | 'PREGUNTA_ANTICIPO' | 'CANTIDAD_ANTICIPO', index: number | null = null) {
    this.inputObjetivoTeclado.set(objetivo);

    if (objetivo === 'PREGUNTA_ANTICIPO') {
      this.valorTecladoEnConstruccion.set('');
    } else if (objetivo === 'CANTIDAD_ANTICIPO') {
      // Inicializamos el prompt numérico vacío para escribir directo
      this.valorTecladoEnConstruccion.set('');
      // Guardamos el índice si estamos editando el descuento de una línea específica
    } else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
      this.indiceLineaDescuentoActual.set(index);
      // Obtenemos el descuento actual de ese ítem en el carrito
      const item = this.carrito()[index];
      const descuentoActual = item ? (item.descuentoPorcentaje || 0) : 0;
      this.valorTecladoEnConstruccion.set(descuentoActual > 0 ? descuentoActual.toString() : '');
    } else {
      this.indiceLineaDescuentoActual.set(null);
    
    // Inicializamos el teclado con el valor que ya tenga ese campo
    if (objetivo === 'ARTICULO') this.valorTecladoEnConstruccion.set(this.busquedaArticulo());
    if (objetivo === 'CLIENTE') this.valorTecladoEnConstruccion.set(this.busquedaCliente());
    if (objetivo === 'DESCUENTO') this.valorTecladoEnConstruccion.set(this.descuentoGlobal().toString());
    }
    
    this.mostrarTecladoGeneral.set(true);
  }

  /* Gestiona las pulsaciones de las teclas del panel táctil */
  pulsarTeclaGeneral(tecla: string) {
    const actual = this.valorTecladoEnConstruccion();
    const objetivo = this.inputObjetivoTeclado();

    // Si es el descuento, controlamos que solo entren números y un punto
    if (objetivo === 'DESCUENTO' || objetivo === 'DESCUENTO_MANUAL' || objetivo === 'CANTIDAD_ANTICIPO') {
      if (tecla === '.' && actual.includes('.')) return;
      if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
      // Evitar letras en el descuento si se colaran
      if (tecla !== '.' && isNaN(Number(tecla))) return;
    }

    this.valorTecladoEnConstruccion.set(actual + tecla);
    this.aplicarValorEnTiempoReal();
  }

  /* Borra el último carácter introducido*/
  borrarUltimoCaracterGeneral() {
    const actual = this.valorTecladoEnConstruccion();
    if (actual.length > 0) {
      this.valorTecladoEnConstruccion.set(actual.slice(0, -1));
      this.aplicarValorEnTiempoReal();
    }
  }

  /* Limpia por completo el input activo */
  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
    this.aplicarValorEnTiempoReal();
  }

  /* Sincroniza lo que se escribe en el teclado con las Signals reales del TPV */
  private aplicarValorEnTiempoReal() {
    const valor = this.valorTecladoEnConstruccion();
    const objetivo = this.inputObjetivoTeclado();

    if (objetivo === 'ARTICULO') {
      this.busquedaArticulo.set(valor);
    } else if (objetivo === 'CLIENTE') {
      this.buscarClientes(valor); // Lanza la búsqueda de clientes directamente
    } else if (objetivo === 'DESCUENTO') {
      let num = parseFloat(valor) || 0;
      if (num > 100) num = 100; // Capamos el descuento máximo al 100%
      this.descuentoGlobal.set(num);
    } else if (objetivo === 'DESCUENTO_MANUAL') {
      let num = parseFloat(valor) || 0;
      if (num > 100) num = 100; // Capamos el descuento máximo al 100%
      
      const index = this.indiceLineaDescuentoActual();
      if (index !== null) {
        // 1. Hacemos una copia de la lista actual del carrito para no mutar directamente el estado
        const listaCarrito = [...this.carrito()];
        // 2. Si la línea existe, modificamos su propiedad directamente
        if (listaCarrito[index]) {
          listaCarrito[index] = {
            ...listaCarrito[index],
            descuentoPorcentaje: num
          };
          
          // 3. Notificamos a Angular el cambio del Signal
          this.carrito.set(listaCarrito);
      }
     }
    }
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
    this.inputObjetivoTeclado.set(null);
    this.valorTecladoEnConstruccion.set('');
    this.indiceLineaDescuentoActual.set(null);
  }

  // Métodos auxiliares para el arqueo guiado
  abrirArqueoGuiado() {
    this.cajaService.obtenerSaldoTeoricoActual().subscribe({
      next: (saldo) => {
        this.saldoTeoricoCaja.set(saldo);
      },
      error: (err) => {
        console.error('Error al recuperar el saldo teórico:', err);
        this.uiService.mostrarToast('No se pudo calcular el saldo teórico de la sesión', 'error');
      }
    });
    
    // Reiniciamos el desglose al abrir
    this.desgloseEfectivo.set({
      b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
      m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
    });
    this.mostrarModalArqueo.set(true);
  }

  // Cambiar la cantidad de un billete o moneda específico
  actualizarCantidadEfectivo(tipo: keyof ReturnType<typeof this.desgloseEfectivo>, valor: number) {
    if (valor < 0) valor = 0;
    this.desgloseEfectivo.update(actual => ({
      ...actual,
      [tipo]: valor
    }));
  }

  // Computed o método para calcular el total real sumado en tiempo real
  calcularTotalReal(): number {
    const d = this.desgloseEfectivo();
    return (
      d.b500 * 500 + d.b200 * 200 + d.b100 * 100 + d.b50 * 50 + d.b20 * 20 + d.b10 * 10 + d.b5 * 5 +
      d.m2 * 2 + d.m1 * 1 + d.m050 * 0.5 + d.m020 * 0.2 + d.m010 * 0.1 + d.m005 * 0.05 + d.m002 * 0.02 + d.m001 * 0.01
    );
  }

  // Calcula la diferencia (Descuadre)
  calcularDescuadre(): number {
    return this.calcularTotalReal() - this.saldoTeoricoCaja();
  }

  // Método para confirmar el arqueo guiado y enviar los datos al backend
  confirmarArqueo() {
    // 1. Extraemos los valores de las métricas guiadas calculadas en tu componente
    const saldoTeorico = this.saldoTeoricoCaja ? this.saldoTeoricoCaja() : 0;
    const saldoReal = this.calcularTotalReal();
    const descuadre = this.calcularDescuadre();
    
    // 2. Extraemos el desglose exacto de monedas/billetes mapeando el Record
    const desglose = (this.desgloseEfectivo ? this.desgloseEfectivo() : {}) as Record<string, number>;

    // 3. Construimos el DTO con la estructura estricta que exige tu 'cerrarCajaGuiado'
    const arqueoDTO = {
      saldoTeorico: this.saldoTeoricoCaja(),
      saldoReal: this.calcularTotalReal(),
      descuadre: this.calcularDescuadre(),
      desglose: this.desgloseEfectivo()
    };

    console.log('Enviando arqueo guiado al servidor:', arqueoDTO);
    
    // Lanzamos la petición HTTP real de cierre de caja
    this.cajaService.cerrarCajaGuiado(arqueoDTO).subscribe({
      next: (response) => {
        console.log('Arqueo guiado procesado y guardado con éxito:', response);
        // Cerramos el modal de arqueo
        this.mostrarModalArqueo.set(false);
        this.uiService.mostrarToast('🔒 Turno finalizado y caja cerrada correctamente.', 'success');
        
        // Sincronización higiénica: Forzamos la actualización de la rejilla inferior de tickets
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe(tickets => this.historialTickets.set(tickets));
      },
      error: (err) => {
        console.error('Error al intentar cerrar la caja:', err);
        this.uiService.mostrarToast('Hubo un problema al registrar el cierre de caja. Revisa la consola.', 'error');
      }
    });
  }
  
  /* Método auxiliar para obtener la cantidad actual de un billete/moneda en la plantilla */
  obtenerCantidad(tipo: string): number {
    const desglose = this.desgloseEfectivo() as Record<string, number>;
    return desglose[tipo] || 0;
  }

  toggleModoDevolucion() {
  this.modoDevolucion.update(activo => !activo);
  this.uiService.mostrarToast(
    this.modoDevolucion() 
      ? '⚠️ TPV en MODO DEVOLUCIÓN (Importes Negativos)' 
      : '🛒 TPV en Modo Venta Ordinaria', 
    this.modoDevolucion() ? 'warning' : 'success'
  );
 }

  desactivarModoDevolucion(): void {
    this.modoDevolucion.set(false);
    this.idTicketOrigenDevolucion.set(null); // Limpiamos también el ticket origen
  }

/* El cliente SÍ quiere dejar anticipo */
  responderSiAnticipo() {
    this.abrirTecladoGeneral('CANTIDAD_ANTICIPO');
  }

  /* Aplica la cantidad numérica introducida por el teclado táctil */
  aplicarCantidadAnticipo() {
    const valor = this.valorTecladoEnConstruccion();
    const numImporte = parseFloat(valor) || 0;
    const id = this.idOrdenPendienteAnticipo();

    if (id !== null && numImporte > 0 && numImporte <= this.totalTicket()) {
      const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
      this.cobrarAnticipoTicket(id, numImporte, metodoPagoSeguro);
      this.cerrarTecladoGeneral();
      this.idOrdenPendienteAnticipo.set(null);
    } else {
      this.uiService.mostrarToast(`Importe no válido. El máximo permitido es ${this.totalTicket()}€.`, 'warning');
    }
  }

  /* ❌ Método para vincular directamente al botón "NO DEJA ANTICIPO" de tu interfaz */
  responderNoAnticipo() {
    const id = this.idOrdenPendienteAnticipo();
    
    if (id !== null) {
      const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
      
      // Forzamos el cobro con un importe de 0€ para que genere el resguardo de taller directo
      this.cobrarAnticipoTicket(id, 0, metodoPagoSeguro);
      this.cerrarTecladoGeneral();
      this.idOrdenPendienteAnticipo.set(null);
    } else {
      this.uiService.mostrarToast('No hay ninguna orden pendiente para procesar.', 'error');
    }
  }

  // --- MÉTODOS DEL FORMULARIO DE REGISTRO PARA CLIENTES ---
  
  abrirModal() {
   if (this.componenteClientes) {
     this.componenteClientes.abrirModal(); // <-- Llama directamente al abrirModal() de tu Clientes.ts
   }
 }

 limpiarFormularioMostrador() {
  this.carrito.set([]); // Vaciamos el carrito
  this.descuentoGlobal.set(0);
  this.deseleccionarCliente(); // Volvemos a cliente general / anónimo
  this.modoDevolucion.set(false);
  this.tipoOrdenSeleccionada.set('VENTA_DIRECTA');
  this.metodoPagoSeleccionado.set('EFECTIVO');
 }

 asignarClienteEnMostrador(cliente: Cliente) {
  // Reutilizamos toda la lógica (guarda objeto, guarda ID y limpia búsquedas)
  this.seleccionarCliente(cliente);
  this.clienteSeleccionadoId.set(cliente.id);
}

/* 🔄 ACCIÓN TÁCTIL: Devuelve todo el contenido del ticket adaptándose al DevolucionRequest de Java */
  devolverTicketCompleto(ticket: any): void {
    // 1. Nos aseguramos de que el ticket tiene líneas o artículos dentro para poder devolverlos
    // Nota: Dependiendo de cómo te devuelva el objeto el backend, puede llamarse 'lineas', 'items' o 'detalles'
    const lineasTicket = ticket.lineas || ticket.items || ticket.detalles || [];

    if (lineasTicket.length === 0) {
      this.uiService.mostrarToast('⚠️ Este ticket no contiene artículos registrados para poder devolver.', 'warning');
      return;
    }

    // 2. Confirmación táctil en el mostrador
    this.uiService.mostrarToast(`¿Estás seguro de que deseas realizar la DEVOLUCIÓN COMPLETA del ticket #${ticket.numeroTicket || ticket.id}? Se reincorporarán las ${lineasTicket.length} líneas de artículos al stock.`, 'warning');

    if (!confirm()) {
      this.uiService.mostrarToast('Devolución cancelada por el operario.', 'warning');
      return; // Si el operario pulsa "Cancelar", detiene el proceso de forma segura
    }
      
    this.uiService.mostrarToast('Procesando abono total...', 'success');

    // 3. Construimos el JSON mapeando EXACTAMENTE al DevolucionRequest de Java que me has pasado
    const requestDevolucion = {
      ordenOrigenId: ticket.id, // Vinculamos la orden origen
      metodoPago: this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO',
      
      // Mapeamos las líneas del historial al DTO estricto del Back. 
      // Revisa si tu backend en el ticket original devuelve 'articuloId' o 'productoId' y 'cantidad'
      lineas: lineasTicket.map((linea: any) => ({
        articuloId: linea.articuloId || linea.productoId || linea.articulo?.id, 
        cantidad: Math.abs(linea.cantidad) // Javi lo quiere en POSITIVO (ej: 1), nos aseguramos con Math.abs
      }))
    };

    // 4. Llamamos al endpoint que SÍ está desarrollado en tu ordenService
    this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
      next: (devolucionGuardada) => {
        this.uiService.mostrarToast(`✅ Devolución del ticket #${ticket.numeroTicket || ticket.id} procesada con éxito.`, 'success');
        
        // Guardamos la referencia para el PDF si hiciera falta mostrar el comprobante
        this.idOperacionProcesada.set(devolucionGuardada.id);

        // Insertamos el abono generado en tu historial local en negativo para que cuadre visualmente
        const ticketAbonoHistorial: TicketHistorial = {
          id: devolucionGuardada.id,
          numeroTicket: devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`, 
          fecha: new Date(),
          cliente: ticket.cliente ? { nombre: ticket.cliente.nombre } : null,
          total: -Math.abs(ticket.total), // Lo pintamos en negativo en la parrilla inferior
          estadoAeat: 'PENDIENTE',
          estadoPago: 'DEVOLUCION',
          tipo: 'VENTA_DIRECTA'
        };

        // Añadimos el nuevo ticket de abono arriba en la tabla del turno
        this.historialTickets.update(tickets => [ticketAbonoHistorial, ...tickets]);

        // Volvemos a pedir todas las órdenes al servidor para actualizar los badges del ticket original a 'DEVOLUCION' en caliente
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
          next: (ticketsActualizados) => this.historialTickets.set(ticketsActualizados),
          error: (err) => console.error('Error al actualizar parrilla tras abono:', err)
        });

        // Limpiamos los estados de selección del mostrador por seguridad
        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => {
        console.error('Error en devolución automática:', err);
        this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error?.message || err.error || 'Error en el servidor'), 'error');
      }
    });
  }

}