import { fillField, fillMessages, findFields } from "./browser-fields.js";
import { randomUsername } from "./generator.js";

const names = document.getElementById("names");
const hero = document.getElementById("hero");
const alts = document.getElementById("alts");
const trigger = document.getElementById("destination");
const destLabel = document.getElementById("destlabel");
const menu = document.getElementById("destmenu");
const choiceList = document.getElementById("destoptions");
const message = document.getElementById("status");
let fields = [];
let selected = ""; // "" is the clipboard, otherwise an index into fields
let tabId;
let busy = false;

function render() {
	hero.textContent = randomUsername();
	alts.replaceChildren(
		...Array.from({ length: 4 }, () => {
			const li = document.createElement("li");
			const button = document.createElement("button");
			button.className = "username";
			button.textContent = randomUsername();
			li.append(button);
			return li;
		}),
	);
}

/** Page-derived labels stay text nodes: they are never parsed as markup. */
function destinationChoices() {
	return [
		{ value: "", short: "clipboard", label: "Copy to clipboard" },
		...fields.map((field, index) => {
			const suffix = fields.length > 1 ? ` (${index + 1})` : "";
			return {
				value: String(index),
				short: `${field.label}${suffix}`,
				label: `${field.hasValue ? "Replace" : "Fill"}: ${field.label}${suffix}`,
			};
		}),
	];
}

function syncTriggerLabel() {
	destLabel.textContent = destinationChoices().find(
		(choice) => choice.value === selected,
	).short;
}

function renderDestinations() {
	const choices = destinationChoices();
	if (!choices.some((choice) => choice.value === selected)) selected = "";
	choiceList.replaceChildren(
		...choices.map((choice) => {
			const label = document.createElement("label");
			const input = document.createElement("input");
			input.type = "radio";
			input.name = "destination";
			input.value = choice.value;
			input.checked = choice.value === selected;
			label.append(input, choice.label);
			return label;
		}),
	);
	syncTriggerLabel();
}

async function refreshFields() {
	const result = await findFields(tabId);
	fields = result.fields;
	const focused = fields.reduce(
		(best, field) =>
			field.focused && (best === null || field.focusedAt > best.focusedAt)
				? field
				: best,
		null,
	);
	const target = focused || (fields.length === 1 ? fields[0] : null);
	selected = target === null ? "" : String(fields.indexOf(target));
	renderDestinations();
	if (result.status === "unavailable")
		message.textContent = fillMessages.unavailable;
	else if (fields.length === 0)
		message.textContent =
			"No matching username field. Copy a name, or right-click the field and choose Generate username here.";
	else if (target === null)
		message.textContent =
			"Several username fields found. Choose a destination, then select a name.";
	else message.textContent = "Select a name to fill the chosen field.";
	trigger.disabled = false;
}

// Leave the radios in place: rebuilding them here would drop keyboard focus.
choiceList.addEventListener("change", (event) => {
	selected = event.target.value;
	syncTriggerLabel();
	menu.hidePopover();
});

names.addEventListener("click", async (event) => {
	const button = event.target.closest("button.username");
	if (!button || busy) return;
	busy = true;
	names.inert = true;
	try {
		const field = selected === "" ? null : fields[Number(selected)];
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
		names.inert = false;
	}
});

document.getElementById("reroll").addEventListener("click", render);
render();
renderDestinations();
names.inert = true;
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
	trigger.disabled = false;
} finally {
	names.inert = false;
}
