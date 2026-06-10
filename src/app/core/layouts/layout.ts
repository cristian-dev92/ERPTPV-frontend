import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  // Importamos RouterOutlet para que las otras pantallas se carguen aquí dentro
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.html',
  styleUrl: './layout.scss'
})
export class LayoutComponent {
  // Inyectamos el servicio para saber quién es el usuario y poder cerrar sesión
  public authService = inject(AuthService);

  /**
   * Cierra la sesión y manda al usuario de vuelta al login.
   */
  onLogout(): void {
    this.authService.logout();
  }
}