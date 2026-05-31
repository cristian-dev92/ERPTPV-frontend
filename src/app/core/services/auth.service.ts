import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest } from '../models/auth.model';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  // URL base para autenticación (Ajustar según Swagger si es distinta)
  private readonly API_URL = 'http://localhost:8080/api/auth';

  /**
   * Signal que guarda si el usuario está logueado. 
   * En Angular 21, esto permite que la UI reaccione instantáneamente.
   */
  isAuthenticated = signal<boolean>(this.hasToken());

  // Nueva Signal para el nombre (leemos del localStorage si ya existía)
  usuarioNombre = signal<string | null>(localStorage.getItem('nombre_zapatero'));

  /**
   * Intenta iniciar sesión con las credenciales proporcionadas.
   */
  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, credentials).pipe(
      tap(response => {

        // Al recibir respuesta, guardamos el token
        localStorage.setItem('token_zapatero', response.token);
        // GUARDAMOS EL NOMBRE
        localStorage.setItem('nombre_zapatero', response.nombre);
        // Actualizamos el estado global
        this.isAuthenticated.set(true);
        // ACTUALIZAMOS LA SIGNAL
        this.usuarioNombre.set(response.nombre);
      })
    );
  }

  /**
   * Cierra la sesión limpiando el almacenamiento y el estado.
   */
  logout(): void {
    localStorage.removeItem('token_zapatero');
    localStorage.removeItem('nombre_zapatero'); // LIMPIAMOS EL NOMBRE
    this.isAuthenticated.set(false);
    this.usuarioNombre.set(null); // RESETEAMOS LA SIGNAL
    this.router.navigate(['/login']);
  }

  /**
   * Comprueba si existe un token en el navegador.
   */
  private hasToken(): boolean {
    return !!localStorage.getItem('token_zapatero');
  }
}