# Account & profile

Customer account frontend based on Figma section `2559:10527`.

## Pages

- `/account/my-profile` → `my profile.tsx`
- **Edit profile** toggles the `edit profile.tsx` component inside My Profile. Save and Cancel return to the details card without changing `/account/my-profile`. Draft name, phone, and photo changes are discarded on Cancel.

Routes use the existing authenticated layout. `AccountProvider` keeps example data in memory across these routes. Refreshing resets all changes; this is a frontend prototype, not a persisted profile. No real email is sent or updated.

`components/` contains the native-dialog shell, upload photo, remove photo, remove passenger, change email, passenger form, avatar and passenger list. Dialogs trap focus through the native modal API, restore focus on close, and support Escape and backdrop clicks.

The upload dialog reads JPG/PNG files locally (maximum 5 MB); it does not upload to a server. Add/edit/remove passengers and profile edits update only the prototype state. Email code entry and resend remain disconnected until the existing Clerk integration is wired in. The passenger add/edit dialog follows Figma frame `2557:16248`: relationship, passport names, optional local names, birth date, gender, nationality, and optional passport number. Birth date, gender, and nationality are read-only when editing an existing saved passenger.

The navigation/header belongs to Feature 1 and is left for the shared customer navigation. These pages reserve the Figma header space without introducing another navigation system.

Background: user-supplied local aurora image. Icons: Figma exports, kept at their original 16/18 px dimensions. Inter fonts are bundled locally with their license.
