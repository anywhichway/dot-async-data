(function() {
	function dotAsyncData(value,{isDataKey,idKey,db,autoSave,inline,cache}={}) {
		const listeners = {
				on: {
					change: [],
					delete: [],
					save: []
				}
			};
		return new Proxy(value,{
			get(target,property) {
				if(property==="$flush") {
					return () => cache ? Object.keys(cache).reduce((accum,key) => { delete accum[key]; return accum; },cache) : undefined;
				}
				const proxy = _dotAsync(target,{isDataKey,idKey,db,autoSave,listeners,inline,cache});
				return proxy[property];
			}
		})
	}
	
	const handlers = {
		$onchange({listeners},path,cb) {
			listeners.on.change.push([path,cb]);
		},
		$ondelete({listeners},path,cb) {
			listeners.on.delete.push([path,cb]);
		},
		$onsave({listeners},path,cb) {
			listeners.on.save.push([path,cb]);
		}
	}
	
	function _dotAsync(value,options,path=[]) {
		const length = path.length,
			f = () => {};
		const proxy = new Proxy(f,{
				get(target,property) {
					if(property==="then") {
						return target[value];
					}
					const handler = handlers[property];
					if(handler) {
						return (cb) => handler(options,path.slice(),cb);
					}
					path[length] = property;
					return _dotAsync(value,options,path);
				},
				async apply(_,thisArg,argumentsList) {
					const ctx = typeof(thisArg)==="function" ? value : thisArg;
					path = path.slice(0,length);
					if(length===1) {
						return value[path[0]];
					}
					return exec(ctx,path,argumentsList.length,argumentsList[0],options,ctx);
				}
			});
		return proxy;
	}
	
	const objectAccessors = {
		$count:  (accum,value,i,values) => values.length,
		$avg:  (accum,value,i,values) => {
			accum || (accum = {value:0,count:0}); 
			if(typeof(value)==="number") { accum.count++; accum.value+=value; }
			if(i===values.length-1) { return accum.count===0 ? 0 : accum.value/accum.count };
			return accum;
		},
		$min:   (accum,value) => typeof(value)==="number" && value < (typeof(accum)==="number" ? accum : Infinity) ? value :  accum,
		$max:  (accum,value) => typeof(value)==="number" && value > (typeof(accum)==="number" ? accum : -Infinity) ? value :  accum,
		$sum:  (accum,value) => typeof(value)==="number" ?  value += (typeof(accum)==="number" ? accum : 0) : accum,
		$product:  (accum,value) => typeof(value)==="number" ? value *= (typeof(accum)==="number" ? accum : 1) : accum,
		$values: (accum,value,i,values) => values
	}
	
	async function exec(target,path,argCount,arg,{isDataKey,idKey,db,autoSave,listeners,inline,cache}={},previous,recursing) {
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
				if(inline) {
					try {
						var test = Function("return " + item)();
						if(typeof(test)==="function") {
							return test;
						}
						if(test instanceof RegExp) {
							return (accum,item,i,array) => {
								if(Array.isArray(array)) {
									accum || (accum = []);
									if(test.test(item+"")) {
										accum.push(item);
									}
									return accum;
								}
								return test.test(accum+"") ? accum : undefined;
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
			dbvalue,
			saved;
		if(path.length>0 && (!value || typeof(value)!=="object")) {
			return;
		}
		
		
		for(let i=0;i<path.length;i++) {
			const key = path[i],
				fkey = typeof(key)==="function" ? key : undefined;
			if(i<path.length-1 && !fkey && (!value || typeof(value)!=="object")) {
				return;
			}

			if(Array.isArray(previous) && !previous.resolved) {
				const values = [];
				for(let i=0;i<previous.length;i++) {
					let item = previous[i];
					if(isDataKey && isDataKey(item)) {
						item =  await cacheGet(item);
					}
					if(item!==undefined) {
						values.push(item);
					}
				}
				if(previous===value) {
					value = values;
				}
				previous = values;
				previous.resolved = true;
			}
			
			if(value!==previous && Array.isArray(value)  && !value.resolved) {
				const values = [];
				for(let i=0;i<value.length;i++) {
					let item = value[i];
					if(isDataKey && isDataKey(item)) {
						item =  await cacheGet(item);
					}
					if(item!==undefined) {
						values.push(item);
					}
				}
				value = values;
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
				oldvalue = value[key];
				if(arg===undefined) {
					delete value[key];
				} else {
					value[key] = arg;
				}
				if(dbvalue && autoSave) {
					await db.set(dbkey,dbvalue);
					saved = true;
				}
				value = arg;
				break;
			}
			
			if(typeof(value)==="function") {
				value = value.call(value.ctx,key);
			} else if(fkey && typeof(value)==="object") {
				if(Array.isArray(value)) {
					const values = [];
					path = path.slice(i+1);
					for(const item of value) {
						let result = await exec(item,path,0,undefined,{isDataKey,idKey,db,autoSave,inline,cache},value,true);
						if(result!=undefined) {
							values.push(result); //fkey ? await fkey(result) : result
						}
					}
					value = fkey ? values.reduce(fkey,undefined) : values;
				} else { // handle objects used to store references {idref1: value, idref2: value, ...}
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
					delete cache[dbkey]
				}
			} else {
				value = value[key]; //fkey ?  await fkey.call(dbvalue||target,value) : value[key];
				if(value===undefined) {
					return;
				}
				if(typeof(value)==="function") {
					value.ctx = previous;
				}
			}
			previous = value;
		}
		setTimeout(() => {
			if(argCount>0) {
				if(arg===undefined) {
					listeners.on.delete.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item = path[i])  && cb({type:"delete",oldvalue,path:match}))
				} else {
					listeners.on.change.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item = path[i]) && cb({type:"change",value,oldvalue,path:match}))
					if(saved) {
						listeners.on.save.forEach(([match,cb]) => path.length==match.length && match.every((item,i) => item = path[i]) && cb({type:"save",key:dbkey,value:dbvalue,path:match}))
					}
				}
			}
		});
		return value;
	}
	
	if(typeof(module)!=="undefined") {
		module.exports = dotAsyncData;
		dotAsyncData.dotAsyncData = dotAsyncData;
	}
	if(typeof(window)!=="undefined") {
		window.dotAsyncData = dotAsyncData;
		Object.assign(dotAsyncData,objectAccessors);
	}
})();

