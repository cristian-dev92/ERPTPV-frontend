import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

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
          // Si todo va bien, vamos al inventario (o al dashboard)
          this.router.navigate(['/inventario']);
        },
        error: (err) => {
          // Si el backend devuelve 400 o 401, mostramos el error
          this.errorMessage.set('Credenciales incorrectas o error de servidor');
        }
      });
    }
  }
}