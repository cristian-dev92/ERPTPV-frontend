# Estado del proyecto ERPTPV (Jul 2026)

## Reglas
Cuando revises el backend, no modificarlo nunca siempre preguntar antes para tenerlo en pendiente.

## Frontend
- **Modal ticket**: Layout de 2 columnas (grid 1.5fr 1fr). Columna izquierda (`.left-column`): info cliente + contenido del ticket + totales. Columna derecha (`.actions-section`): acciones operativas. Submodal de configuración dentro de `.left-column`.
- **orden-list**: Códigos de etiqueta (🔖 #260001) en cada línea y resumen en card. Fecha de recogida desde `orden.trabajosTaller?.[0]?.fechaPrometidaRecogida`.
- **tpv**: Validaciones precio cero, sincronización fecha recogida/entrega, `@let lineaIdx`, `tieneServicioEnCarrito()`. Búsquedas con `startsWith`. Eliminada barra buscar/reemplazar artículo en líneas del carrito.
- **Devoluciones**: `LineaDevolucionDTO.trabajoId` añadido. Taller envía `trabajoId`, productos `articuloId`.
- **Artículos**: `codigoReferencia`, `familiaId`, `familiaNombre` en formulario y tabla. Auto-generación de `codigoReferencia` al crear.
- **Proveedores**: `codigoPostal`, `ciudad` en formulario y tabla. Columna Dirección añadida.
- **Clientes**: Columna Dirección añadida entre Email y Ubicación.
- **Familias**: Modal separado en "Nueva Familia" (solo creación) y "Configurar Familias" (listado paginado 10/20/50/100 con editar/eliminar). Detección de duplicados.
- **Inventario**: Columnas: Código Ref. | Nombre | Familia | Subfamilia | Código Barras | Precio | Proveedor | Stock | Stock Mín. | Acciones. Botones de acción estilizados como clientes/proveedores.
- **Caja**: Movimiento manual corregido — envía `tipoMovimiento: "INGRESO" | "GASTO"` (no `EGRESO`) e incluye `metodoPago: "EFECTIVO"`.
- **Layout**: Menú hamburguesa hasta 1200px.
- **Búsquedas**: Todas las barras de búsqueda (clientes, proveedores, tickets, inventario, TPV) usan `startsWith` y disparan con 1 carácter.

## Backend
- Ruta: `C:\Users\crist\Downloads\springboot\ERPTPV\demo`
- `ProveedorDTO.java`: ✅ `direccion` mapeado (línea 39), `email` mapeado (línea 36).
- `NuevoMovimientoRequest.java`: Schema dice "EGRESO" pero el enum `TipoMovimientoCaja` usa `GASTO`. Solo documentación, no afecta al funcionamiento.

## Backend — Tareas para el compañero
1. **`EmpresaDTO.java`**: Añadir `this.integracionVerifactuOk = empresa.isIntegracionVerifactuOk();` en el constructor. El campo existe en la entidad `Empresa.java` pero nunca se mapea en el DTO.
2. **`EmpresaDTO.java`**: Añadir campo `private boolean verifactuOk;`. No existe en la entidad `Empresa.java` — decidir si añadirlo al modelo o unificar la lógica con `integracionVerifactuOk`. Actualmente el frontend (panel-monitorizacion) usa ambos campos para el semáforo fiscal (🟢/🟡/❌).

## Pendiente / Bloqueado
- (ninguno)
