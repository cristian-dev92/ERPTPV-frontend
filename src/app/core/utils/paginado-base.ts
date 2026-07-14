import { signal } from "@angular/core";

export abstract class ComponentePaginado {
  paginaActual = signal<number>(0);
  itemsPorPagina: number = 20;
  totalElementos: number = 0;
  totalPaginas = signal<number>(0);

  // Este método lo tendrá que definir cada componente para saber qué API llamar
  abstract cargarDatos(): void;

  paginaSiguiente(): void {
    if (this.paginaActual() < this.totalPaginas() - 1) {
      this.paginaActual.update(p => p + 1);
      this.cargarDatos();
    }
  }

  paginaAnterior(): void {
    if (this.paginaActual() > 0) {
      this.paginaActual.update(p => p - 1);
      this.cargarDatos();
    }
  }

  // Por si quieres dar la opción de cambiar de 20 a 50 o 100 items por página
  cambiarTamanoPagina(nuevoTamano: number): void {
    this.itemsPorPagina = nuevoTamano;
    this.paginaActual.set(0); // Reiniciamos a la primera página
    this.cargarDatos();
  }
}