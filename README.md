# Username Roller

A browser extension that generates usernames for registration forms.

## Install

In a browser that supports Chrome Manifest V3 extensions, open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select this folder. Reload the extension and refresh open pages after updates.

## Use

Click an empty username field to open the generator, or open it from the toolbar.
The popup suggests one username with four alternates below it; choose one, or
**Roll again** for a fresh set. The **sending to** menu at the top picks which
field receives it, or copies it to the clipboard instead. You can also
right-click an input and choose **Generate username here**.

## Development

Use Node.js and pnpm as specified in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
```

`pnpm test:unit` and `pnpm test:browser` run the suites separately.
There is no build step.

The icons in `icons/` are committed PNGs. Regenerate them after editing a
source SVG (`icon.svg` covers 48 and 128; `icon-16.svg` is hinted separately
for 16):

```sh
rsvg-convert -w 16 -h 16 icons/icon-16.svg -o icons/icon-16.png
rsvg-convert -w 48 -h 48 icons/icon.svg -o icons/icon-48.png
rsvg-convert -w 128 -h 128 icons/icon.svg -o icons/icon-128.png
```

## Releases

The [GitHub Releases](https://github.com/zanellig/username-gen/releases) page
contains the generated changelog. To release, update the version in
`manifest.json` and `package.json`, then push a matching `vX.Y.Z` tag. The workflow
checks the versions and runs the tests before publishing the release notes.

## License

[MIT](LICENSE)
