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
  cif: string;
  direccion: string;
  emailPedidos: string;
  telefono: string;
  empresaId: number;
}

@Injectable({ providedIn: 'root' })
export class ProveedorService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/proveedores';

  obtenerMisProveedores(): Observable<ProveedorDTO[]> {
    return this.http.get<ProveedorDTO[]>(this.API_URL);
  }

  crearProveedor(nuevo: NuevoProveedorRequest): Observable<ProveedorDTO> {
    return this.http.post<ProveedorDTO>(this.API_URL, nuevo);
  }

  actualizarProveedor(id: number, proveedor: NuevoProveedorRequest): Observable<ProveedorDTO> {
    return this.http.put<ProveedorDTO>(`${this.API_URL}/${id}`, proveedor);
  }

  eliminarProveedor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
}