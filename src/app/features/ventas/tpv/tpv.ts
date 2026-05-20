import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden, NuevaLineaDTO } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
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
}

@Component({
  selector: 'app-tpv',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})

export class TpvComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);
  private clienteService = inject(ClienteService);
  private uiService = inject(UiService);

  // Estados del TPV
  articulos = signal<Articulo[]>([]);
  filtro = signal('');
  carrito = signal<ItemCarrito[]>([]); // Aquí guardaremos { articuloId, nombre, cantidad, precio, notas }
  // Añade esta propiedad arriba junto a los otros signals/variables
  saldoInicialInput: number = 150; // 150€ por defecto para cambio

  // Para controlar el flujo de Reparación en el TPV
  tipoOrdenSeleccionada = signal<TipoOrden>('VENTA_DIRECTA'); 
  fechaPrometidaRecogida = signal<string | null>(null); // Para guardar el YYYY-MM-DD si es reparación
  metodoPagoSeleccionado = signal<string>('EFECTIVO'); // EFECTIVO o TARJETA

  // Para la búsqueda de clientes en el TPV (opcional, pero útil para reparaciones)
  clienteSeleccionadoId = signal<number | null>(null); // null para ventas anónimas
  busquedaCliente = signal('');
  clientesEncontrados = signal<Cliente[]>([]);
  clienteSeleccionado = signal<Cliente | null>(null);

  // Comprobación segura de caja abierta (computed reacciona al signal del servicio)
  cajaAbierta = computed(() => !!this.cajaService.cajaActual());
  
  // Totales automáticos
  totalTicket = computed(() => {
    return this.carrito().reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  });

  // Filtrado de artículos en tiempo real
  articulosFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.articulos().filter(a => a.nombre.toLowerCase().includes(f));
  });

  ngOnInit() {
    // 1. Cargamos artículos
    this.articuloService.getArticulos().subscribe(data => this.articulos.set(data));
    // 2. Comprobamos si la caja ya estaba abierta
    this.cajaService.checkEstadoCaja().subscribe();
  }

  agregarAlCarrito(articulo: Articulo) {
    // 1. Extraemos y aseguramos el ID en una constante local de tipo 'number'
    const idSeguro = articulo.id;
    if (idSeguro === undefined || idSeguro === null) {
      console.error('No se puede añadir un artículo sin ID al carrito');
      return;
    }

    this.carrito.update((items: ItemCarrito[]): ItemCarrito[] => {
      // Usamos la constante local que TypeScript ya sabe que es 100% number
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
        precio: articulo.precioBase * (1 + articulo.porcentajeIva / 100),
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
      next: () => {
        this.uiService.mostrarToast('💰 ¡Venta cobrada al 100% correctamente en Caja!', 'success');
        this.limpiarCarrito();
        this.deseleccionarCliente();
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
    this.carrito.set([]);
    this.fechaPrometidaRecogida.set(null);
    this.deseleccionarCliente(); // Reseteamos el cliente seleccionado a null para la siguiente venta anónima
    // Mantenemos el cliente en null por defecto para la siguiente venta anónima
    this.clienteSeleccionadoId.set(null); 
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

}