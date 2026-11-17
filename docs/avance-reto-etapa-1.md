# AVANCE RETO ETAPA 1 — Justificación y Planeación

- Franco Varela Villegas — A01199186
- Emilio Ogaz Galván — A01572029
- Angelica Velez Cantu — A01199359
- Melissa Anahid Esparza López — A01286887
- José Fernando Munguía Zertuche — A01199357

13 de noviembre del 2026

## Índice

1. Conocimiento de la empresa y del área donde se estará trabajando
2. Conocimiento del área donde se estará trabajando
3. Conocimiento de la función y forma de operar
4. Conocimiento de la forma en que se genera las fuentes de datos
5. Conocimiento de las necesidades de información y de analítica de datos
6. Conocimiento de la herramienta de análisis actualmente usada + Tecnologías usadas en sus procesos
7. Conocimiento de los beneficios que se obtendrán de la realización de esta intervención
8. Comprensión de las necesidades y/o problemáticas del usuario principal de la Solución de analítica a ser construida
9. Objetivo del Reto

---

## Conocimiento de la empresa y del área donde se estará trabajando

**La empresa.** OT Consulting es una consultora mexicana de tecnologías de información e inteligencia artificial. Nació vendiendo e implementando sistemas ERP (Oracle EBS, Oracle Cloud y NetSuite) y evolucionó hacia la consultoría de software como negocio central. Desde hace unos cuatro años tiene un área especializada en IA. Además, con socios externos, comercializa dos soluciones SaaS: Anastasia (planeación estratégica y pronósticos con IA) y CPA Vision (gestión fiscal y cumplimiento regulatorio). Atiende a retail, salud, manufactura, automotriz, construcción, alimentos, servicios y seguros. Compite con Softtek, Neoris y Grupo Indi en México, y con Accenture, Deloitte e IBM a nivel internacional. Reporta un margen de utilidad aproximado de 30%. Su visión es ser un referente de consultoría tecnológica en Latinoamérica para 2035.

Como es una empresa de consultoría, su principal activo es su gente: lo que vende son las horas, el conocimiento y las certificaciones de sus consultores. Por eso RH es un área estratégica para el negocio.

## Conocimiento del área donde se estará trabajando

El área de Recursos Humanos de OT Consulting administra el capital humano de toda la organización: el área comercial (5 personas), consultoría e implementación (80 colaboradores), proyectos específicos (20 colaboradores) y el área de inteligencia artificial. También se coordina con el abogado externo en temas laborales y contractuales.

Como la empresa es una consultora, su principal activo es su gente, ya que lo que vende es el conocimiento, las horas y las certificaciones de sus consultores. Por eso RH tiene un papel estratégico, el atraer, desarrollar y retener talento técnico muy competido en el mercado frente a empresas competidoras. El área se encarga del reclutamiento, la nómina, la capacitación, la evaluación del desempeño y la administración del personal, y apoya a las áreas operativas para contar con los perfiles adecuados en cada proyecto.

## Conocimiento de la función y forma de operar

Las funciones principales del área son:

- **Reclutamiento y selección:** atraer perfiles técnicos muy competidos en el mercado (consultores Oracle, NetSuite, especialistas en IA). Compite por talento con Softtek, Neoris, Accenture y Deloitte.
- **Onboarding y asignación:** integrar al nuevo colaborador y coordinar con las áreas operativas su asignación a proyectos.
- **Capacitación y certificación:** mantener actualizadas las certificaciones Oracle y las competencias en IA, que son clave para vender y ejecutar proyectos.
- **Nómina y administración de personal:** altas y bajas ante el IMSS, prestaciones, incidencias y contratos. Los 20 colaboradores de proyectos específicos probablemente tienen esquemas temporales o por proyecto.
- **Evaluación del desempeño:** medir resultados por consultor y por proyecto.
- **Clima y cumplimiento laboral:** por ejemplo, NOM-035 (riesgo psicosocial) y gestión de salidas.

## Conocimiento de la forma en que se genera las fuentes de datos

Los datos de RH se generan a lo largo de todo el ciclo del colaborador. En el reclutamiento se registran las vacantes, los candidatos, las fuentes de contratación y los tiempos de cada etapa. Al ingresar el colaborador se crea su expediente con puesto, área, fecha de ingreso, tipo de contrato y sueldo. La nómina genera información de pagos, prestaciones, faltas, vacaciones e incidencias, y el registro de horas por proyecto muestra cuánto tiempo dedica cada consultor a cada cliente. A esto se suman los registros de capacitación y certificaciones, las evaluaciones de desempeño, las encuestas de clima y, al final, los datos de bajas y entrevistas de salida. Es probable que esta información esté dispersa en distintos archivos y sistemas, lo cual se debe confirmar con el socio formador.

## Conocimiento de las necesidades de información y de analítica de datos

El área necesita conocer la tasa de rotación por área y sus causas, ya que en consultoría TI reemplazar a un consultor es costoso y tardado. También requiere medir el tiempo y el costo de contratación, la utilización de los consultores (qué porcentaje de sus horas se factura y cuántos están sin proyecto asignado) y contar con un inventario actualizado de habilidades y certificaciones, incluyendo sus fechas de vencimiento. Otras necesidades son analizar el costo de personal frente a los ingresos que genera cada área, el desempeño por consultor y el clima laboral, para anticipar riesgos de salida y planear las contrataciones según los proyectos que se esperan cerrar.

## Conocimiento de la herramienta de análisis actualmente usada + Tecnologías usadas en sus procesos

Lo que la empresa utiliza actualmente para llevar a cabo toda la administración de recursos humanos es una PWA hospedada en Firebase, siendo Firebase un ecosistema completo de Google. El principal propósito de esta herramienta es llevar toda la trazabilidad de este departamento, y por lo que podemos ver está hecha a la medida de la empresa, por lo cual la adaptación de su parte es lo más integral posible.

Adicional a esto, preparamos el dataset completo que nos proporcionaron en diferentes Excels, ya con los datos limpios y sobre todo ordenados; así contamos con mejor capacidad de análisis y somos capaces de entender con mejor detalle cómo funciona todo.

- Dataset: `DATASET_BASE_OTC.xlsx`

## Conocimiento de los beneficios que se obtendrán de la realización de esta intervención

La intervención permitirá a RH tomar decisiones basadas en datos y no solo en la experiencia. Con indicadores claros se podrán detectar a tiempo las causas de rotación y retener talento difícil de reemplazar, hacer más rápida y eficiente la contratación y planear las capacitaciones del personal según los proyectos que viene cerrando el área comercial. Esto evita tanto perder proyectos por falta de consultores como pagar personal sin asignar. También ayudará a proteger el margen de la empresa al controlar el costo de personal y aumentar las horas facturables, y a asignar mejor a cada consultor según sus habilidades y certificaciones. Finalmente, documentar los procesos usados, así como todo lo que necesita cualquier colaborador nuevo para tener todo claro al momento de entrar a la empresa, ya que consideramos que la capacitación del empleado es un proceso tedioso y tardado.

## Comprensión de las necesidades y/o problemáticas del usuario principal de la Solución de analítica a ser construida

La necesidad principal del socio formador, OT Consulting, es contar con un mejor control dentro de su herramienta de análisis y control interno. La idea es clara: implementar mejoras con base en nuestra experiencia como consultores para que tengan una mejor manera de llevar a cabo sus tareas del día a día. Con esto en mente, nos enfocaremos principalmente en el tablero proporcionado por ellos y encontraremos áreas de mejora para así brindarles la mejor solución posible. Agregando a lo anterior, todo esto estará respaldado por una analítica robusta de datos, la cual les ayudará a tomar decisiones de manera controlada y mucho mejor.

### Puntos clave para entender la problemática

- **Falta de orden en su sistema:** su sistema no cuenta con el orden suficiente para que sea lo más usable posible.
- **Falta de analítica de datos:** no hay suficientes métricas ni KPIs útiles; además, no contamos con una analítica robusta para la toma de decisiones.
- **Falta de funciones:** el dashboard está muy básico para cubrir el departamento de Recursos Humanos.
- **No hay trazabilidad:** no hay ningún lugar para poner procesos, POEs ni nada por el estilo. ¿Dónde viven esos documentos? No se sabe.

Durante el desarrollo del reto vamos a explorar las soluciones para estos y más problemas, dándonos la oportunidad de usar los datos proporcionados por ellos y concentrarnos en entender toda la problemática, y con base en eso llegar a una o varias soluciones lo más viables para el socio formador, garantizando así su satisfacción.

## Objetivo del Reto

_(Pendiente)_

## Evidencia del trabajo de Jira

Captura de pantalla de cómo nos estamos organizando para manejar el Jira, project management tool usada para llevar el control de cada sprint del proyecto.

- https://tec-team-mxsl3din.atlassian.net

## Referencias

- Entrevista socio formador, presentaciones compartidas.
