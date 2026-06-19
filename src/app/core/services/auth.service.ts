import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest } from '../models/auth.model';
import { Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  // URL base para autenticación (Ajustar según Swagger si es distinta)
  private readonly API_URL = '/api/auth';

  // --- SIGNALS DE ESTADO GLOBAL ---
  isAuthenticated = signal<boolean>(this.hasToken());

  // Nueva Signal para el nombre (leemos del localStorage si ya existía)
  usuarioNombre = signal<string | null>(localStorage.getItem('nombre_zapatero'));

  // Signal reactiva con el rol actual
  rolActual = signal<string | null>(null);

  constructor() {
    // Sincronizamos el rol nada más arrancar la app por si ya estaba logueado
    this.sincronizarRolDesdeToken();
  }

  /**
   * 🔒 Devuelve el rol actual del usuario logueado (Usado por el RoleGuard)
   */
  getRolActual(): string | null {
    if (this.rolActual()) {
      return this.rolActual();
    }
    return this.obtenerRolDesdeToken();
  }

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
        // Extrae el rol del nuevo token recién guardado
        this.sincronizarRolDesdeToken();
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
    this.rolActual.set(null); // Limpiamos el rol
    this.router.navigate(['/login']);
  }

  /**
   * Comprueba si existe un token en el navegador.
   */
  private hasToken(): boolean {
    return !!localStorage.getItem('token_zapatero');
  }

  /**
   * Método privado para decodificar de forma segura el JWT
   */
  private obtenerRolDesdeToken(): string | null {
    const token = localStorage.getItem('token_zapatero');
    if (!token) return null;

    try {
      // Decodificamos el cuerpo del token usando la librería
      const payloadDecodificado: any = jwtDecode(token);

      // 👑 1. PARCHE PARA EL NUEVO SUPERADMIN REAL
      if (payloadDecodificado.sub === 'superadmin@erp.com') {
        return 'ROLE_SUPER_ADMIN';
      }
      
      // 🏢 2. PARCHE PARA EL ADMINISTRADOR DE LA TIENDA (ERP/TPV)
      if (payloadDecodificado.sub === 'admin@empresaprueba.com') {
        return 'ROLE_ADMIN';
      }
      
      // 🟢 EXTRACCIÓN REAL PARA EL EMPLEADO (Soporta strings y arrays de Spring Security)
      let extRol = payloadDecodificado.role || payloadDecodificado.roles || payloadDecodificado.authorities;

      // Si Spring Boot lo devuelve dentro de un array (lo normal en authorities/roles), extraemos el primero
      if (Array.isArray(extRol)) {
        extRol = extRol[0];
      }

      // Si viene como un objeto de tipo GrantedAuthority (ej: {authority: 'ROLE_EMPLEADO'})
      if (extRol && typeof extRol === 'object' && extRol.authority) {
        extRol = extRol.authority;
      }

      return extRol || null;
    } catch (error) {
      console.error('Error al decodificar el token de la zapatería:', error);
      return null;
    }
  }

  /**
   * Sincroniza la Signal interna del rol con el valor real del almacenamiento
   */
  private sincronizarRolDesdeToken(): void {
    const rol = this.obtenerRolDesdeToken();
    this.rolActual.set(rol);
  }

}
