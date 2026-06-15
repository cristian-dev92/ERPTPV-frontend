import { Component, inject, OnInit, signal, effect, computed } from '@angular/core';
import { MetodoPago, OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';

@Component({
  selector: 'app-orden-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, FormsModule],
  templateUrl: './orden-list.html',
  styleUrl: './orden-list.scss'
})
export class OrdenListComponent implements OnInit {
  private ordenService = inject(OrdenService);
  private uiService = inject(UiService);
  
  // Signals para el estado
  filtroTipo = signal<string>('TALLER');           
  filtroEstado = signal<string>('TODOS');       

  terminoBusqueda = signal<string>('');
  ordenes = signal<any[]>([]);

  // Computed para aplicar los filtros y búsqueda sobre el listado de órdenes
  ordenesAMostrar = computed(() => {
    const busqueda = this.terminoBusqueda().toLowerCase().trim();
    const pestañaPrincipal = this.filtroTipo();
    const subFiltro = this.filtroEstado();
    let listaFiltrada = this.ordenes();

   // =========================================================================
    // 1. Por estado de flujo físico del taller
    // =========================================================================
    
    if (pestañaPrincipal === 'TALLER') {
      // 🛠️ TALLER: Filtra únicamente lo que esté físicamente trabajándose
      listaFiltrada = listaFiltrada.filter(orden => orden.estadoTaller === 'EN_TALLER');
      
      // Botones pequeños de Taller: Filtran por estadoPago
      if (subFiltro === 'PENDIENTE_PAGO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PENDIENTE' || orden.estadoPago === 'ANTICIPO');
      } else if (subFiltro === 'PAGADO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PAGADO');
      }
    } 
    
    else if (pestañaPrincipal === 'LISTO_RECOGER') {
      // 📦 LISTO PARA RECOGER: Filtra calzado terminado esperando al cliente
      listaFiltrada = listaFiltrada.filter(orden => orden.estadoTaller === 'LISTO');
      
      // Botones pequeños de Listo para Recoger: Filtran por estadoPago
      if (subFiltro === 'PAGADO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PAGADO');
      } else if (subFiltro === 'PENDIENTE_PAGO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PENDIENTE' || orden.estadoPago === 'ANTICIPO');
      }
    } 
    
    else if (pestañaPrincipal === 'CERRADOS') {
      // 📁 TICKETS CERRADOS: Calzado entregado, ventas directas de mostrador o abonos/devoluciones
      listaFiltrada = listaFiltrada.filter(orden =>
        orden.estadoTaller === 'ENTREGADO' || 
        (orden.tipoOrden || orden.tipo) === 'VENTA_DIRECTA'|| 
        (orden.tipoOrden || orden.tipo) === 'DEVOLUCION'
      );
      
      // Botones pequeños de Tickets Cerrados: Filtran por la variable 'tipo'
      if (subFiltro === 'VENTA_DIRECTA') {
        listaFiltrada = listaFiltrada.filter(orden =>
          // Es venta directa pura y tiene importe positivo (es el ticket original)
          (orden.tipoOrden || orden.tipo) === 'VENTA_DIRECTA' &&
          (orden.total >= 0 && (orden.importeTotal ?? 0) >= 0)
        );
      } else if (subFiltro === 'REPARACION') {
        listaFiltrada = listaFiltrada.filter(orden => 
          (orden.tipoOrden || orden.tipo) === 'REPARACION'
        );
      } else if (subFiltro === 'DEVOLUCION') {
        listaFiltrada = listaFiltrada.filter(orden => 
          // Entra aquí si es el nuevo ticket de abono físico (tipo DEVOLUCION o total negativo)
          (orden.tipoOrden || orden.tipo) === 'DEVOLUCION' || 
          orden.tipoOrden === 'ABONO' ||
          orden.tipo === 'ABONO' ||
          orden.total < 0 || 
          (orden.importeTotal < 0)
        );
      }
    }

    // =========================================================================
    // 2. BUSCADOR DINÁMICO TÁCTIL
    // =========================================================================
    if (busqueda) {
      listaFiltrada = listaFiltrada.filter(orden => {
        const cumpleId = orden.id?.toString().includes(busqueda);
        const cumpleCliente = orden.clienteNombre?.toLowerCase().includes(busqueda);
        const cumpleNumFactura = orden.numeroTicket?.toLowerCase().includes(busqueda) || orden.numeroFactura?.toLowerCase().includes(busqueda);
        return cumpleId || cumpleCliente || cumpleNumFactura;
      });
    }

    // Paginación en memoria a 50 elementos para que la tablet rinda al 100%
    return listaFiltrada.slice(0, 50);
  });

  // --- EL RESTO DE TU LÓGICA DE COBROS, DETALLES Y PDF SE QUEDA EXACTAMENTE IGUAL ---
  ordenSeleccionada = signal<any | null>(null);
  editandoNotas: string = '';
  editandoFecha: string = '';
  nuevoPrecioPanic: string = '';
  mostrarModalCobro = signal<boolean>(false);
  metodoPago = signal<MetodoPago>('EFECTIVO');
  importeEntregado = signal<string>(''); 
  
  cambioAOfrecer = computed(() => {
    if (this.metodoPago() === 'TARJETA') return 0;
    const total = this.ordenSeleccionada()?.importePendiente || 0;
    const entregado = parseFloat(this.importeEntregado()) || 0;
    return entregado > total ? entregado - total : 0;
  });

  mostrarModalDevolucion = signal<boolean>(false);
  metodoDevolucion = signal<MetodoPago>('EFECTIVO');

  ngOnInit() {
    this.cargarDatosDelServidor();
  }

  cargarDatosDelServidor() {
    this.ordenService.getOrdenesPorEstado('TODAS').subscribe({
      next: (data) => this.ordenes.set(data),
      error: (err) => this.uiService.mostrarToast('Error al cargar la gestión de tickets: ' + (err.error?.message || err.message), 'error')
    });
  }

  verDetalle(orden: any) {
    this.ordenSeleccionada.set(orden);
    this.nuevoPrecioPanic = '';
    this.editandoNotas = orden.notas || orden.notasReparacion || '';
    if (orden.fechaPrometidaRecogida) { 
      this.editandoFecha = new Date(orden.fechaPrometidaRecogida).toISOString().split('T')[0];
    } else { 
      this.editandoFecha = ''; 
    }
  }

  cerrarModal() { 
    this.ordenSeleccionada.set(null);
    this.cerrarTeclado();
   }

  limpiarBuscador() { 
    this.terminoBusqueda.set('');
    this.cerrarTeclado();
   }

  empezarTrabajo(ordenId: number) {
    this.ordenService.editarReparacion(ordenId, this.editandoNotas, this.editandoFecha).subscribe({
       next: () => { 
         this.uiService.mostrarToast('¡Trabajo iniciado en taller!', 'success'); 
         this.cargarDatosDelServidor(); 
         if (this.ordenSeleccionada()?.id === ordenId) this.cerrarModal(); 
       },
       error: () => this.uiService.mostrarToast('Error al actualizar estado en taller', 'error')
     });
   }

  finalizarReparacion(ordenId: number) {
    this.ordenService.editarReparacion(ordenId, this.editandoNotas, this.editandoFecha).subscribe({
      next: () => {
        this.ordenService.terminarReparacion(ordenId).subscribe({
          next: () => {
            this.uiService.mostrarToast('Reparación finalizada. Pasada a "Listos para recoger".', 'success');
            this.cargarDatosDelServidor();
            if (this.ordenSeleccionada()?.id === ordenId) this.cerrarModal();
          },
          error: () => this.uiService.mostrarToast('Error al terminar reparación', 'error')
        });
      },
      error: () => this.uiService.mostrarToast('Error al finalizar reparación', 'error')
    });
  }

  guardarCambiosReparacion() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    this.ordenService.editarReparacion(orden.id, this.editandoNotas, this.editandoFecha).subscribe({
      next: () => {
        this.uiService.mostrarToast('Ticket actualizado correctamente.', 'success');
        this.cargarDatosDelServidor();
        this.cerrarModal();
      },
      error: () => this.uiService.mostrarToast('Error al actualizar el ticket', 'error')
    });
  }

  // --- BOTÓN DEL PÁNICO: CAMBIAR PRECIO EN ORDENES EN TALLER ---
  cambiarPrecioReparacion(ordenId: number) {
  const precio = parseFloat(this.nuevoPrecioPanic);
  
  if (isNaN(precio) || precio <= 0) {
    this.uiService.mostrarToast('Por favor, introduce un precio válido mayor que 0.', 'warning');
    return;
  }

  this.uiService.mostrarToast(`⚡ Aplicando cambio de precio a ${precio}€...`, 'warning');

  this.ordenService.cambiarPrecioOrden(ordenId, precio).subscribe({
    next: (ticketCuadrado) => {
      this.uiService.mostrarToast('💰 ¡Precio modificado y ticket recalculado con éxito!', 'success');
      this.cargarDatosDelServidor(); // Refrescamos el grid de la pantalla
      this.cerrarModal();            // Cerramos para que vean los datos frescos
    },
    error: (err) => {
      console.error('Error en botón del pánico:', err);
      this.uiService.mostrarToast('No se pudo cambiar el precio: ' + (err.error?.message || 'Fallo en servidor'), 'error');
    }
  });
}

  // --- LIQUIDACIÓN Y PASARELA DE COBRO (KEYPAD) ---
  abrirPanelCobro() {
    this.importeEntregado.set('');
    this.metodoPago.set('EFECTIVO');
    this.mostrarModalCobro.set(true);
  } 

  cerrarPanelCobro() { this.mostrarModalCobro.set(false); }

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

  seleccionarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO') {
    this.metodoPago.set(metodo);
    if (metodo === 'EFECTIVO') this.importeEntregado.set('');
  }

  finalizarEntregaYCobro() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;
    const totalCobrar = orden.importePendiente;
    const entregado = this.metodoPago() !== 'EFECTIVO' ? totalCobrar : (parseFloat(this.importeEntregado()) || 0);

    if (this.metodoPago() === 'EFECTIVO' && entregado < totalCobrar) {
      this.uiService.mostrarToast(`El importe entregado (${entregado}€) es menor que el total pendiente (${totalCobrar}€)`, 'warning');
      return;
    } 

    const ejecutarCambioEstado = () => {
      if (orden.estadoTaller === 'LISTO') {
        this.ordenService.entregarOrden(orden.id).subscribe({
          next: () => {
            this.uiService.mostrarToast('¡Ticket completado! Orden cobrada y ENTREGADA.', 'success');
            this.cerrarPanelCobro();
            this.cerrarModal(); 
            this.cargarDatosDelServidor();
          },
          error: () => this.uiService.mostrarToast('Problema al marcar como ENTREGADO.', 'error')
        });
      } else {
        this.uiService.mostrarToast('¡Pago adelantado registrado! El ticket sigue en proceso.', 'success');
        this.cerrarPanelCobro();
        this.cerrarModal(); 
        this.cargarDatosDelServidor();
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

  // --- GESTIÓN DE DEVOLUCIONES ---
  abrirPanelDevolucion() {
    this.metodoDevolucion.set('EFECTIVO');
    this.mostrarModalDevolucion.set(true);
  }

  cerrarPanelDevolucion() { this.mostrarModalDevolucion.set(false); }

  confirmarDevolucionTicket() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    // Control preventivo por si el cliente pulsa repetidamente en la pantalla
    if (orden.estadoPago === 'DEVOLUCION' || orden.estadoPago === 'DEVUELTO') {
      this.uiService.mostrarToast('Este ticket ya ha sido devuelto.', 'warning');
      return;
    }

    const detallesOriginales = orden.detalles || [];

    const lineasDev = detallesOriginales.map((l: any) => {
      return{
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
        //Forzamos el cambio en local para que el @if del HTML reaccione al instante
        this.cerrarPanelDevolucion();
        this.cerrarModal();
        this.cargarDatosDelServidor();
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error || err.message), 'error')
    });
  }

  // --- DOCUMENTOS ---
   descargarPdfTicket(ordenId: number) {
    this.uiService.mostrarToast('Generando PDF del ticket...');
    this.ordenService.getTicketPdf(ordenId).subscribe({
      next: (blob: Blob) => {
        const urlDescarga = window.URL.createObjectURL(blob);
        window.open(urlDescarga, '_blank');
        window.URL.revokeObjectURL(urlDescarga);
      },
      error: () => this.uiService.mostrarToast('Error al generar el archivo PDF en el servidor.', 'error')
    });
  }

  descargarFacturaA4(ordenId: number) {
  this.uiService.mostrarToast('Generando Factura A4...');
  this.ordenService.getFacturaPdf(ordenId).subscribe({
    next: (blob: Blob) => this.abrirBlobEnNuevaPestana(blob),
    error: () => this.uiService.mostrarToast('Error al generar la factura A4. ¡REVISA SI LLEVA CLIENTE! (Fallo en servidor).', 'error')
  });
  }

  // Método auxiliar para evitar duplicar código de apertura de PDFs
  private abrirBlobEnNuevaPestana(blob: Blob) {
    const urlDescarga = window.URL.createObjectURL(blob);
    window.open(urlDescarga, '_blank');
    window.URL.revokeObjectURL(urlDescarga);
  } 

   getBadgeClass(orden: any): string {
    if (!orden) return 'badge-secondary';
    // Solo va en rojo si está CANCELADO o si es el con saldo negativo
    if (orden.estadoPago === 'CANCELADO' || (orden.tipoOrden || orden.tipo) === 'DEVOLUCION' || orden.total < 0 || (orden.importeTotal ?? 0) < 0) {
      return 'badge-danger';
    }
    // Ventas directas de mostrador (Pagadas al momento)
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
    // El Ticket original entrará aquí 
    if (orden.estadoPago === 'PAGADO') {
      return 'badge-success';
    }
  return 'badge-secondary';
}

// --- CONTROL DEL TECLADO TÁCTIL INTEGRADO ---
mostrarTeclado = signal<boolean>(false);
inputActivo = signal<string>(''); // 'busqueda', 'notas', 'fecha'

// Distribución de teclas para el teclado táctil del TPV
lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', '.'];
lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// Abre el teclado y registra sobre qué campo estamos trabajando
activarTeclado(campo: string) {
  this.inputActivo.set(campo);
  this.mostrarTeclado.set(true);
}

// Cierra el panel del teclado
cerrarTeclado() {
  this.mostrarTeclado.set(false);
  this.inputActivo.set('');
}

// Procesa la pulsación de cada letra/número en la pantalla
escribirTeclado(caracter: string) {
  const campo = this.inputActivo();
  
  if (campo === 'busqueda') {
    this.terminoBusqueda.set(this.terminoBusqueda() + caracter);
  } else if (campo === 'notas') {
    this.editandoNotas += caracter;
  } else if (campo === 'precio') {  
    this.nuevoPrecioPanic += caracter;
  }
}

// Borrar el último carácter (Tecla Retroceso ⌫)
borrarUltimoCaracter() {
  const campo = this.inputActivo();
  
  if (campo === 'busqueda') {
    const actual = this.terminoBusqueda();
    this.terminoBusqueda.set(actual.slice(0, -1));
  } else if (campo === 'notas') {
    this.editandoNotas = this.editandoNotas.slice(0, -1);
  } else if (campo === 'precio') {
    this.nuevoPrecioPanic = this.nuevoPrecioPanic.slice(0, -1);  
  }
}

// Añadir espacio (Tecla Espaciadora)
insertarEspacio() {
  const campo = this.inputActivo();
  if (campo === 'busqueda') {
    this.terminoBusqueda.set(this.terminoBusqueda() + ' ');
  } else if (campo === 'notas') {
    this.editandoNotas += ' ';
  } else if (campo === 'precio') {
    this.nuevoPrecioPanic += ' ';
  }
}

}
