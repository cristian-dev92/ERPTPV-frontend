import { Injectable, signal } from '@angular/core';

export interface ToastMensaje {
  texto: string;
  tipo: 'success' | 'error' | 'warning';
}

@Injectable({ providedIn: 'root' })
export class UiService {
  toast = signal<ToastMensaje | null>(null);

  mostrarToast(texto: string, tipo: 'success' | 'error' | 'warning' = 'success') {
    this.toast.set({ texto, tipo });
    
    // Se esconde automáticamente a los 3.5 segundos
    setTimeout(() => {
      this.toast.set(null);
    }, 3500);
  }
}