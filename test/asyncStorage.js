(function(){
	if(typeof(window)==="undefined") {
		localStorage = require("node-localstorage").LocalStorage("./localStorage");
	}
	
	const asyncStorage = {
		async delete(key) {
			return localStorage.removeItem(key);
		},
		async get(key) {
			const value = localStorage.getItem(key);
			if(value!==undefined) {
				return JSON.parse(value);
			}
		},
		async put(object,{dereference}={}) {
			object["#"] || (object["#"] = `/${object.constructor.name}/#${(Math.random()+"").substring(2)}`);
			for(const key in object) {
				const value = object[key];
				if(value && typeof(value)==="object") {
					if(Array.isArray(value)) {
						for(let i=0;i<value.length;i++) {
							const item = value[i];
							if(item && typeof(item)==="object") {
								await this.put(item,{dereference});
								if(dereference) {
									value[i] = item["#"];
								}
							}
						}
					} else {
						await this.put(value,{dereference});
						if(dereference) {
							object[key] = value["#"];
						}
					}
				}
			}
			return this.set(object["#"],object);
		},
		async set(key,value) {
			return localStorage.setItem(key,JSON.stringify(value));
		}
	}
	
	if(typeof(module)!=="undefined") {
		module.exports = asyncStorage;
		asyncStorage.asyncStorage = asyncStorage;
	}
	if(typeof(window)!=="undefined") {
		window.asyncStorage = asyncStorage;
	}
})();

