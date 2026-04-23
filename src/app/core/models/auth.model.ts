/**
 * Estructura para el inicio de sesión.
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Respuesta que nos devuelve el servidor tras un login exitoso.
 */
export interface AuthResponse {
  /** El JWT que usará nuestro Interceptor */
  token: string;
  /** Nombre del usuario para mostrar en la interfaz */
  nombre: string;
  /** Rol: 'ADMIN' o 'EMPLEADO' */
  rol: string;
}