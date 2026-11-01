StudyVillage — Windows installer

Send the StudyVillage .exe in this folder to the recipient. They do not need
Node, Rust, npm, or the source code to install it.

This build includes the settings dialog, local avatar PNG sheet, sound and
weather preferences, walking access to world stations, and up to 4K screen
capture requests. Actual capture quality depends on the device and connection.

The installer is unsigned. A production signing certificate is not configured.
Windows runtime and actual capture on Windows have not been tested here.

Multiplayer still uses a browser/client host and PeerJS signaling. A permanent
self-hosted world server is not implemented in this build. Closing the host
can end the session.

Build source: branch build/windows-settings-20261031, commit 41cefc6.
Build job: https://github.com/Javpato/HACKATHON/actions/runs/41229534667
