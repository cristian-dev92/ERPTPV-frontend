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

  // URL base del backend (Asegúrate de que coincida con el puerto de tu compañero)
  private readonly API_URL = 'http://localhost:8080/api/articulos';

  /**
   * Recupera la lista completa de artículos de la empresa.
   * Gracias al Interceptor, no enviamos el empresaId, el backend lo sabe por el Token.
   * @returns Un Observable con el array de artículos.
   */
  getArticulos(): Observable<Articulo[]> {
    return this.http.get<Articulo[]>(this.API_URL);
  }

  /**
   * Obtiene los detalles de un único artículo por su ID.
   * @param id El identificador del artículo
   */
  getArticuloById(id: number): Observable<Articulo> {
    return this.http.get<Articulo>(`${this.API_URL}/${id}`);
  }

  /**
   * Envía un nuevo artículo al servidor para ser guardado.
   * @param articulo Los datos del artículo (sin ID)
   */
  crearArticulo(articulo: Articulo): Observable<Articulo> {
    return this.http.post<Articulo>(this.API_URL, articulo);
  }

  /**
   * Actualiza un artículo existente.
   * @param id El ID del artículo a modificar
   * @param articulo Los nuevos datos
   */
  actualizarArticulo(id: number, articulo: Articulo): Observable<Articulo> {
    return this.http.put<Articulo>(`${this.API_URL}/${id}`, articulo);
  }
}