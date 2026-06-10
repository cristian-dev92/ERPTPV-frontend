import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; 

export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Supongamos que tu authService tiene un método o un signal con el rol actual
    const userRole = authService.getRolActual(); 

    if (userRole && allowedRoles.includes(userRole)) {
      return true;
    }

    // Si no tiene el rol permitido, lo redirigimos al login o a una página de acceso denegado
    router.navigate(['/login']);
    return false;
  };
};