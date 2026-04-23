import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Este interceptor actúa como un "peaje" para todas las peticiones HTTP.
 * Captura la petición antes de que salga al servidor y le añade el token 
 * de seguridad si el usuario ya está logueado.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Intentamos recuperar el token que guardaremos al hacer login
  const token = localStorage.getItem('token_zapatero');

  // 2. Si el token existe, clonamos la petición y le ponemos el "sello" de seguridad
  if (token) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    // Enviamos la petición con el token
    return next(clonedRequest);
  }

  // 3. Si no hay token (ej. estamos en el login), la petición sigue su curso normal
  return next(req);
};