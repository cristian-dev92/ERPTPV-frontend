import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiService } from '../../../core/services/ui.service';
import { JefeAdminDTO, SuperAdminService } from '../../../core/services/superdamin.service';

@Component({
  selector: 'app-gestion-jefes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './gestion-jefes.html',
  styleUrls: ['./gestion-jefes.scss']
})
export class GestionJefesComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  public uiService = inject(UiService);

  // Estados reactivos
  jefes = signal<JefeAdminDTO[]>([]);
  loading = signal<boolean>(false);

  // Control de Modales Táctiles
  mostrarModalEmail = signal<boolean>(false);
  mostrarModalClave = signal<boolean>(false);

  // Datos operacionales intermedios
  jefeSeleccionado = signal<JefeAdminDTO | null>(null);
  nuevoEmailInput = signal<string>('');
  passwordTemporalGenerada = signal<string>('');

  ngOnInit(): void {
    this.cargarJefes();
  }

  cargarJefes(): void {
    this.loading.set(true);
    this.superAdminService.obtenerTodosLosJefes().subscribe({
      next: (data) => {
        this.jefes.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.uiService.mostrarToast('Error al cargar la lista de administradores', 'error');
        this.loading.set(false);
      }
    });
  }

  // --- FLUJO: MODIFICACIÓN DE EMAIL ---
  abrirModalEmail(jefe: JefeAdminDTO): void {
    this.jefeSeleccionado.set(jefe);
    this.nuevoEmailInput.set(jefe.email); // Precargamos el email actual
    this.mostrarModalEmail.set(true);
  }

  cerrarModalEmail(): void {
    this.mostrarModalEmail.set(false);
    this.jefeSeleccionado.set(null);
    this.nuevoEmailInput.set('');
  }

  ejecutarCambioEmail(): void {
    const jefe = this.jefeSeleccionado();
    const nuevoEmail = this.nuevoEmailInput().trim();

    if (!jefe || !nuevoEmail) return;
    if (nuevoEmail === jefe.email) {
      this.uiService.mostrarToast('El email es idéntico al actual', 'warning');
      return;
    }

    this.superAdminService.actualizarEmailPropietario(jefe.empresaId, nuevoEmail).subscribe({
      next: (res) => {
        this.uiService.mostrarToast(res.mensaje || 'Email de acceso actualizado', 'success');
        this.cerrarModalEmail();
        this.cargarJefes();
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'El email ya está registrado o es inválido';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  // --- FLUJO: REGENERACIÓN DE CLAVE MAESTRA ---
  solicitarResetClave(jefe: JefeAdminDTO): void {
    this.superAdminService.generarPasswordTemporalAdmin(jefe.empresaId).subscribe({
      next: (res) => {
        this.passwordTemporalGenerada.set(res.passwordTemporal);
        this.mostrarModalClave.set(true);
        this.uiService.mostrarToast('Nueva contraseña de contingencia generada', 'warning');
      },
      error: (err) => {
        const msgError = err.error?.mensaje || 'Error al restablecer la credencial';
        this.uiService.mostrarToast(msgError, 'error');
      }
    });
  }

  cerrarModalClave(): void {
    this.mostrarModalClave.set(false);
    this.passwordTemporalGenerada.set('');
  }
}