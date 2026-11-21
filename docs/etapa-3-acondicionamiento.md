# Etapa 3: acondicionamiento y corrección de los datos

Resultados de correr `src/acondicionamiento_rh.py` contra los 7 archivos reales, con corte al 20 de noviembre de 2026.
El detalle método por método está en `notebooks/etapa3_acondicionamiento.ipynb`.

## Qué entra y qué sale

| Archivo fuente | Filas | Tabla acondicionada | Filas |
|---|---|---|---|
| Colaboradores | 107 | `colaborador_acondicionado` | 107 |
| Asignaciones | 31 | `asignacion_acondicionada` | 31 |
| Clientes y proyectos | 12 | `proyecto_acondicionado` / `cliente_acondicionado` | 12 / 8 |
| Activos | 123 | `activo_acondicionado` | 123 |
| Departamentos | 6 | `departamento_acondicionado` | 6 |
| Habilidades | 71 | `habilidad_acondicionada` | 71 |
| Matriz de habilidades | 54 × 77 | `matriz_habilidad_long` | 1,529 |

Ninguna tabla pierde registros. Además se generan `log_correcciones`, `calidad_datos`, los catálogos `cat_*`,
`expediente_documento_long` y las cuatro tablas de extensión vacías.

## Correcciones por método

| Método | Correcciones |
|---|---|
| M3 · Catálogos | 270 |
| M2 · Centinelas a nulo | 255 |
| M5 · Llaves reconstruidas | 177 |
| M11 · Montos en $0 a nulo | 95 |
| M6 · Habilidades repetidas | 26 |
| M1 · Normalización de texto | 4 |
| M7 · Familiares fuera de plantilla | 2 |
| M8 · Coherencia de fechas | 1 |
| M12 · Matriz a formato largo | 1 |
| **Total** | **831** |

M10 no cerró ninguna asignación: nadie dado de baja tiene asignaciones registradas.

## Completitud aparente contra real

| Columna | Aparente | Real |
|---|---|---|
| Rol asignado (asignaciones) | 100 % | 6.5 % |
| Contrato en expediente | 100 % | 14 % |
| Fecha de fin de asignación | 100 % | 22.6 % |
| Fecha de inicio de asignación | 100 % | 32.3 % |
| Costo de equipo | 100 % | 43.1 % |
| Puesto | 100 % | 53.3 % |
| Sueldo total integrado | 100 % | 76.6 % |

## Validaciones

Las 13 consultas de validación dan cero: sin activos con fecha de baja, sin bajas anteriores al ingreso, sin
asignaciones vigentes de bajas, sin sueldos ni costos en $0, sin centinelas ni fechas de relleno, sin llaves huérfanas
y sin filas perdidas.

## Lo que se reporta a RH

No son errores del pipeline; son datos que solo RH puede corregir.

- 18 bajas sin fecha y 32 sin causa de baja.
- 1 activo que traía fecha de baja: confirmar su estatus.
- 1 persona con dos asignaciones al mismo tiempo.
- 9 equipos a nombre de personas que ya salieron.
- 62 activos sin departamento, 29 sin puesto y 5 sin sueldo.
- 2 proyectos «En curso» con fecha de fin vencida y 6 sin PM de OT Consulting.

## Decisiones que conviene conocer

- **Dedicación.** El sistema no la captura. Cada asignación se toma al 100 % y se marca como estimada; el costo se
  reparte en proporción para no contarlo dos veces.
- **Baja en el primer año.** Se confirma con la fecha de baja. Cuando no hay fecha pero la persona entró hace menos de
  12 meses y ya es baja, se deduce sin inventar nada. En el resto queda como desconocido (16 de 32).
- **Rotación mensual.** Solo usa bajas con fecha, así que subestima la rotación real.
- **Banca.** Incluye personal administrativo; separarlo requiere el departamento.
- **Aseguradora.** `SI` confirma que hay seguro pero no con quién; `PLAN ATLAS` es ambiguo. Ambos quedan con
  `tiene_sgmm = 1` y aseguradora nula.
