# Requested improvements — sequential progress

Implement the approved conversation plan one task at a time, verifying each before continuing. Every UI addition requires Spanish and English translations. Work is local; no deployment or release requested.

1. Eraser modes and sizes — complete. Typecheck, 23 focused unit tests, 3 existing device browser checks, and new partial-erasure/undo/redo/persistence browser test pass.
2. Voice channels — complete. Full app/server tests pass; 24 peer-host network tests include party travel/isolation. Server socket coverage verifies calls/parties across neighborhoods. Two-browser party consent and existing server persistence/board flows pass. Protocol 2; server-wide voice media context is independent of neighborhood signing scope.
3. Visible streetlights — complete. Shared fixture/source/collision definitions; visible bulbs and ground pools in all areas; moved fixtures away from entrances and furniture. Typecheck, 13 world/mobile tests and 3 browser loading/motion checks pass. Night render inspected.
4. House lobbies, three floors total, ten full project rooms per floor — complete. Separate owner-approved floor/room entry and scoped data/boards/media. Durable server workspaces and local owner copies; room-specific shared notes/materials/projects/tasks, furniture/colors/images/theme and decoration history. Public metadata contains only room names/structure. Full check passes (154 app + 16 server tests); private-board P2P and server restart/forged movement checks pass; browser room separation/persistence and decoration checks pass. Fixed delayed settings-close events clearing new movement keys; cross-neighborhood browser test passes twice consecutively.
5. Phone/iPad controls and HUD editor — complete. Smaller defaults; fixed top-right mobile menu; drag/size/color/show-hide editor with save/cancel/reset and separate device/orientation profiles. Held input released on layout changes. 20 focused unit tests, phone/tablet persistence/orientation/bounds browser tests and 8 existing settings/control browser tests pass; final screenshots inspected.
6. Mobile screen sharing capability handling — complete. Capability-based buttons, mobile constraints, retryable denial vs unsupported, inline playback activation and iOS/CSS fullscreen fallbacks. 17 media/i18n tests and unsupported-mobile browser check pass. Physical device capture remains unverified.
7. Headphone colors — complete. Preview/save/discard, legacy orange default, schema-backed persistence and existing appearance synchronization. 12 wardrobe/i18n tests and 2 wardrobe browser tests pass, including saved headphone color.
8. Directional avatar bodies — complete. Profile torsos, clothing, jackets, arms and directional feet retain existing walk timing. Four-direction/outfit contact sheet inspected; typecheck and 12 wardrobe/redesign tests pass.
9. Smaller interaction radius — complete. Shared 20-unit reach for house exits/entrances, world portals, furniture, stations and room/floor entrances. Double taps approach before activating; single taps still do not auto-open. 13 model/boundary tests and 10 settings/wardrobe browser tests pass.
10. Upright furniture facings — complete. Built-in directional views preserve upright monitors, legs, shelves, labels and hitboxes. Custom single images mirror horizontally for opposite facings; symmetrical plants reuse artwork. Wall items can face other directions. Four-facing contact sheet inspected.

Decisions: exclusive voice channel; invite-and-accept parties; private channels survive travel; screens use selected channel; switching channels stops capture. Lobby follows house access setting. Ground-floor lobby plus gated corridor; three floors total. Each floor and room needs approval on every entry; location voice is isolated by room/corridor/lobby. Full workspaces separate shared content, never automatically publish personal files. Mobile menu fixed top right, other HUD/controls customizable. Precision eraser cuts drawings/shapes, leaves text editable; Small/Medium/Large sizes.

## Final verification

- `npm run check`: both TypeScript projects, 160 app tests, 17 server tests, 1,869 Spanish/English catalogue entries, production app build and server bundle pass.
- 25 affected browser checks pass across whiteboards/erasers, phone and tablet editor, unsupported capture, language switching, rooms, server, wardrobe, decoration and settings. The server pair was rerun after adding automatic public-layout creation on first private-space entry.
- Visual checks: mobile layouts, night lamps, avatar directions/outfits, and four furniture facings.
- Room and floor entry is separately approved on each visit. Requests expire on departure/disconnection; deleted spaces relocate occupants. Forged movement cannot enter a room or transfer private access between houses with identical room IDs.
- Server protocol is now 2. Restart/update the server and clients together; older clients receive the existing translated version-mismatch error. No deployment, installer, or commit was made.
- Physical phone/iPad capture, microphones and real-device WebRTC remain unverified. Tests use browser automation and fake media where applicable; unsupported capture buttons are hidden.

## Where to find the changes

- Whiteboard → More / Más → Stroke and editing / Trazo y edición: eraser mode and size. Precision cuts ink and shape outlines; typed text uses the stroke eraser.
- Menu → Voice / Voz: location, direct calls, invite-only parties, and game channels.
- Menu → Rooms / Habitaciones: floors and project rooms. Inside a room, Projects / Proyectos, Study / Estudio, and the study table open its shared workspace tabs. The existing house content remains in the lobby.
- Phone/iPad menu → Edit controls / Editar controles: customize the HUD; the menu stays fixed at the top right.
- Wardrobe → Appearance / Aspecto: headphone color.
- Decoration → Rotate / Girar: upright front/right/back/left views.

Shared room content is deliberately bounded to 40 KB per document to stay inside existing transport limits; private furniture images are included in that budget. Personal local files and personal notes are never implicitly published.


## Follow-up: friend access and smoother floor/room creation

Completed 2026-11-01. The room manager uses responsive cards, softer buttons, editable floor/room titles, consistent touch targets, inline save feedback and separate expandable friend selectors for the lobby and each room. Owners choose from saved contacts; previously authorized identities remain removable even on another device without those contacts. Maximum 24 unique identities per list; existing houses without lists retain their previous behavior.

The house list grants lobby entry, including a closed house. A room list grants that room plus passage through its lobby/floor; it does not open other private rooms. Unlisted visitors still need separate approvals. Both peer hosts and the durable server enforce the same rules. Removing an automatic room authorization stops private reads and relocates that visitor without undoing separately approved manual access.

Explicit layout saves await a committed server ACK and create the durable public house layout even before the separate house/board import operation. Permission lists persist in the signed house JSON in SQLite, so no destructive table migration is required. Reconnection, decoration and subsequent local imports preserve server permission metadata. Conflicts on explicit permission edits ask the owner to review the current server layout. The protocol is now **3**; update/restart server and clients together.

Validation: 165 app tests and 18 server tests, TypeScript, 1,888 ES/EN messages and production app/server builds pass. Seven affected browser tests pass, including local room contents, independent house/room lists on phone/tablet/desktop, and real-server phone configuration followed by server restart and room entry with the owner disconnected. Socket tests also cover a same-name outsider, house-only versus room-only rights, board isolation and revocation. Visual screenshots inspected at 390, 820 and 1440 px widths. No deployment or commit was made.
