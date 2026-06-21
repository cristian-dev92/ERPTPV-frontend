import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { OrdenService } from '../../../core/services/orden.service';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';

type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO';

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
  
  // Signals para el estado de los filtros
  filtroTipo = signal<string>('TALLER');           
  filtroEstado = signal<string>('TODOS');       

  terminoBusqueda = signal<string>('');
  ordenes = signal<any[]>([]);

  // --- CONFIGURACIÓN TECLADO TÁCTIL ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>(''); 
  mayusculas = signal<boolean>(true); 
  indiceLineaActiva: number | null = null;

  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ', '.'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_', 'com'];

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
      listaFiltrada = listaFiltrada.filter(orden => orden.estadoTaller === 'EN_TALLER');
      
      if (subFiltro === 'PENDIENTE_PAGO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PENDIENTE' || orden.estadoPago === 'ANTICIPO');
      } else if (subFiltro === 'PAGADO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PAGADO');
      }
    } 
    else if (pestañaPrincipal === 'LISTO_RECOGER') {
      listaFiltrada = listaFiltrada.filter(orden => orden.estadoTaller === 'LISTO');
      
      if (subFiltro === 'PAGADO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PAGADO');
      } else if (subFiltro === 'PENDIENTE_PAGO') {
        listaFiltrada = listaFiltrada.filter(orden => orden.estadoPago === 'PENDIENTE' || orden.estadoPago === 'ANTICIPO');
      }
    } 
    else if (pestañaPrincipal === 'CERRADOS') {
      listaFiltrada = listaFiltrada.filter(orden =>
        orden.estadoTaller === 'ENTREGADO' || 
        (orden.tipoOrden || orden.tipo) === 'VENTA_DIRECTA' || 
        (orden.tipoOrden || orden.tipo) === 'DEVOLUCION'
      );
      
      if (subFiltro === 'VENTA_DIRECTA') {
        listaFiltrada = listaFiltrada.filter(orden =>
          (orden.tipoOrden || orden.tipo) === 'VENTA_DIRECTA' &&
          (orden.total >= 0 && (orden.importeTotal ?? 0) >= 0)
        );
      } else if (subFiltro === 'REPARACION') {
        listaFiltrada = listaFiltrada.filter(orden => 
          (orden.tipoOrden || orden.tipo) === 'REPARACION'
        );
      } else if (subFiltro === 'DEVOLUCION') {
        listaFiltrada = listaFiltrada.filter(orden => 
          (orden.tipoOrden || orden.tipo) === 'DEVOLUCION' || 
          orden.tipoOrden === 'ABONO' ||
          orden.tipo === 'ABONO' ||
          orden.total < 0 || 
          (orden.importeTotal < 0)
        );
      }
    }

    // =========================================================================
    // 2. Buscador
    // =========================================================================
    if (busqueda) {
      listaFiltrada = listaFiltrada.filter(orden => {
        const cumpleId = orden.id?.toString().includes(busqueda);
        const cumpleCliente = orden.clienteNombre?.toLowerCase().includes(busqueda);
        const cumpleNumFactura = orden.numeroTicket?.toLowerCase().includes(busqueda) || orden.numeroFactura?.toLowerCase().includes(busqueda);
        return cumpleId || cumpleCliente || cumpleNumFactura;
      });
    }

    return listaFiltrada.slice(0, 50);
  });

  ordenSeleccionada = signal<any | null>(null);
  detallesEditados: any[] = [];
  idDetalleDesplegado: number | null = null; 

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
  this.idDetalleDesplegado = null;

  const lineas = orden.detalles || orden.lineas || [];
  this.detallesEditados = lineas.map((linea: any, index: number) => {
    let fechaFormateada = '';
    const fechaBase = linea.fechaPrometidaRecogida || orden.fechaPrometidaRecogida;
    if (fechaBase) {
      fechaFormateada = new Date(fechaBase).toISOString().split('T')[0];
    }

    // 1. Aseguramos capturar el precio unitario venga como venga del backend
    const precioUnitario = linea.precioUnitario || linea.precioUnidad || linea.precio || 0;
    const cantidad = linea.cantidad || 1;
    
    // 2. Aseguramos el subtotal de la línea
    const subtotalLinea = linea.subtotal || linea.total || (cantidad * precioUnitario);
    const notaExistente = linea.notas || linea.notasReparacion || '';

    return {
      id: linea.id || index, 
      articuloId: linea.articuloId || linea.articulo?.id,
      nombre: linea.articuloNombre || linea.articulo?.nombre || 'Artículo/Servicio',
      cantidad: cantidad,
      precio: precioUnitario, // <-- Ahora sí tendrá el valor real
      subtotal: subtotalLinea, // <-- Ahora sí tendrá el valor real
      esServicio: linea.esServicio || linea.articulo?.tipo === 'SERVICIO' || orden.tipo === 'REPARACION',
      notas: notaExistente,
      notasReparacion: notaExistente,
      fechaEntrega: fechaFormateada,
      nuevoPrecioInput: '' 
    };
  });
}

  toggleDesplegableServicio(id: number) {
    this.idDetalleDesplegado = this.idDetalleDesplegado === id ? null : id;
  }

  eliminarLineaLocal(item: any) {
   const orden = this.ordenSeleccionada();
  if (!orden) return;

  // El idCorrecto debe ser el id de la línea intermedia de la Base de Datos
  const idCorrecto = item.id; 

  this.uiService.mostrarToast('🗑️ Eliminando línea de forma permanente...', 'warning');

  this.ordenService.eliminarLineaOrden(orden.id, idCorrecto).subscribe({
    next: () => {
      this.uiService.mostrarToast('✨ ¡Línea eliminada e inventario/totales recalculados!', 'success');
      
      // Actualizamos el modal en caliente con los datos que devuelve el motor de Java
      this.cargarDatosDelServidor(); 
      this.cerrarModal(); 
    },
    error: (err) => {
      console.error(err);
      this.uiService.mostrarToast('No se pudo eliminar la línea: ' + (err.error?.message || err.message), 'error');
    }
  });
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

  empezarTrabajo(ordenId: number) {
    this.guardarCambiosFlujoServidor(ordenId, () => {
      this.uiService.mostrarToast('¡Trabajo iniciado en taller!', 'success');
      this.cargarDatosDelServidor();
      this.cerrarModal();
    });
  }

  finalizarReparacion(ordenId: number) {
    this.guardarCambiosFlujoServidor(ordenId, () => {
      this.ordenService.terminarReparacion(ordenId).subscribe({
        next: () => {
          this.uiService.mostrarToast('Reparación finalizada. Pasada a "Listos para recoger".', 'success');
          this.cargarDatosDelServidor();
          this.cerrarModal();
        },
        error: () => this.uiService.mostrarToast('Error al terminar reparación', 'error')
      });
    });
  }

  guardarCambiosReparacion() {
    const orden = this.ordenSeleccionada();
    if (!orden) return;

    this.guardarCambiosFlujoServidor(orden.id, () => {
      this.uiService.mostrarToast('Ticket y desgloses actualizados correctamente.', 'success');
      this.cargarDatosDelServidor();
      this.cerrarModal();
    });
  }

  private guardarCambiosFlujoServidor(ordenId: number, callbackSuccess: () => void) {
  // 1. Filtramos las líneas que son servicios/reparaciones
  const serviciosAActualizar = this.detallesEditados.filter(d => d.esServicio);

  if (serviciosAActualizar.length === 0) {
    callbackSuccess();
    return;
  }

  this.uiService.mostrarToast('Guardando líneas una a una de forma segura...', 'warning');

  // 2. Función recursiva para ejecutar las peticiones en orden SECUENCIAL
  const guardarLineaSecuencial = (indice: number) => {
    // Si ya hemos procesado todos los artículos, disparamos el éxito general
    if (indice >= serviciosAActualizar.length) {
      callbackSuccess();
      return;
    }

    const linea = serviciosAActualizar[indice];
    const notaFinal = linea.notasReparacion || linea.notas || '';
    
    // Si el id es igual a la posición en el array (temporal), mandamos null
    const idLineaCorrecto = (typeof linea.id === 'number' && linea.id === indice) ? null : linea.id;

    // Ejecutamos la petición para ESTA línea
    this.ordenService.editarReparacion(ordenId, notaFinal, linea.fechaEntrega, idLineaCorrecto).subscribe({
      next: () => {
        // 🚀 ÉXITO: Cuando termina de guardar una línea, llamamos a la siguiente
        guardarLineaSecuencial(indice + 1);
      },
      error: (err) => {
        console.error(`Error al guardar la línea con ID ${idLineaCorrecto}:`, err);
        this.uiService.mostrarToast('Error al actualizar las notas de uno de los artículos.', 'error');
      }
    });
  };

  // 3. Arrancamos el bucle secuencial desde la primera línea (índice 0)
  guardarLineaSecuencial(0);
 }

  cambiarPrecioLineaEspecifica(item: any) {
  const precioLimpio = item.nuevoPrecioInput.toString().replace(',', '.');
  const precioParsed = parseFloat(precioLimpio);
  const orden = this.ordenSeleccionada();
  
  if (!orden || isNaN(precioParsed) || precioParsed <= 0) {
    this.uiService.mostrarToast('Introduce un precio válido mayor que 0.', 'warning');
    return;
  }

  // Aseguramos formato decimal limpio (ej: "10.00") por si Spring Boot se pone estricto con los tipos
  const precioFinal = precioParsed.toFixed(2);

  // Si 'item.articuloId' (2) te da Bad Request, cambia esto a: item.id || item.articuloId
  const idCorrecto = item.id || item.articuloId;

  this.uiService.mostrarToast(`⚡ Modificando precio de la línea a ${precioFinal}€...`, 'warning');

  this.ordenService.cambiarPrecioOrden(orden.id, parseFloat(precioFinal), idCorrecto).subscribe({
    next: () => {
      this.uiService.mostrarToast('💰 ¡Línea modificada y ticket recalculado con éxito!', 'success');
      this.cargarDatosDelServidor();
      this.cerrarModal();
    },
    error: (err) => {
      console.error('Error del backend:', err);
      this.uiService.mostrarToast('No se pudo cambiar el precio: ' + (err.error?.message || 'Fallo en servidor'), 'error');
    }
  });
}

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

  seleccionarMetodoPago(metodo: MetodoPago) {
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

  abrirPanelDevolucion() {
    this.metodoDevolucion.set('EFECTIVO');
    this.mostrarModalDevolucion.set(true);
  }

  cerrarPanelDevolucion() { this.mostrarModalDevolucion.set(false); }

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
        this.cargarDatosDelServidor();
      },
      error: (err) => this.uiService.mostrarToast('Error al procesar la devolución: ' + (err.error || err.message), 'error')
    });
  }

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
  // LOGICA DEL NUEVO TECLADO VIRTUAL TÁCTIL
  // =========================================================================
  activarTeclado(campo: string, indexLinea?: number | null) {
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
  } else if (campo === 'notas-linea' && idx !== null) {
    // Inicializamos con string vacío tanto 'notas' como 'notasReparacion' para curarnos en salud
    if (!this.detallesEditados[idx].notasReparacion) this.detallesEditados[idx].notasReparacion = '';
    if (!this.detallesEditados[idx].notas) this.detallesEditados[idx].notas = '';

    this.detallesEditados[idx].notasReparacion += caracterProcesado;
    this.detallesEditados[idx].notas += caracterProcesado; // Mantenemos ambos actualizados
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
  } else if (campo === 'notas-linea' && idx !== null) {
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
  } else if (campo === 'notas-linea' && idx !== null) {
    // 🚀 CORREGIDO: Arreglada la 'e' intrusa que rompía el método
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