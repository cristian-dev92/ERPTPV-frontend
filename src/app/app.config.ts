import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { routes } from './app.routes';
import { LOCALE_ID } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-ES' },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // Aquí es donde activamos la comunicación con el Backend y la seguridad
    provideHttpClient(
    withInterceptors([authInterceptor]) // Registramos el interceptor aquí
    )
  ]
};