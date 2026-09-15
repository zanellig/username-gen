import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extension = dirname(fileURLToPath(import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "username-roller-test-"));
let markup = "";
const server = createServer((request, response) => {
	response.setHeader("Content-Type", "text/html; charset=utf-8");
	response.end(
		`<!doctype html><html><body>${request.url === "/frame" ? '<form><h2>Create account</h2><label>Handle<input name="handle"></label></form>' : markup}</body></html>`,
	);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
let passed = 0;
try {
	context = await chromium.launchPersistentContext(profile, {
		headless: true,
		channel: "chromium",
		args: [
			`--disable-extensions-except=${extension}`,
			`--load-extension=${extension}`,
		],
	});
	const worker =
		context.serviceWorkers()[0] ||
		(await context.waitForEvent("serviceworker"));
	const harness = await context.newPage();
	await harness.goto(worker.url().replace("background.js", "popup.html"));
	const page = await context.newPage();
	const errors = [];
	worker.on("console", (event) => {
		if (event.type() === "error") errors.push(event.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));

	async function fixture(html, path = "/case") {
		markup = html;
		await page.goto(origin + path);
		await page.bringToFront();
		return worker.evaluate(
			async (url) =>
				(await chrome.tabs.query({})).find((tab) => tab.url === url).id,
			origin + path,
		);
	}
	async function find(tabId) {
		return harness.evaluate(async (id) => {
			const fields = await import(chrome.runtime.getURL("browser-fields.js"));
			return fields.findFields(id);
		}, tabId);
	}
	async function fill(tabId, target, value = "SwiftOtter4821") {
		return harness.evaluate(
			async ({ tabId, target, value }) => {
				const fields = await import(chrome.runtime.getURL("browser-fields.js"));
				return fields.fillField(tabId, target, value);
			},
			{ tabId, target, value },
		);
	}
	async function manual(tabId, selector, frameId = 0, scope = page) {
		await scope.locator(selector).click({ button: "right" });
		await page.keyboard.press("Escape");
		return harness.evaluate(
			async ({ tabId, frameId }) => {
				const fields = await import(chrome.runtime.getURL("browser-fields.js"));
				return fields.fillContextField(tabId, frameId, "SwiftOtter4821");
			},
			{ tabId, frameId },
		);
	}
	async function test(name, run) {
		await run();
		console.log(`ok - ${name}`);
		passed++;
	}

	async function closePopups() {
		await harness.evaluate(() =>
			chrome.extension
				.getViews({ type: "popup" })
				.forEach((view) => view.close()),
		);
		await harness.waitForFunction(
			() => chrome.extension.getViews({ type: "popup" }).length === 0,
		);
	}

	async function waitForPopup() {
		await harness.waitForFunction(() => {
			const popup = chrome.extension.getViews({ type: "popup" })[0];
			return (
				popup &&
				popup.document.querySelector("#destination")?.disabled === false &&
				popup.document.querySelector("#names")?.inert === false
			);
		});
	}

	await test("detects dedicated usernames and handles, excludes other input types and names", async () => {
		const id = await fixture(`<form><h1>Create account</h1>
      <label>Username<input id="user" autocomplete="username"></label>
      <label>Public handle<input id="handle"></label>
      <input id="email" type="email" autocomplete="username">
      <label>Email or username<input autocomplete="username"></label>
      <label>Display name<input name="username"></label>
      <label>Full name<input></label><input type="password" autocomplete="new-password">
      <input name="username" hidden><input name="username" disabled>
      <input name="username" readonly><fieldset disabled><input name="username"></fieldset>
      <div inert><input name="username"></div>
      <div style="opacity:0"><input name="username"></div></form>`);
		const { fields } = await find(id);
		assert.deepEqual(
			fields.map((field) => field.label),
			["Username", "Public handle"],
		);
		assert.equal(
			await page.evaluate(() => globalThis.usernameRollerFields),
			undefined,
			"module must be isolated from the page",
		);
	});
	await test("keeps login and signup form evidence separate", async () => {
		const id =
			await fixture(`<h1>Sign up</h1><form><label>Username<input id="login" autocomplete="username"></label><button>Sign in</button></form>
      <form><label>Username<input id="signup"></label><button>Create account</button></form>`);
		const { fields } = await find(id);
		assert.equal(fields.length, 1);
		assert.equal((await fill(id, fields[0])).status, "filled");
		assert.equal(await page.locator("#login").inputValue(), "");
		assert.equal(await page.locator("#signup").inputValue(), "SwiftOtter4821");
		assert.equal((await manual(id, "#login")).status, "ineligible");
	});
	await test("ambiguous forms need explicit right-click targeting", async () => {
		const id = await fixture(
			'<form><label>Username<input id="ambiguous"></label><button>Continue</button></form><input id="other">',
		);
		assert.equal((await find(id)).fields.length, 0);
		assert.equal((await manual(id, "#ambiguous")).status, "filled");
		assert.equal(
			await page.locator("#ambiguous").inputValue(),
			"SwiftOtter4821",
		);
		assert.equal(await page.locator("#other").inputValue(), "");
	});
	await test("manual fallback refuses email, password, display name, and login routes", async () => {
		let id = await fixture(
			'<form><input id="email" type="email"><input id="password" type="password"><label>Display name<input id="display"></label><label>Name<input id="realname"></label></form>',
		);
		assert.equal((await manual(id, "#email")).status, "stale");
		assert.equal((await manual(id, "#password")).status, "stale");
		assert.equal((await manual(id, "#display")).status, "ineligible");
		assert.equal((await manual(id, "#realname")).status, "ineligible");
		id = await fixture(
			'<input id="account" autocomplete="username"><button>Continue</button>',
			"/login",
		);
		assert.equal((await find(id)).fields.length, 0);
		assert.equal((await manual(id, "#account")).status, "ineligible");
	});
	await test("supports onboarding and username changes with password confirmation", async () => {
		let id = await fixture(
			'<h1>Choose your username</h1><input aria-label="Username">',
			"/onboarding",
		);
		assert.equal((await find(id)).fields.length, 1);
		id = await fixture(
			'<form><h2>Change username</h2><input name="username"><input type="password" autocomplete="current-password"><button>Save</button></form>',
		);
		assert.equal((await find(id)).fields.length, 1);
	});
	await test("discovers dynamically inserted fields, accessible labels, and open shadow roots", async () => {
		const id = await fixture('<main id="mount"></main>');
		assert.equal((await find(id)).fields.length, 0);
		await page.evaluate(() => {
			document.querySelector("main").innerHTML =
				'<form><h2>Register</h2><span id="caption">Username</span><input aria-labelledby="caption"></form><div id="shadow"></div>';
			document
				.querySelector("#shadow")
				.attachShadow({ mode: "open" }).innerHTML =
				"<form><h2>Create account</h2><label>Handle<input></label></form>";
		});
		const { fields } = await find(id);
		assert.deepEqual(
			fields.map((field) => field.label),
			["Username", "Handle"],
		);
		assert.equal((await fill(id, fields[1])).status, "filled");
	});
	await test("fills only the selected field and dispatches input/change without submitting", async () => {
		const id = await fixture(
			'<form><h2>Sign up</h2><input name="username" id="first"><input name="handle" id="second"><button>Register</button></form>',
		);
		await page.locator("#second").focus();
		await page.evaluate(() => {
			globalThis.events = [];
			for (const name of ["input", "change", "submit"])
				document.addEventListener(name, (event) => {
					event.preventDefault();
					events.push(name);
				});
			const input = document.querySelector("#second");
			const descriptor = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			);
			Object.defineProperty(input, "value", {
				get: () => descriptor.get.call(input),
				set: () => {
					throw new Error("must use native setter");
				},
			});
		});
		const { fields } = await find(id);
		assert.equal(fields[1].focused, true);
		assert.equal((await fill(id, fields[1])).status, "filled");
		assert.equal(await page.locator("#first").inputValue(), "");
		assert.deepEqual(await page.evaluate(() => events), ["input", "change"]);
	});
	await test("rejects changed values, detached targets, and navigation", async () => {
		const html = '<form><h2>Register</h2><input name="username"></form>';
		const id = await fixture(html);
		let target = (await find(id)).fields[0];
		await page.locator("input").fill("UserTypedThis");
		assert.equal((await fill(id, target)).status, "stale");
		target = (await find(id)).fields[0];
		await page
			.locator("input")
			.evaluate((field) => field.replaceWith(field.cloneNode()));
		assert.equal((await fill(id, target)).status, "stale");
		target = (await find(id)).fields[0];
		await fixture(html);
		assert.equal((await fill(id, target)).status, "stale");
	});
	await test("respects site constraints and rechecks eligibility before writing", async () => {
		const id = await fixture(
			'<form><h2>Register</h2><input name="username" maxlength="8"></form>',
		);
		assert.equal(
			(await fill(id, (await find(id)).fields[0])).status,
			"constraints",
		);
		await page.locator("input").evaluate((input) => {
			input.removeAttribute("maxlength");
			input.pattern = "[a-z]+";
		});
		assert.equal(
			(await fill(id, (await find(id)).fields[0])).status,
			"constraints",
		);
		await page.locator("input").evaluate((input) => {
			input.removeAttribute("pattern");
			input.minLength = 30;
		});
		assert.equal(
			(await fill(id, (await find(id)).fields[0])).status,
			"constraints",
		);
		const target = (await find(id)).fields[0];
		await page.locator("h2").evaluate((heading) => {
			heading.textContent = "Sign in";
		});
		assert.equal((await fill(id, target)).status, "ineligible");
		assert.equal(await page.locator("input").inputValue(), "");
	});
	await test("discovers and targets same-origin, cross-origin, and about:blank frames", async () => {
		const id = await fixture(
			`<iframe src="/frame"></iframe><iframe src="http://localhost:${server.address().port}/frame"></iframe><iframe srcdoc='<form><h2>Register</h2><input name="username"></form>'></iframe>`,
		);
		const { fields } = await find(id);
		assert.equal(fields.length, 3);
		assert.equal(new Set(fields.map((field) => field.frameId)).size, 3);
		for (const field of fields)
			assert.equal((await fill(id, field)).status, "filled");
		for (const frame of page.frames().slice(1))
			assert.equal(await frame.locator("input").inputValue(), "SwiftOtter4821");
		const firstFrame = page
			.frames()
			.find((frame) => frame.url() === origin + "/frame");
		const frameId = await harness.evaluate(
			async ({ id, url }) => {
				const frames = await chrome.scripting.executeScript({
					target: { tabId: id, allFrames: true },
					func: () => location.href,
				});
				return frames.find((frame) => frame.result === url).frameId;
			},
			{ id, url: firstFrame.url() },
		);
		assert.equal(
			(await manual(id, "input", frameId, firstFrame)).status,
			"filled",
		);
	});
	await test("a real username click opens the native popup and fills the clicked field", async () => {
		await fixture(
			'<form><h2>Register</h2><label>Username<input id="first"></label><label>Handle<input id="second"></label></form>',
		);
		await page.locator("#second").click();
		await waitForPopup();
		const selected = await harness.evaluate(
			() =>
				chrome.extension
					.getViews({ type: "popup" })[0]
					.document.querySelector("input[name=destination]:checked").value,
		);
		assert.equal(selected, "1");
		const name = await harness.evaluate(() => {
			const popup = chrome.extension.getViews({ type: "popup" })[0];
			const button = popup.document.querySelector("button.username");
			button.click();
			return button.textContent;
		});
		await harness.waitForFunction(
			() =>
				chrome.extension
					.getViews({ type: "popup" })[0]
					?.document.querySelector("#status").textContent ===
				"Username filled.",
		);
		assert.equal(await page.locator("#second").inputValue(), name);
		assert.equal(await page.locator("#first").inputValue(), "");
		await closePopups();
		await page.locator("#second").click();
		await page.waitForTimeout(150);
		assert.equal(
			(
				await worker.evaluate(() =>
					chrome.runtime.getContexts({ contextTypes: ["POPUP"] }),
				)
			).length,
			0,
		);
		await page.locator("#second").fill("");
		await page.locator("#second").click();
		await waitForPopup();
		await closePopups();
	});
	await test("only eligible primary clicks open the popup", async () => {
		await fixture(`<form><h2>Register</h2><label>Username<input id="username"></label>
      <input type="email" id="email"><input type="password" id="password"><label>Display name<input id="display"></label>
      <label>Username<input id="prefilled" value="ExistingUsername"></label></form>
      <form><h2>Sign in</h2><input autocomplete="username" id="login"></form>
      <form><label>Username<input id="ambiguous"></label><button>Continue</button></form>`);
		for (const id of [
			"email",
			"password",
			"display",
			"login",
			"ambiguous",
			"prefilled",
		]) {
			await page.locator(`#${id}`).click();
		}
		await page.locator("#username").evaluate((field) => {
			field.focus();
			field.click();
		});
		await page.locator("#username").click({ button: "right" });
		await page.keyboard.press("Escape");
		await page.waitForTimeout(150);
		assert.equal(
			(
				await worker.evaluate(() =>
					chrome.runtime.getContexts({ contextTypes: ["POPUP"] }),
				)
			).length,
			0,
		);
	});
	await test("clicks inside open shadow roots and embedded forms open the popup", async () => {
		await fixture(
			`<div id="shadow"></div><iframe src="http://localhost:${server.address().port}/frame"></iframe>`,
		);
		await page.locator("#shadow").evaluate((host) => {
			host.attachShadow({ mode: "open" }).innerHTML =
				'<form><h2>Register</h2><label>Username<input id="shadow-name"></label></form>';
		});
		await page.locator("#shadow-name").click();
		await waitForPopup();
		assert.match(
			await harness.evaluate(
				() =>
					chrome.extension
						.getViews({ type: "popup" })[0]
						.document.querySelector("#destlabel").textContent,
			),
			/Username/,
		);
		await closePopups();
		await page
			.frames()
			.find((frame) => frame.url().includes("localhost"))
			.locator("input")
			.click();
		await waitForPopup();
		assert.match(
			await harness.evaluate(
				() =>
					chrome.extension
						.getViews({ type: "popup" })[0]
						.document.querySelector("#destlabel").textContent,
			),
			/Handle/,
		);
		await closePopups();
	});
	await test("delayed requests from inactive tabs cannot open the popup", async () => {
		const id = await fixture(
			'<form><h2>Register</h2><input name="username"></form>',
		);
		const active = await context.newPage();
		await active.goto(origin + "/another");
		await worker.evaluate(async (tabId) => {
			await chrome.scripting.executeScript({
				target: { tabId },
				func: () => chrome.runtime.sendMessage("open-username-popup"),
			});
		}, id);
		await page.waitForTimeout(150);
		assert.equal(
			(
				await worker.evaluate(() =>
					chrome.runtime.getContexts({ contextTypes: ["POPUP"] }),
				)
			).length,
			0,
		);
		await active.close();
	});
	await test("popup UI selects the focused field and fills using the keyboard", async () => {
		await fixture(
			'<form><h2>Register</h2><label>Username<input id="first"></label><label>Handle<input id="second"></label></form>',
		);
		await page.locator("#second").focus();
		const opened = context.waitForEvent("page", { timeout: 10000 });
		// Load the real popup document without changing the active website tab.
		// Headless browser automation does not expose native toolbar popup windows.
		await worker.evaluate(() =>
			chrome.tabs.create({
				url: chrome.runtime.getURL("popup.html"),
				active: false,
			}),
		);
		const popup = await opened;
		await popup.waitForSelector("#destination:not([disabled])");
		assert.equal(
			await popup.locator("input[name=destination]:checked").inputValue(),
			"1",
		);
		const name = await popup.locator("button.username").first().textContent();
		await popup.locator("button.username").first().focus();
		await popup.keyboard.press("Enter");
		await popup
			.getByRole("status")
			.filter({ hasText: "Username filled." })
			.waitFor();
		assert.equal(await page.locator("#second").inputValue(), name);
		assert.equal(await page.locator("#first").inputValue(), "");
		await popup.close();
	});
	await test("the destination menu retargets the fill and closes on choice", async () => {
		await fixture(
			'<form><h2>Register</h2><label>Username<input id="first"></label><label>Handle<input id="second"></label></form>',
		);
		await page.locator("#second").focus();
		const opened = context.waitForEvent("page", { timeout: 10000 });
		await worker.evaluate(() =>
			chrome.tabs.create({
				url: chrome.runtime.getURL("popup.html"),
				active: false,
			}),
		);
		const popup = await opened;
		await popup.waitForSelector("#destination:not([disabled])");
		await popup.locator("#destination").click();
		assert.deepEqual(await popup.locator("#destoptions label").allTextContents(), [
			"Copy to clipboard",
			"Fill: Username (1)",
			"Fill: Handle (2)",
		]);
		await popup.getByRole("radio", { name: "Fill: Username (1)" }).check();
		await popup.waitForFunction(
			() => !document.querySelector("#destmenu").matches(":popover-open"),
		);
		assert.equal(
			await popup.locator("#destlabel").textContent(),
			"Username (1)",
		);
		const name = await popup.locator("#hero").textContent();
		await popup.locator("#hero").click();
		await popup
			.getByRole("status")
			.filter({ hasText: "Username filled." })
			.waitFor();
		assert.equal(await page.locator("#first").inputValue(), name);
		assert.equal(await page.locator("#second").inputValue(), "");
		await popup.close();
	});
	await test("restricted pages fail cleanly", async () => {
		const restricted = await context.newPage();
		await restricted.goto("chrome://version");
		const id = await worker.evaluate(
			async () =>
				(await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
		);
		assert.equal((await find(id)).status, "unavailable");
		await restricted.close();
	});
	assert.deepEqual(errors, []);
	console.log(
		`${passed} browser tests passed (${context.browser().version()}).`,
	);
} finally {
	await context?.close();
	await new Promise((resolve) => server.close(resolve));
	await rm(profile, { recursive: true, force: true });
}
