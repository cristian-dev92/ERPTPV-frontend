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
  // Añadimos Inventario y la Caja
  // Todas las rutas de aquí abajo usarán el Layout (Menú + Cabecera)
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout').then(m => m.LayoutComponent),
    children: [
     { 
    path: 'inventario', 
    children: [
    { 
      path: '', 
      loadComponent: () => import('./features/inventario/inventario-list/inventario-list').then(m => m.InventarioListComponent) 
    },
    { 
      path: 'nuevo', 
      loadComponent: () => import('./features/inventario/articulo-form/articulo-form').then(m => m.ArticuloFormComponent) 
    },
    { 
      path: 'editar/:id', 
      loadComponent: () => import('./features/inventario/articulo-form/articulo-form').then(m => m.ArticuloFormComponent) 
    }]
   },
   { 
      path: 'ventas', 
      loadComponent: () => import('./features/ventas/tpv/tpv').then(m => m.TpvComponent) 
   },
   { 
      path: 'caja', 
      loadComponent: () => import('./features/caja/caja-resumen/caja-resumen').then(m => m.CajaResumenComponent) 
   },
  ]
 }
]
