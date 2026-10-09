import { PUtilsNumber, PUtilsString } from 'pols-utils'
import { FindOptions, FindOrBuildOptions, IncludeOptions, Model, Op, Sequelize, WhereOptions } from 'sequelize'
import { Cast, Col, Fn, Where } from 'sequelize/lib/utils'

export type POrder = ([...{ model?: any, as: string }[], string, 'asc' | 'desc'] | [string, 'asc' | 'desc'])[]

export type PFilter = {
	text: string
	fields: (string | Fn | Col | Cast)[]
}

export type PIncludeOptions = Omit<IncludeOptions, 'order'> & {
	filter?: PFilter | PFilter[]
	order?: POrder
}

export type PFindOptions = Omit<FindOptions, 'order' | 'include'> & {
	filter?: PFilter | PFilter[]
	order?: POrder
	include?: PIncludeOptions | PIncludeOptions[]
	page?: number
	rowsPerPage?: number
}

export type PFindOrBuildOptions = Omit<FindOrBuildOptions, 'order' | 'include'> & {
	filter?: PFilter | PFilter[]
	order?: POrder
	include?: PIncludeOptions | PIncludeOptions[]
	page?: number
	rowsPerPage?: number
}

export type PFindAllConfig = {
	includeRequiredDefault?: boolean
	secureSeparate?: boolean
}

export type PFindAllByPageConfig = {
	includeRequiredDefault?: boolean
}

const cloneOrder = (order?: POrder): POrder | undefined => {
	if (!order) return undefined
	return order.map(element => {
		if (Array.isArray(element)) {
			return element.map(part => {
				if (part && typeof part === 'object' && 'as' in part) {
					return { ...part }
				}
				return part
			}) as any
		}
		return element
	})
}

const isPlainObject = (value: any): boolean => {
	if (value == null || typeof value !== 'object') {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === null || proto === Object.prototype
}

const cloneInclude = (include: any): any => {
	if (include == null) return include
	if (typeof include === 'string' || typeof include === 'function') {
		return include
	}
	if (typeof include === 'object') {
		const copy = { ...include }
		if (copy.where && isPlainObject(copy.where)) {
			copy.where = { ...copy.where }
			if (copy.where[Op.and] && Array.isArray(copy.where[Op.and])) {
				copy.where[Op.and] = [...(copy.where[Op.and] as any)]
			}
		}
		if (copy.include) {
			if (Array.isArray(copy.include)) {
				copy.include = copy.include.map(inc => cloneInclude(inc))
			} else {
				copy.include = cloneInclude(copy.include)
			}
		}
		if (copy.order) {
			copy.order = cloneOrder(copy.order)
		}
		return copy
	}
	return include
}

const cloneFindOptions = <T extends PFindOptions | PFindOrBuildOptions>(options?: T): T => {
	if (!options) return {} as T
	const copy = { ...options } as any
	if (copy.where && isPlainObject(copy.where)) {
		copy.where = { ...copy.where }
		if (copy.where[Op.and] && Array.isArray(copy.where[Op.and])) {
			copy.where[Op.and] = [...(copy.where[Op.and] as any)]
		}
	}
	if (copy.include) {
		if (Array.isArray(copy.include)) {
			copy.include = copy.include.map(inc => cloneInclude(inc))
		} else {
			copy.include = cloneInclude(copy.include as any)
		}
	}
	if (copy.order) {
		copy.order = cloneOrder(copy.order)
	}
	return copy as T
}

export const makeFilterCondition = (model: typeof Model, params: PFilter): WhereOptions => {
	const opOr: WhereOptions[] = []
	const filter_text = PUtilsString.withoutAccentMark(params.text.trim())
	const tokens = filter_text.split(' ')
	const sequelize = model.sequelize
	const dialect = sequelize.getDialect()
	for (const field of params.fields) {
		const opAnd: WhereOptions[] = []
		for (const token of tokens) {
			let likeValue = `%${token.toLowerCase()}%`
			if (token.match(/(?<!\*)\*(?!\*)/)) {
				likeValue = token.replace(/(?<!\*)\*(?!\*)/g, '%').toLowerCase()
			}
			let col: Fn
			if (typeof field == 'string') {
				col = sequelize.fn('lower', sequelize.col(`${model.name}.${field}`))
			} else {
				col = sequelize.fn('lower', field)
			}
			switch (dialect) {
				case 'mssql': {
					opAnd.push(sequelize.where(
						sequelize.fn('replace',
							sequelize.fn('replace',
								sequelize.fn('replace',
									sequelize.fn('replace',
										sequelize.fn('replace',
											sequelize.fn('replace',
												sequelize.fn('replace',
													col,
													'ñ', 'n'),
												'ü', 'u'),
											'ú', 'u'),
										'ó', 'o'),
									'í', 'i'),
								'é', 'e'),
							'á', 'a'),
						{ [Op.like]: likeValue }
					))
					break
				}
				case 'postgres':
					opAnd.push(sequelize.where(sequelize.fn('translate', col, 'áéíóúüñ', 'aeiouun'),
						{ [Op.like]: likeValue }
					))
					break
				default:
					opAnd.push(sequelize.where(col, { [Op.like]: likeValue }))
					break
			}
		}
		opOr.push({ [Op.and]: opAnd })
	}
	return { [Op.or]: opOr }
}

const completeFilter = (model: typeof Model, options?: PFindOptions) => {
	if (!options?.filter) return

	const filters: PFilter[] = []

	if (options?.filter instanceof Array) {
		filters.push(...options?.filter.filter(f => f.fields?.length && f.text))
	} else {
		if (options?.filter?.fields.length && options?.filter?.text) filters.push(options?.filter)
	}

	if (!filters.length) return
	if (!options?.where) options.where = {}
	let opAnd = options.where[Op.and]
	if (opAnd == null) {
		opAnd = []
	} else if (!Array.isArray(opAnd)) {
		opAnd = [opAnd]
	} else {
		opAnd = [...opAnd]
	}

	for (const filter of filters) {
		opAnd.push(makeFilterCondition(model, filter))
	}

	options.where[Op.and] = opAnd
}

const completeInclude = (model: typeof Model, include: PIncludeOptions, secureSeparate = true, includeRequiredDefault = false) => {
	if (include == null || typeof include != 'object') return
	if (include.model) return
	const association = model.associations[include.as]
	if (association == null) throw new Error(`No se encontró relación con nombre '${include.as}'`)
	include.model = association.target
	if (include.required == null) include.required = includeRequiredDefault
	if (include.include) completeAnyInclude(include.model as any, include.include as any, secureSeparate)
	if (include.order) completeOrder(include.model as any, include.order as any)
	if (include.separate == null && secureSeparate && ['HasMany', 'BelongsToMany'].includes(association.associationType) && include.required == false) {
		include.separate = true
	}
	completeFilter(include.model as any, include as any)
}

const completeAnyInclude = (model: typeof Model, include: PIncludeOptions | PIncludeOptions[], secureSeparate = true, includeRequiredDefault = false) => {
	if (include instanceof Array) {
		for (const i of include) {
			completeInclude(model, i, secureSeparate, includeRequiredDefault)
		}
	} else {
		completeInclude(model, include, secureSeparate, includeRequiredDefault)
	}
}

const completeOrder = (model: typeof Model, order: POrder) => {
	if (!(order instanceof Array)) return
	for (const elementOrder of order) {
		if (!(elementOrder instanceof Array) || elementOrder.length < 3) continue

		/* Variable que mantiene al modelo del cuál se buscarán sus asociaciones */
		let targetModel = model
		for (let j = 0; j <= elementOrder.length - 3; j++) {
			const partOrder = elementOrder[j]
			if (typeof partOrder == 'string' || !('as' in partOrder)) continue
			const association = targetModel.associations[partOrder.as]
			if (association == null) throw new Error(`No se encontró relación con nombre '${partOrder.as}'`)
			partOrder.model = association.target
			targetModel = association.target
		}
	}
}

const includeIsOneToOne = (model: any, include: PIncludeOptions) => {
	const association = model.associations[include.as]
	if (association == null) throw new Error(`No se encontró relación con nombre '${include.as}'`)
	return ['BelongsTo', 'HasOne'].includes(association.associationType)
}

export const findAll: {
	<T = never, P extends new () => any = new () => any>(model: P, options?: PFindOptions, config?: PFindAllConfig): Promise<[T] extends [never] ? InstanceType<P>[] : T[]>
} & PFindAllConfig = async <T = never, P extends new () => any = new () => any>(model: P, options?: PFindOptions, config?: PFindAllConfig): Promise<[T] extends [never] ? InstanceType<P>[] : T[]> => {
	const m = model as unknown as typeof Model
	const clonedOptions = cloneFindOptions(options)
	if (clonedOptions.include) completeAnyInclude(m, clonedOptions.include, config?.secureSeparate ?? findAll.secureSeparate, config?.includeRequiredDefault ?? findAll.includeRequiredDefault)
	if (clonedOptions.order) completeOrder(m, clonedOptions.order)
	completeFilter(m, clonedOptions)

	return await (m as any).findAll(clonedOptions)
}
findAll.includeRequiredDefault = false
findAll.secureSeparate = true

export const findOne = async <T = never, P extends new () => any = new () => any>(model: P, options?: PFindOptions): Promise<[T] extends [never] ? InstanceType<P> : T> => {
	const m = model as any
	const clonedOptions = cloneFindOptions(options)
	if (clonedOptions.include) completeAnyInclude(m, clonedOptions.include, false)
	if (clonedOptions.order) completeOrder(m, clonedOptions.order)
	completeFilter(m, clonedOptions)

	return await m.findOne(clonedOptions)
}

export const findOrBuild = async <T = never, P extends new () => any = new () => any>(model: P, options?: PFindOrBuildOptions): Promise<[T] extends [never] ? InstanceType<P> : T> => {
	const m = model as any
	const clonedOptions = cloneFindOptions(options)
	if (clonedOptions.include) completeAnyInclude(m, clonedOptions.include, false)
	if (clonedOptions.order) completeOrder(m, clonedOptions.order)
	completeFilter(m, clonedOptions)

	return await m.findOrBuild(clonedOptions)
}

const shouldKeepInclude = (currentModel: any, includeOpt: any): boolean => {
	if (typeof includeOpt === 'string' || typeof includeOpt === 'function') return true
	if (includeIsOneToOne(currentModel, includeOpt)) return true
	if (includeOpt.required === true) return true
	if (includeOpt.where || includeOpt.filter) return true
	if (includeOpt.include) {
		const targetModel = currentModel.associations[includeOpt.as]?.target
		if (!targetModel) return true
		if (Array.isArray(includeOpt.include)) {
			return includeOpt.include.some(i => shouldKeepInclude(targetModel, i))
		} else {
			return shouldKeepInclude(targetModel, includeOpt.include)
		}
	}
	return false
}

export const count = async (model: any, options?: PFindOptions): Promise<number> => {
	const clonedOptions = cloneFindOptions(options)
	completeFilter(model, clonedOptions)

	if (clonedOptions.include) {
		if (clonedOptions.include instanceof Array) {
			clonedOptions.include = clonedOptions.include.filter(i => shouldKeepInclude(model, i))
		} else {
			if (!shouldKeepInclude(model, clonedOptions.include)) {
				delete clonedOptions.include
			}
		}
	}

	if (clonedOptions.include) completeAnyInclude(model, clonedOptions.include)

	return await model.count(clonedOptions)
}

export const findAllByPage: {
	<T = never, P extends new () => any = new () => any>(model: P, options?: PFindOptions, config?: PFindAllByPageConfig): Promise<{
		rows: [T] extends [never] ? InstanceType<P>[] : T[]
		rowsCount: number
		totalPages: number
		currentPage: number
	}>
	rowsPerPage?: number
} & PFindAllByPageConfig = async <T = never, P extends new () => any = new () => any>(model: P, options?: PFindOptions, config?: PFindAllByPageConfig): Promise<{
	rows: [T] extends [never] ? InstanceType<P>[] : T[]
	rowsCount: number
	totalPages: number
	currentPage: number
}> => {
		const clonedOptions = cloneFindOptions(options)
		let page = clonedOptions?.page != null ? Math.floor(PUtilsNumber.parse(clonedOptions.page)) : -1
		let rowsPerPage = Math.floor(PUtilsNumber.parse(clonedOptions?.rowsPerPage ?? findAllByPage.rowsPerPage))

		if (page < 1 || rowsPerPage <= 0) {
			const records = await findAll<T, P>(model, clonedOptions, {
				includeRequiredDefault: config?.includeRequiredDefault ?? findAllByPage.includeRequiredDefault
			})
			return {
				rows: records,
				rowsCount: records.length,
				totalPages: records.length > 0 ? 1 : 0,
				currentPage: 1
			}
		} else {
			const rowsCount = await count(model, {
				...clonedOptions,
				attributes: undefined
			})
			const totalPages = Math.ceil(rowsCount / rowsPerPage)
			if (!rowsCount) {
				return {
					rows: [],
					rowsCount,
					totalPages: 0,
					currentPage: page
				}
			}
			if (page > totalPages) {
				return {
					rows: [],
					rowsCount,
					totalPages,
					currentPage: page
				}
			}

			const rows = await findAll(model, {
				...clonedOptions,
				limit: rowsPerPage,
				offset: (page - 1) * rowsPerPage
			}, {
				secureSeparate: true,
				includeRequiredDefault: config?.includeRequiredDefault ?? findAllByPage.includeRequiredDefault
			})

			return {
				rows,
				rowsCount,
				totalPages,
				currentPage: page
			}
		}
	}
findAllByPage.includeRequiredDefault = false
findAllByPage.rowsPerPage = 50

export const selectQuery = (model: new () => any, options?: PFindOptions): string => {
	const m = model as any
	const clonedOptions = cloneFindOptions(options)
	if (clonedOptions.include) completeAnyInclude(m, clonedOptions.include)
	if (clonedOptions.order) completeOrder(m, clonedOptions.order)
	completeFilter(m, clonedOptions)

	if (clonedOptions.include && typeof m._validateIncludedElements === 'function') {
		m._validateIncludedElements(clonedOptions)
	}

	const sequelizeInstance = m.sequelize as Sequelize
	if (!sequelizeInstance) throw new Error(`No se ha inicializado la instancia`)
	const queryGenerator = sequelizeInstance.getQueryInterface().queryGenerator as any
	const tableName = queryGenerator.quoteTable({ schema: m._schema, tableName: m.tableName })
	const quotedModel = queryGenerator.quoteIdentifier(model.name)
	const tableReplacement = m.tableName !== model.name ? `${tableName} AS ${quotedModel}` : tableName
	const tableNameToReplace = queryGenerator.quoteTable({ tableName: '@@toreplace@@' }).replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\./g, '\\.')

	return queryGenerator.selectQuery('@@toreplace@@', clonedOptions).replace(/;$/, '').replace(new RegExp(tableNameToReplace, 'g'), tableReplacement)
}

export const countQuery = (model: new () => any, options?: PFindOptions): string => {
	const m = model as any
	const clonedOptions = cloneFindOptions(options)

	if (clonedOptions.include) completeAnyInclude(m, clonedOptions.include)
	if (clonedOptions.order) completeOrder(m, clonedOptions.order)
	completeFilter(m, clonedOptions)

	if (clonedOptions.include && typeof m._validateIncludedElements === 'function') {
		m._validateIncludedElements(clonedOptions)
	}

	const sequelizeInstance = m.sequelize as Sequelize
	if (!sequelizeInstance) throw new Error(`No se ha inicializado la instancia`)
	const queryGenerator = sequelizeInstance.getQueryInterface().queryGenerator as any
	const tableName = queryGenerator.quoteTable({ schema: m._schema, tableName: m.tableName })
	const quotedModel = queryGenerator.quoteIdentifier(model.name)
	const tableReplacement = m.tableName !== model.name ? `${tableName} AS ${quotedModel}` : tableName
	const tableNameToReplace = queryGenerator.quoteTable({ tableName: '@@toreplace@@' }).replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\./g, '\\.')

	return queryGenerator.selectQuery('@@toreplace@@', {
		...clonedOptions,
		attributes: [[sequelizeInstance.fn('count', sequelizeInstance.col('*')), 'count']]
	}).replace(/;$/, '').replace(new RegExp(tableNameToReplace, 'g'), tableReplacement)
}