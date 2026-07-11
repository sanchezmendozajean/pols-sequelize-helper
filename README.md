# pols-sequelize-helper

`pols-sequelize-helper` es una biblioteca de utilidades y helpers para **Sequelize (v6)** que facilita la realización de consultas avanzadas, paginación automática, generación de consultas SQL y filtrado de texto insensible a acentos/tildes en dialectos como MSSQL y Postgres.

---

## Características Principales

* **Filtrado Inteligente con Acentos y Diacríticos**: Genera condiciones `WHERE` insensibles a mayúsculas/minúsculas y acentos (`á`, `é`, `í`, `ó`, `ú`, `ü`) de forma nativa para MSSQL y PostgreSQL, con fallback automático para otros dialectos (MySQL, SQLite, MariaDB).
* **Búsqueda con Comodines**: Soporte para comodines utilizando el asterisco (`*`) en los tokens de búsqueda.
* **Paginación Automática**: Método `findAllByPage` que gestiona el cálculo total de filas (`count`) y la extracción del subconjunto paginado (`limit` y `offset`) en una sola llamada.
* **Simplificación de Ordenamiento Relacionado**: Permite ordenar por campos de modelos asociados usando el alias (`as`) directamente en la definición del orden, sin necesidad de instanciar o pasar las clases del modelo manualmente.
* **Generación de SQL Síncrona**: Métodos `selectQuery` y `countQuery` para previsualizar u obtener las cadenas SQL generadas por Sequelize sin necesidad de ejecutar la consulta contra el servidor.
* **Evita Efectos Secundarios (Inmutabilidad)**: Clona automáticamente las opciones suministradas por el usuario antes de procesarlas para evitar la mutación inesperada de los objetos de configuración.

---

## Instalación

Instala el paquete a través de npm:

```bash
npm install pols-sequelize-helper
```

*Nota: Asegúrate de tener `sequelize` y `pols-utils` instalados en tu proyecto.*

---

## API y Ejemplos de Uso

### 1. Filtrado de Texto (Filtros Acústicos y Diacríticos)

Puedes aplicar filtros de texto insensibles a tildes y mayúsculas sobre múltiples campos.

```typescript
import { findAll } from 'pols-sequelize-helper';
import { Usuario } from './models';

const usuarios = await findAll(Usuario, {
  filter: {
    text: 'Ramón', // Coincidirá con "ramon", "Ramon", "ramón", etc.
    fields: ['Nombres', 'Apellidos']
  }
});
```

#### Búsqueda con comodines:
El caracter `*` se traduce automáticamente a comodines `%` en la base de datos:
```typescript
const usuarios = await findAll(Usuario, {
  filter: {
    text: 'Ra*l', // Coincidirá con "Raul", "Raúl", "Rael", etc.
    fields: ['Nombres']
  }
});
```

---

### 2. Paginación con `findAllByPage`

El método `findAllByPage` calcula automáticamente la cantidad total de registros y extrae la página seleccionada.

```typescript
import { findAllByPage } from 'pols-sequelize-helper';
import { Producto } from './models';

const resultado = await findAllByPage(Producto, {
  page: 2,
  rowsPerPage: 10,
  where: { Activo: true },
  order: [['Nombre', 'asc']]
});

console.log(resultado.rows);        // Array de 10 productos (página 2)
console.log(resultado.rowsCount);   // Total de productos que cumplen la condición
console.log(resultado.totalPages);  // Total de páginas calculadas
console.log(resultado.currentPage); // Página actual devuelta
```

---

### 3. Ordenamiento Simplificado en Relaciones

En Sequelize estándar, ordenar por un modelo relacionado requiere pasar la clase del modelo. Con este helper, puedes hacerlo especificando la ruta de la relación mediante sus aliases (`as`).

```typescript
import { findAll } from 'pols-sequelize-helper';
import { Padre } from './models';

const registros = await findAll(Padre, {
  include: [{ as: 'Hijos' }],
  order: [
    // Ordena por el campo 'Dato' del modelo asociado con el alias 'Hijos'
    [[{ as: 'Hijos' }, 'Dato', 'asc']]
  ]
});
```

---

### 4. Generación de Consultas SQL (`selectQuery` y `countQuery`)

Obtén la consulta SQL cruda que Sequelize generaría para una configuración dada, útil para depuración o ejecución manual.

```typescript
import { selectQuery, countQuery } from 'pols-sequelize-helper';
import { Cliente } from './models';

// Obtener SQL de selección
const sqlSelect = selectQuery(Cliente, {
  where: { Activo: true },
  filter: { text: 'sanchez', fields: ['Apellidos'] }
});
console.log(sqlSelect); 
// "SELECT ... FROM [Clientes] WHERE [Clientes].[Activo] = 1 AND ... LIKE '%sanchez%'"

// Obtener SQL de conteo
const sqlCount = countQuery(Cliente, {
  where: { Activo: true }
});
console.log(sqlCount);
// "SELECT count(*) AS [count] FROM [Clientes] WHERE [Clientes].[Activo] = 1"
```

---

### 5. Métodos Adicionales

* **`findOne(model, options)`**: Igual a `Model.findOne`, pero aplica los filtros `filter`, el orden simplificado y la resolución de alias en el `include` de forma automática.
* **`findOrBuild(model, options)`**: Igual a `Model.findOrBuild`, con soporte automático de filtros y resolución de asociaciones.
* **`count(model, options)`**: Ejecuta un conteo optimizado. Descarta asociaciones muchos-a-muchos o uno-a-muchos irrelevantes que no alteren el resultado final, pero **conserva** de forma inteligente aquellas relaciones marcadas como requeridas (`required: true`) o que contengan filtros activos (`where` o `filter`).

---

## Dialectos Soportados

1. **Microsoft SQL Server (`mssql`)**: Soporte nativo para eliminación de acentos usando niveles anidados de la función `replace` (incluyendo soporte de `ü` -> `u`).
2. **PostgreSQL (`postgres`)**: Soporte nativo y rápido utilizando la función `translate` (ej. `translate(col, 'áéíóúü', 'aeiouu')`).
3. **Otros Dialectos (MySQL, SQLite, MariaDB, etc.)**: Fallback automático que aplica un filtrado `Op.like` o `Op.iLike` estándar sobre el valor en minúsculas del campo.