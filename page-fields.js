// Each frame owns its field values and references in the isolated extension world.
(() => {
	const documentKey = crypto.randomUUID();
	let targets = new Map();
	let contextTarget = null;
	let focusedAt = 0;
	const normalize = (text) =>
		text
			.slice(0, 2000)
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[_\W]+/g, " ")
			.trim();
	const username =
		/\b(user\s*name|user\s*id|login\s*(name|id)|screen\s*name|handle|nick\s*name|nombre de usuario|usuario|seudonimo)\b/;
	const otherField =
		/\b(e\s*mail|phone|telephone|mobile|search|first\s*name|last\s*name|full\s*name|real\s*name|display\s*name|given\s*name|family\s*name|company|nombre completo|nombre real|correo|telefono)\b/;
	const login = /\b(log\s*in|sign\s*in|iniciar sesion|acceder)\b/;
	const registration =
		/\b(sign\s*up|register|registration|create (your |an? )?account|join now|registrarse|registro|crear cuenta)\b/;
	const editing =
		/\b(change|choose|pick|set|update|edit|create|cambiar|elegir|editar)\b.*\b(user\s*name|handle|screen\s*name|nick\s*name|usuario)\b|\b(edit|update|save) profile\b/;

	function labels(field) {
		const root = field.getRootNode();
		const referenced = (field.getAttribute("aria-labelledby") || "")
			.split(/\s+/)
			.slice(0, 10)
			.map((id) => root.getElementById?.(id)?.textContent || "");
		return [...(field.labels || [])]
			.map((label) => label.textContent || "")
			.concat(
				referenced,
				field.getAttribute("aria-label") || "",
				field.placeholder,
			);
	}

	function identity(field) {
		const visibleLabels = labels(field).map(normalize);
		const signals = [
			...visibleLabels,
			normalize(field.name),
			normalize(field.id),
		];
		const text = signals.join(" ");
		const autocomplete = field.autocomplete.toLowerCase().split(/\s+/);
		const isUsername = username.test(text) || autocomplete.includes("username");
		const realName =
			/^(name|first|last|given|family|nombre|apellido|apellidos)$/;
		if (
			otherField.test(text) ||
			visibleLabels.some((signal) => realName.test(signal)) ||
			(!isUsername && signals.some((signal) => realName.test(signal))) ||
			autocomplete.some((token) =>
				[
					"email",
					"name",
					"given-name",
					"family-name",
					"nickname",
					"tel",
					"organization",
					"street-address",
					"one-time-code",
				].includes(token),
			)
		)
			return "other";
		return isUsername ? "username" : "unknown";
	}

	function editable(field) {
		if (
			!(field instanceof HTMLInputElement) ||
			field.type !== "text" ||
			!field.isConnected ||
			field.disabled ||
			field.readOnly ||
			field.matches(":disabled") ||
			field.getClientRects().length === 0 ||
			getComputedStyle(field).visibility !== "visible"
		)
			return false;
		for (
			let node = field;
			node;
			node = node.parentElement || node.getRootNode().host
		) {
			if (
				node.hasAttribute("inert") ||
				node.hasAttribute("hidden") ||
				getComputedStyle(node).opacity === "0"
			)
				return false;
		}
		return true;
	}

	function context(field) {
		let scope = field.form || field.closest('[role="form"]');
		if (scope === null) {
			scope = field.parentElement;
			while (
				scope?.parentElement &&
				scope !== document.body &&
				!scope.querySelector(
					'h1,h2,h3,legend,button,input[type="submit"],input[type="password"]',
				)
			) {
				scope = scope.parentElement;
			}
		}
		scope ||= field.getRootNode();
		// Login and signup forms on the same page must not borrow each other's signals.
		const controls = field.form
			? [...field.form.elements]
			: [...scope.querySelectorAll("input,button")];
		const headings = [...scope.querySelectorAll("h1,h2,h3,legend")];
		const actions = controls.filter(
			(item) =>
				item instanceof HTMLButtonElement ||
				(item instanceof HTMLInputElement &&
					["submit", "button"].includes(item.type)),
		);
		const text = normalize(
			[
				scope.getAttribute?.("aria-label") || "",
				...headings.map((node) => node.textContent || ""),
				...actions.map((node) =>
					node instanceof HTMLInputElement
						? node.value
						: node.textContent || "",
				),
			].join(" "),
		);
		const passwords = controls.filter(
			(item) => item instanceof HTMLInputElement && item.type === "password",
		);
		const currentPassword = passwords.some((item) =>
			item.autocomplete.split(/\s+/).includes("current-password"),
		);
		const newPassword = passwords.some((item) =>
			item.autocomplete.split(/\s+/).includes("new-password"),
		);
		const changing = editing.test(text);
		if (!changing && (login.test(text) || currentPassword)) return "login";
		if (changing || registration.test(text) || newPassword) return "eligible";
		const path = normalize(location.pathname);
		if (login.test(path)) return "login";
		if (
			registration.test(path) ||
			/\b(onboarding|settings|preferences)\b/.test(path) ||
			/\b(profile|account)\b.*\b(edit|setup)\b/.test(path)
		)
			return "eligible";
		if (document.forms.length <= 1) {
			const heading = normalize(
				[...document.querySelectorAll("h1")]
					.map((node) => node.textContent || "")
					.join(" "),
			);
			if (login.test(heading)) return "login";
			if (registration.test(heading) || editing.test(heading))
				return "eligible";
		}
		return "unknown";
	}

	function inputs(root) {
		const found = [...root.querySelectorAll("input")];
		for (const element of root.querySelectorAll("*")) {
			if (element.shadowRoot) found.push(...inputs(element.shadowRoot));
		}
		return found;
	}

	function snapshot(field) {
		return { field, value: field.value, createdAt: Date.now() };
	}

	function candidates() {
		const next = new Map();
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement)
			active = active.shadowRoot.activeElement;
		const items = [];
		for (const field of inputs(document)) {
			if (
				!editable(field) ||
				identity(field) !== "username" ||
				context(field) !== "eligible"
			)
				continue;
			const id = crypto.randomUUID();
			next.set(id, snapshot(field));
			items.push({
				id,
				label: (
					labels(field).find((text) => text.trim()) ||
					field.name ||
					field.id ||
					"Username"
				)
					.trim()
					.slice(0, 100),
				focused: active === field,
				focusedAt,
				hasValue: field.value !== "",
			});
		}
		targets = next;
		return { documentKey, items };
	}

	function fill(saved, value, manual) {
		// No page-supplied selectors or code; only a previously observed element.
		if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(value))
			return { status: "invalid" };
		if (!saved || Date.now() - saved.createdAt > 300000)
			return { status: "stale" };
		const { field } = saved;
		if (!editable(field) || field.value !== saved.value)
			return { status: "stale" };
		const kind = identity(field);
		const purpose = context(field);
		if (
			kind === "other" ||
			purpose === "login" ||
			(!manual && (kind !== "username" || purpose !== "eligible"))
		)
			return { status: "ineligible" };
		const probe = field.cloneNode();
		probe.value = value;
		if (
			(field.maxLength >= 0 && value.length > field.maxLength) ||
			(field.minLength >= 0 && value.length < field.minLength) ||
			!probe.validity.valid
		)
			return { status: "constraints" };
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		).set.call(field, value);
		field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
		field.dispatchEvent(new Event("change", { bubbles: true }));
		return {
			status:
				field.isConnected && field.value === value ? "filled" : "rejected",
		};
	}

	document.addEventListener(
		"focusin",
		() => {
			focusedAt = Date.now();
		},
		true,
	);
	document.addEventListener(
		"click",
		async (event) => {
			if (!event.isTrusted || event.button !== 0) return;
			const field = event.composedPath()[0];
			if (
				!editable(field) ||
				field.value !== "" ||
				identity(field) !== "username" ||
				context(field) !== "eligible"
			)
				return;
			try {
				await chrome.runtime.sendMessage("open-username-popup");
			} catch {
				// The extension may have been reloaded while this page was open.
			}
		},
		true,
	);
	document.addEventListener(
		"contextmenu",
		(event) => {
			if (!event.isTrusted) return;
			const field = event.composedPath()[0];
			contextTarget = editable(field) ? snapshot(field) : null;
		},
		true,
	);

	globalThis.usernameRollerFields = Object.freeze({
		candidates,
		fillTarget(key, id, value) {
			if (key !== documentKey) return { status: "stale" };
			const saved = targets.get(id);
			targets.delete(id);
			return fill(saved, value, false);
		},
		fillContext(value) {
			const saved = contextTarget;
			contextTarget = null;
			return fill(saved, value, true);
		},
	});
})();
