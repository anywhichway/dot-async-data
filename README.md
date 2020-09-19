# dot-async-data

Asynchronous dot notation to radically simplify JSON database access.

Frustrated by complex code to navigate through related JSON objects?

Tired of tracking down typographical errors in strings that have to be compiled into queries?

Angry about all the errors thrown by navigating incomplete JSON records?

What if you could:

1) Load a single root object and navigate to any of its leaf nodes with dot notation (even those that require loading additional data)?

2) Automatically save data when changes are made?

3) Match and transform data and paths with inline regular expressions aand functions?

4) Do this with ANY JSON database that supports `get(key)` and `set(key,value)`!

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

## Installing

```
npm install dot-async-data
```

## Using

`dot-async-data` is isomorphic, the `index.js` file can be loaded in a browser or required by NodeJS code.

Browser

```javascript
<script src="./path/copyOfIndex.js></script>
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
a dependency for NoeJS and if you wish to mix and match start your application with the command `node -r esm <your file>`.

See the files `test/index.html` and `test/index.js` for basic examples while we enhance the documentation.

This is an ALPHA release.

### Creating An Async Data Object

You can make any existing object into an asynchronously accessable object by calling `dotAsyncData`:

```javascript
const jane = {
		"#": "/Person/#abcxyz",
		name: "jane",
		age: 25
	},
	asyncJane = dotAsyncData(jane,options),
	janesAge = await asyncJane.age();
	janesNewAge = await asyncJane.age(26);
```

You can also pass `null` or `undefined` as the first argument so long as you provide a data store in the start-up options. When you do this, the first step in the dot path is considered the
initial query key. The initial query can be re-used over and over.

```javascript
const mydb = ... some data store instance,
	query = dotAsyncData(null,{db}),
	asyncJane = query["/Person/#abcxyz"], // note lack of await or ()
	janesAge = await asyncJane.age(),
	asyncBill = query["/Person/#123789"],
	...
```

The options surface is:

```javascript
{
	isDataKey:function, // return true if the passed in value is a database object key, e.g. a UUID
	idKey: string, // the property in JSON objects where the unique id is store, e.g. _id
	db: object, // the database or database wrapper supporting `get(key)` and `set(key,value)`, the wrapper must convert to and from JSON
	autoSave: boolean, // automatically save objects when their properties are updated
	inline: boolean, // allow inline functions
	cache
}
```

### Path Access

Once you have a `dotAsyncData` object, you can access it to any depth using standard dot notation, just put an `await` at the start and finish it with `()`.

If a dot path can't be resolved it will simpoly return `undefined`. No more errors half way down a path because of a missing entity! (We will probably add a `strict` mode
if you want the errors).

### Built-in Functions

Some must be inline, others can be referenced via dot notation, e.g. `value[$max]` and `value.$max`. If a function must be inline, then to use it the `dotAsyncData` object must have been
created with `{inline:true}`.

Unless otherwise noted, functions that would typically work only on arrays or object are not polymorphic, i.e. if $max is called on a single numeric value, then `undefined` is returned. 
If $max is called on an array, the the maximum value in the array is returned. Polymorphic versions are planned and will be prefixed with `poly`, e.g. `$polyMax`.

$count

$type(type :string ) - inline only (for now)

$lt(value :number)

$lte(value :number)

$gte(value :number)

$gt(value :number)

$avg

$min

$max

$sum

$product

$values

$map(mapper :function) - inline only, polymorphic

$reduce(reducer :function[,accumulator]) - inline only, polymorphic

$match(pattern :object - inline only, polymorphic

### Regular Expressions


### Inline Functions


## Internals

`dotAsyncData` objects are Proxies around Functions that maintain a closure around property access requests and the values to which they resolve.

The functions and regular expressions used within access paths take advantage of `[]` property definition that is part of modern JavaScript. Since
the JavaScript engine checks the syntax when `[]` is initially processed, the string version of the functions and regular expressions that form property names are known to be reversable into 
actual functions and regular expressions, unless a function contains a closure.

## Security

Using inline functions and regular expressions in the browser brings along some security issues related to code injection. It is recommeded you not implement
a form based mechanism for defining queries unless you fully understand the issues related to code injection.

`dotAsyncData` paths are fully serializable and could be sent to a server, this creates even more attack vectors that must be taken into consideration.

As a result on both of the above, inline functions and regular expressions must be explicitly turned on when creating a `dotAsyncData` object by using `{inline:true}`.

## Acknowledgements

Although the purpose and architecture of `dot-async` are very different, the asychronous dot notation was inspired by the fabulous [GunDB](https://gun.eco/).

## Release History (reverse chronological order)

2020-09-18 v0.0.4a Added $type, $map, $reduce, $match, $lt, $lte, $gte, $gt and base query support.

2020-09-18 v0.0.3a Ehanced docs. Further simplified internals.

2020-09-18 v0.0.2a Simplified internals. Added support for inline named functions from exports and multi-faceted RegExp matched for array values or individual keys.

2020-09-17 v0.0.1a First public release
