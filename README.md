# Username Roller

A browser extension that generates usernames for registration forms.

## Install

In a browser that supports Chrome Manifest V3 extensions, open
`chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select this folder. Reload the extension and refresh open pages after updates.

## Use

Click an empty username field to open the generator, or open it from the toolbar.
Select a username to fill the chosen field or copy it. You can also right-click
an input and choose **Generate username here**.

## Development

Use Node.js and pnpm as specified in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
```

`pnpm test:unit` and `pnpm test:browser` run the suites separately.
There is no build step.

## Releases

The [GitHub Releases](https://github.com/zanellig/username-gen/releases) page
contains the generated changelog. To release, update the version in
`manifest.json` and `package.json`, then push a matching `vX.Y.Z` tag. The workflow
checks the versions and runs the tests before publishing the release notes.

## License

[MIT](LICENSE)
