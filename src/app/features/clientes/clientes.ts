import { Component, OnInit, inject, signal, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClienteService, ClienteDTO, NuevoClienteRequest } from '../../core/services/cliente.service';
import { UiService } from '../../core/services/ui.service';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss'
})
export class ClientesComponent implements OnInit {
  private clienteService = inject(ClienteService);
  private uiService = inject(UiService);
  modoModalSolo = input<boolean>(false);

  //Emitir el cliente seleccionado o creado hacia el componente TPV
  onClienteSeleccionado = output<ClienteDTO>();

  clientes = signal<ClienteDTO[]>([]);
  mostrarModalRegistro = signal<boolean>(false);
  filtroBusqueda = signal<string>('');
  cargando = signal<boolean>(false);

  nuevoCliente = signal<NuevoClienteRequest>({
    nombre: '',
    telefono: '',
    email: '',
    documentoIdentidad: '',
    direccion: '',
    codigoPostal: '',
    ciudad: ''
  });

  // 🎯 FILTRADO AUTOMÁTICO EN TIEMPO REAL (Client-side con Signals)
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

  // SIGNALS PARA EL CONTROL DEL TECLADO GENERAL
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<string>('');
  valorTecladoEnConstruccion = signal<string>('');
  mayusculasGeneral = signal<boolean>(true);

  // CONTROL DE MODO MODAL PARA SELECCIÓN RÁPIDA DESDE TPV
  modoEdicion = signal<boolean>(false);
  clienteSeleccionadoId = signal<number | null>(null);

  // SIGNALS PARA CONTROL DE MODAL DE CONFIRMACIÓN DE BORRADO
  mostrarModalBorrar = signal<boolean>(false);
  clienteABorrarId = signal<number | null>(null);
  clienteABorrarNombre = signal<string>('');



  ngOnInit() {
    this.cargarClientes();
  }

  // ⌨️ MÉTODOS DEL TECLADO TÁCTIL
  abrirTecladoGeneralForm(
    objetivo: 'NOMBRE' | 'TELEFONO' | 'DNI' | 'EMAIL' | 'DIRECCION' | 'CP' | 'CIUDAD' | 'BUSQUEDA',
  index?: number | null | undefined,
  valorActualForm: string = '') 
  {
    this.inputObjetivoTeclado.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActualForm || '');
    this.mostrarTecladoGeneral.set(true);
  }

  pulsarTeclaGeneral(caracter: string) {
   // 🚀 NUEVO: Procesamos si el carácter es una letra para respetar el estado de las mayúsculas
    let valorAInsertar = caracter;
    const esLetra = /^[a-zA-ZÑñ]$/.test(caracter);
    
    if (esLetra) {
      valorAInsertar = this.mayusculasGeneral() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    // Mantenemos tu lógica original de actualización de strings y filtrado reactivo al vuelo
    this.valorTecladoEnConstruccion.set(this.valorTecladoEnConstruccion() + valorAInsertar);
    
    if (this.inputObjetivoTeclado() === 'BUSQUEDA') {
      this.filtroBusqueda.set(this.valorTecladoEnConstruccion());
    }
  }

  alternarMayusculasGeneral() {
    this.mayusculasGeneral.set(!this.mayusculasGeneral());
  }

  borrarUltimoCaracterGeneral() {
   this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
    
    // 💡 Clonamos la validación del filtro para que la búsqueda responda también al borrar de forma táctil
    if (this.inputObjetivoTeclado() === 'BUSQUEDA') {
      this.filtroBusqueda.set(this.valorTecladoEnConstruccion());
    }
  }

  limpiarTecladoGeneral() {
    this.valorTecladoEnConstruccion.set('');
    
    if (this.inputObjetivoTeclado() === 'BUSQUEDA') {
      this.filtroBusqueda.set('');
    }
  }

  cerrarTecladoGeneral() {
    this.mostrarTecladoGeneral.set(false);
    this.inputObjetivoTeclado.set('');
    this.valorTecladoEnConstruccion.set('');
  }

  // 🎯 VOLCAR EL TEXTO CONSTRUIDO AL SIGNAL NUEVOCLIENTE
  aplicarTextoAlFormulario() {
    const campo = this.inputObjetivoTeclado();
    const valor = this.valorTecladoEnConstruccion();

    if (campo === 'BUSQUEDA'){ 
      this.filtroBusqueda.set(valor);
      this.cerrarTecladoGeneral();
      return;
    }

    this.nuevoCliente.update(cliente => {
      const actualizacion = { ...cliente };
      if (campo === 'NOMBRE') actualizacion.nombre = valor;
      if (campo === 'TELEFONO') actualizacion.telefono = valor;
      if (campo === 'DNI') actualizacion.documentoIdentidad = valor;
      if (campo === 'EMAIL') actualizacion.email = valor.toLowerCase(); 
      if (campo === 'DIRECCION') actualizacion.direccion = valor;
      if (campo === 'CP') actualizacion.codigoPostal = valor;
      if (campo === 'CIUDAD') actualizacion.ciudad = valor;
      return actualizacion;
    });

    this.cerrarTecladoGeneral();
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
      this.cargarClientes();
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
      ciudad: ''
    });
    this.mostrarModalRegistro.set(true);
  }

  cerrarModal() {
    this.mostrarModalRegistro.set(false);
  }

  seleccionarCliente(cliente: ClienteDTO) {
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
      ciudad: cliente.ciudad || ''
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