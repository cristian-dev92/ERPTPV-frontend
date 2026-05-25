import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { UiService } from '../../../core/services/ui.service';
import { HttpClient } from "@angular/common/http";

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
  numeroFactura: string;
  fecha: Date;
  cliente: { nombre: string } | null;
  total: number;
  estadoAeat: 'ENVIADO' | 'PENDIENTE';
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, DecimalPipe],
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

  // Para controlar el flujo de Reparación en el TPV
  tipoOrdenSeleccionada = signal<TipoOrden>('VENTA_DIRECTA'); // Por defecto, el TPV arranca en modo Venta Directa
  sinFechaRecogida = signal<boolean>(false); // Nuevo estado para controlar el toggle de "Sin Fecha de Recogida" en reparaciones
  fechaRecogida = signal<string>(''); // Guardamos la fecha prometida de recogida como string para que sea fácil de bindear con el input type="date"
  metodoPagoSeleccionado = signal<string>('EFECTIVO'); // EFECTIVO o TARJETA

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
  
  // El saldo que el backend dice que debería haber (se carga al abrir el arqueo)
  saldoTeoricoCaja = signal<number>(1450.50); // Sustituir por el valor real que venga de tu servicio/caja

  // Desglose de monedas y billetes introducidos por el usuario
  desgloseEfectivo = signal({
    b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, b5: 0,
    m2: 0, m1: 0, m050: 0, m020: 0, m010: 0, m005: 0, m002: 0, m001: 0
  });

  // === ESTADOS PARA EL CIERRE DE CAJA ===
  mostrarModalCierre = signal<boolean>(false);
  saldoContadoInput: number | null = null; // Lo que el cajero cuenta físicamente

  // --- NUEVAS SIGNALS PARA EL MODAL Y PDF ---
  idOperacionProcesada = signal<number | string | null>(null);
  cargandoPDF = signal<boolean>(false);

  // === ESTADOS PARA EL TECLADO TÁCTIL GENERAL ===
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<'ARTICULO' | 'CLIENTE' | 'DESCUENTO' | null>(null);
  valorTecladoEnConstruccion = signal<string>('');

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

  // Método que se ejecuta al cargar el componente, ideal para cargar los artículos y comprobar el estado de la caja
  ngOnInit() {
    // 1. Cargamos artículos
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
    // 2. Comprobamos si la caja ya estaba abierta
    this.cajaService.checkEstadoCaja().subscribe();
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

  // EL MOMENTO DE LA VERDAD: Enviar al Backend
  finalizarVenta() {
    if (!this.cajaAbierta()) {
      this.uiService.mostrarToast('¡Atención! Debes abrir la caja antes de realizar una venta.', 'warning');
      return;
    }

    if (this.carrito().length === 0) {
      this.uiService.mostrarToast('El carrito está vacío.', 'warning');
      return;
    }

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

    console.log('JSON final enviado al Backend:', JSON.stringify(request, null, 2));

    this.ordenService.crearOrden(request).subscribe({
      next: (ordenGuardada) => {
        // Evaluamos qué flujo seguir según lo que haya seleccionado el cajero
        if (this.tipoOrdenSeleccionada() === 'VENTA_DIRECTA') {
          // Flujo A: Cobro completo inmediato
          this.cobrarTicketCompleto(ordenGuardada.id);
        } else {
          // Flujo B: Es una reparación. Preguntamos si va a dejar un anticipo/señal
          const dejarAnticipo = confirm('¿El cliente va a dejar un anticipo para la reparación?');
          if (dejarAnticipo) {
            const importe = prompt(`El total es de ${this.totalTicket()}€. ¿Cuánto deja de señal?`);
            const numImporte = parseFloat(importe || '0');
            if (numImporte > 0 && numImporte <= this.totalTicket()) {
              this.cobrarAnticipoTicket(ordenGuardada.id, numImporte, this.metodoPagoSeleccionado());
            } else {
              this.uiService.mostrarToast('Importe no válido. La orden se ha guardado como PENDIENTE sin anticipo.', 'warning');
              this.limpiarCarrito();
              this.deseleccionarCliente();
            }
          } else {
            this.uiService.mostrarToast('Orden de reparación guardada como PENDIENTE de cobro.', 'success');
            this.limpiarCarrito();
            this.deseleccionarCliente();
          }
        }
      },
      error: (err) => this.uiService.mostrarToast('Error al crear ticket: ' + (err.error?.message || err.error || 'Error desconocido'), 'error')
    });
  }

  // Métodos privados para manejar los flujos de cobro según la selección del cajero
  private cobrarTicketCompleto(id: number) {
    this.ordenService.cobrar(id, this.metodoPagoSeleccionado()).subscribe({
      next: (res) => {
        this.uiService.mostrarToast('💰 ¡Venta cobrada al 100% correctamente en Caja!', 'success');

        // Guardamos la referencia de operación/ID para la llamada del PDF
        this.idOperacionProcesada.set(id);

        // === NUEVO: INSERTAR EL TICKET EN EL HISTORIAL INFERIOR ===
        const nuevoTicket: TicketHistorial = {
          id: id,
          // Si el back aún no te da un número de factura real, generamos uno temporal basado en el ID
          numeroFactura: res.numeroFactura || `TEMP-${id}`, 
          fecha: new Date(),
          cliente: this.clienteSeleccionado() ? { nombre: this.clienteSeleccionado()!.nombre } : null,
          total: this.totalTicket(),
          // Como la AEAT está pausada en el back, lo marcamos como PENDIENTE de envío por ahora
          estadoAeat: 'PENDIENTE' 
        };

        // Lo metemos al principio de la lista usando .update() para que sea reactivo
        this.historialTickets.update(tickets => [nuevoTicket, ...tickets]);
        // =========================================================

        if (res.aeatQrUrl || res.aeatIdentificador) {
          this.datosFacturaAeat.set({
            qr: res.aeatQrUrl,
            ref: res.aeatIdentificador,
            total: this.totalTicket(),
            fecha: new Date().toLocaleTimeString()
          });
        }
        // Como dentro de limpiarCarrito() ya tienes metido tu this.deseleccionarCliente(), al llamarlo aquí dejas el TPV impoluto para la siguiente venta.
        this.limpiarCarrito();
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar el pago: ' + (err.error || err.message), 'error')
    });
  }

  // Método para registrar un anticipo en una reparación
  private cobrarAnticipoTicket(id: number, importe: number, metodoPago: string) {
    const metodo = metodoPago || this.metodoPagoSeleccionado();
    this.ordenService.registrarAnticipo(id, importe, metodo).subscribe({
      next: () => {
        this.uiService.mostrarToast(`📉 ¡Anticipo de ${importe}€ registrado con éxito! El ticket queda pendiente del resto.`, 'success');
        // Seteamos datos para que salte tu modal VeriFactu y permita sacar el ticket/resguardo con el anticipo
        this.idOperacionProcesada.set(id);
        this.datosFacturaAeat.set({
          qr: '',
          ref: `ANTICIPO-#${id}`,
          total: importe,
          fecha: new Date().toLocaleTimeString()
        });

        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => this.uiService.mostrarToast('Error al registrar el anticipo: ' + (err.error || err.message), 'error')
    });
  }

  /* Pide al backend el PDF en formato BLOB basándose en la operación activa */
  descargarTicketPDF(): void {
    const idOReferencia = this.idOperacionProcesada() || this.datosFacturaAeat()?.ref;
    
    if (!idOReferencia) {
      this.uiService.mostrarToast('No se encontró ninguna referencia de operación activa.', 'error');
      return;
    }

    this.cargandoPDF.set(true);
    const url = `/api/operaciones/${idOReferencia}/ticket-pdf`;

    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const nuevaPestana = window.open(blobUrl, '_blank');
        if (nuevaPestana) {
          nuevaPestana.focus();
        } else {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `ticket_${idOReferencia}.pdf`;
          link.click();
        }
        this.cargandoPDF.set(false);
      },
      error: (err) => {
        console.error('Error al descargar el PDF:', err);
        this.uiService.mostrarToast('No se pudo generar el documento PDF del ticket.', 'error');
        this.cargandoPDF.set(false);
      }
    });
  }

  // Método para limpiar el carrito y resetear estados después de finalizar una venta o reparación
  private limpiarCarrito() {
    this.carrito.set([]); // Vaciamos el carrito para la siguiente venta
    this.fechaRecogida.set(''); // Reseteamos la fecha de recogida prometida para la siguiente venta
    this.deseleccionarCliente(); // Reseteamos el cliente seleccionado a null para la siguiente venta anónima
    this.clienteSeleccionadoId.set(null); // Mantenemos el cliente en null por defecto para la siguiente venta anónima
    this.descuentoGlobal.set(0); // Reseteamos el descuento global para la siguiente venta
    this.modoDevolucion.set(false); // Reseteamos el modo devolución para la siguiente venta normal
    this.tipoOrdenSeleccionada.set('VENTA_DIRECTA'); // Reseteamos el tipo de orden a venta directa para la siguiente venta
    this.sinFechaRecogida.set(false); // Reseteamos el toggle de "Sin fecha de recogida" para la siguiente venta normal
    this.metodoPagoSeleccionado.set('EFECTIVO'); // Reseteamos el método de pago a efectivo para la siguiente venta
    this.datosFacturaAeat.set(null); // Limpiamos los datos de la factura AEAT para que no se muestren en la siguiente venta
    this.idOperacionProcesada.set(null); // Reseteamos la referencia de operación procesada para el PDF para que no se asocie por error a la siguiente venta
    this.modoDevolucion.set(false); // Cerramos el modo devolución por si acaso quedó activo
    this.seleccionarCategoria('TODOS'); // Reseteamos el filtro de categoría para mostrar todo el catálogo en la siguiente venta
    this.cargandoPDF.set(false); // Reseteamos el estado de carga del PDF para la siguiente venta
    this.indiceItemEditandoPrecio.set(null); // Cerramos el keypad de precio por si acaso quedó abierto
    this.precioEnConstruccion.set(''); // Reseteamos el valor en construcción del precio para la siguiente venta
    
  }

  // Método para cerrar el recibo de la AEAT, que se ejecuta al hacer clic en el botón "Cerrar Recibo AEAT"
  cerrarReciboAeat() {
    this.datosFacturaAeat.set(null);
    this.idOperacionProcesada.set(null);
  }
  
  // Métodos para manejar la búsqueda y selección de clientes en el TPV (útil para reparaciones)
  buscarClientes(termino: string) {
    console.log('🔍 Buscando cliente con el término:', termino);
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
    this.uiService.mostrarToast(`🖨️ Reenviando a impresora ticket #${ticket.numeroFactura}...`, 'success');
    
    // Aquí en el futuro llamarás a tu servicio de impresión:
    // this.ordenService.imprimirTicket(ticket.id).subscribe();
    console.log('Reimprimiendo ticket ID:', ticket.id);
  }
  
  actualizarDescuentoLinea(index: number, evento: Event) {
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
    this.saldoContadoInput = null; // Resetear el campo para que sea ciego de verdad
    this.mostrarModalCierre.set(true);
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
  abrirTecladoGeneral(objetivo: 'ARTICULO' | 'CLIENTE' | 'DESCUENTO') {
    this.inputObjetivoTeclado.set(objetivo);
    
    // Inicializamos el teclado con el valor que ya tenga ese campo
    if (objetivo === 'ARTICULO') this.valorTecladoEnConstruccion.set(this.busquedaArticulo());
    if (objetivo === 'CLIENTE') this.valorTecladoEnConstruccion.set(this.busquedaCliente());
    if (objetivo === 'DESCUENTO') this.valorTecladoEnConstruccion.set(this.descuentoGlobal().toString());
    
    this.mostrarTecladoGeneral.set(true);
  }

  /* Gestiona las pulsaciones de las teclas del panel táctil */
  pulsarTeclaGeneral(tecla: string) {
    const actual = this.valorTecladoEnConstruccion();
    const objetivo = this.inputObjetivoTeclado();

    // Si es el descuento, controlamos que solo entren números y un punto
    if (objetivo === 'DESCUENTO') {
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
    }
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
    this.inputObjetivoTeclado.set(null);
    this.valorTecladoEnConstruccion.set('');
  }

  // Métodos auxiliares para el arqueo guiado
  abrirArqueoGuiado() {
    // Aquí podrías llamar a tu servicio para traer el saldo teórico actual de la caja activa
    this.cajaService.obtenerSaldoTeoricoActual().subscribe(saldo => {
      this.saldoTeoricoCaja.set(saldo);
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

  /**
   * Envía el arqueo definitivo al backend
   */
  confirmarArqueo() {
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
        this.mostrarModalArqueo.set(false);
        // Aquí opcionalmente puedes redirigir al usuario o mostrar un mensaje de éxito
      },
      error: (err) => {
        console.error('Error al intentar cerrar la caja:', err);
        alert('Hubo un problema al registrar el cierre de caja. Revisa la consola.');
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

}