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
  // 1. CONFIGURACIÓN INTERNA DE LA EMPRESA (ADMIN)
  // =========================================================================

  actualizarDatosEmpresa(datos: any): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(`${this.baseUrl}/admin/empresa`, datos);
  }

  listarEmpleados(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/admin/empleados`);
  }

  crearEmpleado(empleado: any): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.baseUrl}/admin/empleados`, empleado);
  }

  resetearPasswordEmpleado(empleadoId: number): Observable<{ mensaje: string, passwordTemporal: string }> {
    return this.http.patch<{ mensaje: string, passwordTemporal: string }>(
      `${this.baseUrl}/admin/empleados/${empleadoId}/reset-password`, {}
    );
  }

  eliminarEmpleado(id: number): Observable<{ mensaje: string }> {
  return this.http.delete<{ mensaje: string }>(`${this.baseUrl}/admin/empleados/${id}`);
}

  // =========================================================================
  // 2. MI PERFIL Y SUBIDA DE ARCHIVOS (MULTITENANT SEGURO)
  // =========================================================================

  cambiarMiPassword(payload: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/perfil/password`, payload);
  }

  guardarMiFirma(firmaUrl: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/perfil/firma`, { firmaUrl });
  }

  subirArchivo(file: File, tipo: 'logo' | 'firma'): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.baseUrl}/upload/${tipo}`, formData);
  }
}