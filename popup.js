const ADJECTIVES = [
  "Amber", "Brisk", "Calm", "Clever", "Cosmic", "Crimson", "Curious", "Dapper",
  "Eager", "Electric", "Fuzzy", "Gentle", "Glossy", "Golden", "Happy", "Hidden",
  "Humble", "Idle", "Jolly", "Lucky", "Merry", "Mellow", "Nimble", "Noble",
  "Polar", "Quiet", "Rapid", "Rustic", "Silent", "Silver", "Sleepy", "Smooth",
  "Solar", "Spry", "Sunny", "Swift", "Tidy", "Velvet", "Wander", "Zesty",
];

const NOUNS = [
  "Alpaca", "Anchor", "Badger", "Basil", "Beacon", "Bison", "Canyon", "Cedar",
  "Comet", "Coral", "Dune", "Ember", "Falcon", "Ferret", "Fjord", "Gecko",
  "Harbor", "Heron", "Iris", "Jaguar", "Kestrel", "Lantern", "Lemur", "Lynx",
  "Maple", "Marlin", "Meadow", "Nebula", "Otter", "Pebble", "Quartz", "Raven",
  "Salmon", "Sparrow", "Tundra", "Vulture", "Walrus", "Willow", "Yarrow", "Zebra",
];

// ponytail: modulo bias over 2^32 is ~1e-8 for these list sizes; rejection
// sampling if this ever generates secrets instead of usernames.
const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const pick = (list) => list[rand(list.length)];

/** Alphanumeric only — the format every registration form accepts. */
export const randomUsername = () =>
  pick(ADJECTIVES) + pick(NOUNS) + (1000 + rand(9000));

const COUNT = 5;

function render(list) {
  list.replaceChildren(
    ...Array.from({ length: COUNT }, () => {
      const li = document.createElement("li");
      li.textContent = randomUsername();
      li.tabIndex = 0;
      return li;
    }),
  );
}

async function copy(li) {
  await navigator.clipboard.writeText(li.textContent);
  li.dataset.copied = "";
  setTimeout(() => delete li.dataset.copied, 900);
}

// ponytail: optional chaining so `node test.js` can import the generator.
globalThis.document?.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("list");
  render(list);
  document.getElementById("reroll").addEventListener("click", () => render(list));
  list.addEventListener("click", (e) => e.target.matches("li") && copy(e.target));
  list.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && e.target.matches("li") && copy(e.target),
  );
});
