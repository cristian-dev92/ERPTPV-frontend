import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

  registerLocaleData(localeEs, 'es-ES');