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
	function dotAsyncData(value,options,path=[]) {
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
					if(initialvalue==null && options.db && length===0) {
						value = {[property]:options.db.get(property)};
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
	
	const $match = (value,pattern) => {
		const vtype = typeof(value),
			ptype = typeof(pattern);
		if(vtype!==ptype) return false;
		if(value===pattern) return true;
		if(value && pattern) {
			if(pattern.length!==undefined && value.length!==pattern.length) return false;
			if(pattern.size!==undefined && value.size!==pattern.size) return false;
			if(vtype==="object" && ptype==="object") {
				for(const key in pattern) {
					if(!$match(value[key],pattern[key])) return false;
				}
			}
		}
		return true;
	}
	
	const objectAccessors = {
		$count: (values) => values.length,
		$type: (type) => `(value) => typeof(value)==="${type}" ? value : undefined`,
		$lt: (value) => `<${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$lte: (value) => `<=${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$gte: (value) => `>=${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$gt: (value) => `>${typeof(value)==="string" ? "'" + value + "'" : value}`,
		$avg:  (values) => { let i=0; return values.reduce((accum,value) => typeof(value)==="number" ? (i++,accum+=value) : accum,0)/i; },
		$min:  (values) => values.reduce((accum,value) => typeof(value)==="number" && value < accum ? value : accum,Infinity),
		$max:  (values) => values.reduce((accum,value) => typeof(value)==="number" && value > accum ? value : accum,-Infinity),
		$sum:  (values) => values.reduce((accum,value) => typeof(value)==="number" ? value += accum : accum,0),
		$product:  (values) => values.reduce((accum,value) => typeof(value)==="number" ? value *= accum : accum,1),
		$values: (values) => values,
		$map: (f) => `(value) => value.map(${f+""})`,
		$reduce: (f,accum) => accum!==undefined ? `(value) => value.reduce(${f},${JSON.stringify(accum)})` :  `(value) => value.reduce(${f})`,
		$match: (pattern) => `(values) => {
			if(Array.isArray(values)) {
				return values.filter((value) => $match(value,${JSON.stringify(pattern)}))
			}
			return $match(values,${JSON.stringify(pattern)})
		}`
	}
	
	const inlineScope = {
		$match
	};
	
	async function exec(target,path,argCount,arg,{isDataKey,idKey,db,autoSave,inline,cache}={},previous,listeners,recursing) {
		const cacheGet =  async (key) => cache ? cache[key]||(cache[key] =  await db.get(key)) : await db.get(key);
		path = Array.isArray(path) ? path : path.split(".");
		if(recursing===undefined) {
			path = path.map((item) => {
				if(typeof(item)==="function") {
					return item;
				}
				if(objectAccessors[item]) {
					return objectAccessors[item];
				}
				if(item.startsWith("<")) {
					return Function(`return (values) => Array.isArray(values) ? values.filter((value) => value ${item}) : values ${item}`)();
				}
				if(item.startsWith(">")) {
					return Function(`return (values) => Array.isArray(values) ? values.filter((value) => value ${item}) : values ${item}`)();
				}
				if(inline) {
					try {
						var test = Function("inlineScope","with(inlineScope) { return " + item + "}")(inlineScope);
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
			if(i<path.length-1 && !fkey && (value==null || typeof(value)!=="object")) {
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
			
			if(cache[key]) {
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
							let result = await exec(item,path,0,undefined,{isDataKey,idKey,db,autoSave,inline,cache},value,listeners,true);
							if(result!=undefined) {
								values.push(result); //fkey ? await fkey(result) : result
							}
						}
						value = fkey ? await fkey.call(value,values) : values;
					} else { 
						let tmp;
						try {
							tmp = await fkey(value);
							if(tmp!==undefined) {
								value = value; // just to be clear, if passing the value remains the same
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
								} else if(fkey && await fkey.call(previous,key)) {
									values = values.concat(previous[key])
								}
							}
							value = values;
						}
					}
				} else {
					value = await fkey(value);
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

