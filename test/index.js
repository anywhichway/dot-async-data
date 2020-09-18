var chai,
	expect,
	dotAsync,
	asyncStorage;
if(typeof(window)==="undefined") {
	chai = require("chai");
	expect = chai.expect;
	dotAsync = require("../index.js");
	asyncStorage = require("./asyncStorage.js");
} else {
	chai = window.chai;
	expect = window.expect;
}

function isDataKey(key) {
	return typeof(key)==="string" && new RegExp("/.*/\#.*").test(key);
}
	
const { $max, $values } = dotAsync;

describe("dotAsync",async function() {
	const cache = {},
		db = asyncStorage,
		joe = {name:"joe",children:[{name:"janet",age:5},{name:"jon",age:10},{name:"mary"}],f(value) { return value; }},
		jane = {name: "jane"};
	joe.wife = jane;

	await db.put(joe,{dereference:true});
	jane.husband = joe;
	await db.put(jane);
	
	jane.children = joe.children;
	
	let object;
	it("create",() => {
		object = dotAsync(jane,{isDataKey,idKey:"#",db,autoSave:true,inline:true,cache});
		expect(object).to.be.instanceof(Object)
	})
	it("get direct property value",async () => {
		const value = await object.name();
		expect(value).to.equal("jane")
	});
	it("get indirect property value",async () => {
		const value = await object.husband.name();
		expect(value).to.equal("joe")
	});
	it("invoke",async () => {
		const value = await object.husband.f['{"test":"test"}']();
		expect(value.test).to.equal("test");
	});
	it("get related unresolved",async () => {
		const value = await object.children();
		expect(value.length).to.equal(3);
		expect(value.every(item => isDataKey(item))).to.equal(true);
	});
	it("get with property",async () => {
		const value = await object.children.name();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
	});
	it("get related resolved",async () => {
		const value = await object.children[$values]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => item && typeof(item)==="object")).to.equal(true);
	});
	it("flush cache",async () => {
		expect(Object.keys(cache).length).to.be.greaterThan(0);
		const thecache = await object.$flush();
		expect(Object.keys(cache).length).to.equal(0);
		expect(thecache).to.equal(cache);
	});
	it("get avg",async () => {
		const value = await object.children.$avg.age();
		expect(value).to.equal(7.5);
	});
	it("get min",async () => {
		const value = await object.children.$min.age();
		expect(value).to.equal(5);
	});
	it("get max",async () => {
		const value = await object.children.$max.age();
		expect(value).to.equal(10);
	});
	it("get max as function",async () => {
		const value = await object.children[$max].age();
		expect(value).to.equal(10);
	});
	it("get count",async () => {
		const value = await object.children.$count.age();
		expect(value).to.equal(2);
	});
	it("get product",async () => {
		const value = await object.children.$product.age();
		expect(value).to.equal(50);
	});
	it("get sum",async () => {
		const value = await object.children.$sum.age();
		expect(value).to.equal(15);
	});
	it("get RegExp array",async () => {
		const value = await object[/child.*/].age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
	});
	it("get RegExp array summary",async () => {
		const value = await object[/child.*/].$product.age();
		expect(value).to.equal(50);
	});
	it("get RegExp value",async () => {
		const value = await object[/child.*/].name[/mar.*/]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(1);
		expect(value[0]).to.equal("mary");
	});
	it("get transform values",async () => {
		const value = await object.children[(accum,{age}) => ((accum || (accum=[]),age===undefined||accum.push({age}),accum))]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
		expect(value.every(item => typeof(item.age)==="number")).to.equal(true);
	});
});
