import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ArticuloService } from '../../../core/services/articulo.service';
import { OrdenService, NuevaOrdenDTO, TipoOrden } from '../../../core/services/orden.service';
import { Articulo } from '../../../core/models/articulo.model';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService } from '../../../core/services/caja.service';
import { ClienteService } from '../../../core/services/cliente.service';

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
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './tpv.html',
  styleUrl: './tpv.scss'
})

export class TpvComponent implements OnInit {
  private articuloService = inject(ArticuloService);
  private ordenService = inject(OrdenService);
  private cajaService = inject(CajaService);
  private clienteService = inject(ClienteService);

  // Estados del TPV
  articulos = signal<Articulo[]>([]);
  filtro = signal('');
  carrito = signal<any[]>([]); // Aquí guardaremos { articuloId, nombre, cantidad, precio, notas }
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
    const actual = this.carrito();
    const existe = actual.find(item => item.articuloId === articulo.id);

    if (existe) {
      existe.cantidad++;
      this.carrito.set([...actual]);
    } else {
      this.carrito.set([...actual, {
        articuloId: articulo.id,
        nombre: articulo.nombre,
        cantidad: 1,
        precio: articulo.precioBase * (1 + articulo.porcentajeIva / 100), // Precio PVP
        notasReparacion: ''
      }]);
    }
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
      alert('¡Atención! Debes abrir la caja antes de realizar una venta.');
      return;
    }

    if (this.carrito().length === 0) {
      alert('El carrito está vacío.');
      return;
    }

    // Si es reparación, obligamos a que pongan una fecha de recogida
    if (this.tipoOrdenSeleccionada() === 'REPARACION' && !this.fechaPrometidaRecogida()) {
      alert('Por favor, selecciona una fecha prometida de recogida para la reparación.');
      return;
    }

    // Construimos la petición cumpliendo con la interfaz estricta NuevaOrdenDTO
    const request: NuevaOrdenDTO = {
      empresaId: 1,  // Reemplazar por el ID real de tu sesión si cambia
      empleadoId: 2, // Reemplazar por el ID real del empleado logueado si cambia
      clienteId: this.clienteSeleccionadoId(),
      tipo: this.tipoOrdenSeleccionada(),
      fechaPrometidaRecogida: this.tipoOrdenSeleccionada() === 'REPARACION' ? this.fechaPrometidaRecogida() : null,
      lineas: this.carrito().map(item => ({
        articuloId: item.articuloId,
        cantidad: item.cantidad,
        notasReparacion: item.notasReparacion || null
      }))
    };

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
              this.cobrarAnticipoTicket(ordenGuardada.id, numImporte);
            } else {
              alert('Importe no válido. La orden se ha guardado como PENDIENTE sin anticipo.');
              this.limpiarCarrito();
              this.deseleccionarCliente;
            }
          } else {
            alert('Orden de reparación guardada como PENDIENTE de cobro.');
            this.limpiarCarrito();
            this.deseleccionarCliente();
          }
        }
      },
      error: (err) => alert('Error al crear ticket: ' + (err.error?.message || err.error || 'Error desconocido'))
    });
  }

  // Métodos privados para manejar los flujos de cobro según la selección del cajero
  private cobrarTicketCompleto(id: number) {
    this.ordenService.cobrar(id, this.metodoPagoSeleccionado()).subscribe({
      next: () => {
        alert('💰 ¡Venta cobrada al 100% correctamente en Caja!');
        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => alert('Error al procesar el pago: ' + err.error)
    });
  }

  // Método para registrar un anticipo en una reparación
  private cobrarAnticipoTicket(id: number, importe: number) {
    this.ordenService.registrarAnticipo(id, importe, this.metodoPagoSeleccionado()).subscribe({
      next: () => {
        alert(`📉 ¡Anticipo de ${importe}€ registrado con éxito! El ticket queda pendiente del resto.`);
        this.limpiarCarrito();
        this.deseleccionarCliente();
      },
      error: (err) => alert('Error al registrar el anticipo: ' + err.error)
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
      alert('El saldo inicial no puede ser negativo');
      return;
    }

    this.cajaService.abrirCaja(this.saldoInicialInput).subscribe({
      next: (caja) => {
        alert(`🚀 Caja abierta con un fondo de ${caja.saldoInicial}€`);
        // Al abrirse, el signal cajaActual del servicio se actualiza y el TPV se desbloquea solo
      },
      error: (err) => alert('Error al abrir caja: ' + (err.error || err.message))
    });
  }
  
  // Métodos para manejar la búsqueda y selección de clientes en el TPV (útil para reparaciones)
  buscarClientes(termino: string) {
    this.busquedaCliente.set(termino);
    
    // Si escribe menos de 2 caracteres, limpiamos el desplegable
    if (termino.trim().length < 2) {
      this.clientesEncontrados.set([]);
      return;
    }

    // Expresión regular para saber si solo está escribiendo números (admite el + del prefijo)
    const esTelefono = /^\+?[0-9\s\-]+$/.test(termino.trim());

    if (esTelefono) {
      // Llamada al endpoint de teléfono (/api/clientes/telefono/{telefono})
      this.clienteService.buscarPorTelefono(termino.trim()).subscribe({
        next: (resultado) => this.clientesEncontrados.set(resultado),
        error: () => this.clientesEncontrados.set([])
      });
    } else {
      // Llamada al endpoint de nombre (/api/clientes/nombre/{nombre})
      this.clienteService.buscarPorNombre(termino.trim()).subscribe({
        next: (resultado) => this.clientesEncontrados.set(resultado),
        error: () => this.clientesEncontrados.set([])
      });
    }
  }

  seleccionarCliente(cliente: Cliente) {
    this.clienteSeleccionado.set(cliente);
    this.clienteSeleccionadoId.set(cliente.id); // Se asocia al DTO de la orden
    this.busquedaCliente.set('');
    this.clientesEncontrados.set([]);
  }

  deseleccionarCliente() {
    this.clienteSeleccionado.set(null);
    this.clienteSeleccionadoId.set(null); // Vuelve a ser venta anónima
  }

}