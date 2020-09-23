# dot-async-data

Asynchronous dot notation to radically simplify JSON database access.

Frustrated by complex code to navigate through related JSON objects?

Tired of tracking down typographical errors in strings that have to be compiled into queries?

Angry about all the errors thrown by navigating incomplete JSON records?

What if you could:

1) Load a single root object and navigate to any of its leaf nodes with dot notation (even those that require loading additional data)?

2) Automatically save data when changes are made?

3) Match and transform data and paths with inline regular expressions aand functions?

4) Do this with ANY JSON database that supports `get(key)` and `set(key,value)` and even pass queries to a GraphQL or SQL API!

## Example

Assume that customer contacts are stored distinct from their account info which is distinct from billing and shipping info which is distinct from addresses:

```javascript
{
	"#":/Contact/#1,
	accountInfo: "/Account/#3",
	premier: false,
	firstName: "Bill",
	lastName: "Jones",
	phone: "(555) 555-5555",
	email: "bill@somewhere.com",
	...
}

{
	"#": "/Account/#3",
	billingInfo:"/BillingInfo/#99",
	shippingAddress:"/Address/#6"
}

{
	"#": "/BillingInfo/#99"
	address:"/Address/#7"
}

{
	"#": "/Address/#6",
	city: "Seattle",
	...
}

{
	"#": "/Address/#7",
	city: "Tacoma",
	...
}

```

The below code will retrieve and update data:

```javascript

function isDataKey(key) { // keys take the form '/Classname/#<some id>'
	return typeof(key)==="string" && new RegExp("/.*/\#.*").test(key);
}

let contact = db.get("/Contact/#1");
if(contact) {
	contact = dotAsyncData(customer,{isDataKey,idKey:"#,db}),
	billingAddress = await customer.accountInfo.billingInfo.address(),
	shippingAddress = await customer.accountInfo.shippingAddress();
	await contact.premier(true); // update to premier
	...
}
```

Dot notation paths may also include filter, transformation, and summary functions or regular expressions, e.g.

```javascript
customer.contacts[({firstName,lastName,phone}) => { return {firstName,lastName,phone} }]();
```

will load the referenced objects and extract the destructured properties from this data:

```javascript
{
	"#":"/Customer/#10",
	contacts: ["/Contact/#1","/Contact/#3","/Contact/#90"],
	...
}
```

# Installing

```
npm install dot-async-data
```

# Using

`dot-async-data` is isomorphic, the `index.js` file can be loaded in a browser or required by NodeJS code.

Browser

```html
<script src="./path/copyOfIndex.js"></script>
<script>
const {$min, $max, ... other functions you wish to use} = dotAsyncData;

... your code

</script>

```

NodeJS

```javascript
const {$min, $max, ... other functions you wish to use} = require("dotAsyncData");

... your code

```

To maintain isomorphism and keep our own build process simple, the use of JavaScript modules using `import/export` is not yet supported. The [esm](https://www.npmjs.com/package/esm) module is
a dependency for the NodeJS version. If you wish to mix and match, start your application with the command `node -r esm <your file>`.

See the files `test/index.html` and `test/index.js` for basic examples while we enhance the documentation.

This is an ALPHA release.

## Creating An Async Data Object

You can make any object into an asynchronously accessable object by calling `dotAsyncData`:

<downrunner id="create" console="createConsole" scripts="./index.js"></downrunner>
```javascript
(() => {
	const jane = {
			"#": "/Person/#abcxyz",
			name: "jane",
			age: 25
		},
		asyncJane = dotAsyncData(jane,options);
	console.log(await asyncJane.age());
	console.log(await asyncJane.age(26));
})();
```


You can also pass `null` or `undefined` as the first argument, so long as you provide a data store in the start-up options. When you do this, the first step in the dot path is considered the
initial query key. The `dotAsyncData` object can be re-used over and over with different paths.

```javascript
const mydb = ... some data store instance,
	query = dotAsyncData(null,{db}),
	asyncJane = query["/Person/#abcxyz"], // note lack of await or ()
	janesAge = await asyncJane.age(),
	asyncBill = query["/Person/#123789"],
	...
```

Finally, you can pass `{}` as the first argument and populate the object using any serializable query supported by your database, e.g. `GraphQL`. 
See the `$query` built-in function for more details.

The options surface for `dotAsyncData` is:

```javascript
{
	isDataKey:function, // return true if the passed in value is a database object key, e.g. a UUID
	idKey: string, // the property in JSON objects where the unique id is store, e.g. _id. Value not have to return true for `isDataKey`
	db: object, // the database or database wrapper supporting `get(key)` and `set(key,value)`, the wrapper must convert to and from JSON
	autoSave: boolean, // automatically save objects when their properties or values are updated
	inline: boolean, // allow inline functions
	cache
}
```

## Path Access

Once you have a `dotAsyncData` object, you can access it to any depth using standard dot notation, just put an `await` at the start and finish it with `()`.

You can use functions and regular expressions as part of path to filter path components and filter or transform data. These operayions can all be expressed using
square bracket, `[<function or regular expression]` notation. Some functions can be used directly, e.g. `part1.$<function name>.part2`.

```javascript
dotAsyncObject[/*.Address/].city(); // cities for all data in fields ending in Address, e.g. homeAddress, billingAddress, etc.
```

```javascript
dotAsyncObject.children.$avg.age(); // the average age of the children
dotAsyncObject.children[$avg].age(); 

```

See [built-in functions](#built-in-functions) below for additional concrete examples.

If a dot path can't be resolved it will simply return `undefined`. No more errors half way down a path because of a missing entity! (We will probably add a `strict` mode
if you want the errors).

## Built-in Functions

Unless otherwise noted, built-in functions can be access via inline square brackets or dot notation, e.g. `value[$max]` and `value.$max`. With some noted exceptions, 
if a function is flagged as inline, then to use it the `dotAsyncData` object must have been created with `{inline:true}`.

Functions that typically work only on arrays or object are usually not polymorphic, i.e. if $max is called on a single numeric value, then `undefined` is returned. 
If $max is called on an array, the maximum value in the array is returned. Polymorphic versions are planned and will be prefixed with `poly`, e.g. `$polyMax`.
Exceptions include `$count`, `$map` and `$reduce` which handle array and non-array data. Non-array data is treated like single element arrays.

For the examples below, assume the following:

```javascript
{name:"joe",children:[{name:"janet",age:5},{name:"jon",age:10},{name:"mary"}]}
```

$count - number of values in array that are not undefined.

```javascript
3 === await asyncDataObject.children[$count](); // true
3 === await asyncDataObject.children.$count(); // true
3 === (await object1.children()).length; // true
2=== await asyncDataObject.children.age[$count](); // true
2 === await asyncDataObject.children.age.$count(); // true
2 === (await asyncDataObject.children.age()).length; // true, undefined is ALWAYS filtered out of child data
```

$avg - average of numeric items in an array

```javascript
7.5 === await asyncDataObject.children[$avg](); // true
7.5 === await asyncDataObject.children.$avg; // true
```

$avgAll - average of all items in an array, non-numerics treated as 0

```javascript
5 === await asyncDataObject.children[$avgAll](); // true
5 === await asyncDataObject.children.$avgAll(); // true
```

$avgIf(test :function,default :number=0) - inline only, average of all items in an array passing `test(value)`

```javascript
10 === await asyncDataObject.children[$avgIf(value => value>5)](); // true
```

Note: To implete `avgAllIf`, your test function should return `true` for undefined and you should not provide a default value for undefined.

$max - max of numeric items in an array

```javascript
10 === await asyncDataObject.children[$max](); // true
10 === await asyncDataObject.children.$max; // true
```

$min - min of numeric items in an array

```javascript
5 === await asyncDataObject.children[$min](); // true
5 === await asyncDataObject.children.$min; // true
```

$sum - sum of numeric items in an array

```javascript
15 === await asyncDataObject.children[$sum](); // true
15 === await asyncDataObject.children.$sum; // true
```

$product - product of numeric items in an array

```javascript
50 === await asyncDataObject.children[$product](); // true
50 === await asyncDataObject.children.$product; // true
```

$values - returns the values in the array resolved if they are database keys

```javascript
deepEqual(
	await asyncDataObject.children.$values(),
	await dotAsyncData({children:["/Object/#child1","/Object/#child2","/Object/#child3"]}).children.$values()
	) = true // assuming the keys resolve to children with the same names and ages as the assumed data
```

$type(type :string ) - inline but usable without options flag

```javascript
"joe" === await asyncDataObject.name[$type("string")]();
undefined  === await asyncDataObject.name[$type("number")]();
```

$lt(value :primitive)  - inline but usable without options `{inline:true}`

```javascript
[5] === await asyncDataObject.children.age[$lt(10)](); // true
```

$lte(value :primitive)  - inline but usable without options `{inline:true}`

```javascript
[5] === await asyncDataObject.children.age[$lte(5)](); // true
```

$gte(value :primitive)  - inline but usable without options `{inline:true}`

```javascript
[10] === await asyncDataObject.children.age[$gte(10)](); // true
```

$gt(value :primitive)  - inline but usable without options `{inline:true}`

```javascript
[10] === await asyncDataObject.children.age[$gt(9)](); // true
```

$match(pattern :any) - polymorphic, matches any value, including objects with multiple properties holding literals or `$lt`, `$lte`, `$eq`, `$eeq`, `$neq`, `$gte`, `$gte`, `$type`

```javascript
await  asyncDataObject.children[$match({age:{$lte: 5},name:"janet"})]() // returns an array of children that have age<=5 and name="janet

```

$query(formatter :function||:string) - inline only (for now)

Takes the current property name, value provided by an inline function, or terminal value for the path and passes it to the `formatter` function. The string value returned by the formatter function
will be passed to `db.query` (with `db` being the database wrapper provided when the `dotAsyncData` object was created) and results will be passed down the path.

If a `string` is passed to `$query`, the string is treated as an interpolation and the varibale `$value` is available for resolution.

Using this capability you can query a server using SQL, GraphQl, Mongo query language, etc. You just need to provide an adapter that passes the string to you server and returns parsed JSON.

```javascript
await asyncDataObject.name[$query("SELECT ${$value} FROM Contacts OUTPUT JSON")]();
await asyncDataObject.name[$query((value) => `SELECT ${value} FROM Contacts OUTPUT JSON`)]();
```

$get - inline only (for now), polymorphic, returns the results of a database query using the value at the current property in the path

$set(value :any) - inline only (for now), polymorphic, sets the value of the current property

$map(mapper :function) - inline only, polymorphic

$reduce(reducer :function[,accumulator]) - inline only, polymorphic

## Regular Expressions

Regular expressions can be used to match either property names in the dotted path or the value at the end of the path, e.g.

```javascript
[10,5] = await asyncDataObject[/child*./].age();
["janet","jon"] = await asyncDataObject.children.name[/j.*/]();
```

## Custom Inline Functions

Custom inline functions can be used to transform data so long as they do not contain closures, e.g.:

```javascript
[{name:"janet",minor:true},{name:"jon",minor:true},{name:"mary:,minor:undefined}] 
	= await asyncDataObject.children[({name,age}) => ({name,minor:age==undefined ? undefined : age>=21 ? true : false})]();
```
Functions containing closures will usually silently fail and the path will resolve to `undefined`.

# Internals

`dotAsyncData` objects are Proxies around Functions that maintain a closure around property access requests and the values to which they resolve.

The functions and regular expressions used within access paths take advantage of `[]` property definition that is part of modern JavaScript. Since
the JavaScript engine checks the syntax when `[]` is initially processed, the string version of the functions and regular expressions that form property names are known to be reversable into 
actual functions and regular expressions, unless a function contains a closure.

# Security

Using inline functions and regular expressions in the browser brings along some security issues related to code injection. It is recommeded you not implement
a form based mechanism for defining queries unless you fully understand the issues related to code injection.

`dotAsyncData` paths are fully serializable and could be sent to a server, this creates even more attack vectors that must be taken into consideration.

As a result on both of the above, inline functions and regular expressions must be explicitly turned on when creating a `dotAsyncData` object by using `{inline:true}`.

# Acknowledgements

Although the purpose and architecture of `dot-async` are very different, the asychronous dot notation was inspired by the fabulous [GunDB](https://gun.eco/).

# Release History (reverse chronological order)

2020-09-21 v0.0.7a Documentation updates. $match completion.

2020-09-20 v0.0.6a Lots of documentation updates. Added `$avgAll` and `$avgIf`. Fixed some issues related to inlines of $max, $min, and other functions that don't require `{inline:true}`.

2020-09-19 v0.0.5a Added $get, $set, $query. Enhanced documentation. MVP scope complete. 

2020-09-18 v0.0.4a Added $type, $map, $reduce, $match, $lt, $lte, $gte, $gt and base query support.

2020-09-18 v0.0.3a Ehanced docs. Further simplified internals.

2020-09-18 v0.0.2a Simplified internals. Added support for inline named functions from exports and multi-faceted RegExp matched for array values or individual keys.

2020-09-17 v0.0.1a First public release

<script>
const logger = `<script>if(window.frameElement.stdio) { while(window.frameElement.stdio.children.length>1) {window.frameElement.stdio.firstElementChild.remove(); }};
	const logger = {
		log(text) {
			const div = document.createElement("div");
			div.innerText = "> " + text;
			window.frameElement.stdio.lastElementChild.insertAdjacentElement("beforebegin",div);
		}
	};
	console = new Proxy(console,{
		get(target,property) {
			if(logger[property] && window.frameElement.stdio) {
				return logger[property]
			}
			return target[property];
		}
	});${"</"}script>`;

function renderRunner(runner,scripts,runners,recursing) {
	const id = runner.id,
		editorid = runner.getAttribute("editor"),
		targetid = runner.getAttribute("target"),
		consoleid = runner.getAttribute("console"),
		el = runner.nextElementSibling,
		language = el.getAttribute("class").split(" ").find(item => item.startsWith("language-")).substring(9),
		textarea = document.createElement("textarea");
		textarea.value = el.innerText;
	let editor = document.getElementById(editorid),
		target = document.getElementById(targetid),
		stdio = document.getElementById(consoleid);
	scripts = (runner.getAttribute("scripts")||"").split(";").reduce((accum,src) => accum += `<script src="${src}">${"</"}script>`,scripts);
	if(editor) {
		textarea.setAttribute("style",editor.getAttribute("style"));
		editor.appendChild(textarea);
		const s = scripts.substring();
		textarea.addEventListener("change",(event) => {
			if(language==="javascript") {
				const scripts = s + `<script type="application/${language}">${editor.value}${"</"}script>`;
				if(target) {
					const iframe = document.createElement("iframe");
					iframe.setAttribute("srcdoc",scripts);
					target.replaceChild(iframe,target.firstElementChild);
				}
				renderRunners(runners,scripts,recursing);
				if(!recursing) {
					renderRunners([].slice.call(document.querySelectorAll(`downrunner[for=${id}]`)),scripts,true)
				}
			} else if(language==="html") {
				if(target) {
					const iframe = document.createElement("iframe");
					iframe.setAttribute("srcdoc",`${s}${editor.value}`);
					target.replaceChild(iframe,target.firstElementChild);
				}
				renderRunners(runners,scripts,recursing);
				if(!recursing) {
					renderRunners([].slice.call(document.querySelectorAll(`downrunner[for=${id}]`)),scripts,true)
				}
			}
		});
	} else {
		textarea.setAttribute("style",runner.getAttribute("style"));
	}
	editor = textarea;
	if(language==="javascript") {
		scripts = scripts + `<script type="application/${language}">${editor.value}${"</"}script>`;
	}
	if(consoleid && !stdio) {
		stdio = document.createElement("div");
		stdio.className = "downrunner-console";
		stdio.setAttribute("style","border: solid grey 1px");
		stdio.setAttribute("id",consoleid);
		//stdio.innerHTML = '<div style="width:100%">&gt; <textarea style="width:95%;resize:none;height:1.5em" id="intepreter" onchange="event.target.value = eval(event.target.value)"></textarea></div>';
		stdio.innerHTML = `<div>&gt;</div>`;
	}
	let hide;
	if((stdio && !target) || (targetid && !target)) {
		target = document.createElement("div");
		if(targetid) {
			target.setAttribute("id",targetid);
		}
		hide = true;
		el.insertAdjacentElement("afterend",target);
	}
	if(target) {
		if(language==="javascript") {
			const iframe = document.createElement("iframe");
			iframe.setAttribute("srcdoc",scripts);
			while(target.firstElementChild) {
				target.firstElementChild.remove();
			}
			if(hide) {
				iframe.setAttribute("hidden","");
			}
			iframe.stdio = stdio;
			target.appendChild(iframe);
			if(stdio) {
				target.appendChild(stdio);
			}
		} else if(language==="html") {
			const iframe = target.firstElementChild || document.createElement("iframe");
			iframe.setAttribute("srcdoc",`${scripts}${editor.value}`);
			while(target.firstElementChild) {
				target.firstElementChild.remove();
			}
			if(hide) {
				iframe.setAttribute("hidden","");
			}
			iframe.stdio = stdio;
			target.appendChild(iframe);
			if(stdio) {
				target.appendChild(stdio);
			}
		}
	}
	if(!recursing) {
		return renderRunners([].slice.call(document.querySelectorAll(`downrunner[for=${id}]`)),scripts,runners,true)
	}
	return scripts;
}

function renderRunners(runners=[].slice.call(document.querySelectorAll("downrunner[id]")),scripts=logger,recursing) {
	runners.forEach((runner,i) => scripts = renderRunner(runner,scripts,runners.slice(i+1),recursing));
	return scripts;
}
renderRunners();
</script>