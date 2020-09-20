var chai,
	expect,
	dotAsyncData,
	asyncStorage;
if(typeof(window)==="undefined") {
	chai = require("chai");
	expect = chai.expect;
	dotAsyncData = require("../index.js");
	asyncStorage = require("./asyncStorage.js");
} else {
	chai = window.chai;
	expect = window.expect;
}

/*

$key[$]

*/

function isDataKey(key) {
	return typeof(key)==="string" && new RegExp("/.*/\#.*").test(key);
}
	
const { $max, $values, $map, $type, $reduce, $match, $lt, $lte, $gte, $gt, $get, $set, $query, $avgIf } = dotAsyncData;

describe("dotAsyncData",async function() {
	const cache = {},
		db = asyncStorage,
		joe = {name:"joe",children:[{name:"janet",age:5},{name:"jon",age:10},{name:"mary"}],f(value) { return value; }},
		jane = {name: "jane",secret:"asecret"};

	
	await db.set("keys",{
		private: "a private key",
		public: "a public key"
	});
	
	await db.set("parts",{
		private: "a private part",
		public: "a public part"
	})
	
	await db.set("asecret","the secret")

	await db.put(joe);
	jane.husband = joe;
	await db.put(jane);
	joe.wife = jane;
	jane.children = joe.children;
	await db.put(joe,{dereference:true});
	
	let object0, object1, object2;
	it("create",() => {
		object0 = dotAsyncData(null,{isDataKey,idKey:"#",db,autoSave:true,inline:true,cache})
		object1 = dotAsyncData(jane,{isDataKey,idKey:"#",db,autoSave:true,inline:true,cache});
		object2 = dotAsyncData(joe,{isDataKey,idKey:"#",db,autoSave:true,inline:true,cache});
		expect(object1).to.be.instanceof(Object);
		expect(object2).to.be.instanceof(Object)
	})
	it("key query",async () => {
		const value = await object0.keys();
		expect(value.private).to.equal("a private key");
		expect(value.public).to.equal("a public key")
	});
	it("key query extended",async () => {
		const value = await object0.keys.private();
		expect(value).to.equal("a private key");
	});
	it("re-use query",async () => {
		const value = await object0.parts();
		expect(value.private).to.equal("a private part");
		expect(value.public).to.equal("a public part");
	});
	it("get by key",async () => {
		const value = await object1.secret[$get]();
		expect(value).to.equal("the secret");
	});
	it("set by key",async () => {
		const value = await object1.secret[$set("new secrect")]();
		expect(value).to.equal("new secrect");
	});
	it("get by key - updated",async () => {
		const value = await object1.secret[$get]();
		expect(value).to.equal("new secrect");
	});
	it("inline query as string",async () => {
		const value = await object1.name[$query("SELECT ${$value} FROM Contacts OUTPUT JSON")]();
		expect(value).to.equal("SELECT jane FROM Contacts OUTPUT JSON");
	});
	it("inline query as function",async () => {
		const value = await object1.name[$query((value) => `SELECT ${value} FROM Contacts OUTPUT JSON`)]();
		expect(value).to.equal("SELECT jane FROM Contacts OUTPUT JSON");
	});
	it("get direct property value",async () => {
		const value = await object1.name();
		expect(value).to.equal("jane")
	});
	it("get property value with type",async () => {
		const value = await object1.name[$type("string")]();
		expect(value).to.equal("jane")
	});
	it("get property value with type - fail",async () => {
		const value = await object1.name[$type("number")]();
		expect(value).to.equal(undefined)
	});
	it("set property value",async () => {
		const value = await object1.name("janet");
		expect(value).to.equal("janet")
	});
	it("get direct property value after change",async () => {
		const value = await object1.name();
		expect(value).to.equal("janet");
	});
	it("get indirect property value",async () => {
		const value = await object1.husband.name();
		expect(value).to.equal("joe");
	});
	it("set indirect property value",async () => {
		const value = await object1.husband.name("jake");
		expect(value).to.equal("jake")
	});
	it("get indirect property value after change",async () => {
		const value = await object1.husband.name();
		expect(value).to.equal("jake")
	});
	it("set property value with on change",(done) => {
		let event;
		object1.name.$onchange(ev => event = ev)("joan").then(() => {
			setTimeout(() => {
				expect(typeof(event)).to.equal("object");
				expect(event.oldvalue).to.equal("janet");
				expect(event.newvalue).to.equal("joan");
				expect(event.type).to.equal("change");
				done();
			})
		})
		
	});
	it("set property on same path, different object",(done) => {
		let event;
		object2.name.$onchange(ev => event = ev)("bill").then(() => {
			setTimeout(() => {
				expect(typeof(event)).to.equal("object");
				expect(event.oldvalue).to.equal("jake");
				expect(event.newvalue).to.equal("bill");
				expect(event.type).to.equal("change");
				done();
			})
		})
	});
	xit("invoke",async () => { // won't work if object restored unless we add restoring as a class'
		const value = await object1.husband.f['{"test":"test"}']();
		expect(value.test).to.equal("test");
	});
	it("get related unresolved",async () => {
		const value = await object1.children();
		expect(value.length).to.equal(3);
		expect(value.every(item => isDataKey(item))).to.equal(true);
	});
	it("get with property",async () => {
		const value = await object1.children.name();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
	});
	it("get related resolved",async () => {
		const value = await object1.children[$values]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => item && typeof(item)==="object")).to.equal(true);
	});
	it("flush cache",async () => {
		expect(Object.keys(cache).length).to.be.greaterThan(0);
		await object1.$flush();
		expect(Object.keys(cache).length).to.equal(0);
	});
	it("$lt",async () => {
		const value = await object1.children[$lt(10)].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value[0]).to.be.lessThan(10);
	});
	it("$lte",async () => {
		const value = await object1.children[$lte(10)].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value[0]).to.be.most(10);
	});
	it("$gte",async () => {
		const value = await object1.children[$gte(10)].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value[0]).to.be.least(10);
	});
	it("$gt",async () => {
		const value = await object1.children[$gt(9)].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value[0]).to.be.greaterThan(9);
	});
	it("get avg",async () => {
		const value = await object1.children.$avg.age();
		expect(value).to.equal(7.5);
	});
	it("get avgAll",async () => {
		const value = await object1.children.$avgAll.age();
		expect(value).to.equal(5);
	});
	it("get avgIf",async () => {
		const value = await object1.children[$avgIf(value => value>5||value===undefined,0)].age();
		expect(value).to.equal(5);
	});
	it("get min",async () => {
		const value = await object1.children.$min.age();
		expect(value).to.equal(5);
	});
	it("get max",async () => {
		const value = await object1.children.$max.age();
		expect(value).to.equal(10);
	});
	it("get max as function",async () => {
		const value = await object1.children[$max].age();
		expect(value).to.equal(10);
	});
	it("get array count",async () => {
		const value = await object1.children.$count();
		expect(value).to.equal(3);
		expect((await object1.children()).length).to.equal(3);
	});
	it("get array value count",async () => {
		const value = await object1.children.$count.age();
		expect(value).to.equal(2);
		expect( (await object1.children.age()).length).to.equal(2);
	});
	it("get product",async () => {
		const value = await object1.children.$product.age();
		expect(value).to.equal(50);
	});
	it("get sum",async () => {
		const value = await object1.children.$sum.age();
		expect(value).to.equal(15);
	});
	it("get RegExp array",async () => {
		const value = await object1[/child.*/].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
	});
	it("get RegExp array summary",async () => {
		const value = await object1[/child.*/].$product.age();
		expect(value).to.equal(50);
	});
	it("get RegExp value",async () => {
		const value = await object1[/child.*/].name[/mar.*/]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(1);
		expect(value[0]).to.equal("mary");
	});
	it("get transform values",async () => {
		const value = await object1.children[(values) => values.reduce((accum,{age}) => age===undefined ? accum : (accum.push(age),accum),[])]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
		expect(value.every(item => typeof(item)==="number")).to.equal(true);
	});
	it("map",async () => {
		const value = await object1.children[$map((child) => { 
			if(child.age<21) { child.minor = true }
			return child;
		})]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every((child) => child.age ? child.minor : true)).to.equal(true);
	});
	it("map",async () => {
		const value = await object1.children[$map((child) => { 
			if(child.age<21) { child.minor = true }
			return child;
		})]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every((child) => child.age ? child.minor : true)).to.equal(true);
	});
	it("reduce",async () => {
		const value = await object1.children[$reduce((accum,child) => { 
			if(child.age) { accum.push(child) }
			return accum;
		},[])]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
	});
	it("match in array",async () => {
		const value = await object1.children[$match({name:"janet"})]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(1);
	});
	it("match in object",async () => {
		const value = await object1[$match({name:"joan"})]();
		expect(value.name).to.equal("joan");
	});
});
