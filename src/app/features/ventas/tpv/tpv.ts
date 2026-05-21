import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';
import { UiService } from '../../../core/services/ui.service';

// Interfaz para representar clientes en el TPV (puede ser extendida según necesidades)
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email?: string;
}

// Interfaz que extiende NuevaLineaDTO para incluir el nombre y precio del artículo, facilitando la visualización en el TPV
export interface ItemCarrito extends NuevaLineaDTO {
  nombre: string;
  precio: number;
  descuentoPorcentaje?: number;
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
  imports: [CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})

export class TpvComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);
  private clienteService = inject(ClienteService);
  public uiService = inject(UiService);

  // Estados del catalogo tactil
  articulos = signal<Articulo[]>([]); // Lista completa de artículos cargada desde el backend
  categoriaSeleccionada = signal<'TODOS' | 'PRODUCTO' | 'SERVICIO'>('TODOS');
  busquedaArticulo = signal<string>('');

  // === ESTADOS DEL PANEL DE HISTORIAL INFERIOR ===
  mostrarHistorial = signal<boolean>(false); // Empieza cerrado por defecto
  historialTickets = signal<TicketHistorial[]>([]); // Aquí guardaremos los tickets del día para mostrar en el historial inferior

  // Estado del carrito de compra y caja
  carrito = signal<ItemCarrito[]>([]); // Aquí guardaremos { articuloId, nombre, cantidad, precio, notas }
  saldoInicialInput: number = 150; // 150€ por defecto para cambio
  descuentoGlobal = signal<number>(0); // Descuento global en porcentaje

  // Para controlar el flujo de Reparación en el TPV
  tipoOrdenSeleccionada = signal<TipoOrden>('VENTA_DIRECTA'); // Por defecto, el TPV arranca en modo Venta Directa
  fechaPrometidaRecogida = signal<string | null>(null); // Para guardar el YYYY-MM-DD si es reparación
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

  // === ESTADOS PARA EL CIERRE DE CAJA ===
  mostrarModalCierre = signal<boolean>(false);
  saldoContadoInput: number | null = null; // Lo que el cajero cuenta físicamente
  
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

    // Retornamos el total final asegurando que no sea negativo por error de tipeo
    return totalFinal > 0 ? totalFinal : 0;
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

      // Calculamos el PVP dinámico respetando la estructura de tu nuevo HTML
      const precioPvp = articulo.precio || (articulo.precioBase * (1 + (articulo.porcentajeIva || 21) / 100));
    
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
        precio: articulo.precioBase * (1 + articulo.porcentajeIva / 100),
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
    if (this.tipoOrdenSeleccionada() === 'REPARACION' && !this.fechaPrometidaRecogida()) {
      this.uiService.mostrarToast('Por favor, selecciona una fecha prometida de recogida para la reparación.', 'warning');
      return;
    }

    // Construimos la petición cumpliendo con la interfaz estricta NuevaOrdenDTO
    const request: NuevaOrdenDTO = {
      empresaId: 1,  // Reemplazar por el ID real de tu sesión si cambia
      empleadoId: 2, // Reemplazar por el ID real del empleado logueado si cambia
      clienteId: this.clienteSeleccionadoId(),
      tipo: this.tipoOrdenSeleccionada(),
      fechaPrometidaRecogida: this.tipoOrdenSeleccionada() === 'REPARACION' ? this.fechaPrometidaRecogida() : null,
      lineas: this.carrito().map(item => {
        return {
          articuloId: item.articuloId,
          cantidad: item.cantidad,
          notasReparacion: item.notasReparacion || null
        };
      })
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
        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => this.uiService.mostrarToast('Error al registrar el anticipo: ' + (err.error || err.message), 'error')
    });
  }

  // Método para limpiar el carrito y resetear estados después de finalizar una venta o reparación
  private limpiarCarrito() {
    this.carrito.set([]); // Vaciamos el carrito para la siguiente venta
    this.fechaPrometidaRecogida.set(null); // Reseteamos la fecha de recogida prometida para la siguiente venta
    this.deseleccionarCliente(); // Reseteamos el cliente seleccionado a null para la siguiente venta anónima
    this.clienteSeleccionadoId.set(null); // Mantenemos el cliente en null por defecto para la siguiente venta anónima
    this.descuentoGlobal.set(0); // Reseteamos el descuento global para la siguiente venta
  }

  // Método para cerrar el recibo de la AEAT, que se ejecuta al hacer clic en el botón "Cerrar Recibo AEAT"
  cerrarReciboAeat() {
    this.datosFacturaAeat.set(null);
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
        next: (resultado) => this.clientesEncontrados.set(resultado),
        error: (err) => {
          console.error('❌ Error buscando por teléfono:', err); 
          this.clientesEncontrados.set([]);
        }
      });
    } else {
      // Llamada al endpoint de nombre (/api/clientes/nombre/{nombre})
      this.clienteService.buscarPorNombre(terminoLimpio).subscribe({
        next: (resultado) => this.clientesEncontrados.set(resultado),
        error: (err) => {
          console.error('❌ Error buscando por nombre:', err); 
          this.clientesEncontrados.set([]);
        }
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

  // Método para actualizar la fecha prometida de recogida en el signal, que se ejecuta al cambiar el valor del input de fecha en el HTML
  actualizarFecha(event: Event) {
    const elemento = event.target as HTMLInputElement;
    this.fechaPrometidaRecogida.set(elemento.value || null);
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

  confirmarCierreCaja() {
    if (this.saldoContadoInput === null || this.saldoContadoInput < 0) {
      this.uiService.mostrarToast('Por favor, introduce el saldo total contado en el cajón.', 'warning');
      return;
    }

    // Llamamos al servicio de caja (asegúrate de que tu CajaService tenga este método)
    this.cajaService.cerrarCaja(this.saldoContadoInput).subscribe({
      next: (res) => {
        // res suele traer la diferencia calculada en el back: { saldoReal, saldoEsperado, diferencia }
        const esperado = res.saldoFinalEsperado;
        const real = res.saldoFinalReal;
        const dif = res.diferencia;
        let mensaje = `Caja cerrada.  Real: ${real}€. Esperado: ${esperado}€. `;
        
        if (dif === 0) {
          mensaje += '✅ ¡Cuadre perfecto!';
          this.uiService.mostrarToast(mensaje, 'success');
        } else {
          mensaje += `⚠️ Descuadre de ${dif}€.`;
          this.uiService.mostrarToast(mensaje, dif > 0 ? 'warning' : 'error');
        }

        this.mostrarModalCierre.set(false);
        // Al cerrarse la caja, el signal del servicio cajaActual() pasará a ser null 
        // y el TPV se bloqueará automáticamente con el aviso amarillo que ya teníamos.
      },
      error: (err) => this.uiService.mostrarToast('Error al cerrar caja: ' + (err.error || err.message), 'error')
    });
  }

}