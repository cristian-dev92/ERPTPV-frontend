import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Articulo } from '../models/articulo.model';

/**
 * Servicio encargado de la comunicación con los endpoints de Artículos.
 * Gestiona tanto los PRODUCTOS (zapatos, cordones) como los SERVICIOS (reparaciones).
 */
@Injectable({
  providedIn: 'root' // Hace que el servicio sea global y único en toda la app
})
export class ArticuloService {
  // Inyectamos el cliente HTTP para poder hacer peticiones
  private http = inject(HttpClient);

  // URL base para los endpoints de artículos. El Interceptor se encargará de añadir el empresaId automáticamente.
  private apiUrl = '/api/articulos';

  // Obtiene la lista completa de artículos (productos y servicios) para la empresa actual.
  getArticulos(): Observable<Articulo[]> {
    return this.http.get<Articulo[]>(this.apiUrl);
  }

  // Obtiene los detalles de un único artículo por su ID.
  getArticuloById(id: number): Observable<Articulo> {
    return this.http.get<Articulo>(`${this.apiUrl}/${id}`);
  }

  // Crea un nuevo artículo (producto o servicio) en el backend.
  crearArticulo(articulo: Articulo): Observable<Articulo> {
    return this.http.post<Articulo>(this.apiUrl, articulo);
  }

  // Actualiza un artículo existente.
  actualizarArticulo(id: number, articulo: Articulo): Observable<Articulo> {
    return this.http.put<Articulo>(`${this.apiUrl}/${id}`, articulo);
  }

  // Elimina un artículo por su ID.
  eliminarArticulo(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }
}