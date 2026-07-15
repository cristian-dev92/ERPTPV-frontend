import { computed, signal } from "@angular/core";

export abstract class ComponentePaginado {
  paginaActual = signal<number>(0);
  itemsPorPagina = signal<number>(20);
  totalElementos = signal<number>(0);
  // totalPaginas se calcula automáticamente y de forma reactiva
  totalPaginas = computed(() => {
    const paginas = Math.ceil(this.totalElementos() / this.itemsPorPagina());
    return paginas > 0 ? paginas : 1; // Evitamos que devuelva 0 páginas si no hay registros
  });

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
    this.itemsPorPagina.set(nuevoTamano);
    this.paginaActual.set(0); // Reiniciamos a la primera página
    this.cargarDatos();
  }
}