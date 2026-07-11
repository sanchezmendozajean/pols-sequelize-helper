import { sequelize, TestPadres, TestHijos } from "./models"
import { selectQuery, countQuery, count, findAllByPage } from '../src/index'
import { Model, DataTypes } from 'sequelize'

// 1. Definir un modelo con un nombre de tabla diferente al del modelo para probar alias en selectQuery
class TestCustomTable extends Model {
	declare id: number
	declare Nombre: string
}
TestCustomTable.init({
	id: { type: DataTypes.INTEGER, primaryKey: true },
	Nombre: { type: DataTypes.STRING }
}, {
	tableName: 'personas_custom',
	sequelize,
	modelName: 'TestCustomTable'
})

// Relación para probar count keep
class TestDetalle extends Model {
	declare id: number
	declare dato: string
}
TestDetalle.init({
	id: { type: DataTypes.INTEGER, primaryKey: true },
	dato: { type: DataTypes.STRING }
}, {
	tableName: 'detalles_custom',
	sequelize,
	modelName: 'TestDetalle'
})
TestCustomTable.hasMany(TestDetalle, { as: 'Detalles', foreignKey: 'cabeceraId' })

async function runTests() {
	console.log("=== INICIANDO PRUEBAS DE MEJORAS ===");

	// --- PRUEBA 1: Evitar Mutación de Opciones ---
	const originalOptions: any = {
		where: { id: 1 },
		include: [{ as: 'Hijos', filter: { text: 'hola', fields: ['Dato'] } }],
		order: [[{ as: 'Hijos' }, 'Dato', 'asc']] as any
	}
	const optionsCopy = JSON.parse(JSON.stringify(originalOptions))

	// selectQuery procesa la consulta y completa filtros/includes/order
	selectQuery(TestPadres, originalOptions)

	// Verificamos que originalOptions no se haya mutado (debe ser idéntica a optionsCopy en estructura externa)
	if (originalOptions.include[0].model !== undefined || 'separate' in originalOptions.include[0]) {
		console.error("❌ ERROR: El objeto 'options' original fue mutado.");
	} else {
		console.log("✅ OK: El objeto 'options' original no fue mutado.");
	}


	// --- PRUEBA 2: Alias de Tabla en selectQuery ---
	const sqlCustom = selectQuery(TestCustomTable, {
		filter: { text: 'juan', fields: ['Nombre'] }
	})
	console.log("SQL Generado para tabla custom:", sqlCustom)
	if (
		sqlCustom.includes("personas_custom AS [TestCustomTable]") || 
		sqlCustom.includes("personas_custom AS TestCustomTable") ||
		sqlCustom.includes("[personas_custom] AS [TestCustomTable]")
	) {
		console.log("✅ OK: selectQuery aplica correctamente el alias 'personas_custom AS TestCustomTable'.");
	} else {
		console.error("❌ ERROR: selectQuery no aplicó el alias correspondiente.");
	}


	// --- PRUEBA 3: Conservación de Relaciones Requeridas en count ---
	// count filtra las relaciones, pero debe mantener las requeridas o con filtros.
	// Hacemos una prueba simulando count con opciones
	const countOptions = {
		include: [
			{ as: 'Detalles', required: true, filter: { text: 'test', fields: ['dato'] } }
		]
	}
	// Ejecutamos countQuery para ver el SQL generado para el conteo
	const countSql = countQuery(TestCustomTable, countOptions)
	console.log("SQL Generado para countQuery:", countSql)
	if (countSql.includes("detalles_custom")) {
		console.log("✅ OK: countQuery mantiene relaciones requeridas/filtradas.");
	} else {
		console.error("❌ ERROR: countQuery descartó incorrectamente una relación requerida/filtrada.");
	}


	// --- PRUEBA 4: Acento Diacrítico 'ü' en MSSQL ---
	const sqlFilterU = selectQuery(TestCustomTable, {
		filter: { text: 'pingüino', fields: ['Nombre'] }
	})
	if (sqlFilterU.includes("'ü'") || sqlFilterU.includes("replace") && sqlFilterU.includes("'u'")) {
		console.log("✅ OK: makeFilterCondition incluye soporte de reemplazo para 'ü'.");
	} else {
		console.error("❌ ERROR: No se detectó reemplazo de 'ü' en la consulta MSSQL.");
	}


	// --- PRUEBA 5: findAllByPage sin Crash cuando options es undefined ---
	try {
		// Mockeamos la base de datos para simular findAllByPage sin conectar realmente, o simplemente pasamos
		// un caso que ejecute findAllByPage y retorne (dará error de conexión, pero no TypeError de options.page)
		console.log("Probando findAllByPage con options undefined...");
		await findAllByPage(TestCustomTable, undefined)
	} catch (err: any) {
		if (err instanceof TypeError && err.message.includes("Cannot read properties of undefined")) {
			console.error("❌ ERROR: findAllByPage crasheó con TypeError de undefined.");
		} else {
			console.log("✅ OK: findAllByPage no crasheó por opciones indefinidas (se esperaba error de conexión: " + err.message + ")");
		}
	}

	// --- PRUEBA 6: findAllByPage devuelve totalPages y currentPage ---
	console.log("Probando findAllByPage con mocks para verificar totalPages y currentPage...");
	const originalCount = TestCustomTable.count;
	const originalFindAll = TestCustomTable.findAll;

	try {
		// Mock count para retornar 13 registros
		TestCustomTable.count = async function(): Promise<number> {
			return 13;
		} as any;

		// Mock findAll para retornar un array ficticio
		TestCustomTable.findAll = async function(): Promise<any[]> {
			return [{ id: 1 }, { id: 2 }];
		} as any;

		const result = await findAllByPage(TestCustomTable, {
			page: 2,
			rowsPerPage: 5
		});

		console.log("Resultado de findAllByPage mockeado:", result);
		if (result.currentPage === 2 && result.totalPages === 3 && result.rowsCount === 13) {
			console.log("✅ OK: findAllByPage devuelve currentPage y totalPages correctos.");
		} else {
			console.error("❌ ERROR: Valores devueltos incorrectos en findAllByPage paginado.");
		}

		// Caso sin paginación (page < 1)
		const resultNoPage = await findAllByPage(TestCustomTable, {
			page: 0,
			rowsPerPage: 5
		});
		console.log("Resultado de findAllByPage mockeado (sin paginación):", resultNoPage);
		if (resultNoPage.currentPage === 1 && resultNoPage.totalPages === 1 && resultNoPage.rowsCount === 2) {
			console.log("✅ OK: findAllByPage sin paginación devuelve currentPage: 1 y totalPages: 1.");
		} else {
			console.error("❌ ERROR: Valores devueltos incorrectos en findAllByPage sin paginación.");
		}
	} finally {
		// Restauramos los métodos originales
		TestCustomTable.count = originalCount;
		TestCustomTable.findAll = originalFindAll;
	}

	console.log("=== FIN DE LAS PRUEBAS ===");
}

runTests().catch(console.error)
