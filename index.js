(function() {
	function dotAsync(value,{isDataKey,idKey,db,autoSave,inline,cache}={}) {
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
					return () => !cache || (cache = {});
				}
				const proxy = _dotAsync(target,{isDataKey,idKey,db,autoSave,listeners,inline,cache,parentKey:property});
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
		$count:  (values) => values.length,
		$avg:  (values) => { values = values.filter(item => typeof(item)==="number"); return values.length>0 ? values.reduce((accum,value) => accum += value,0)/values.length : 0 },
		$min:  (values) => { values = values.filter(item => typeof(item)==="number"); return values.reduce((accum,value) => value < accum ? value : accum,Infinity) },
		$max:  (values) => { values = values.filter(item => typeof(item)==="number"); return values.reduce((accum,value) => value > accum ? value : accum,-Infinity) },
		$sum:  (values) => { values = values.filter(item => typeof(item)==="number"); return values.length>0 ? values.reduce((accum,value) => accum += value,0) : 0 },
		$product:  (values) => { values = values.filter(item => typeof(item)==="number"); return values.length>0 ? values.reduce((accum,value) => accum *= value,1) : 0 },
		"*": (values) => values,
		"!": (values) => values
	}
	
	async function exec(target,path,argCount,arg,{isDataKey,idKey,db,autoSave,listeners,inline,cache={},parentKey}={},previous) {
		path = Array.isArray(path) ? path : path.split(".");
		if(inline) {
			path = path.map((item) => {
				if(typeof(item)==="function") {
					return item;
				}
				try {
					var test = Function("return " + item)();
					if(typeof(test)==="function") {
						return test;
					}
					if(test instanceof RegExp) {
						return (value) => {
							return test.test(value+"") ? value : undefined;
						}
					}
				} catch(e) {
					
				}
				return item;
			})
		}
		if(typeof(target)==="string" && cache[target]!=undefined) {
			target = cache[target]
		}
		let value = parentKey!=="*" && isDataKey && isDataKey(target) ? (cache ? cache[target] || (cache[target] = await db.get(target)) : await db.get(target)) : target,
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
			if(isDataKey && isDataKey(value[idKey])) {
				dbkey = value[idKey];
				dbvalue = cache[dbkey] = value;
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
			if(cache[key]) {
				previous = value = cache[key];
				continue;
			}
			const accessor = objectAccessors[key];
			if((fkey || accessor) && typeof(previous)==="object") {
				let items = Array.isArray(previous) ? previous : Object.entries(previous), 
					values = [];
				if(!Array.isArray(previous)) { // handle objects used to store {idref1: value, idref2: value, ...}
					for(let j=0;j<items.length;j++) {
						const [key,value] = items[j],
							isdatakey = isDataKey && isDataKey(key);
						if(isdatakey && (!value || typeof(value)!=="object")) {
							items[j] = key;
						} else if(!isdatakey) {
							items[j] = undefined;
							if(fkey && await fkey.call(previous,key)) {
								const result = await exec(value,path.slice(i+1),0,undefined,{isDataKey:key==="*" ? undefined : isDataKey,idKey,db,autoSave,inline,cache,parentKey:key},previous[key]);
								if(result!=undefined) {
									values = values.concat(result);
								}
							}
						} else {
							items[j] = value;
						}
					}
					items = items.filter(item => item!==undefined);
				}
				if(items.length>0) {
					path = path.slice(i+1);
					for(let j=0;j<items.length;j++) {
						let result = await exec(items[j],path,0,undefined,{isDataKey:key==="*" ? undefined : isDataKey,idKey,db,autoSave,inline,cache,parentKey:key},value);
						result = fkey ? await fkey.call(previous,result) : result;
						if(result!=undefined) {
							values.push(fkey ? await fkey(result) : result);
						}
					}
					value = accessor ? accessor(values) : values;
				} else {
					value = accessor ? accessor(values) : values;
					break;
				}
			} else if(isDataKey && db & isDataKey(key)) {
				dbkey = key;
				dbvalue = value = parentKey!=="*" && cache ? cache[key] = await db.get(value) : await db.get(value);
			} else if(key==="$delete") {
				if(isDataKey && isDataKey(dbkey) && db) {
					await db.delete(dbkey);
					delete cache[dbkey]
				}
			} else {
				value = fkey ?  await fkey.call(dbvalue||target,value) : value[key];
				if(value===undefined) {
					return;
				}
				if(isDataKey && db && isDataKey(value)) {
					dbkey = value;
					dbvalue = value = parentKey!=="*" && cache ? cache[value] = await db.get(value) : await db.get(value);
				}
			}
			previous = await value;
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
		module.exports = dotAsync;
		dotAsync.dotAsync = dotAsync;
	}
	if(typeof(window)!=="undefined") {
		window.dotAsync = dotAsync;
	}
})();

