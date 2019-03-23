var sentinel = {}

function isEventHandler(key) {
	// Compare characters by char code to avoid string allocation overhead.
	// I'd prefer `return key[0] === "o" && key[1] === "n"`, but so far, only
	// V8 seems to optimize that idiom.
	return key.charCodeAt(0) === 0x6F && key.charCodeAt(1) === 0x6E
}

function isReferenceType(value) {
	return value != null &&
		(typeof value === "function" || typeof value === "object")
}

function wrapHandler(handler, redraw) {
	return function (ev) {
		var result = false
		if (typeof handler === "function") {
			result = handler.apply(this, arguments)
		} else {
			handler.handleEvent(ev)
			result = Boolean(ev.defaultPrevented)
		}
		if (result !== false) redraw()
		return result
	}
}

/* eslint-disable no-bitwise */
function wrapRedraw(Vnodes, child, redraw) {
	var attrs = child.attrs
	cloneChildren: {
		if ((child.mask & 0xFF) > 0x0E) {
			for (var i = 0; i !== child.attrs.length; i += 2) {
				if (
					isEventHandler(child.attrs[i]) &&
					isReferenceType(child.attrs[i + 1])
				) {
					attrs = child.attrs.slice()
					attrs[i + 1] = wrapHandler(attrs[i + 1], redraw)
					while ((i += 2) !== attrs.length) {
						if (
							isEventHandler(attrs[i]) &&
							isReferenceType(attrs[i + 1])
						) {
							attrs[i + 1] = wrapHandler(attrs[i + 1], redraw)
						}
					}

					break cloneChildren
				}
			}

			if (child.children != null) break cloneChildren
			// eslint-disable-next-line no-bitwise
		} else if ((child.mask & 0xFD) === 0x02 && child.children != null) {
			break cloneChildren
			// eslint-disable-next-line no-bitwise
		}

		return child
	}

	var children

	if (child.children != null) {
		children = []
		for (var i = 0; i < child.children.length; i++) {
			children[i] = wrapRedraw(Vnodes, child.children[i], redraw)
		}
	}

	return Vnodes.create(
		child.mask, child.tag, attrs, children, child.key, child.ref
	)
}
/* eslint-enable no-bitwise */

function component(_, init, Vnodes) {
	return function (attrs) {
		return function (_, context) {
			var view = sentinel
			var current = sentinel

			function render(next) {
				var prev = current
				if (prev === sentinel) {
					throw new TypeError("Cannot perform a sync redraw while rendering!")
				}
				current = sentinel
				try {
					var result = view(prev, next)
					if (result != null && result !== prev) {
						context.renderSync(
							wrapRedraw(Vnodes, Vnodes.normalize(result), redraw)
						)
					}
				} finally {
					current = next
				}
			}

			function redrawSync() {
				render(current)
			}

			function redraw() {
				return context.scheduleLayout(redrawSync)
			}

			var innerContext = {
				renderType: function () { return context.renderType() },
				redraw: redraw,
				redrawSync: redrawSync,
				wrap: function (func) {
					var p = new Promise(function (resolve) { resolve(func()) })
					p.then(redraw, redraw)
					return p
				},
				done: undefined,
			}

			var done = attrs(function (next) {
				if (view == sentinel) {
					view = init(next, innerContext)
				}
				render(next)
			})

			return function () {
				try {
					if (innerContext.done != null) innerContext.done()
				} finally {
					if (done != null) done()
				}
			}
		}
	}
}

export {component as default}
