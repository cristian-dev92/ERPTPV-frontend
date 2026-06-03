import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NuevoClienteRequest {
  nombre: string;
  telefono: string;
  email?: string;
  documentoIdentidad?: string;
  direccion?: string;
  codigoPostal?: string;
  ciudad?: string;
}

export interface ClienteDTO {
  id: number;
  nombre: string;
  telefono: string;
  email?: string;
  documentoIdentidad?: string;
  direccion?: string;
  codigoPostal?: string;
  ciudad?: string;
  empresaId?: number;
  activo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClienteService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/clientes';

  obtenerMisClientes(): Observable<ClienteDTO[]> {
    return this.http.get<ClienteDTO[]>(this.API_URL);
  }

  buscarPorTelefono(telefono: string): Observable<ClienteDTO> {
    return this.http.get<ClienteDTO>(`${this.API_URL}/telefono/${telefono}`);
  }

  buscarPorNombre(nombre: string): Observable<ClienteDTO[]> {
    return this.http.get<ClienteDTO[]>(`${this.API_URL}/nombre/${nombre}`);
  }

  crearCliente(nuevo: NuevoClienteRequest): Observable<ClienteDTO> {
    return this.http.post<ClienteDTO>(this.API_URL, nuevo);
  }

  actualizarCliente(id: number, cliente: NuevoClienteRequest): Observable<ClienteDTO> {
    return this.http.put<ClienteDTO>(`${this.API_URL}/${id}`, cliente);
  }

  eliminarCliente(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
  
}