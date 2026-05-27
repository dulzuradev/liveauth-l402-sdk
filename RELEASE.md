# Release Checklist

Use this checklist for publishing `@liveauth-labs/l402-sdk`.

## First 0.1.0 Publish

1. Confirm `package.json` is at `0.1.0` and the changelog has a matching entry.
2. Run `npm ci`.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm pack --dry-run` and confirm the tarball contains only `dist`, examples, README, changelog, release notes, license, and package metadata.
6. Run `npm publish --dry-run`.
7. Create the release tag: `git tag v0.1.0`.
8. Push the release commit and tag: `git push origin main --tags`.
9. Publish publicly: `npm publish --access public`.

## Future Releases

1. Update `CHANGELOG.md`.
2. Run `npm version patch`, `npm version minor`, or `npm version major`.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm publish --dry-run`.
6. Push the version commit and tag: `git push origin main --tags`.
7. Publish: `npm publish --access public`.

## Optional Local Smoke

With a local LiveAuth backend running:

```sh
LIVEAUTH_API_URL=http://127.0.0.1:5167 LIVEAUTH_PUBLIC_KEY=la_pk_smoke npm run smoke:local
```
