(function() {
	const handlers = {
		$onchange(listeners,path,cb) {
			listeners.on.change.push([path,cb]);
		},
		$ondelete(listeners,path,cb) {
			listeners.on.delete.push([path,cb]);
		},
		$onsave(listeners,path,cb) {
			listeners.on.save.push([path,cb]);
		}
	}
	
	const listeners = {on:{change:[],delete:[],save:[]}};
	function dotAsyncData(value,options={},path=[]) {
		path = path.slice();
		const length = path.length, // fix length to this level of the proxy
			f = () => {},
			initialvalue = value;
			proxy = new Proxy(f,{
				get(target,property) {
					if(property==="then") {
						return target[property]
					}
					if(property==="$flush") {
						return () => {
							if(options.cache) {
								Object.keys(options.cache).reduce((accum,key) => { delete accum[key]; return accum; },options.cache)
							}
							return proxy;
						}
					}
					const handler = handlers[property];
					if(handler) {
						return (cb) => { handler(listeners,path.slice(),cb); return proxy; }
					}
					path[length] = property;
					const {idKey,db,cache={}} = options;
					if(initialvalue==null && db && length===0) {
						value = {[property]:db.get(property)};
					}
					if(cache[value[idKey]]) { // mat have been updated by a different Proxy
						value = cache[value[idKey]];
					}
					return dotAsyncData(value,options,path,listeners);
				},
				async apply(_,thisArg,argumentsList) {
					const ctx = typeof(thisArg)==="function" ? await value : thisArg|| await value;
					path = path.slice(0,length);
					return exec(ctx,path,argumentsList.length,argumentsList[0],options,ctx,listeners);
				}
			});
		return proxy;
	}
	
	const joqular = {
		$lt: (value,test) => value < test,
		$lte: (value,test) => value <= test,
		$eq: (value,test) => value == test,
		$eeq: (value,test) => value === test,
		$neq: (value,test) => value != test,
		$gte: (value,test) => value >= test,
		$gt: (value,test) => value > test,
		$type: (value,type) => typeof(value)===type,
		$match: (value,pattern) => {
			const vtype = typeof(value);
			let	ptype = typeof(pattern);
			if(ptype==="function") {
				pattern = pattern(value);
				ptype = typeof(pattern);
			}
			if(value===pattern) return true;
			if(ptype==="object") {
				for(const key in pattern) {
					if(joqular[key]) {
						if(!joqular[key](value,pattern[key])) return undefined;
					}
				}
				if(value!=null) {
					if(pattern.length!==undefined && value.length!==pattern.length) return undefined;
					if(pattern.size!==undefined && value.size!==pattern.size) return undefined;
				}
				for(const key in pattern) {
					if(!joqular[key] && !joqular.$match(value[key],pattern[key])) return undefined;
				}
				return value;
			}
			return undefined;
		}
	}
	
	const objectAccessors = {
		$count: function $count(values) { return Array.isArray(values) ? values.filter(item => item!=undefined).length : values==undefined ? 0 : 1 },
		$type: (type) => `typeof(values)==="${type}"`,
		$lt: (value) => `<${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$lte: (value) => `<=${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$gte: (value) => `>=${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$gt: (value) => `>${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$avg:  function $avg(values) { let i=0; return values.reduce((accum,value) => typeof(value)==="number" ? (i++,accum+=value) : accum,0)/i; },
		$avgAll: function $avgAll(values) { let i=0; return values.reduce((accum,value) => typeof(value)==="number" ? (i++,accum+=value) : (i++,accum),0)/i; },
		$avgIf: (test,dflt=0) => `(values) => {let i=0; return values.reduce((accum,value) => (${test})(value) ? (i++,accum+=(typeof(value)==="number" ? value : ${dflt})) : accum,0)/i; }`,
		$min:  function $min(values) { return values.reduce((accum,value) => typeof(value)==="number" && value < accum ? value : accum,Infinity) },
		$max:  function $max(values) { return values.reduce((accum,value) => typeof(value)==="number" && value > accum ? value : accum,-Infinity) },
		$sum:  function $sum(values) { return values.reduce((accum,value) => typeof(value)==="number" ? value += accum : accum,0) },
		$product: function $product(values) { return values.reduce((accum,value) => typeof(value)==="number" ? value *= accum : accum,1) },
		$values: function $values(values) { return values },
		$map: (f) => `(value) => value.map(${f+""})`,
		$reduce: (f,accum) => accum!==undefined ? `(value) => value.reduce(${f},${JSON.stringify(accum)})` :  `(value) => value.reduce(${f})`,
		$match: (pattern) => `(values) => {
			if(Array.isArray(values)) {
				return values.filter((value) => $match(value,${JSON.stringify(pattern)}))
			}
			return $match(values,${JSON.stringify(pattern)})
		}`,
		$get: async function $get(values,{$db}) {
			if(Array.isArray(values)) {
				const results = [];
				for(const key of values) {
					const result = await $db.get(key);
					if(result!=null) {
						results.push(result);
					}
				}
				return results;
			} else {
				return $db.get(values);
			}
		},
		$set: (value) => `async (values,{$db}) => {
			const value = ${typeof(value)==="string" || typeof(value)==="object" ? JSON.stringify(value) : value};
			if(Array.isArray(values)) {
				const results = [];
				for(const key of values) {
					await $db.set(key,value);
					if(result!=null) {
						results.push(value);
					}
				}
				return results;
			} else {
				await $db.set(values,value);
				return value;
			}
		}`,
		$query: (value) => typeof(value)==="string" ? `async ($value,{$db}) => { return $db.query(\`${value}\`) }` :  `async (value,{$db}) => { return $db.query((${value})(value)) }`
	}
	
	
	async function exec(target,path,argCount,arg,{isDataKey,idKey,db,autoSave,inline,cache}={},previous,listeners,recursing) {
		const cacheGet =  async (key) => cache ? cache[key]||(cache[key] =  await db.get(key)) : await db.get(key),
			inlineScope = {
				$match:joqular.$match,
				$db:db
			};
	
		path = Array.isArray(path) ? path : path.split(".");
		if(recursing===undefined) {
			path = path.map((item) => {
				if(typeof(item)==="function") {
					return item;
				}
				for(const [key,value] of Object.entries(objectAccessors)) {
					if(key===item || item.startsWith(`function ${key}(`) || item.startsWith(`async function ${key}(`)) {
						return value;
					}
				}
				if(objectAccessors[item]) {
					return objectAccessors[item];
				}
				if(item.startsWith("<") || item.startsWith(">")) {
					return Function(`return (values) => Array.isArray(values) ? values.filter((value) => value ${item}) : values ${item}`)();
				}
				if(item.startsWith("typeof(values)===")) {
					return Function(`return (values) => Array.isArray(values) ? values.filter((value) => ${item}) : ${item} ? values : undefined`)();
				}
				if(inline) {
					try {
						var test = Function("$inlineScope","with($inlineScope) { return " + item + "}")(inlineScope);
						if(typeof(test)==="function") {
							return test;
						}
						if(test instanceof RegExp) {
							return (value) => {
								if(Array.isArray(value)) {
									return value.reduce((accum,item) => {
										if(test.test(item+"")) {
											accum.push(item);
										}
										return accum;
									},[])
								}
								return test.test(value+"") ? value : undefined;
							}
						}
					} catch(e) {
						
					}
				}
				try {
					return JSON.parse(item);
				} catch(e) {
					
				}
				return item;
			})
		}
		let value = isDataKey && db && isDataKey(target) ? cacheGet(target) : target,
			oldvalue,
			dbkey,
			dbvalue;
		if(path.length>0 && (!value || typeof(value)!=="object")) {
			return;
		}
		
		
		for(let i=0;i<path.length;i++) {
			const key = path[i],
				fkey = typeof(key)==="function" ? key : undefined;
			if(i<path.length-1 && !fkey && value==null) {
				return;
			}

			if(Array.isArray(previous) && !previous.resolved) {
				let filter;
				for(let i=0;i<previous.length;i++) {
					let item = previous[i];
					if(isDataKey && isDataKey(item)) {
						if(!(previous[i] =  await cacheGet(item)) && !filter) {
							filter = true;
						}
					}
				}
				previous = filter ? previous.filter(item => item!=null) : previous;
				previous.resolved = true;
			}
			
			if(value!==previous && Array.isArray(value)  && !value.resolved) {
				for(let i=0;i<value.length;i++) {
					let item = value[i];
					if(isDataKey && isDataKey(item)) {
						if(!(value[i] =  await cacheGet(item)) && !filter) {
							filter = true;
						}
					}
				}
				value = filter ? value.filter(item => item!=null) : value;
				value.resolved = true;
			}
			
			if(cache && cache[key]) {
				value = cache[key];
			}
			if(isDataKey && db) {
				if(isDataKey(value)) {
					dbkey = value;
					dbvalue = value = await cacheGet(value);
				} else if(isDataKey(value[idKey])) {
					dbkey = value[idKey];
					dbvalue = cache[dbkey] = value;
				}
			}
			
			if(i===path.length-1 && argCount>0) {
				if(typeof(value)==="object") {
					oldvalue = await value[key];
					if(arg===undefined) {
						delete value[key];
					} else {
						value[key] = arg;
					}
					let saved;
					if(dbvalue && autoSave) {
						await db.set(dbkey,dbvalue);
						saved = true;
					}
					const newvalue = arg,
					object = value;
					setTimeout(() => {
						listeners.on.change.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item === path[i]) && cb({type:"change",newvalue,oldvalue,key,object,path:match}))
						if(saved) {
							listeners.on.save.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item === path[i]) && cb({type:"save",key:dbkey,value:dbvalue,path:match}))
						}
					});
				}
				value = arg;
				break;
			}
			
			if(typeof(value)==="function") {
				value = await value.call(value.ctx,key);
			} else if(fkey) {
				if(value && typeof(value)==="object") {
					if(Array.isArray(value)) {
						const values = [];
						path = path.slice(i+1);
						for(const item of value) {
							values.push(await exec(item,path,0,undefined,{isDataKey,idKey,db,autoSave,inline,cache},value,listeners,true));
						}
						value = fkey ? await fkey.call(value,values,inlineScope) : values;
						if(Array.isArray(value)) {
							value = value.filter(item => item!=undefined)
						}
					} else { 
						let tmp;
						try {
							tmp = await fkey(value,inlineScope);
							if(tmp!==undefined) {
								if(fkey.name==="$get") {
									dbkey = value;
									dbvalue = tmp;
								}
								value = tmp;
							}
						} catch(e) {
							
						}
						if(tmp===undefined) { // handle objects used to store references {idref1: value, idref2: value, ...}
							const entries = Object.entries(value);
							let values = [];
							for(let [key,value] of entries) {
								if(isDataKey && isDataKey(key)) {
									if(!value || typeof(value)!=="object") {
										values.push(key)
									} else {
										values.push(value)
									}
								} else if(fkey && await fkey.call(previous,key,inlineScope)) {
									values = values.concat(previous[key])
								}
							}
							value = values;
						}
					}
				} else {
					value = await fkey(value,inlineScope);
				}
			} else if(Array.isArray(value)) {
				value = value.reduce((accum,item) => {
					if(item[key]!==undefined) {
						accum.push(item[key])
					}
					return accum;
				},[])
			} else if(isDataKey && db & isDataKey(key)) {
				dbkey = key;
				dbvalue = value = cache ? cache[key] = await db.get(value) : await db.get(value);
			} else if(key==="$delete") {
				if(isDataKey && isDataKey(dbkey) && db) {
					await db.delete(dbkey);
					delete cache[dbkey];
					setTimeout(() => {
						listeners.on.delete.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item === path[i])  && cb({type:"delete",key:dbkey,path:match}))
					})
				}
				value = undefined;
			} else {
				value = await value[key]; //fkey ?  await fkey.call(dbvalue||target,value) : value[key];
				if(value===undefined) {
					return;
				}
				if(typeof(value)==="function") {
					value.ctx = previous;
				}
			}
			previous = value = await value;
		}
		return value;
	}
	
	if(typeof(module)!=="undefined") {
		module.exports = dotAsyncData;
		dotAsyncData.dotAsyncData = dotAsyncData;
		Object.assign(dotAsyncData,objectAccessors);
	}
	if(typeof(window)!=="undefined") {
		window.dotAsyncData = dotAsyncData;
		Object.assign(dotAsyncData,objectAccessors);
	}
})();

