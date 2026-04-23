import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http'; // Importamos estas dos
import { authInterceptor } from './core/interceptors/auth.interceptor'; // Importamos tu nuevo archivo

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // Aquí es donde activamos la comunicación con el Backend y la seguridad
    provideHttpClient(
    withInterceptors([authInterceptor]) // Registramos el interceptor aquí
    )
  ]
};