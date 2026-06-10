import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracionService } from '../../core/services/configuracion.service';

@Component({
  selector: 'app-gestion-empresas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-empresas.html',
  styleUrls: ['./gestion-empresas.scss']
})
export class GestionEmpresasComponent implements OnInit {
  private configService = inject(ConfiguracionService);

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
        console.error('Error al cargar la monitorización', err);
        this.loading.set(false);
      }
    });
  }

  // 🚀 Botón del Pánico (Suspender / Activar)
  alternarEstado(id: number): void {
    this.configService.alternarBotonPanico(id).subscribe({
      next: () => this.cargarEmpresas(),
      error: (err) => alert('Error al cambiar el estado: ' + err.error)
    });
  }

  // 🔐 Cambio de Email de Gestión
  cambiarEmail(id: number, emailActual: string): void {
    const nuevoEmail = prompt('Introduce el nuevo email para el administrador de esta empresa:', emailActual);
    if (!nuevoEmail || nuevoEmail === emailActual) return;

    this.configService.cambiarEmailPropietario(id, nuevoEmail).subscribe({
      next: (res) => alert(res.mensaje),
      error: (err) => alert('Error: ' + err.error)
    });
  }

  // 🔑 Reseteo Maestro de Contraseña (Muestra contraseña temporal)
  resetearClave(id: number): void {
    if (!confirm('¿Estás seguro de que quieres resetear la clave de acceso de este Administrador?')) return;

    this.configService.resetearPasswordPropietario(id).subscribe({
      next: (res) => {
        this.passwordTemporalGenerada.set(res.passwordTemporal);
        this.mostrarModalReset.set(true);
      },
      error: (err) => alert('Error en el reseteo: ' + err.error)
    });
  }

  // ⚡ Alta Rápida de Empresa e Inquilino
  ejecutarAlta(): void {
    this.configService.crearInquilino(this.nuevaEmpresa).subscribe({
      next: (msg) => {
        alert(msg);
        this.mostrarModalAlta.set(false);
        this.cargarEmpresas();
        this.resetFormularioAlta();
      },
      error: (err) => alert('Error en alta: ' + err.error)
    });
  }

  resetFormularioAlta(): void {
    this.nuevaEmpresa = { nombreComercial: '', cif: '', direccion: '', ciudad: '', telefono: '', emailAdmin: '', nombreAdmin: '', passwordAdmin: '' };
  }
}