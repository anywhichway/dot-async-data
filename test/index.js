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
	

describe("dotAsync",async function() {
	const db = asyncStorage,
		joe = {name:"joe",children:[{name:"janet",age:5},{name:"jon",age:10},{name:"mary"}],self() { return this; }},
		jane = {name: "jane"};
	joe.wife = jane;

	await db.put(joe,{dereference:true});
	jane.husband = joe;
	await db.put(jane);
	
	jane.children = joe.children;
	
	let object;
	it("create",() => {
		object = dotAsync(jane,{isDataKey,idKey:"#",db,autoSave:true,inline:true,cache:{}});
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
		const value = await object.husband.self[function() { return this; }]();
		expect(value.name).to.equal("joe");
	});
	it("get related unresolved",async () => {
		const value = await object.children();
		expect(value.length).to.equal(3);
		expect(value.every(item => isDataKey(item))).to.equal(true);
	});
	it("get related unresolved 2",async () => {
		const value = await object.children["*"]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => isDataKey(item))).to.equal(true);
	});
	it("get related unresolved with property",async () => {
		const value = await object.children["*"].name();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(0);
	});
	it("get related resolved",async () => {
		const value = await object.children["!"]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => item && typeof(item)==="object")).to.equal(true);
	});
	it("get related cached",async () => {
		const value = await object.children["*"]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => item && typeof(item)==="object")).to.equal(true);
	});
	it("flush cache",async () => {
		await object.$flush();
		const value = await object.children["*"]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(3);
		expect(value.every(item => isDataKey(item))).to.equal(true);
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
	it("get count",async () => {
		const value = await object.children.$count.age();
		expect(value).to.equal(2);
	});
	it("get product",async () => {
		const value = await object.children.$product.age();
		expect(value).to.equal(50);
	});
	it("get RegExp array",async () => {
		const value = await object[/child.*/].$product.age();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(1);
		expect(value[0]).to.equal(50);
	});
	it("get RegExp value",async () => {
		const value = await object[/child.*/]["*"].name[/mar.*/]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(1);
		expect(value[0]).to.equal("mary");
	});
	it("get transform values",async () => {
		const value = await object.children[({age}) => {return age!=undefined ? {age} : undefined}]();
		expect(Array.isArray(value)).to.equal(true);
		expect(value.length).to.equal(2);
		expect(value.every(item => typeof(item.age)==="number")).to.equal(true);
	});
});
