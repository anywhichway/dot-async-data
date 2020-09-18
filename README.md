# dotasync

Asynchronous dot notation to radically simplify JSON database access.

Frustrated by complex code to navigate through related JSON objects?

Tired of tracking down typographical errors in strings that have to be compiled into queries?

Angry about all the errors thrown by navigating incomplete JSON records?

What if you could just load a single root object and navigate to any of its leaf nodes with dot notation (even those that require loading additional data)?

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
	contact = dotAsync(customer,{isDataKey,idKey:"#,db}),
	billingAddress = await customer.accountInfo.billingInfo.address(),
	shippingAddress = await customer.accountInfo.shippingAddress;
	await contact.premier(true);
	...
}
```

Dot notation paths can also include filter, transformation, and summary functions or regular expressions, e.g.

```javascript
customer.contacts[({firstName,lastName,phone}) => { return {firstName,lastName,phone} }]();
```

will extract the listed properties from this data:

```javascript
{
	"#":"/Customer/#10",
	contacts: ["/Contact/#1","/Contact/#3","/Contact/#90"],
	...
}
```

You can do this with ANY JSON database that supports `get(key)` and `set(key)`!

## Installing

```
npm install dotasync
```

## Using

`dotAsync` is isomorphic, the `index.js` file can be loaded in a browser or required by NodeJS code.

See the files `test/index.html` and `test/index.js` for basic examples while we enhance the documentation.

If a dot path can't be resolved is will simpoly return `undefined`. No more errors half way down a path because of a missing entity! (We will probably add a `strict` mode
if you want the errors).

This is an ALPHA release.

## Acknowledgements

Although the purpose and architecture of `dot-async` are very different, the asychronous dot notation was inspired by the fabulous [GunDB](https://gun.eco/).

## Release History (reverse chronological order)

2020-09-17 v0.0.1a First public release
