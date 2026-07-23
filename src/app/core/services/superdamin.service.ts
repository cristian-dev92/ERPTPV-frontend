import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ==========================================
// 📋 CONTRATOS DE DATOS (INTERFACES TS)
// ==========================================

export interface NuevaEmpresaRequest {
  nombreComercial: string;
  nif: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  telefono: string;
  nombreAdmin: string;
  emailAdmin: string;
  passwordAdmin: string;
}

export interface EmpresaEstadoDTO {
  id: number;
  nombreComercial: string;
  nif: string;
  activa: boolean;
  verifactuOk: boolean;
  integracionVerifactuOk: boolean;
}

export interface JefeAdminDTO {
  id: number;
  nombre: string;
  email: string;
  empresaId: number;
  empresaNombre: string;
}

export interface ResetPasswordResponse {
  mensaje: string;
  passwordTemporal: string;
}

@Injectable({
  providedIn: 'root'
})
export class SuperAdminService {
  private http = inject(HttpClient);
  private baseUrl = '/api/superadmin';

  // ==========================================
  // 🏢 1. COLUMNA: GESTIÓN DE EMPRESAS & MONITORIZACIÓN
  // ==========================================

  /**
   * Registra un nuevo Tenant junto a su usuario administrador inicial.
   */
  crearEmpresaYAdmin(request: NuevaEmpresaRequest): Observable<string> {
    return this.http.post(`${this.baseUrl}/crear-inquilino`, request, { responseType: 'text' });
  }

  /**
   * Obtiene el listado global de empresas con su estado de bloqueo y semáforo VeriFactu.
   * Servirá tanto para Gestión de Empresas como para el Panel de Monitorización.
   */
  obtenerEstadoEmpresas(): Observable<EmpresaEstadoDTO[]> {
    return this.http.get<EmpresaEstadoDTO[]>(`${this.baseUrl}/empresas/estado-hacienda`);
  }

  /**
   * Botón del Pánico: Alterna el bloqueo/activación total de una empresa en el SaaS.
   */
  alternarBloqueoEmpresa(empresaId: number): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.baseUrl}/empresas/${empresaId}/estado`, {});
  }

  // ==========================================
  // 🔑 2. COLUMNA: GESTIÓN DE JEFES (ADMINS)
  // ==========================================

  /**
   * Recupera la lista de todos los administradores de empresas del sistema.
   * (Este es el método que acordamos añadir para poder pintar la tabla).
   */
  obtenerTodosLosJefes(): Observable<JefeAdminDTO[]> {
    return this.http.get<JefeAdminDTO[]>(`${this.baseUrl}/jefes`);
  }

  /**
   * Modificación de credenciales: Cambia el correo electrónico de login del dueño de la empresa.
   */
  actualizarEmailPropietario(empresaId: number, nuevoEmail: string): Observable<{ mensaje: string }> {
    return this.http.patch<{ mensaje: string }>(`${this.baseUrl}/empresas/${empresaId}/admin/email`, {
      nuevoEmail: nuevoEmail
    });
  }

  /**
   * Generación de contraseña temporal con rescate y visualización inmediata en Front.
   */
  generarPasswordTemporalAdmin(empresaId: number): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.baseUrl}/empresas/${empresaId}/admin/reset-password`, {});
  }

}