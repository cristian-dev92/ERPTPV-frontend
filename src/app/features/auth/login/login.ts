import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';
import { UiService } from '../../../core/services/ui.service';
import { isMobileOrTablet } from '../../../core/utils/device-utils';
import { LoginRequest } from '../../../core/models/auth.model';

/** Perfil de acceso rápido para la demo del Login */
interface DemoPerfil {
  clave: string;
  etiqueta: string;
  icono: string;
  descripcion: string;
  email: string;
  password: string;
}

/** Credenciales de demostración (deben existir en el backend / BD) */
const PERFILES_DEMO: DemoPerfil[] = [
  {
    clave: 'superadmin',
    etiqueta: 'SuperAdmin',
    icono: '🛡️',
    descripcion: 'Gestión global multi-tenant y plataforma',
    email: 'superadmin@erp.com',
    password: 'Master1234!'
  },
  {
    clave: 'admin',
    etiqueta: 'Admin / Dueño',
    icono: '💼',
    descripcion: 'Gestión completa del comercio, inventario y configuración',
    email: 'admin@empresaprueba.com',
    password: '123456'
  }
];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule], // Necesario para gestionar el formulario
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private uiService = inject(UiService);

  // Perfiles de demo expuestos al template
  perfilesDemo = PERFILES_DEMO;

  // Perfil demo en proceso de login (null = ninguno cargando)
  perfilDemoCargando = signal<string | null>(null);

  // Signal para gestionar mensajes de error de forma reactiva (Angular 21 style)
  errorMessage = signal<string | null>(null);

  // Estado reactivo del teclado guardado en el dispositivo
  tecladoNativoForzado = signal<boolean>(true);

  // ⌨️ Signals del Teclado Virtual Integrado
  mostrarTecladoGeneral = signal<boolean>(false);
  inputObjetivoTeclado = signal<'EMAIL' | 'PASSWORD'>('EMAIL');
  valorTecladoEnConstruccion = signal<string>('');
  mayusculasGeneral = signal<boolean>(false);

  // Define la señal al inicio del componente
  mostrarPassword = signal<boolean>(false);

  // Definición del formulario con validaciones básicas
  loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  ngOnInit(): void {
    // Leemos la persistencia del navegador nada más arrancar la pantalla
    this.tecladoNativoForzado.set(localStorage.getItem('FORZAR_TECLADO_NATIVO') !== 'false');
  }

  /**
   * Cambia el modo del buffer de entrada según el dispositivo
   */
  cambiarModoTeclado(forzarNativo: boolean): void {
    this.tecladoNativoForzado.set(forzarNativo);
    localStorage.setItem('FORZAR_TECLADO_NATIVO', forzarNativo ? 'true' : 'false');
  }

  // ⌨️ Métodos del Teclado Táctil
  abrirTecladoGeneralForm(objetivo: 'EMAIL' | 'PASSWORD', valorActualForm: string = ''): void {
    // Si está forzado el nativo por botón O el detector nativo dice que es móvil/tablet, no abrir nunca
    if (this.tecladoNativoForzado() || isMobileOrTablet()) {
      return;
    }
    this.inputObjetivoTeclado.set(objetivo);
    this.valorTecladoEnConstruccion.set(valorActualForm || '');
    this.mostrarTecladoGeneral.set(true);
  }

  pulsarTeclaGeneral(caracter: string): void {
    let valorAInsertar = caracter;
    const esLetra = /^[a-zA-ZÑñ]$/.test(caracter);
    
    if (esLetra) {
      valorAInsertar = this.mayusculasGeneral() ? caracter.toUpperCase() : caracter.toLowerCase();
    }

    this.valorTecladoEnConstruccion.set(this.valorTecladoEnConstruccion() + valorAInsertar);
  }

  alternarMayusculasGeneral(): void {
    this.mayusculasGeneral.set(!this.mayusculasGeneral());
  }

  borrarUltimoCaracterGeneral(): void {
    this.valorTecladoEnConstruccion.update(val => val.slice(0, -1));
  }

  limpiarTecladoGeneral(): void {
    this.valorTecladoEnConstruccion.set('');
  }

  cerrarTecladoGeneral(): void {
    this.mostrarTecladoGeneral.set(false);
  }

  aplicarTextoAlFormulario(): void {
    const objetivo = this.inputObjetivoTeclado();
    const valor = this.valorTecladoEnConstruccion();

    if (objetivo === 'EMAIL') {
      this.loginForm.controls.email.setValue(valor);
    } else if (objetivo === 'PASSWORD') {
      this.loginForm.controls.password.setValue(valor);
    }

    this.cerrarTecladoGeneral();
  }

  // Método para alternar el estado
  alternarVisibilidadPassword() {
    this.mostrarPassword.update(visible => !visible);
  }

  /**
   * Se ejecuta al pulsar el botón de Entrar.
   */
  onSubmit(): void {
    if (this.loginForm.valid) {
      this.ejecutarLogin(this.loginForm.getRawValue());
    }
  }

  /**
   * Acceso rápido demo: rellena el formulario con las credenciales del perfil
   * y ejecuta el login directamente.
   */
  loginDemo(perfil: DemoPerfil): void {
    if (this.perfilDemoCargando()) return;

    this.loginForm.controls.email.setValue(perfil.email);
    this.loginForm.controls.password.setValue(perfil.password);
    this.perfilDemoCargando.set(perfil.clave);
    this.ejecutarLogin({ email: perfil.email, password: perfil.password });
  }

  /**
   * Lógica común de login: llama a AuthService, muestra el toast de bienvenida
   * y redirige según el rol obtenido del token.
   */
  private ejecutarLogin(credentials: LoginRequest): void {
    this.authService.login(credentials).subscribe({
      next: () => {
        this.uiService.mostrarToast(`¡Bienvenido de nuevo, ${this.authService.usuarioNombre()}!`, 'success');
        this.router.navigate([this.rutaPorRol(this.authService.getRolActual())]);
      },
      error: (err: any) => {
        const mensajeError = err.error?.mensaje || 'Credenciales incorrectas o error de servidor';
        this.uiService.mostrarToast(mensajeError, 'error');
      },
      complete: () => this.perfilDemoCargando.set(null)
    });
  }

  /** Devuelve la ruta inicial según el rol del usuario */
  private rutaPorRol(rol: string | null): string {
    if (rol === 'ROLE_SUPER_ADMIN') return '/superadmin';
    if (rol === 'ROLE_ADMIN' || rol === 'ROLE_EMPLEADO' || rol === 'EMPLEADO') return '/ventas';
    return '/ventas';
  }

}
