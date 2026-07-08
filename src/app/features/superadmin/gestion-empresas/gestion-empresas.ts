import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';
import { EmpresaEstadoDTO, NuevaEmpresaRequest, SuperAdminService } from '../../../core/services/superdamin.service';

@Component({
  selector: 'app-gestion-empresas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './gestion-empresas.html',
  styleUrls: ['./gestion-empresas.scss']
})
export class GestionEmpresasComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  public uiService = inject(UiService);

  // Signals reactivas con tipos estrictos
  empresas = signal<EmpresaEstadoDTO[]>([]);
  loading = signal<boolean>(false);
  
  // Modales de flujo
  mostrarModalAlta = signal<boolean>(false);
  mostrarModalPanic = signal<boolean>(false);

  // Estado para la empresa que se va a bloquear/desbloquear
  empresaSeleccionadaPanic = signal<EmpresaEstadoDTO | null>(null);

  // Molde del formulario de alta rápida
  nuevaEmpresa: NuevaEmpresaRequest = {
    nombreComercial: '',
    nif: '',
    direccion: '',
    ciudad: '',
    codigoPostal: '',
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
    this.superAdminService.obtenerEstadoEmpresas().subscribe({
      next: (data) => {
        this.empresas.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.uiService.mostrarToast('Error al sincronizar el estado de las empresas', 'error');
        this.loading.set(false);
      }
    });
  }

  // Abre el modal táctil de confirmación para el Botón del Pánico
  solicitarConfirmacionPanic(empresa: EmpresaEstadoDTO): void {
    this.empresaSeleccionadaPanic.set(empresa);
    this.mostrarModalPanic.set(true);
  }

  cerrarModalPanic(): void {
    this.mostrarModalPanic.set(false);
    this.empresaSeleccionadaPanic.set(null);
  }

  // Ejecuta la suspensión o activación definitiva tras confirmar en el modal
  confirmarAlternarEstado(): void {
    const empresa = this.empresaSeleccionadaPanic();
    if (!empresa) return;

    this.superAdminService.alternarBloqueoEmpresa(empresa.id).subscribe({
      next: (res) => {
        this.uiService.mostrarToast(res?.mensaje || 'Estado de la empresa actualizado', 'success');
        this.cerrarModalPanic();
        this.cargarEmpresas();
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'No se pudo cambiar el estado de la empresa';
        this.uiService.mostrarToast(msgError, 'error');
        this.cerrarModalPanic();
      }
    });
  }

  // Alta Rápida de Empresa e Inquilino Tenant
  ejecutarAlta(): void {
    this.superAdminService.crearEmpresaYAdmin(this.nuevaEmpresa).subscribe({
      next: (msg) => {
        // Tu backend devuelve un string plano, lo mostramos directamente
        this.uiService.mostrarToast(msg || 'Empresa e Inquilino creados correctamente', 'success');
        this.mostrarModalAlta.set(false);
        this.cargarEmpresas();
        this.resetFormularioAlta();
      },
      error: (err) => {
        const msgError = err.error || 'Error al procesar el alta rápida';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  resetFormularioAlta(): void {
    this.nuevaEmpresa = { 
      nombreComercial: '',
      nif: '',
      direccion: '', 
      ciudad: '', 
      codigoPostal: '',
      telefono: '', 
      emailAdmin: '', 
      nombreAdmin: '', 
      passwordAdmin: '' 
    };
  }
}