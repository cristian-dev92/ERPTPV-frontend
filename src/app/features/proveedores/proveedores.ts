import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProveedorService, ProveedorDTO, NuevoProveedorRequest } from '../../core/services/proveedor.service';
import { UiService } from '../../core/services/ui.service'; // Ajusta la ruta a tu servicio de notificaciones

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.scss'
})
export class ProveedoresComponent implements OnInit {
  private proveedorService = inject(ProveedorService);
  private uiService = inject(UiService);

  // === ESTADOS REACTIVOS ===
  proveedores = signal<ProveedorDTO[]>([]);
  mostrarModalRegistro = signal<boolean>(false);

  // Molde vacío para el formulario
  nuevoProveedor = signal<NuevoProveedorRequest>({
    nombre: '',
    cif: '',
    emailPedidos: '',
    telefono: '',
    direccion: ''
  });

  ngOnInit() {
    this.cargarProveedores();
  }

  cargarProveedores() {
    this.proveedorService.obtenerMisProveedores().subscribe({
      next: (data) => this.proveedores.set(data),
      error: (err) => this.uiService.mostrarToast('Error al cargar proveedores: ' + err.message, 'error')
    });
  }

  abrirModal() {
    this.nuevoProveedor.set({
      nombre: '',
      cif: '',
      emailPedidos: '',
      telefono: '',
      direccion: ''
    });
    this.mostrarModalRegistro.set(true);
  }

  cerrarModal() {
    this.mostrarModalRegistro.set(false);
  }

  guardarProveedor() {
    const datos = this.nuevoProveedor();
    
    if (!datos.nombre.trim()) {
      this.uiService.mostrarToast('El nombre del proveedor es obligatorio', 'warning');
      return;
    }

    this.proveedorService.crearProveedor(datos).subscribe({
      next: (proveedorCreado) => {
        this.uiService.mostrarToast(`📦 Proveedor "${proveedorCreado.nombre}" registrado con éxito`, 'success');
        
        // Actualizamos la lista local añadiendo el nuevo al principio
        this.proveedores.update(list => [proveedorCreado, ...list]);
        this.cerrarModal();
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al crear proveedor: ' + (err.error || err.message), 'error');
      }
    });
  }
}