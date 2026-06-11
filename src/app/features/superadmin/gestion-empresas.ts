import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { UiService } from '../../core/services/ui.service';

@Component({
  selector: 'app-gestion-empresas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-empresas.html',
  styleUrls: ['./gestion-empresas.scss']
})
export class GestionEmpresasComponent implements OnInit {
  private configService = inject(ConfiguracionService);
  public uiService = inject(UiService);

  // Signals para reactividad limpia
  empresas = signal<any[]>([]);
  loading = signal<boolean>(false);
  
  // Modales y control de flujos
  mostrarModalAlta = signal<boolean>(false);
  mostrarModalReset = signal<boolean>(false);
  passwordTemporalGenerada = signal<string>('');

  // Formularios reactivos simplificados (ngModule)
  nuevaEmpresa = {
    nombreComercial: '',
    cif: '',
    direccion: '',
    ciudad: '',
    telefono: '',
    emailAdmin: '',
    nombreAdmin: '',
    passwordAdmin: ''
  };

  ngOnInit(): void {
    this.cargarEmpresas();
  }

  cargarEmpresas(): void {
    this.loading.set(true);
    this.configService.obtenerEstadoHacienda().subscribe({
      next: (data) => {
        this.empresas.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'Error al conectar con el servidor';
        this.uiService.mostrarToast(`Monitorización fallida: ${msgError}`, 'error');
        this.loading.set(false);
      }
    });
  }

  // Botón del Pánico (Suspender / Activar)
  alternarEstado(id: number): void {
    this.configService.alternarBotonPanico(id).subscribe({
      next: (res) => {
      this.uiService.mostrarToast(res?.mensaje || 'Estado de la empresa actualizado', 'success');
      this.cargarEmpresas();
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'No se pudo cambiar el estado';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  // Cambio de Email de Gestión
  cambiarEmail(id: number, emailActual: string): void {
    const nuevoEmail = prompt('Introduce el nuevo email para el administrador de esta empresa:', emailActual);
    if (!nuevoEmail || nuevoEmail === emailActual) return;

    this.configService.cambiarEmailPropietario(id, nuevoEmail).subscribe({
      next: (res) => {
        this.uiService.mostrarToast(res.mensaje || 'Email actualizado con éxito', 'success');
        this.cargarEmpresas(); // Refrescamos la lista para ver el cambio si es necesario
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'Error al actualizar el email';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  // Reseteo Maestro de Contraseña (Muestra contraseña temporal)
  resetearClave(id: number): void {
    if (!confirm('¿Estás seguro de que quieres resetear la clave de acceso de este Administrador?')) return;

    this.configService.resetearPasswordPropietario(id).subscribe({
      next: (res) => {
        this.passwordTemporalGenerada.set(res.passwordTemporal);
        this.mostrarModalReset.set(true);
        this.uiService.mostrarToast('Nueva contraseña maestra generada', 'warning');
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'Error en el reseteo de contraseña';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  // Alta Rápida de Empresa e Inquilino
  ejecutarAlta(): void {
    this.configService.crearInquilino(this.nuevaEmpresa).subscribe({
      next: (msg) => {
        this.uiService.mostrarToast(msg || 'Empresa e Inquilino creados correctamente', 'success');
        this.mostrarModalAlta.set(false);
        this.cargarEmpresas();
        this.resetFormularioAlta();
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'Error al procesar el alta rápida';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  resetFormularioAlta(): void {
    this.nuevaEmpresa = { 
      nombreComercial: '', 
      cif: '', 
      direccion: '', 
      ciudad: '', 
      telefono: '', 
      emailAdmin: '', 
      nombreAdmin: '', 
      passwordAdmin: '' 
    };
  }
}