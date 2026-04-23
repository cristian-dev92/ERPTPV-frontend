import { Routes } from '@angular/router';

export const routes: Routes = [
    {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },
  // Más adelante añadiremos aquí el Inventario y la Caja
  // Todas las rutas de aquí abajo usarán el Layout (Menú + Cabecera)
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout').then(m => m.LayoutComponent),
    children: [
      { 
        path: 'inventario', 
        loadComponent: () => import('./features/inventario/inventario-list/inventario-list').then(m => m.InventarioListComponent) 
      },
      // Aquí iremos añadiendo /ventas y /caja
      { path: '', redirectTo: 'inventario', pathMatch: 'full' }
    ]
  }
];
