import { Component, inject, OnInit, signal, computed, ViewChild, HostListener } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { UiService } from '../../../core/services/ui.service';
import { HttpClient } from "@angular/common/http";
import { ClientesComponent } from '../../clientes/clientes';
import { Router } from "@angular/router";
import { DomSanitizer } from '@angular/platform-browser';

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
  tipo?: 'VENTA_DIRECTA' | 'REPARACION' | 'DEVOLUCION';
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, ClientesComponent, NgClass],
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
  @ViewChild(ClientesComponent) clientesComponent!: ClientesComponent;

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
  saldoInicialInput: number = 0;
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
  cajaActual = this.cajaService.cajaActual;
  cajaAbierta = computed(() => !!this.cajaService.cajaActual());

  // === ESTADOS PARA EL TECLADO TÁCTIL GENERAL ===
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<'ARTICULO' | 'CLIENTE' | 'DESCUENTO' | 'DESCUENTO_MANUAL' |'PREGUNTA_ANTICIPO' | 'CANTIDAD_ANTICIPO' | 'APERTURA_CAJA' |  null>(null);
  valorTecladoEnConstruccion = signal<string>('');

  // Distribución de teclas idéntica a tu diseño favorito del TPV
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', '.'];

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

  tieneServicioEnCarrito = computed(() => {
    return this.carrito().some(item => {
      const art = this.articulos().find(a => a.id === item.articuloId);
      return art?.tipo === 'SERVICIO';
    });
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

  // Estados para controlar el proceso de devolución manual sin ticket, que se activa al hacer clic en el botón rojo de "Devolución Manual"
  mostrarModalDevolucion = false;
  mensajeModalDevolucion = '';
  ticketParaDevolver: any = null;

  // Variable para guardar la ID de la operación que se acaba de procesar (venta o devolución) y que se usará para generar el PDF del ticket correspondiente
  idOperacionProcesada = signal<number | string | null>(null); 
  cargandoPDF = signal<boolean>(false);                        
  urlSeguraPdf = signal<any>(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank')); // URL segura para incrustar el PDF generado por el backend en el iframe del TPV             

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
    // ✨ Si vaciamos el carrito o ya no quedan servicios dentro, permitimos reevaluar el tipo
    const tieneServicios = this.carrito().some(item => {
      // Buscamos en la lista de artículos cargados si el item actual es de tipo SERVICIO
      const art = this.articulos().find(a => a.id === item.articuloId);
      return art?.tipo === 'SERVICIO';
    });

    if (!tieneServicios && this.carrito().length === 0) {
      this.tipoOrdenSeleccionada.set('VENTA_DIRECTA');
    }
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
      metodoPago: this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO',
      lineas: this.carrito().map(item => ({
        articuloId: item.articuloId,
        cantidad: Math.abs(item.cantidad) // Javi pide la cantidad en POSITIVO, nos aseguramos con Math.abs
      }))
    };

    this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
      next: (devolucionGuardada) => {
        this.uiService.mostrarToast(`✅ Devolución procesada con éxito. Abono de ${this.totalTicket()}€ registrado.`, 'success');
        
        // Preparamos las referencias del ticket actual con los datos del abono generado
        this.idOperacionProcesada.set(devolucionGuardada.id);
        this.numeroTicketActual.set(devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`);
        this.horaTicketActual.set(new Date().toLocaleTimeString());

        // Insertamos la devolución en el historial inferior (en negativo para que cuadre visualmente)
        const ticketAbonoHistorial: TicketHistorial = {
          id: devolucionGuardada.id,
          numeroTicket: devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`, 
          fecha: new Date(),
          cliente: this.clienteSeleccionado() ? { nombre: this.clienteSeleccionado()!.nombre } : null,
          clienteNombre: this.clienteSeleccionado()?.nombre || 'Cliente General', // Para evitar fallos con NIF/Anónimos
          total: -Math.abs(this.totalTicket()), // Lo pintamos en negativo en la lista
          estadoAeat: 'PENDIENTE',
          estadoPago: 'DEVOLUCION', 
          tipo: 'VENTA_DIRECTA'
        };

        this.historialTickets.update(tickets => [ticketAbonoHistorial, ...tickets]);

        // Si el backend devolviera QR de VeriFactu para el abono, lo preparamos
        if (devolucionGuardada.aeatQrUrl || devolucionGuardada.aeatIdentificador) {
          this.datosFacturaAeat.set({
            qr: devolucionGuardada.aeatQrUrl,
            ref: devolucionGuardada.aeatIdentificador,
            total: -Math.abs(this.totalTicket()),
            fecha: new Date().toLocaleTimeString()
          });
        }

        // Activamos el visor y forzamos la previsualización e impresión del ticket de abono
        this.isTicketVisible.set(true);
        this.generarYPrevisualizarTicket();

        // Limpiamos el estado de la devolución y el carrito
        if (this.desactivarModoDevolucion) this.desactivarModoDevolucion(); // Función tuya para apagar el botón rojo si la tienes
        this.limpiarCarrito();
        this.deseleccionarCliente();
        if (this.idTicketOrigenDevolucion) this.idTicketOrigenDevolucion.set(null); // Reset de la orden ligada a la devolución para evitar confusiones en futuras operaciones
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
          precioModificado: item.precio,
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
          estadoAeat: res.estadoAeat || 'PENDIENTE',
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
  previsualizarFacturaA4(ticket: TicketHistorial): void {
    // 🚀 1. Extraemos el nombre del cliente EXACTAMENTE igual que lo haces en tu HTML
    const nombreCliente = ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General';
    // 2. Verificación obligatoria de cliente (idéntica a tu lógica)
    if (nombreCliente === 'Cliente General') {
      this.uiService.mostrarToast('No se puede generar una factura formal A4 para una venta anónima. Debe registrar un cliente.', 'warning');
      return;
    }

    // 2. Activamos los estados de carga y abrimos la pantalla del visor
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
    this.urlSeguraPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl('about:blank'));
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
  reimprimirFacturaA4(ticket: TicketHistorial) {
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

// === GESTIÓN DEL TECLADO GENERAL (MOSTRADOR, DESCUENTOS Y ANTICIPOS) ===

abrirTecladoGeneral(objetivo: 'ARTICULO' | 'CLIENTE' | 'DESCUENTO'| 'DESCUENTO_MANUAL' | 'PREGUNTA_ANTICIPO' | 'CANTIDAD_ANTICIPO' | 'APERTURA_CAJA', index: number | null = null) {
  this.inputObjetivoTeclado.set(objetivo);

  if (objetivo === 'PREGUNTA_ANTICIPO' || objetivo === 'CANTIDAD_ANTICIPO' || objetivo === 'APERTURA_CAJA') {
    this.valorTecladoEnConstruccion.set('');
  } else if (objetivo === 'DESCUENTO_MANUAL' && index !== null) {
    this.indiceLineaDescuentoActual.set(index);
    const item = this.carrito()[index];
    const descuentoActual = item ? (item.descuentoPorcentaje || 0) : 0;
    this.valorTecladoEnConstruccion.set(descuentoActual > 0 ? descuentoActual.toString() : '');
  } else {
    this.indiceLineaDescuentoActual.set(null);
    
    if (objetivo === 'ARTICULO') this.valorTecladoEnConstruccion.set(this.busquedaArticulo());
    if (objetivo === 'CLIENTE') this.valorTecladoEnConstruccion.set(this.busquedaCliente());
    if (objetivo === 'DESCUENTO') this.valorTecladoEnConstruccion.set(this.descuentoGlobal().toString());
  }
  
  this.mostrarTecladoGeneral.set(true);
}

pulsarTeclaGeneral(tecla: string) {
  const actual = this.valorTecladoEnConstruccion();
  const objetivo = this.inputObjetivoTeclado();

  // Filtro estricto para campos de dinero o porcentajes
  if (objetivo === 'DESCUENTO' || objetivo === 'DESCUENTO_MANUAL' || objetivo === 'CANTIDAD_ANTICIPO' || objetivo === 'APERTURA_CAJA') {
    if (tecla === '.' && actual.includes('.')) return;
    if (actual.includes('.') && actual.split('.')[1].length >= 2) return;
    if (tecla !== '.' && isNaN(Number(tecla))) return;
  }

  this.valorTecladoEnConstruccion.set(actual + tecla);
  this.aplicarValorEnTiempoReal();
}

borrarUltimoCaracterGeneral() {
  const actual = this.valorTecladoEnConstruccion();
  if (actual.length > 0) {
    this.valorTecladoEnConstruccion.set(actual.slice(0, -1));
    this.aplicarValorEnTiempoReal();
  }
}

limpiarTecladoGeneral() {
  this.valorTecladoEnConstruccion.set('');
  this.aplicarValorEnTiempoReal();
}

insertarEspacioGeneral() {
  this.valorTecladoEnConstruccion.set(this.valorTecladoEnConstruccion() + ' ');
}

cerrarTecladoGeneral() {
  this.mostrarTecladoGeneral.set(false);
  this.inputObjetivoTeclado.set(null);
  this.valorTecladoEnConstruccion.set('');
  this.indiceLineaDescuentoActual.set(null);
}

private aplicarValorEnTiempoReal() {
  const valor = this.valorTecladoEnConstruccion();
  const objetivo = this.inputObjetivoTeclado();

  if (objetivo === 'ARTICULO') {
    this.busquedaArticulo.set(valor);
  } else if (objetivo === 'CLIENTE') {
    this.buscarClientes(valor); 
  } else if (objetivo === 'DESCUENTO') {
    let num = parseFloat(valor) || 0;
    if (num > 100) num = 100; 
    this.descuentoGlobal.set(num);
  } else if (objetivo === 'DESCUENTO_MANUAL') {
    let num = parseFloat(valor) || 0;
    if (num > 100) num = 100; 
    
    const index = this.indiceLineaDescuentoActual();
    if (index !== null) {
      const listaCarrito = [...this.carrito()];
      if (listaCarrito[index]) {
        listaCarrito[index] = {
          ...listaCarrito[index],
          descuentoPorcentaje: num
        };
        this.carrito.set(listaCarrito);
      }
    }
  }
  // CANTIDAD_ANTICIPO no se ejecuta aquí para evitar llamadas a la API o validaciones a medio escribir.
}

aplicarAccionTeclado() {
  const objetivo = this.inputObjetivoTeclado();
  const resultado = this.valorTecladoEnConstruccion();

  if (objetivo === 'ARTICULO') this.busquedaArticulo.set(resultado);
  if (objetivo === 'CLIENTE') this.buscarClientes(resultado);
  if (objetivo === 'DESCUENTO') {
    let num = parseFloat(resultado) || 0;
    if (num > 100) num = 100;
    this.descuentoGlobal.set(num);
  }
  if (objetivo === 'CANTIDAD_ANTICIPO') {
    this.aplicarCantidadAnticipo();
  }
  if (objetivo === 'APERTURA_CAJA') {
    this.saldoInicialInput = parseFloat(resultado) || 0;
    this.ejecutarAperturaCaja();
  }

  this.cerrarTecladoGeneral();
}

// === MODOS DE VENTA / DEVOLUCIÓN ===

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
  this.idTicketOrigenDevolucion.set(null);
}

// === FLUJO DE ANTICIPOS (MODAL CENTRADO INTERACTIVO) ===

responderSiAnticipo() {
  // Pasamos directamente a pedir la cantidad numérica
  this.abrirTecladoGeneral('CANTIDAD_ANTICIPO');
}

responderNoAnticipo() {
  const id = this.idOrdenPendienteAnticipo();
  
  if (id !== null) {
    const metodoPagoSeguro = this.metodoPagoSeleccionado() as any;
    // Cobro de 0€ para imprimir el resguardo físico directo de taller sin pagos previos
    this.cobrarAnticipoTicket(id, 0, metodoPagoSeguro);
    this.cerrarTecladoGeneral();
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
    this.cerrarTecladoGeneral();
    this.idOrdenPendienteAnticipo.set(null);
  } else {
    this.uiService.mostrarToast(`Importe no válido. El máximo permitido es ${this.totalTicket()}€.`, 'warning');
  }
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
    // CONTROL DE SEGURIDAD: Si ya está devuelto, frenamos inmediatamente
    if (ticket.estadoPago === 'DEVOLUCION') {
      this.uiService.mostrarToast('⚠️ Este ticket ya figura como devuelto o abonado en el sistema.', 'warning');
      return;
    }
    // 1. Nos aseguramos de que el ticket tiene líneas o artículos dentro para poder devolverlos
    const lineasTicket = ticket.lineas || ticket.items || ticket.detalles || [];

    if (lineasTicket.length === 0) {
      this.uiService.mostrarToast('⚠️ Este ticket no contiene artículos registrados para poder devolver.', 'warning');
      return;
    }

    // Guardamos los datos para usarlos al pulsar "Aceptar"
    this.ticketParaDevolver = ticket;
    this.mensajeModalDevolucion = `¿Estás seguro de que deseas realizar la DEVOLUCIÓN COMPLETA del ticket #${ticket.numeroTicket || ticket.id}? Se reincorporarán las ${lineasTicket.length} líneas de artículos al stock.`;
    
    // Abrimos el modal de SCSS
    this.mostrarModalDevolucion = true;
  }

  // 2. Este método se ejecuta si le dan a "❌ Cancelar"
  cancelarDevolucion(): void {
    this.mostrarModalDevolucion = false;
    this.ticketParaDevolver = null;
    this.uiService.mostrarToast('Devolución cancelada por el operario.', 'warning');
  }

  // 3. Este método se ejecuta si le dan a "✓ Confirmar" (TODA TU LÓGICA INTACTA)
  ejecutarDevolucionConfirmada(): void {
    this.mostrarModalDevolucion = false; // Cerramos el modal primero
    const ticket = this.ticketParaDevolver;

    if (!ticket) return;

    const lineasTicket = ticket.lineas || ticket.items || ticket.detalles || [];
      
    this.uiService.mostrarToast('Procesando abono total...', 'success');

    // 3. Construimos el JSON mapeando EXACTAMENTE al DevolucionRequest de Java que me has pasado
    const requestDevolucion = {
      ordenOrigenId: ticket.id, // Vinculamos la orden origen
      metodoPago: this.metodoPagoSeleccionado() as 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO',
      // Mapeamos las líneas del historial al DTO estricto del Back. 
      lineas: lineasTicket.map((linea: any) => ({
        articuloId: linea.articuloId || linea.productoId || linea.articulo?.id, 
        cantidad: Math.abs(linea.cantidad) // Tiene que ser en POSITIVO, nos aseguramos con Math.abs
      }))
    };

    // 4. Llamamos al endpoint que SÍ está desarrollado en tu ordenService
    this.ordenService.procesarDevolucion(requestDevolucion).subscribe({
      next: (devolucionGuardada) => {
        this.uiService.mostrarToast(`✅ Devolución del ticket #${ticket.numeroTicket || ticket.id} procesada con éxito.`, 'success');
        
       // Preparamos las referencias en el TPV para sacar el PDF térmico del abono
        this.idOperacionProcesada.set(devolucionGuardada.id);
        this.numeroTicketActual.set(devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`);
        this.horaTicketActual.set(new Date().toLocaleTimeString());

        // Insertamos el abono generado en tu historial local en negativo para que cuadre visualmente
        const ticketAbonoHistorial: TicketHistorial = {
          id: devolucionGuardada.id,
          numeroTicket: devolucionGuardada.numeroTicket || `ABONO-${devolucionGuardada.id}`, 
          fecha: new Date(),
          cliente: ticket.cliente ? { nombre: ticket.cliente.nombre } : null,
          clienteNombre: ticket.clienteNombre || ticket.cliente?.nombre || 'Cliente General',
          total: -Math.abs(ticket.total), // Lo pintamos en negativo en la parrilla inferior
          estadoAeat: 'PENDIENTE',
          estadoPago: 'DEVOLUCION',
          tipo: 'VENTA_DIRECTA'
        };

        // Añadimos el nuevo ticket de abono arriba en la tabla del turno
        this.historialTickets.update(tickets => [ticketAbonoHistorial, ...tickets]);

        // Activamos el visor modal e inyectamos el PDF térmico de la devolución en el iframe
        this.isTicketVisible.set(true);
        this.generarYPrevisualizarTicket();

        // Volvemos a pedir todas las órdenes al servidor para actualizar los badges del ticket original a 'DEVOLUCION' en caliente
        this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
          next: (ticketsActualizados) => this.historialTickets.set(ticketsActualizados),
          error: (err) => console.error('Error al actualizar parrilla tras abono:', err)
        });

        // Limpiamos los estados de selección del mostrador por seguridad
        this.limpiarCarrito();
        this.deseleccionarCliente();
        this.ticketParaDevolver = null;
      },
      error: (err) => {
        console.error('Error en devolución automática:', err);
        this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error?.message || err.error || 'Error en el servidor'), 'error');
        this.ticketParaDevolver = null;
      }
    });
  }

}