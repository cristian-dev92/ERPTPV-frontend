import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email?: string;
  documentoIdentidad?: string;
  ciudad?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClienteService {
  private http = inject(HttpClient);
  private urlBase = '/api/clientes'; // Ajusta la URL si tu proxy de Angular usa otro prefijo

  buscarPorNombre(nombre: string): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(`${this.urlBase}/nombre/${nombre}`);
  }

  buscarPorTelefono(telefono: string): Observable<Cliente[]> {
    return this.http.get<Cliente>(`${this.urlBase}/telefono/${telefono}`).pipe(
      // Transformamos el cliente único en un array de un elemento [cliente]
      map(cliente => [cliente]),
      // Si el backend devuelve un 404 (no encontrado), devolvemos un array vacío sin romper el flujo
      catchError(() => of([]))
    );
  }
}