import { fillContextField, fillMessages } from "./browser-fields.js";
import { randomUsername } from "./generator.js";

async function openPopupForTab({ id, windowId }) {
	try {
		if (typeof chrome.action.openPopup !== "function") return;
		const [tab, window] = await Promise.all([
			chrome.tabs.get(id),
			chrome.windows.get(windowId),
		]);
		// A delayed message from another tab must not open UI in the current one.
		if (!tab.active || !window.focused) return;
		await chrome.action.openPopup({ windowId });
	} catch {
		// Manual opening remains available if the browser cannot open it for us.
	}
}

chrome.runtime.onMessage.addListener((message, sender) => {
	if (
		message !== "open-username-popup" ||
		sender.id !== chrome.runtime.id ||
		!Number.isInteger(sender.tab?.id)
	)
		return;
	void openPopupForTab(sender.tab);
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: "generate-username",
			title: "Generate username here",
			contexts: ["editable"],
			documentUrlPatterns: ["http://*/*", "https://*/*"],
		});
	});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId !== "generate-username" || !Number.isInteger(tab?.id))
		return;
	const result = await fillContextField(
		tab.id,
		info.frameId ?? 0,
		randomUsername(),
	);
	try {
		await chrome.action.setBadgeText({
			tabId: tab.id,
			text: result.status === "filled" ? "" : "!",
		});
		await chrome.action.setTitle({
			tabId: tab.id,
			title: fillMessages[result.status] || fillMessages.unavailable,
		});
	} catch {
		// The tab may have closed while the operation was running.
	}
});
