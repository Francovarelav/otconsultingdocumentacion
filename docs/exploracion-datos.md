# Exploración de la base de datos de RH — OT Consulting

Fecha de corte: 17-nov-2026 · Archivos fuente: 7 Excel del socio formador (no publicados) · Sistema: PWA en Firebase (`ot-apps-demo.web.app`)

## 1. Qué hay en cada archivo

| Archivo | Filas × columnas | Qué es | Módulo de la app |
|---|---|---|---|
| `Catalogo_Colaboradores.xlsx` | 107 × 45 | Expediente maestro: datos personales, estatus, nómina, sueldos, seguros, beneficiarios y checklist de documentos | Colaboradores |
| `Asignaciones_Colaboradores.xlsx` | 31 × 11 | Quién está en qué cliente/proyecto, tipo, fechas | Asignaciones |
| `Catalogo_Clientes.xlsx` | 12 × 13 | 8 clientes y 12 proyectos, contacto, PM OTC y PM cliente | Clientes |
| `Catalogo_Activos.xlsx` | 123 × 11 | Inventario de equipo (122 laptops + 1 monitor), costo y a quién está asignado | Inventario Activos |
| `Matriz_Habilidades.xlsx` | 54 × 77 | Nivel (Básico → Experto) de cada colaborador en 71 habilidades | Matriz de Habilidades |
| `Catalogo_Habilidades.xlsx` | 71 × 6 | Catálogo de habilidades: tecnología, código, HARD/SOFT | Configuración › Habilidades |
| `Catalogo_Departamentos.xlsx` | 6 × 7 | 6 departamentos con su objetivo | Configuración › Departamentos |

**Llave entre tablas:** `ID` (OTC003–OTC110) en Colaboradores, Asignaciones y Matriz. **Activos se liga por nombre**, no por ID (frágil). Clientes se liga a Asignaciones por texto de `Cliente`/`Proyecto`.

```
Departamentos ─┐
               ├─< Colaboradores (ID) >─┬─< Asignaciones >── Clientes/Proyectos
Habilidades ──< Matriz (ID) ────────────┘
                     Activos ── (por NOMBRE) ── Colaboradores
```

## 2. Panorama de la plantilla

- **107 registros: 75 activos, 32 bajas.** 77 hombres / 30 mujeres.
- Antigüedad de los activos: mediana **3.9 años** (de 0.1 a 23.6). Edad mediana 41.6 años.
- 42 de los 75 activos están en Monterrey; el resto, repartido en 17 ciudades.
- Ingresos por año: 2023 → 10, **2024 → 20, 2025 → 20, 2026 → 15**. La empresa crece muy rápido en los últimos 3 años.
- Nómina mensual de los activos: neto total **$3.28 M**, integrado (con comisión e IMSS) **$3.92 M**. Sueldo neto mediano $42.6 k.
  - El 66% del neto se paga vía asimilados/sindicato ($2.15 M) y solo el 31% por IMSS ($1.0 M).
  - 10 esquemas de nómina distintos (SMR, MAGNESON-SINDICATO, OTC 100%, XERES, etc.).
  - Las fórmulas cuadran: Neto = IMSS + Asimilados + Complementos, e Integrado = Neto + Comisión + Impuestos, en las 107 filas.
- Sueldo por género (activos): promedio M $45.4 k vs F $39.9 k; **la mediana es igual** (~$42.6 k). La diferencia viene de unos pocos sueldos altos.

## 3. Hallazgos clave (lo que sirve para el reto)

### Rotación: el problema más fuerte
- **32 bajas de 107 (30%)**. De los contratados en 2024–2026 (55 personas), **25 ya se fueron (≈45%)**.
- Los que se van duran poco: mediana **1.0 año** en la empresa (de los 14 con fecha de baja).
- Las bajas se concentran en el esquema **MAGNESON-SINDICATO (10 de 32)**: la mitad de las 20 personas en ese esquema.
- **No hay campo de causa de baja ni de entrevista de salida**. Con los datos actuales no se puede responder *por qué* se van.

### Utilización / banca
- Solo **30 de los 75 activos tienen asignación** (40%). **45 activos aparecen sin proyecto**. Puede ser banca real o asignaciones que nunca se capturaron. Hay que confirmarlo con el socio formador.
- 23 de las 30 personas asignadas están en un solo cliente (**METALSA**): riesgo alto de concentración.
- No hay registro de horas, tarifa ni ingreso por proyecto. No se puede calcular % facturable ni costo vs. ingreso.

### Habilidades
- La matriz cubre solo **54 personas; 28 activos no tienen matriz**.
- Fortalezas (más expertos): PL/SQL (16), Reports (13), INV (13), Oracle EBS (12), Publisher (10), PO (10).
- **Huecos (0 expertos):** TAX, MFG Cloud, Landed Cost, OPM, iExpenses, eBTax, Taleo, FUSE. Son posibles focos de capacitación o de contratación.
- Solo **12 con certificación Oracle**, y no se registra la fecha de vencimiento.
- El catálogo repite 13 nombres (GL, AP, PO, etc.) porque existen en EBS y en Cloud, pero la matriz no muestra a qué tecnología pertenece cada uno, y eso confunde.

### Expedientes y cumplimiento
- **Solo 1 de 75 activos tiene el expediente completo.**
- Faltan sobre todo: contrato (solo 19% lo tiene), aviso Infonavit (13%), manutención (12%), foto (40%). Acta, INE, CURP y NSS rondan el 75%.
- Beneficiario de seguro de vida en «Pendiente» para 98 personas; alergias/condiciones en «Pendiente» para 104.
- SGMM capturado con 11 variantes de texto («PLAN SEGURO» / «PLAN SEGUROS», «SI», «NO LO ENVIO», etc.).

### Activos (equipo de cómputo)
- 123 equipos que suman **$567,915.55**; **70 tienen costo $0** (no se capturó). El costo real es mayor.
- 32 equipos «Sin Asignar» (inventario ocioso) y **18 activos sin equipo**.
- **17 equipos siguen a nombre de gente dada de baja**, 9 con «Fecha Fin = Activo»: posible equipo no recuperado.
- 17 personas tienen 2 o 3 equipos.
- Marca escrita en 12 formas («DELL», «Dell», «DELL »…). 35 equipos con fecha placeholder `1990-01-01`.

## 4. Problemas de calidad de datos (para la propuesta de mejora)

| Problema | Dónde | Cantidad |
|---|---|---|
| Puesto = «PENDIENTE» | Colaboradores | 48 (29 activos) |
| Departamento vacío | Colaboradores | 95 de 107 |
| Fecha placeholder `1990-01-01` | Asignaciones / Activos | 21 / 35 |
| Rol asignado = «PENDIENTE» | Asignaciones | 29 de 31 |
| Baja sin fecha de baja | Colaboradores | 18 |
| Activo con fecha de baja (19-nov-2026, futura) | OTC029 | 1 |
| Activo con sueldo $0 | OTC013, 043, 049, 073, 080 | 5 |
| Bajas sin tipo de nómina ni sueldo | Colaboradores | 6 |
| Persona en 2 asignaciones simultáneas | OTC095 (METALSA + Daltile) | 1 |
| «FAMILIAR COLABORADOR» como empleado activo | OTC108, OTC109 | 2 |
| Datos personales anonimizados (RFC, CURP, correo, domicilio, teléfono) | Colaboradores | 107 (es esperado) |
| Espacios y texto inconsistente («Grupo Daltile », «DELL ») | Varias | — |
| Proyecto con error de dedo («Soporte AMS Manufacta», «Asiganci´ñon») | Clientes | 2 |
| Clientes sin RFC / sin fechas / sin PM OTC | Clientes | 8 / 6 / 6 |
| Departamentos sin responsable ni centro de costos | Departamentos | 6 de 6 |
| Activos ligados por nombre y no por ID | Activos | todo |

## 5. KPIs posibles con los datos actuales vs. lo que falta

**Se pueden calcular ya:** rotación y antigüedad al salir, headcount y altas por año, costo de nómina por esquema y por puesto, % asignado vs. en banca, concentración por cliente, cobertura y huecos de habilidades, % de expediente completo, inversión y recuperación de equipo.

**Faltan datos para:** causa de baja, horas facturables y utilización, ingreso por proyecto o tarifa, tiempo y costo de contratación (no hay datos de reclutamiento), vencimiento de certificaciones, desempeño, clima/NOM-035 y repositorio de procesos/POEs.

## 6. Preguntas para el socio formador

1. ¿Los 45 activos sin asignación están realmente en banca o falta capturar?
2. ¿Qué significa cada esquema de nómina? ¿Por qué MAGNESON concentra las bajas?
3. ¿Dónde se registran las horas por proyecto y las tarifas?
4. ¿Existe la causa de baja o la entrevista de salida en algún lado?
5. ¿Qué son los registros «FAMILIAR COLABORADOR»?
6. ¿Se puede ligar Activos por ID de colaborador en lugar del nombre?
