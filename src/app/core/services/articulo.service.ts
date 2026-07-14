import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Articulo, NuevoArticuloRequest } from '../models/articulo.model';

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

  // BÚSQUEDA GENERAL PARA EL TPV (Centralizado en tu backend: busca por nombre, código de barras o SKU)
  buscarPorTermino(termino: string): Observable<Articulo[]> {
    return this.http.get<Articulo[]>(`${this.apiUrl}/buscar`, {
      params: { query: termino }
    });
  }

  // ALIAS SEMÁNTICOS PARA COMPATIBILIDAD CON TPV. Redirigen limpiamente a tu infraestructura de búsqueda sin alterar el componente
  buscarPorNombre(nombre: string): Observable<Articulo[]> {
    return this.buscarPorTermino(nombre);
  }

  // Filtro de familias/categorías dinámicas para la botonera del mostrador
  getArticulosPorCategoria(familia: string): Observable<Articulo[]> {
    return this.getArticulos().pipe(
      map(articulos => 
        articulos.filter(a => a.familiaNombre?.toUpperCase() === familia.toUpperCase())
      )
    );
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

  getArticulosPaginados(pagina: number, cantidad: number): Observable<any> {
  return this.http.get<any>(`${this.apiUrl}/paginado`, {
    params: { page: pagina.toString(), size: cantidad.toString() }
  });
 }

}