# Quiniela Mundial 2026 - App Personal

Esta es una aplicación web personal y moderna para registrar predicciones, gestionar resultados reales o simulados, y realizar el cálculo automático de puntuaciones para la Copa del Mundo de la FIFA 2026.

## Stack Tecnológico

- **Framework:** Next.js (App Router, React 19)
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS v4 (Tema oscuro premium por defecto)
- **Iconografía:** Lucide React
- **ORM:** Prisma v7
- **Base de Datos (Local):** SQLite (a través de LibSQL con driver adapter)
- **Base de Datos (Producción):** PostgreSQL / Supabase (a través del driver adapter `@prisma/adapter-pg`)
- **Pruebas:** Vitest (Test Driven Development)

---

## Características Principales

1. **Dashboard Premium:** Vista visual y moderna de estadísticas (tasa de acierto, puntos acumulados, porcentaje de completitud de pronósticos).
2. **Alerta de Proyecciones:** Advertencia visual prominente si el total de puntos incluye simulaciones de resultados futuros.
3. **Editor de Predicciones:** Carga ágil de marcadores. Soporta la selección del ganador de penales y el marcador de la tanda de penaltis para partidos eliminatorios en caso de empate.
4. **Gestión de Resultados:** Carga de marcadores reales u proyecciones simuladas.
5. **Mis Puntos:** Desglose detallado de puntos obtenidos por partido y la regla aplicada en español.
6. **Configuración y Utilerías:**
   - Recálculo global idempotente de puntajes.
   - Eliminación masiva de proyecciones simuladas (restauración a estado oficial).
   - Exportación de todos los datos en formato JSON (Backups).
   - Restauración a base de datos semilla por defecto.
   - CRUD manual de partidos del torneo.

---

## Reglas de Puntuación Implementadas

1. **Fase Final (Empate exacto + Penales exactos):** **8 puntos** (aplica solo cuando el partido eliminatorio termina en empate de goles, y el usuario acierta el marcador exacto de goles y penaltis).
2. **Marcador Exacto:** **6 puntos** (acierto de goles local y visitante).
3. **Tendencia + Suma de Goles:** **5 puntos** (acierto de tendencia (ganador/empate) y cantidad total de goles del partido).
4. **Tendencia Correcta (Ganador/Empate):** **4 puntos** (acierto de la tendencia del resultado del partido: gana local, empate o gana visitante, pero sin coincidir goles). *Por ejemplo: si predices un empate (1-1) y el resultado es otro empate (2-2), obtienes 4 puntos por tendencia correcta (empate).*
5. **Solo Suma de Goles:** **1 punto** (falla la tendencia pero acierta el total de goles).
6. **Sin Aciertos:** **0 puntos**.

*Nota:* Si en fase final el usuario acierta el empate exacto pero falla la predicción de penaltis, se le otorgan **6 puntos** por resultado exacto (no se anulan los puntos).

---

## Instalación y Configuración Local (SQLite)

> [!IMPORTANT]
> **Prerrequisito de Node.js:** Este proyecto requiere **Node.js 22 LTS** o superior debido a que ciertas dependencias del ORM (`@prisma/streams-local`) exigen esta versión. Se recomienda utilizar [nvm](https://github.com/nvm-sh/nvm) y ejecutar `nvm use` para cargar la versión correcta especificada en el archivo `.nvmrc`.

### 1. Clonar e Instalar Dependencias
Instala los paquetes necesarios del proyecto:
```bash
npm install
```

### 2. Generar el Esquema y el Cliente de Prisma
Aplica el esquema inicial a la base de datos local SQLite y genera el cliente:
```bash
npx prisma db push
```

### 3. Poblar la Base de Datos (Semilla)
Carga el set de partidos y predicciones de demostración:
```bash
npx prisma db seed
```

### 4. Ejecutar el Servidor de Desarrollo
Inicia el servidor local de Next.js:
```bash
npm run dev
```
Abre tu navegador en [http://localhost:3000](http://localhost:3000).

---

## Ejecución de Pruebas Unitarias

La lógica de cálculo de puntos se encuentra aislada en funciones puras para facilitar su testeo. Para correr las pruebas con Vitest:
```bash
npm run test
```
*O directamente ejecutando `npx vitest run`.*

---

## Migración a Producción (PostgreSQL / Supabase)

El proyecto está diseñado para ser base de datos agnóstica en tiempo de ejecución. **No necesitas modificar el código** para cambiar de SQLite a PostgreSQL en producción.

### Arquitectura de Adaptadores de Prisma 7
La instanciación en `src/lib/db.ts` detecta dinámicamente el protocolo del string de conexión en la variable de entorno `DATABASE_URL`:

- **Si `DATABASE_URL` comienza con `postgres://` o `postgresql://`:** Instancia el adaptador de PostgreSQL (`@prisma/adapter-pg`) usando un pool de conexiones clásico para producción (Supabase).
- **En caso contrario (o si está vacía):** Utiliza el adaptador local de LibSQL/SQLite (`@prisma/adapter-libsql`) apuntando al archivo `dev.db`.

### Pasos para Conectar a Supabase/PostgreSQL:

1. Define tu variable de entorno en tu servidor o archivo de entorno de producción:
   ```env
   DATABASE_URL="postgres://usuario:contraseña@host:puerto/base_de_datos?sslmode=require"
   ```
2. Ejecuta la sincronización del esquema en la base de datos de producción:
   ```bash
   npx prisma db push
   ```
   *Nota: Esto creará las tablas `Match`, `Prediction` y `Score` en tu esquema público de PostgreSQL automáticamente.*

---

## Estructura del Código

- `/src/lib/db.ts`: Inicialización dinámica del cliente Prisma 7 con adaptadores.
- `/src/lib/scoring.ts`: Lógica matemática pura del cálculo de puntos de quiniela.
- `/src/tests/scoring.test.ts`: Suite de pruebas unitarias para el motor de puntos.
- `/src/app/actions.ts`: Acciones de servidor (Server Actions) de Next.js para CRUD, recálculos y exportaciones.
- `/src/app/page.tsx`: Vista de Dashboard principal.
- `/src/app/predictions/`: Vista interactiva de predicciones.
- `/src/app/results/`: Vista de gestión y carga de resultados (reales / simulados).
- `/src/app/scores/`: Vista de desglose de puntos por partido.
- `/src/app/settings/`: Panel de control de base de datos y CRUD manual de partidos.

---

## Flujo Recomendado de Uso

Para aprovechar al máximo todas las funciones de la quiniela, se sugiere seguir este flujo de trabajo:

1. **Crear o Cargar Partidos:** Entra a la pestaña de **Configuración** y usa el botón *Restaurar Semilla* para inicializar los partidos del fixture o agrégalos de forma manual en la sección de *Gestión Manual de Partidos*.
2. **Llenar Predicciones:** Dirígete a la sección de **Predicciones** y registra tus pronósticos de goles para cada partido (y penaltis si se trata de fase final en caso de empate).
3. **Cargar Resultados Reales o Simulados:** Desde la sección de **Resultados**, introduce los marcadores finales oficiales (marcando el resultado como *Real*) o simula escenarios hipotéticos futuros (marcando el resultado como *Simulado*).
4. **Revisar Puntos:** Consulta el **Dashboard** para ver el consolidado de tus métricas y entra a la sección **Mis Puntos** para ver el detalle pormenorizado y las causas de cada puntaje obtenido.
5. **Recalcular Puntos:** Si realizas cambios en el fixture o quieres asegurar la sincronización total del motor, ve a **Configuración** y presiona *Recalcular Puntos*.
6. **Exportar Respaldo:** Cuando sea necesario, haz clic en *Exportar Datos* dentro de **Configuración** para descargar un archivo JSON con toda tu información almacenada.

