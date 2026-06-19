import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';
import { UiService } from '../../../core/services/ui.service';

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

  // Signal para gestionar mensajes de error de forma reactiva (Angular 21 style)
  errorMessage = signal<string | null>(null);

  // Definición del formulario con validaciones básicas
  loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  /**
   * Se ejecuta al pulsar el botón de Entrar.
   */
  onSubmit(): void {
    if (this.loginForm.valid) {
      const credentials = this.loginForm.getRawValue();
      
      this.authService.login(credentials).subscribe({
        next: () => {
        this.uiService.mostrarToast(`¡Bienvenido de nuevo, ${this.authService.usuarioNombre()}!`, 'success');
        // Desviamos según el rol
        const rol = this.authService.getRolActual();

          if (rol === 'ROLE_SUPER_ADMIN') {
            this.router.navigate(['/superadmin']);
          } else if (rol === 'ROLE_ADMIN') {
            this.router.navigate(['/ventas']);
          } else {
            // 🟢 SI ES UN EMPLEADO: Lo redirigimos también al TPV de ventas
            this.router.navigate(['/ventas']); 
            // Nota: Si vuestra ruta del TPV para empleados es distinta (ej: '/tpv'), cámbiala aquí
          }
        },
        error: (err: any) => {
          // Extraemos el mensaje del backend si existe, si no, ponemos el de por defecto
          const mensajeError = err.error?.mensaje || 'Credenciales incorrectas o error de servidor';
          // (Ajusta el método según cómo se llame en tu servicio: mostrarError, error, toast...)
          this.uiService.mostrarToast(mensajeError, 'error');
        }
      });
     }
    }
  
}
