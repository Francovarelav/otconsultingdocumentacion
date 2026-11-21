# Reto OT Consulting — Recursos Humanos

Contexto del proyecto para trabajar con Claude Code sobre este repo.
Si lo pones en la raíz como `CLAUDE.md`, se carga solo en cada sesión.

---

## 1. Qué es esto

Proyecto académico con **socio formador OT Consulting**, consultora mexicana de TI e IA
(~23 años, Oracle EBS / Cloud / NetSuite, división de IA, productos SaaS Anastasia/SMART ALIGN
y CPA Vision). El área asignada es **Recursos Humanos**.

**Objeto de estudio:** el ciclo de vida del colaborador (ingreso → asignación a proyectos →
desarrollo de habilidades → costo → salida) y la capacidad del sistema de RH para dar
información confiable sobre ese ciclo.

**Problemática.** RH no puede responder con datos tres preguntas del negocio:

1. ¿Por qué se va la gente y cuánto cuesta? Casi la mitad de los contratados desde 2024 ya
   salió, la mayoría en su primer año, y **no existe la causa de baja**.
2. ¿Cuánta de la plantilla genera ingreso? El 60% de los activos aparece sin asignación y no
   hay horas ni tarifas.
3. ¿Tenemos el talento para los proyectos que vienen? La matriz de habilidades está incompleta
   y las certificaciones no tienen vencimiento.

**Causa raíz:** el diseño de los datos — texto libre en lugar de catálogos, uniones por nombre,
valores `PENDIENTE` y fechas de relleno, y ausencia de los datos que el negocio necesita.

### Equipo
Franco Varela Villegas (A01199186) · Emilio Ogaz Galván (A01572029) ·
Angelica Velez Cantu (A01199359) · Melissa Anahid Esparza López (A01286887) ·
José Fernando Munguía Zertuche (A01199357)

### Repos del equipo
- Franco — https://github.com/Francovarelav/otconsultingdocumentacion
- Emilio — https://github.com/EOGaz/RetoOTConsulting
- Fernando — https://github.com/JoseFernandoMunguiaZertuche/otc-hr-data-audit
- Angelica — https://github.com/angievelec06-hub/avance-2

### Estado por etapa
| Etapa | Entregable | Estado |
|---|---|---|
| 1 | Justificación y planeación | Entregada |
| 2 | Análisis y exploración de los datos | Entregada |
| 3 | Acondicionamiento y corrección de los datos | Entregada (doc + notebook) · pipeline corrido con datos reales |
| 4 | Prototipo / tablero y conclusiones | **En curso**: prototipo en `tablero/` (React + Tailwind) |

---

## 2. Datos fuente (7 archivos exportados del sistema)

| Archivo | Filas | Llave | Notas |
|---|---|---|---|
| Colaboradores | 107 | `ID` | Sueldos (6 campos), seguros, 14 campos de documentación |
| Asignaciones | 31 | — | Liga a colaborador por `ID Colaborador`, a proyecto **por texto** |
| Clientes y proyectos | 12 | `Cód Cliente` | El proyecto **no tiene código propio** |
| Activos | 123 | `Cód Activo` | Liga al colaborador **por nombre completo** |
| Departamentos | 6 | `Código` | Responsable y centro de costos vacíos |
| Habilidades | 71 | `Código` | `Tecnología` (Oracle EBS, Cloud…) y `Tipo` (HARD/SOFT) |
| Matriz de habilidades | 54 | `ID Colaborador` | **Una columna por habilidad** (formato ancho) |

Relaciones originales: Colaboradores→Asignaciones por ID · Colaboradores→Matriz por ID ·
Habilidades→Matriz por nombre de columna · Asignaciones→Clientes **por texto** ·
Colaboradores→Activos **por nombre** (la más frágil) · Colaboradores→Departamentos por nombre.

Los campos personales (teléfono, correo, domicilio, RFC, CURP, NSS) vienen ocultos en la
exportación y **no se incorporan** a las tablas analíticas: para los indicadores basta saber si
el documento fue entregado, no su contenido.

### Inconsistencias conocidas
- **Colaboradores:** 95 de 107 sin departamento · 29 activos con puesto `PENDIENTE` ·
  18 bajas sin fecha de baja · 1 activo **con** fecha de baja · 5 activos con sueldo $0 ·
  2 familiares registrados como empleados · ciudad y aseguradora con múltiples grafías ·
  solo 1 de 75 activos con expediente completo (lo que más falta: el contrato).
- **Asignaciones:** fechas de relleno `1990-01-01` · `Indefinido` escrito dentro de un campo de
  fecha · casi todos los roles en `PENDIENTE` · una persona en dos proyectos a la vez ·
  45 de 75 activos sin ninguna asignación.
- **Clientes:** sin código de proyecto · faltan RFC, fechas y PM · nombres con errores de dedo.
- **Activos:** liga por nombre · 70 equipos con costo $0 · marca escrita de 12 formas ·
  17 equipos a nombre de gente que ya salió.
- **Habilidades:** 13 con el mismo nombre en EBS y Cloud · 28 activos sin matriz ·
  certificaciones sin vencimiento · ningún departamento con responsable ni centro de costos.

---

## 3. Reglas de negocio (las 20 acordadas)

**Identidad y catálogos**
1. Todas las tablas se unen por ID (`id_colaborador`, `id_proyecto`, `id_cliente`, `id_activo`), **nunca por nombre**.
2. Puesto, departamento, esquema de nómina, aseguradora, ciudad, marca, industria y causa de baja se eligen de catálogo.
3. No se permiten `PENDIENTE`, `XXXX` ni fechas de relleno. Dato desconocido → **nulo + bandera de faltante**.
4. Textos sin espacios sobrantes; nombres propios en formato título.

**Colaboradores**

5. Un activo debe tener puesto, departamento, esquema de nómina y sueldo > $0.
6. Una baja debe tener fecha, tipo y causa. Un activo no puede tener fecha de baja.
7. La fecha de baja no puede ser anterior al ingreso. Un reingreso crea un periodo nuevo.
8. Los familiares de seguros no cuentan como plantilla.
9. Expediente completo = todos los obligatorios en `SI` o `NO APLICA`. Pasaporte y visa son opcionales.
10. Costo mensual = **Sueldo Total Integrado**; costo por hora = Sueldo Total Integrado / 160.

**Asignaciones**

11. Varias asignaciones simultáneas son válidas si la dedicación suma ≤ 100%.
12. Toda asignación tiene fecha de inicio real; sin fecha de fin se marca indefinida (nunca texto en la fecha).
13. Una asignación termina automáticamente cuando el colaborador causa baja.
14. Activo sin asignación vigente = **en banca**.
15. Las horas se registran por semana y asignación, marcando si son facturables.

**Clientes, proyectos y activos**

16. Cada proyecto pertenece a un solo cliente y tiene un PM de OT Consulting.
17. Cada equipo se asigna a una sola persona a la vez y debe tener costo de compra.
18. Al dar de baja a un colaborador, sus equipos se devuelven o se marcan pendientes de recuperar.

**Habilidades**

19. Nivel en escala 1–4 (Básico, Intermedio, Avanzado, Experto) con fecha de evaluación; se reevalúa al menos una vez al año.
20. Cada certificación tiene fecha de obtención y de vencimiento; vigente solo si no ha vencido.

---

## 4. Métodos de corrección (M1–M14)

> **Principio rector:** el acondicionamiento **no borra ni inventa registros**. Corrige formato,
> reconstruye llaves, nulifica centinelas y deja bandera de calidad. Si un registro no cumple
> una regla, se marca y se excluye del indicador, pero se conserva para que RH lo corrija.

| # | Método | Qué hace |
|---|---|---|
| M1 | Normalización de texto | `strip`, colapso de espacios, `NFC`, formato título en nombres propios, mayúsculas en claves |
| M2 | Nulificación de centinelas | `PENDIENTE`, `XXXX`, `N/A`, `-`, vacío, `Indefinido`, `1990-01-01` → `NaN` + bandera `falta_*` |
| M3 | Catálogos | Diccionario de equivalencias + `rapidfuzz` (umbral 90) **solo para proponer**; la asignación final queda escrita en el diccionario para que sea reproducible |
| M4 | Tipificación | Fechas con `errors='coerce'`, montos sin `$` ni comas, documentación `SI/NO/PENDIENTE/NO APLICA` → `1/0/null` (`NO APLICA` cuenta como cumplido) |
| M5 | Reconstrucción de llaves | Activos: nombre → `id_colaborador` (exacta, luego difusa con bandera). Proyectos: se genera `id_proyecto` desde (cliente, proyecto) normalizados |
| M6 | Deduplicación | Las 13 habilidades repetidas en EBS/Cloud se desambiguan con clave compuesta tecnología+descripción |
| M7 | Depuración de plantilla | Los 2 familiares quedan `es_plantilla = 0`; salen del denominador, no del archivo |
| M8 | Coherencia temporal | `fecha_baja ≥ fecha_incorporacion`; al activo con fecha de baja se le nulifica y se marca |
| M9 | Solapamientos | No es error: se mide `pct_dedicacion` y se marca `sobreasignado` si pasa de 100% |
| M10 | Cierre por baja | `fecha_fin = min(fecha_fin, fecha_baja)`; deja de sobreestimarse la utilización |
| M11 | Imputación controlada | **No se imputa.** Sueldos y costos en $0 → nulo + bandera. La causa de baja nunca se inventa |
| M12 | Matriz a formato largo | `melt` de 71 columnas a (`id_colaborador`, `cod_habilidad`, `nivel`); vacío = no evaluado, **no** nivel cero |
| M13 | Trazabilidad | Cada cambio escribe en `log_correcciones` (tabla, columna, registro, original, corregido, método, fecha) |
| M14 | Tablas de extensión | Estructuras vacías con llave y dominio para lo que no existe: `baja`, `registro_horas`, `tarifa_proyecto`, `certificacion` |

---

## 5. Atributos agregados y fórmulas

`fecha_corte` es parámetro del cuaderno. `Disponible`: Sí = ya se calcula · Parcial = el campo
existe pero está incompleto · No = depende de una tabla M14.

### Rotación y permanencia
| Atributo | Fórmula | Disp. |
|---|---|---|
| `edad` | `ENTERO((fecha_corte − fecha_nacimiento) / 365.25)` | Sí |
| `antiguedad_meses` | `MESES(fecha_incorporacion, COALESCE(fecha_baja, fecha_corte))` | Sí |
| `rotacion_mensual_pct` | `bajas_mes / ((activos_inicio + activos_cierre)/2) × 100` | Sí |
| `rotacion_anual_pct` | `bajas_12m / plantilla_promedio_12m × 100` | Sí |
| `permanencia_meses` | `PROMEDIO(antiguedad_meses al salir)` por año de ingreso | Sí |
| `baja_primer_anio` | `1 si antiguedad_meses < 12 al momento de la baja` | Sí |
| `es_baja_voluntaria` | `1 si causa_baja ∈ grupo voluntaria` | No |
| `costo_reemplazo` | `reclutamiento + capacitacion + (dias_vacante/30) × costo_mensual` | No |

### Asignación y utilización
| Atributo | Fórmula | Disp. |
|---|---|---|
| `pct_dedicacion` | % de jornada comprometido; 100% si la asignación es única (se marca el estimado) | Parcial |
| `dedicacion_total_pct` | `SUMA(pct_dedicacion)` de las asignaciones vigentes | Parcial |
| `sobreasignado` | `1 si dedicacion_total_pct > 100` | Parcial |
| `tiene_asignacion_vigente` | existe asignación con `inicio ≤ corte` y (`fin` nula o `≥ corte`) | Sí |
| `dias_en_banca` | `corte − MAX(fin de última asignación, fecha_incorporacion)` | Sí |
| `dias_para_fin_asignacion` | `fecha_fin − corte`, buckets 30/60/90 | Sí |
| `pct_horas_facturables` | `horas_facturables / horas_totales × 100` | No |
| `concentracion_cliente_pct` | `colaboradores_del_cliente / plantilla_activa × 100` | Sí |

### Costo y rentabilidad
| Atributo | Fórmula | Disp. |
|---|---|---|
| `costo_mensual` | Sueldo Total Integrado (nulo si desconocido) | Sí |
| `costo_hora` | `costo_mensual / 160` | Sí |
| `costo_personal_proyecto` | `SUMA(costo_mensual × pct_dedicacion)` del proyecto en el mes | Parcial |
| `ingreso_proyecto` | `SUMA(tarifa_hora × horas_facturables)` | No |
| `margen_proyecto_pct` | `(ingreso − costo_personal) / ingreso × 100` | No |
| `costo_banca_mes` | `SUMA(costo_mensual)` de los que no tienen asignación vigente | Sí |
| `costo_nomina_por_esquema` | `SUMA(costo_mensual)` agrupado por esquema | Sí |
| `inversion_equipo_col` | `SUMA(costo)` de los equipos vigentes del colaborador | Parcial |

### Habilidades, cumplimiento y activos
| Atributo | Fórmula | Disp. |
|---|---|---|
| `nivel_num` | Básico 1 · Intermedio 2 · Avanzado 3 · Experto 4; nulo si no evaluado | Sí |
| `expertos_por_habilidad` | `COUNT(activos con nivel_num ≥ 3)` por habilidad | Sí |
| `riesgo_persona_clave` | `1 si expertos_por_habilidad ≤ 1` | Sí |
| `matriz_actualizada` | `1 si la evaluación tiene menos de 12 meses` | No |
| `dias_vencim_cert` | `fecha_vencimiento − corte`; vigente si ≥ 0 | No |
| `pct_expediente` | `docs en SI o NO APLICA / docs obligatorios × 100` | Sí |
| `expediente_completo` | `1 si pct_expediente = 100` | Sí |
| `valor_equipo_no_recuperado` | `SUMA(costo)` de equipos de gente dada de baja sin devolución | Sí |
| `indice_completitud` | `celdas válidas / celdas esperadas × 100` por tabla y columna | Sí |

**Balance:** 17 ya calculables · 4 parciales · 6 programados contra tablas M14.

---

## 6. Tablas acondicionadas (salida del pipeline)

Nueve tablas unidas por ID, en `salida/otc_rh.db` (SQLite) y en CSV.

| Tabla | Llaves | Qué cambió |
|---|---|---|
| `colaborador_acondicionado` | PK `id_colaborador`; FK `id_departamento`, `id_puesto`, `id_ciudad` | Catálogos, centinelas nulificados, sueldos $0 a nulo, `es_plantilla`, expediente, y todos los derivados |
| `asignacion_acondicionada` | PK `id_asignacion`; FK `id_colaborador`, `id_proyecto` | `id_proyecto` generado, fechas de relleno fuera, `pct_dedicacion`, cierre por baja |
| `proyecto_acondicionado` | PK `id_proyecto`; FK `id_cliente` | El proyecto deja de identificarse por su nombre |
| `cliente_acondicionado` | PK `id_cliente` | Nombres e industria homologados, RFC en mayúsculas |
| `activo_acondicionado` | PK `cod_activo`; FK `id_colaborador` | Liga por ID, marca homologada, costos $0 a nulo, `pendiente_recuperar` |
| `departamento_acondicionado` | PK `id_departamento` | Responsable y centro de costos como obligatorios (hoy nulos con bandera) |
| `habilidad_acondicionada` | PK `cod_habilidad` | Clave compuesta para las 13 descripciones repetidas |
| `matriz_habilidad_long` | PK (`id_colaborador`, `cod_habilidad`) | De 71 columnas a formato largo, nivel 1–4 |
| `log_correcciones` | PK `id_correccion` | Trazabilidad de cada cambio |
| `calidad_datos` | PK (`tabla`, `columna`) | Completitud antes/después, centinelas y correcciones |

Banderas de calidad en `colaborador_acondicionado`: `falta_puesto`, `falta_departamento`,
`falta_sueldo`, `falta_fecha_baja`, `inconsistencia_estatus_fecha`, `sobreasignado`.

---

## 7. Validaciones que deben pasar

Deben dar **cero**:
```sql
SELECT COUNT(*) FROM colaborador_acondicionado WHERE estatus='Activo' AND fecha_baja IS NOT NULL;
SELECT COUNT(*) FROM colaborador_acondicionado WHERE fecha_baja < fecha_incorporacion;
SELECT COUNT(*) FROM asignacion_acondicionada  WHERE vigente=1 AND estatus_colab='Baja';
SELECT COUNT(*) FROM colaborador_acondicionado WHERE sueldo_total_integrado=0;
SELECT COUNT(*) FROM activo_acondicionado      WHERE costo=0;
```

Hallazgos que **se reportan a RH** (no son error del pipeline): bajas sin fecha, colaboradores
sobreasignados, activos sin dueño identificado, equipo pendiente de recuperar.

---

## 8. Estructura del repo

```
├── CLAUDE.md                         # este archivo
├── README.md
├── datos/                            # los 7 exports (NO versionar: datos del socio formador)
├── notebooks/
│   ├── Exploracion_OTC_FrancoVarela.ipynb
│   └── etapa3_acondicionamiento.ipynb
├── src/
│   ├── acondicionamiento_rh.py       # pipeline M1–M14 (CLI: --datos --salida --corte)
│   ├── catalogos.py                  # diccionarios de equivalencias
│   ├── extension.sql                 # tablas M14
│   ├── indicadores.sql               # vistas de KPI (v_*)
│   └── exportar_tablero.py           # vistas → tablero/public/datos.json
├── tablero/                          # React + Vite + Tailwind; lee public/datos.json
├── salida/                           # otc_rh.db y CSV (NO versionar)
└── docs/
```

Comandos:
```bash
.venv/bin/python src/acondicionamiento_rh.py      # regenera salida/otc_rh.db; falla si una validación no da cero
.venv/bin/python src/exportar_tablero.py          # --con-nombres solo para uso interno
cd tablero && npm run dev
```

`.gitignore` cubre `datos/*.xlsx`, `salida/`, `*.db` y `tablero/public/datos.json`.
Los datos son del socio formador — no suban archivos con datos personales al repo público.
En el tablero, **rayado = dato que falta o se estimó**; no usar el rayado para otra cosa.

### Cifras reales del pipeline (corte 2026-11-20)

Sustituyen a las estimadas de las secciones 1 y 2 cuando difieran:

- 107 registros → 105 de plantilla (2 familiares fuera): **73 activos y 32 bajas**.
- Desde 2024: 55 ingresos, 25 bajas (45 %). Bajas con fecha: 14 de 32. Rotación 12 meses medible: 18.4 %.
- **30 de 73 activos con asignación vigente; 43 en banca (58.9 %)**. 1 sobreasignado.
- Sueldo capturado en 68 de 73 activos. Activos que cumplen la regla 5 completa: 11.
- Matriz: 47 de 73 activos; 1,529 evaluaciones, ninguna con fecha. 11 habilidades con ≤ 1 experto.
- Expediente completo: 1 de 73. Equipos: 123; 70 sin costo; **9 por recuperar** de bajas.
- 831 correcciones en `log_correcciones`; 13 validaciones en cero.

---

## 9. Convenciones al trabajar aquí

- **Nunca** unir tablas por nombre: siempre por ID (regla 1).
- **Nunca** imputar un dato faltante para que se vea completo: nulo + bandera (regla 3, M11).
- Todo método nuevo de corrección escribe en `log_correcciones` (M13).
- Los indicadores reportan **sobre cuántos registros confiables** se calcularon.
- Cualquier atributo nuevo se documenta con su fórmula en la sección 5 de este archivo.
- El código va en español en los nombres de columna (consistente con la fuente) y los comentarios.

## 10. Qué sigue (Etapa 4)

1. ~~Correr el pipeline contra los archivos reales~~ Hecho; falta sustituir las cifras estimadas del documento de la Etapa 3.
2. ~~Construir el tablero de RH sobre `otc_rh.db`~~ Prototipo hecho en `tablero/` con los cinco bloques, más captura
   pendiente y calidad de datos. Falta validarlo con el socio formador.
3. ~~Dejar los 6 indicadores bloqueados programados contra las tablas M14~~ Hecho (`v_bajas_por_causa`,
   `v_costo_reemplazo`, `v_horas_facturables`, `v_margen_proyecto`, `v_certificacion_vigencia`, `v_matriz_actualizada`).
4. Entregar a RH la lista de captura pendiente (`v_captura_pendiente`):
   **causa de baja · registro de horas · tarifas por proyecto · certificaciones con vencimiento ·
   fecha de evaluación de habilidades.**
5. Escribir las conclusiones de la Etapa 4.
