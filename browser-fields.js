// Owns browser calls and translates their failures for the popup/background.
export async function findFields(tabId) {
	try {
		const frames = await chrome.scripting.executeScript({
			target: { tabId, allFrames: true },
			func: () => globalThis.usernameRollerFields?.candidates() || null,
		});
		return {
			status: frames.some(({ result }) => result != null)
				? "ready"
				: "unavailable",
			fields: frames.flatMap(({ frameId, result }) =>
				result
					? result.items.map((item) => ({
							...item,
							frameId,
							documentKey: result.documentKey,
						}))
					: [],
			),
		};
	} catch {
		return { status: "unavailable", fields: [] };
	}
}

export async function fillField(tabId, target, value) {
	try {
		const [execution] = await chrome.scripting.executeScript({
			target: { tabId, frameIds: [target.frameId] },
			func: (key, id, name) =>
				globalThis.usernameRollerFields?.fillTarget(key, id, name) || {
					status: "unavailable",
				},
			args: [target.documentKey, target.id, value],
		});
		return execution?.result || { status: "unavailable" };
	} catch {
		return { status: "unavailable" };
	}
}

export async function fillContextField(tabId, frameId, value) {
	try {
		const [execution] = await chrome.scripting.executeScript({
			target: { tabId, frameIds: [frameId] },
			func: (name) =>
				globalThis.usernameRollerFields?.fillContext(name) || {
					status: "unavailable",
				},
			args: [value],
		});
		return execution?.result || { status: "unavailable" };
	} catch {
		return { status: "unavailable" };
	}
}

export const fillMessages = Object.freeze({
	filled: "Username filled.",
	invalid: "This username could not be used.",
	stale: "The field changed. Reopen the popup or right-click the field again.",
	ineligible:
		"This field is excluded. Choose a username field outside a login form.",
	constraints:
		"This username does not fit the field's requirements. Try another or copy and edit it.",
	rejected: "The page did not keep the username. Try copying and pasting it.",
	unavailable:
		"This page is unavailable. Refresh a normal web page and try again, or copy a username.",
});
