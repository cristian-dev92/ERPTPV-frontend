import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface FamiliaDTO {
  id: number;
  nombre: string;
  descripcion: string;
  familiaPadreId: number | null;
  familiaPadreNombre: string | null;
  subfamilias?: FamiliaDTO[];
}

export interface NuevaFamiliaRequest {
  nombre: string;
  descripcion?: string;
  familiaPadreId?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class FamiliaService {
  private http = inject(HttpClient);
  private apiUrl = '/api/familias';

  // Señal global por si necesitas consultar el estado de las familias desde cualquier componente
  public familiasCache = signal<FamiliaDTO[]>([]);

  /**
   * Obtiene todas las familias y subfamilias asociadas a la empresa del usuario autenticado.
   * Almacena el resultado en una señal de caché para optimizar lecturas.
   */
  obtenerMisFamilias(): Observable<FamiliaDTO[]> {
    return this.http.get<FamiliaDTO[]>(this.apiUrl).pipe(
      tap(familias => this.familiasCache.set(familias))
    );
  }

  /**
   * Crea una nueva familia o subfamilia de forma segura vinculada a la empresa actual.
   */
  crearFamilia(peticion: NuevaFamiliaRequest): Observable<any> {
    return this.http.post<any>(this.apiUrl, peticion).pipe(
      // Forzamos refresco automático de la caché tras crear
      tap(() => this.obtenerMisFamilias().subscribe())
    );
  }

  /**
   * Actualiza los datos de una familia o subfamilia existente.
   */
  actualizarFamilia(id: number, peticion: NuevaFamiliaRequest): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, peticion).pipe(
      tap(() => this.obtenerMisFamilias().subscribe())
    );
  }

  /**
   * Elimina una familia de la base de datos (Comportamiento controlado por backend).
   */
  eliminarFamilia(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.obtenerMisFamilias().subscribe())
    );
  }
}