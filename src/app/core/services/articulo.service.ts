import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Articulo } from '../models/articulo.model';

/**
 * Servicio encargado de la comunicación con los endpoints de Artículos.
 * Gestiona tanto los PRODUCTOS (zapatos, cordones) como los SERVICIOS (reparaciones).
 */
@Injectable({
  providedIn: 'root'
})
export class ArticuloService {
  private http = inject(HttpClient);
  private apiUrl = '/api/articulos';

  // Obtiene la lista completa de artículos (productos y servicios) activos/inactivos
  getArticulos(): Observable<Articulo[]> {
    return this.http.get<Articulo[]>(this.apiUrl);
  }

  // Obtiene los detalles de un único artículo por su ID
  getArticuloById(id: number): Observable<Articulo> {
    return this.http.get<Articulo>(`${this.apiUrl}/${id}`);
  }

  // BUSQUEDA EN TIEMPO REAL PARA EL TPV (Por nombre, código de barras o código interno)
  buscarPorTermino(termino: string): Observable<Articulo[]> {
    return this.http.get<Articulo[]>(`${this.apiUrl}/buscar?query=${encodeURIComponent(termino)}`);
  }

  // Crea un nuevo artículo en el backend
  crearArticulo(articulo: Articulo): Observable<Articulo> {
    return this.http.post<Articulo>(this.apiUrl, articulo);
  }

  // Actualiza un artículo existente (Permite cambiar estados e ID de familias)
  actualizarArticulo(articulo: Articulo): Observable<Articulo> {
    return this.http.put<Articulo>(`${this.apiUrl}/${articulo.id}`, articulo);
  }

  // Realiza el borrado lógico en el backend liberando restricciones operativas
  eliminarArticulo(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}