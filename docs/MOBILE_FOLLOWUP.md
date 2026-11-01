# Mobile follow-up — sequential completion

1. Complete: suppress Android tap/text selection in touch UI while preserving editable text selection. Add a 10% grid to HUD preview. Both phone/tablet HUD browser tests pass.
2. Complete: compact game voice button; camera code/styles unchanged. Three Gartic camera browser tests pass.
3. Complete: add verified session participants from Contacts or Village, save local nicknames, preserve them on card import and use them in friend pickers. Storage/i18n tests and real-server browser flow pass.
4. Complete: drag floor/room doors in decoration, including corridors; validated positions persist and interaction follows the moved doorway. Unit and drag/reload/enter browser tests pass. Protocol 4 adds door metadata.
5. Complete: approval-list cache includes workspace requests. Clear waiting notifications on approval, cancellation, owner disconnect and deleted targets; do not clear unrelated notices. Focused coordinator tests pass.
6. Complete: phone portrait screen above its control deck. Editor orientation selector stages and saves both layouts independently; previews preserve aspect ratio. Phone/tablet browser checks pass.
7. Complete: mobile WhatsApp button shares public JSON only. Native Android uses a registered FileProvider plugin and read-only URI; browser uses file sharing or a JSON download fallback. Browser share/cancel/fallback tests pass; native compilation and real-device WhatsApp checks are tracked below.
8. Complete: board has a dedicated fixed mobile back button outside customizable HUD widgets. Portrait/landscape browser checks pass even with location hidden. Native Android share code compiles. Actual WhatsApp recipient selection still needs an installed-device check.

Every UI addition must have Spanish and English translations. Keep source edits separate from browser tests to avoid Vite HMR reloads.


## Final verification and delivery

- `npm run check`: 168 app tests, 18 server tests, TypeScript, 1,910 ES/EN messages, app build and server build pass.
- 13 final affected browser checks pass (HUD orientations/Game Boy bounds, share/cancel/fallback, draggable doors/reload/entry, mobile board back, real-server contacts/nicknames/restart and room persistence). Three focused Gartic voice/camera checks also pass; camera implementation/styles remain untouched.
- Native Android Java compilation and APK assembly pass. Every bundled web asset matches the current production output; the native ContactShare class is included; APK signature verifies and matches the previous build.
- Delivery: `deliverables/android-0.3.2/StudyVillage-0.3.2-mobile-update.apk`, with SHA-256 sidecar. Rebuild/restart the server for protocol **4** before connecting this APK.
- Still needs a physical-device check: choosing a WhatsApp recipient and sending the attached JSON. Browser file sharing, user cancellation and download fallback were tested. The APK uses a temporary cache file with a read-only FileProvider grant; public projection excludes private keys and local nicknames.
