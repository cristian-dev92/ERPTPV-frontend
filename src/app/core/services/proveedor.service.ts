import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NuevoProveedorRequest {
  nombre: string;
  cif: string;
  emailPedidos: string;
  telefono: string;
  direccion: string;
}

export interface ProveedorDTO {
  id: number;
  nombre: string;
  cif?: string;
  direccion?: string;
  emailPedidos?: string;
  telefono?: string;
  activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProveedorService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/proveedores';

  obtenerMisProveedores(): Observable<ProveedorDTO[]> {
    return this.http.get<ProveedorDTO[]>(this.API_URL);
  }

  crearProveedor(request: NuevoProveedorRequest): Observable<ProveedorDTO> {
    return this.http.post<ProveedorDTO>(this.API_URL, request);
  }

  actualizarProveedor(id: number, request: NuevoProveedorRequest): Observable<ProveedorDTO> {
    return this.http.put<ProveedorDTO>(`${this.API_URL}/${id}`, request);
  }

  eliminarProveedor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
}