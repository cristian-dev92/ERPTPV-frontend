import { Component, OnInit, inject, signal, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, ClienteDTO, NuevoClienteRequest } from '../../core/services/cliente.service';
import { UiService } from '../../core/services/ui.service';
import { isMobileOrTablet } from '../../core/utils/device-utils';
import { ComponentePaginado } from '../../core/utils/paginado-base';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss'
})
export class ClientesComponent extends ComponentePaginado implements OnInit {
  private clienteService = inject(ClienteService);
  private uiService = inject(UiService);

  modoModalSolo = input<boolean>(false);
  //Emitir el cliente seleccionado o creado hacia el componente TPV
  onClienteSeleccionado = output<ClienteDTO>();

  clientes = signal<ClienteDTO[]>([]);
  mostrarModalRegistro = signal<boolean>(false);
  filtroBusqueda = signal<string>('');
  cargando = signal<boolean>(false);

  nuevoCliente = signal<NuevoClienteRequest & { activo?: boolean }>({
    nombre: '',
    telefono: '',
    email: '',
    documentoIdentidad: '',
    direccion: '',
    codigoPostal: '',
    ciudad: '',
    lopdAceptada: false, // Cumplimiento LOPD Obligatorio
    activo: true        // Borrado lógico inicial por defecto
  });

  // FILTRADO AUTOMÁTICO EN TIEMPO REAL (Client-side con Signals)
  clientesFiltrados = computed(() => {
    const filtro = this.filtroBusqueda().toLowerCase().trim();
    if (!filtro) return this.clientes();
    
    return this.clientes().filter(c => 
      c.nombre.toLowerCase().includes(filtro) ||
      (c.documentoIdentidad && c.documentoIdentidad.toLowerCase().includes(filtro)) ||
      (c.telefono && c.telefono.includes(filtro)) ||
      (c.email && c.email.toLowerCase().includes(filtro)) ||
      (c.direccion && c.direccion.toLowerCase().includes(filtro)) ||
      (c.codigoPostal && c.codigoPostal.includes(filtro)) ||
      (c.ciudad && c.ciudad.toLowerCase().includes(filtro))
    );
  });

  // --- CONFIGURACIÓN TECLADO TÁCTIL ---
  mostrarTeclado = signal<boolean>(false);
  inputActivo = signal<string>('');
  valorTecladoEnConstruccion = signal<string>('');
  mayusculas = signal<boolean>(true);

  // Filas base (Estrictamente alfabéticas y limpias)
  lineaLetras1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  lineaLetras2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'];
  lineaLetras3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
  lineaNumeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  // Vocales con acento para cuando se necesiten (se pueden pintar en una mini-fila lateral o superior)
  lineaAcentos = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];

  // Fila variable inteligente según el input
  get lineaEspecialDinamica(): string[] {
    const input = this.inputActivo().toLowerCase();
    if (input.includes('email') || input.includes('correo')) {
      return ['@', '.', '-', '_', '.com', '.es', '.net'];
    }
    if (input.includes('pass') || input.includes('password') || input.includes('clave')) {
      return ['@', '.', '_', '-', '!', '#', '$', '%'];
    }
    return ['@', ',', '.', '_', '/', '%', '&', '"', '(', ')', '¡', '!', '¿', '?'];
  }

  // CONTROL DE MODO MODAL PARA SELECCIÓN RÁPIDA DESDE TPV
  modoEdicion = signal<boolean>(false);
  clienteSeleccionadoId = signal<number | null>(null);

  // SIGNALS PARA CONTROL DE MODAL DE CONFIRMACIÓN DE BORRADO
  mostrarModalBorrar = signal<boolean>(false);
  clienteABorrarId = signal<number | null>(null);
  clienteABorrarNombre = signal<string>('');

  constructor() {
    super(); // Llama al constructor de la clase base
  }

  ngOnInit() {
    this.cargarDatos();
    // Si se invoca exclusivamente desde el TPV para registrar, forzamos la apertura del formulario
    if (this.modoModalSolo()) {
    this.abrirModal();
   }
  }

  // Obligatorio implementar este método (lo pide la clase base)
  cargarDatos(): void {
    this.cargando.set(true);
    this.clienteService.getClientesPaginados(this.paginaActual(), this.itemsPorPagina())
      .subscribe({
        next: (data: any) => {
          // data.content trae los 20 registros de la página actual
          this.clientes.set(data.content);
          this.totalElementos.set(data.totalElements || data.total || 0);
          this.cargando.set(false);
        },
        error: (err) => {
          this.uiService.mostrarToast('Error al cargar clientes paginados: ' + (err.error || err.message), 'error');
          this.cargando.set(false);
        }
      });
  } 

  // ⌨️ MÉTODOS DEL TECLADO TÁCTIL
  abrirTeclado(objetivo: string, valorActual: string = '') {
    if (isMobileOrTablet()) return; // Dispositivos móviles usan teclado nativo
    this.inputActivo.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActual || '');
    this.mostrarTeclado.set(true);
  }

  pulsarTecla(caracter: string) {
    let valorAInsertar = caracter;
    if (/^[a-zA-ZÑñÁÉÍÓÚÜáéíóúü]$/.test(caracter)) {
      valorAInsertar = this.mayusculas() ? caracter.toUpperCase() : caracter.toLowerCase();
    }
    this.valorTecladoEnConstruccion.set(this.valorTecladoEnConstruccion() + valorAInsertar);
    this.actualizarCampoDestino(this.valorTecladoEnConstruccion());
  }

  alternarMayusculas() {
    this.mayusculas.set(!this.mayusculas());
  }

  borrarUltimoCaracter() {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
    this.actualizarCampoDestino(this.valorTecladoEnConstruccion());
  }

  limpiarTeclado() {
    this.valorTecladoEnConstruccion.set('');
    this.actualizarCampoDestino('');
  }

  cerrarTeclado() {
    this.mostrarTeclado.set(false);
  }

  private actualizarCampoDestino(valor: string) {
    const campo = this.inputActivo();
    if (campo === 'BUSQUEDA') {
      this.filtroBusqueda.set(valor);
      return;
    }
    this.nuevoCliente.update(cliente => {
      const act = { ...cliente };
      if (campo === 'NOMBRE') act.nombre = valor;
      if (campo === 'TELEFONO') act.telefono = valor;
      if (campo === 'DNI') act.documentoIdentidad = valor;
      if (campo === 'EMAIL') act.email = valor.toLowerCase();
      if (campo === 'DIRECCION') act.direccion = valor;
      if (campo === 'CP') act.codigoPostal = valor;
      if (campo === 'CIUDAD') act.ciudad = valor;
      return act;
    });
  }
  
  cargarClientes() {
    this.cargando.set(true);
    this.clienteService.obtenerMisClientes().subscribe({
      next: (data) => {
        this.clientes.set(data);
        this.cargando.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al cargar clientes: ' + (err.error || err.message), 'error');
        this.cargando.set(false);
      }
    });
  }

  buscarClientes() {
    const termino = this.filtroBusqueda().trim();
    if (!termino) {
      this.cargarDatos();
      return;
    }

    this.cargando.set(true);
    const esNumero = /^\+?[0-9\s\-]+$/.test(termino);

    if (esNumero) {
      this.clienteService.buscarPorTelefono(termino).subscribe({
        next: (cliente) => {
          this.clientes.set([cliente]);
          this.cargando.set(false);
        },
        error: () => {
          this.clientes.set([]);
          this.cargando.set(false);
        }
      });
    } else {
      this.clienteService.buscarPorNombre(termino).subscribe({
        next: (data) => {
          this.clientes.set(data);
          this.cargando.set(false);
        },
        error: () => {
          this.clientes.set([]);
          this.cargando.set(false);
        }
      });
    }
  }

  abrirModal() {
    this.nuevoCliente.set({
      nombre: '',
      telefono: '',
      email: '',
      documentoIdentidad: '',
      direccion: '',
      codigoPostal: '',
      ciudad: '',
      lopdAceptada: false, // Reseteo LOPD obligatorio al dar de alta
      activo: true
    });
    this.mostrarModalRegistro.set(true);
  }

  cerrarModal() {
    this.mostrarModalRegistro.set(false);
  }

  seleccionarCliente(cliente: ClienteDTO) {
    // Evitamos vincular clientes inactivos por borrado lógico
    if (cliente.activo === false) {
      this.uiService.mostrarToast('No puedes asociar un cliente dado de baja', 'error');
      return;
    }
    this.onClienteSeleccionado.emit(cliente); // Mandamos el objeto completo al TPV
    this.uiService.mostrarToast(`👤 Cliente "${cliente.nombre}" vinculado a la venta`, 'success');
  }

  guardarCliente() {
    const datos = this.nuevoCliente();

    if (!datos.nombre.trim()) {
      this.uiService.mostrarToast('El nombre del cliente es obligatorio', 'warning');
      return;
    }

    if (!datos.telefono.trim()) {
      this.uiService.mostrarToast('El teléfono es obligatorio para avisar de las reparaciones', 'warning');
      return;
    }

    // CONTROL DE LOPD EN CREACIÓN: Bloquear si no se marca el Checkbox obligatorio
    if (!this.modoEdicion() && !datos.lopdAceptada) {
      this.uiService.mostrarToast('Debe aceptar la cláusula LOPD/RGPD para registrar al cliente', 'warning');
      return;
    }

    if (this.modoEdicion()) {
      // Flujo de Edición / Modificación en Backend
      const idCliente = this.clienteSeleccionadoId();
      if (!idCliente) return;

      this.clienteService.actualizarCliente(idCliente, datos).subscribe({
        next: (clienteActualizado) => {
          this.uiService.mostrarToast(`👤 Ficha de "${clienteActualizado.nombre}" modificada con éxito`, 'success');
          
          // Actualizamos la lista local en caliente sin perder la posición
          this.clientes.update(list => list.map(c => c.id === idCliente ? clienteActualizado : c));
          
          this.cerrarModal();
        },
        error: (err) => {
          this.uiService.mostrarToast('Error al actualizar ficha: ' + (err.error || err.message), 'error');
        }
      });
    } else {
      // Flujo de Creación Tradicional
      this.clienteService.crearCliente(datos).subscribe({
        next: (clienteCreado) => {
          this.uiService.mostrarToast(`👤 Ficha de "${clienteCreado.nombre}" creada con éxito`, 'success');
          this.clientes.update(list => [clienteCreado, ...list]);
          this.onClienteSeleccionado.emit(clienteCreado);
          this.cerrarModal();
        },
        error: (err) => {
          this.uiService.mostrarToast('Error al registrar cliente: ' + (err.error || err.message), 'error');
        }
      });
    }
  }

  editarCliente(cliente: ClienteDTO) {
    this.modoEdicion.set(true);
    this.clienteSeleccionadoId.set(cliente.id);

    // Mapeamos los campos existentes al signal del formulario de tu teclado
    this.nuevoCliente.set({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email || '',
      documentoIdentidad: cliente.documentoIdentidad || '',
      direccion: cliente.direccion || '',
      codigoPostal: cliente.codigoPostal || '',
      ciudad: cliente.ciudad || '',
      lopdAceptada: cliente.lopdAceptada || false, 
      activo: cliente.activo ?? true // Respetamos el borrado lógico que traiga el DTO
    });

    this.mostrarModalRegistro.set(true);
    this.uiService.mostrarToast(`Modificando ficha de ${cliente.nombre}`, 'warning');
  }

  eliminarCliente(id: number) {
    this.uiService.mostrarToast('Procesando baja en el archivo...', 'warning');

    this.clienteService.eliminarCliente(id).subscribe({
      next: () => {
        this.uiService.mostrarToast('🚫 Ficha de cliente eliminada correctamente', 'success');
        // Filtramos el array local reactivamente para quitar al cliente borrado
        this.clientes.update(list => list.filter(c => c.id !== id));
      },
      error: (err) => {
        console.error(err);
        this.uiService.mostrarToast('No se puede eliminar un cliente con reparaciones o compras históricas activas.', 'error');
      }
    });
  }

   // Cambiamos el método original por este para que primero "pregunte"
    solicitarConfirmacionBorrar(p: ClienteDTO) {
      this.clienteABorrarId.set(p.id);
      this.clienteABorrarNombre.set(p.nombre);
      this.mostrarModalBorrar.set(true);
    }
  
    cerrarModalBorrar() {
      this.mostrarModalBorrar.set(false);
      this.clienteABorrarId.set(null);
      this.clienteABorrarNombre.set('');
    }
  
    // Este método se ejecutará solo cuando pulse "Sí, Eliminar" en el modal
    confirmarEliminar() {
      const id = this.clienteABorrarId();
      if (!id) return;
  
      this.uiService.mostrarToast('Procesando baja en el archivo...', 'warning');
  
      this.clienteService.eliminarCliente(id).subscribe({
        next: () => {
          this.uiService.mostrarToast(`👤 Cliente eliminado con éxito`, 'success');
          // Al ser borrado lógico, actualizamos la lista local cambiando el flag activo a false  o eliminando de la vista según prefieras. Aquí lo marcamos inactivo:
          this.clientes.update(list => list.filter(c => c.id !== id));
          this.cerrarModalBorrar();
        },
        error: (err) => {
          console.error(err);
          this.uiService.mostrarToast('Error al eliminar cliente: ' + (err.error || err.message), 'error');
          this.cerrarModalBorrar();
        }
      });
    }

}