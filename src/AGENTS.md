# Estado del proyecto ERPTPV-frontend (Jul 2026)

## Reglas
- **No tocar el backend**. Si se necesita algún cambio en Java, se avisa al compañero y se anota en "Backend — Tareas para el compañero". Nunca modificar archivos `.java` ni ejecutar Maven.

## Resumen
- **Modal ticket**: Layout de 2 columnas (grid 1.5fr 1fr). Columna izquierda (`.left-column`): info cliente + contenido del ticket + totales. Columna derecha (`.actions-section`): acciones operativas. Submodal de configuración dentro de `.left-column`.
- **orden-list.html**: Códigos de etiqueta (🔖 #260001) en cada línea y resumen en card. Sin "notas generales". "Detalles por trabajo" unificado con "contenido del ticket". Fecha de recogida desde `orden.trabajosTaller?.[0]?.fechaPrometidaRecogida`. Modal balanceado sin divs extra.
- **orden-list.ts**: Métodos `codigosEtiqueta()`, `convertirFechaISO()` (soporta `dd-MM-yyyy` e ISO). `verDetalle()` usa `convertirFechaISO()`.
- **tpv.ts/tpv.html**: Validaciones precio cero, sincronización fecha recogida/entrega, fix `$index` shadowing con `@let lineaIdx`, validación cliente con `tieneServicioEnCarrito()`.
- **Backend**: `TrabajoTallerDTO.java` con `@JsonFormat(pattern = "yyyy-MM-dd")`. Recompilado con `mvn clean compile`. Ya no hay error 400 al seleccionar fecha.
- **Devoluciones**: `LineaDevolucionDTO.trabajoId` añadido. Servicios de taller envían `trabajoId`, productos físicos envían `articuloId`.
- **Artículos**: `codigoReferencia`, `familiaId`, `familiaNombre` integrados en formulario y tabla.
- **Proveedores**: `codigoPostal`, `ciudad` añadidos al DTO y formulario.
- **Layout**: Menú hamburguesa hasta 1200px, `overflow-x: hidden` en menú móvil.

## Backend — Tareas para el compañero
1. **`ProveedorDTO.java`**: Añadir `this.direccion = proveedor.getDireccion();` en el constructor. El campo `direccion` está declarado en la clase pero nunca se mapea (línea 38 de `ProveedorDTO.java`).
2. **`ProveedorDTO.java`**: Verificar que `email` se mapea correctamente — el frontend envía `emailPedidos` en el request, el backend debería mapearlo al campo correcto de la entidad.

## Pendiente / Bloqueado
- (ninguno)
