import { Component, OnInit, inject, signal, input, output } from '@angular/core';
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

  ngOnInit() {
    this.cargarClientes();
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