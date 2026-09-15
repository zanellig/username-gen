import { fillField, fillMessages, findFields } from "./browser-fields.js";
import { randomUsername } from "./generator.js";

const list = document.getElementById("list");
const destination = document.getElementById("destination");
const message = document.getElementById("status");
let fields = [];
let tabId;
let busy = false;

function render() {
	list.replaceChildren(
		...Array.from({ length: 5 }, () => {
			const li = document.createElement("li");
			const button = document.createElement("button");
			button.className = "username";
			button.textContent = randomUsername();
			li.append(button);
			return li;
		}),
	);
}

async function refreshFields() {
	const result = await findFields(tabId);
	fields = result.fields;
	destination.replaceChildren(
		new Option("Copy to clipboard", ""),
		...fields.map(
			(field, index) =>
				new Option(
					`${field.hasValue ? "Replace" : "Fill"}: ${field.label}${fields.length > 1 ? ` (${index + 1})` : ""}`,
					String(index),
				),
		),
	);
	const focused = fields.reduce(
		(best, field) =>
			field.focused && (best === null || field.focusedAt > best.focusedAt)
				? field
				: best,
		null,
	);
	const selected = focused || (fields.length === 1 ? fields[0] : null);
	if (selected) destination.value = String(fields.indexOf(selected));
	if (result.status === "unavailable")
		message.textContent = fillMessages.unavailable;
	else if (fields.length === 0)
		message.textContent =
			"No matching username field. Copy a name, or right-click the field and choose Generate username here.";
	else if (selected === null)
		message.textContent =
			"Several username fields found. Choose a destination, then select a name.";
	else message.textContent = "Select a name to fill the chosen field.";
	destination.disabled = false;
}

list.addEventListener("click", async (event) => {
	const button = event.target.closest("button.username");
	if (!button || busy) return;
	busy = true;
	list.inert = true;
	try {
		const field =
			destination.value === "" ? null : fields[Number(destination.value)];
		if (field) {
			const result = await fillField(tabId, field, button.textContent);
			await refreshFields();
			message.textContent =
				fillMessages[result.status] || fillMessages.unavailable;
		} else {
			await navigator.clipboard.writeText(button.textContent);
			message.textContent = "Username copied.";
		}
	} catch {
		message.textContent =
			"Could not copy the username. Select the text and copy it manually.";
	} finally {
		busy = false;
		list.inert = false;
	}
});

document.getElementById("reroll").addEventListener("click", render);
render();
list.inert = true;
try {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	tabId = tab?.id;
	const title = await chrome.action.getTitle({ tabId });
	await chrome.action.setBadgeText({ tabId, text: "" });
	await chrome.action.setTitle({ tabId, title: "Roll a username" });
	await refreshFields();
	if (
		Object.values(fillMessages).includes(title) &&
		title !== fillMessages.filled
	)
		message.textContent = title;
} catch {
	message.textContent = fillMessages.unavailable;
	destination.disabled = false;
} finally {
	list.inert = false;
}
