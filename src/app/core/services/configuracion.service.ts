import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConfiguracionService {
  private http = inject(HttpClient);
  private baseUrl = '/api';

  // =========================================================================
  // 1. ENDPOINTS DE SUPER_ADMIN
  // =========================================================================

  crearInquilino(datosEmpresa: any): Observable<string> {
    return this.http.post(`${this.baseUrl}/superadmin/crear-inquilino`, datosEmpresa, { responseType: 'text' });
  }

  obtenerEstadoHacienda(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/superadmin/empresas/estado-hacienda`);
  }

  alternarBotonPanico(empresaId: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/superadmin/empresas/${empresaId}/estado`, {});
  }

  cambiarEmailPropietario(empresaId: number, nuevoEmail: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/superadmin/empresas/${empresaId}/admin/email`, { nuevoEmail });
  }

  resetearPasswordPropietario(empresaId: number): Observable<{ mensaje: string, passwordTemporal: string }> {
    return this.http.post<{ mensaje: string, passwordTemporal: string }>(
      `${this.baseUrl}/superadmin/empresas/${empresaId}/admin/reset-password`, {}
    );
  }

  // =========================================================================
  // 2. ENDPOINTS DE CONFIGURACIÓN DE EMPRESA (ADMIN)
  // =========================================================================

  actualizarDatosEmpresa(datos: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/admin/empresa`, datos);
  }

  listarEmpleados(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/admin/empleados`);
  }

  crearEmpleado(empleado: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/admin/empleados`, empleado);
  }

  resetearPasswordEmpleado(empleadoId: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/admin/empleados/${empleadoId}/reset-password`, {});
  }

  // =========================================================================
  // 3. ENDPOINTS DE MI PERFIL (UNIVERSAL) Y SUBIDA DE ARCHIVOS
  // =========================================================================

  cambiarMiPassword(payload: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/perfil/password`, payload);
  }

  guardarMiFirma(firmaUrl: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/perfil/firma`, { firmaUrl });
  }

  subirArchivo(file: File, tipo: 'logo' | 'firma'): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.baseUrl}/api/upload/${tipo}`, formData);
  }
}