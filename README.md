# Qattaar

Qattaar, a browser game offering Balochi Qattaar and Classic Nine Men's Morris, with local two-player play, three AI difficulties, and private online rooms.

[Play Qattaar](https://qattaar.web.app)

## Run locally

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Local games and AI work immediately without Firebase. Games save automatically on this device. The production build caches its assets after the first successful visit so local play and AI can work without an internet connection.

The board uses White and Black pieces on a sand-colored surface. On phones it fills the available width, with compact player and game controls above it. During the movement phase, drag a piece onto a legal empty point, or tap the piece and then its destination. Mouse, pen, and touch use Pointer Events; keyboard players can use Tab and Enter. Invalid drops keep the original position. Dragging is disabled during placement, capture, the opponent's turn, and finished games. Scroll and pinch zoom remain available away from movable pieces.

Choose **Balochi** or **Classic** under Game rules. Balochi is the default and always requires adjacent moves. Classic allows flying to any empty point with exactly three pieces remaining. The choice applies to AI and pass-and-play, saves with the match, and is retained when starting another game. Changing rules during a match asks to start a new game. Online hosts choose before creating the room; guests automatically use the room's rules, which stay locked for the match.

A blue ring marks the opponent's last placement or destination. For movement, a hollow origin marker and dashed arrow show the route. The description below the board names the color and coordinates and includes any capture from the same turn. The opponent's markers remain after your own move until the opponent moves again. In pass-and-play, markers follow the opponent of the player whose turn it is. Replaying a saved game, undoing, and reconnecting rebuild these markers from the action history.

A capture marks the removed piece's location with a crossed-out piece and a −1 badge for 1.8 seconds. The turn message identifies whose piece was taken and where, the affected player card highlights, and the last-capture message remains below the board. Input pauses while the capture is shown; AI waits after a capture and briefly shows a new mill before choosing its capture. Reduced-motion settings keep the marker static. Finished games show a large win/loss/draw panel with the reason, Play again, and View board controls.

```sh
npm run check       # lint, rules-engine/protocol tests, TypeScript, production build
npm run preview     # serve the production build
```

For repeatable browser checks of captures, winning captures, blocked-player wins/losses, last-move trails, and three-piece movement in both variants, start the dev server and open `/tests/fixtures/feedback.html`. The fixture uses the real engine, board, capture hook, and result component. It is excluded from the production bundle.

## Enable online rooms with Firebase Spark

1. In the [Firebase console](https://console.firebase.google.com/), create a project named Qattaar. Keep the **Spark** plan. Do not link a Cloud Billing account or upgrade to Blaze. Analytics is optional and not used by this app.
2. Register a **Web app** in Project settings. Select Firebase Hosting if using the deployment instructions below; Vercel is an alternative.
3. Under **Build → Authentication → Sign-in method**, enable **Anonymous** sign-in. Players get a temporary identity without filling out a registration form.
4. Under **Build → Realtime Database**, create a database in your preferred region, starting in **locked mode**. Use Realtime Database, not Firestore.
5. Open its **Rules** tab, paste the contents of [firebase/database.rules.json](firebase/database.rules.json), and publish. Do not use open test-mode rules. Alternatively, run `npx firebase login` followed by `npx firebase deploy --only database --project YOUR_PROJECT_ID`.
6. Copy `.env.example` to `.env.local`, then fill in the five public Web-app settings. Find `databaseURL` on the Realtime Database page if the Web-app config omits it.
7. Restart the dev server. In two independent browser tabs or devices, choose **Play a friend**, create a room, and join using its code or invite link. The host plays White.

These Web-app config values are public identifiers shipped to browsers, not administrator credentials. Access is enforced by Authentication and the database rules. Never put service-account JSON, private keys, or admin credentials in any `VITE_` variable. `.env.local` is ignored by Git.

If Authentication requires authorized domains, add your localhost/deployed domain under Authentication settings. Avoid phone/SMS sign-in or products that require a billing upgrade; this implementation does not need them.

## Test multiplayer without a Firebase account

The included demo configuration only talks to local emulators. It never accesses a real Firebase project. Install Java 21+ for Firebase's emulator tooling.

```sh
# Terminal one
npm run emulators

# Terminal two
npm run dev:emulated
```

Open the printed URL in two independently opened tabs, then create/join a room. If you duplicate a host tab and it inherits the same session identity, open a fresh tab or use a second browser instead. To run automated security-rule tests with a temporary emulator:

```sh
npm run test:rules
```

The emulator may download its runtime on first use. Rule tests verify access control, all 40 reservation slots, expired reservations, guest contention, turn ownership, and append-only move history. To change the rules, edit `scripts/generate-rules.mjs`, run `node scripts/generate-rules.mjs`, then rerun the tests. Commit both the generator and generated rules.

## Deploy on Firebase Hosting

Use **Firebase Hosting** for the static game. This setup works on Spark and does not use Firebase App Hosting, Cloud Functions, or a server runtime. Authentication and Realtime Database remain in the same Firebase project.

1. Complete the Firebase setup above, including enabling Anonymous sign-in. Put your five public Web-app settings in `.env.local`. Leave `VITE_USE_FIREBASE_EMULATORS` unset for production. Analytics, Storage, and Messaging config fields are not used by this app.
2. The checked-in `.firebaserc` selects the `qattaar` project. If using another project, change that default or pass `--project YOUR_PROJECT_ID` to the commands below. Hosting's default site is used.
3. In this repository's terminal, sign in using `npx firebase login`. Use the Google account that owns the Firebase project. Do not paste login tokens or private credentials into chat or source files.
4. Run `npm run deploy:firebase`. This publishes **both** the website and the database security rules. The Hosting predeploy hook runs `npm run build` first, using `.env.local`, so the Firebase config is included in the production build. No `firebase init` step is needed for this repository.
5. Open the Hosting URL printed by the CLI (normally `https://qattaar.web.app`) on two devices, create a room, and join it. Try each rule variant and confirm that moves sync. Verify that invite links work when opened directly and that AI/local play works after a reload.

For an explicit project override, use `npm run deploy:firebase -- --project YOUR_PROJECT_ID`. For website-only updates, use `npx firebase deploy --only hosting`; this also rebuilds the website. Use `npm run check` before publishing code changes. Future deploys need the local Firebase configuration too; it is intentionally absent from Git.

`firebase.json` serves only `dist/`, rewrites client-side paths to `index.html`, preserves the security headers used on Vercel, caches hashed assets for one year, and requires revalidation of the HTML and service-worker script. The built game does not initialize Google Analytics.

Keep the project on **Spark** with no linked billing account. Hosting and Realtime Database have separate quotas. Hosting quota exhaustion can interrupt the website or block new releases; it does not enable paid overages on Spark. See [Firebase Hosting quota behavior](https://firebase.google.com/docs/hosting/usage-quotas-pricing).

## Deploy on Vercel (alternative)

1. Import [BehrozKarim/qattaar](https://github.com/BehrozKarim/qattaar) into Vercel.
2. Use the **Vite** preset. Build command: `npm run build`. Output directory: `dist`. These settings are also in `vercel.json`.
3. Add the five variables from `.env.example` in Vercel's environment settings if online play should be enabled. Do not set `VITE_USE_FIREBASE_EMULATORS` in Vercel.
4. Deploy. If variables change later, redeploy: Vite substitutes them at build time.

The deployment contains static assets only, with no Vercel Functions. Vercel's Hobby plan is for personal, non-commercial use; review the applicable hosting terms before commercializing the game.

## Capacity and operating costs

- Firebase is initialized only when entering online play; AI and local games do not use a database connection. Leaving online play explicitly disconnects the client.
- There are **40 server-enforced room reservation slots**, accommodating up to 80 seated players. A waiting room reserves the invited player's seat too. Joining/reconnecting clients can temporarily use additional connections.
- Only an owner or an expired lease can modify a reservation. Other players cannot list occupied reservation details. Competing reservations and guest joins use transactions.
- Hosts renew reservations every 30 seconds, with a two-minute expiry. Abandoned reservations can then be reused. Browser suspension can cause expiry; the app reports that the room must be recreated. Firebase presence detects disconnections, which may take time.
- Rooms last at most two hours. The next creator reclaiming a reservation removes its old room; closing a room as its host removes it immediately. There are at most 40 normally retained rooms. One abandoned room can remain per slot until reclamation, without a paid cleanup service.
- Moves are capped at 2,000 actions per room. Clients listen only to their room, not to a global lobby. History is bounded, but replay/download usage grows over a match.
- Spark's **100 concurrent Realtime Database connections** are the hard fallback. Firebase rejects additional connections while existing users remain connected. The app's room cap controls seats, not every incoming connection, so connection failures are handled separately.
- Connection limits do not cap total monthly downloads/storage. Those quotas can still be exhausted. On Spark the result is restricted/unavailable online play, not automatic usage billing. Keep the project on Spark without linked billing.

See [Firebase plan behavior](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) and [Realtime Database limit handling](https://firebase.google.com/docs/database/faq-and-troubleshooting). Hosting quotas are separate.

## Rules and architecture

Both variants use placement, one capture per formed mill, and protected mills. Balochi Qattaar requires **adjacent movement even with only three pieces**. Classic Nine Men's Morris allows flying to any empty point with exactly three pieces; otherwise moves stay adjacent. After placement, a player loses when they have fewer than three pieces or cannot make any legal move under the selected rules. A position repeated three times, or 50 full moves without a capture after placement, is a draw. The in-game rules describe the selected variant.

`src/game/ruleset.json` identifies the supported rule versions, mapped to variants in `src/game/variants.ts`. Each room carries its host's selected ruleset; clients reject unsupported versions. Publish the updated Firebase database rules as well as the frontend when adding Classic rooms. Existing `balochi-v1` rooms and saved games remain compatible. Local saved action histories replay under their saved variant; an incompatible history is backed up under `qattaar.game.legacy-rules` in local storage and a new game starts with an explanation.

```text
src/game/          Pure board topology, rules, and AI search; no React or Firebase
src/hooks/         Local persistence and worker lifecycle
src/components/    Board, player information, accessible modal
src/multiplayer/   Provider-independent session contract and Firebase adapter
firebase/          Deployable security rules
scripts/           Rule generation and production offline-cache generation
tests/             Firebase emulator security tests
```

The UI consumes the same action model for every mode. AI uses budgeted iterative-deepening minimax with alpha-beta pruning in a Web Worker, with increasing search depth/time and intentional mistakes on Easy. No language-model API is used.

Online actions are append-only, turn-authorized, and revision-checked. Both clients replay the history through the pure rules engine and reject invalid moves or turn manipulation. **The database rules do not fully evaluate Morris move legality.** A modified client can spoil its own casual match; there are no rankings or competitive integrity guarantees. Authoritative validation would need additional trusted logic. Room codes are invitations, not passwords for confidential data.

## Contributing

Use Conventional Commits, for example `feat(game): add a rule variant`, `fix(multiplayer): handle expired reservations`, or `test(game): cover repeated positions`. Keep rules, presentation, and transport responsibilities separate; reuse the rules engine instead of duplicating move logic in the UI. Run `npm run check` and, for multiplayer/rule changes, `npm run test:rules` before pushing.

CI runs the same checks on pushes and pull requests. Build tooling can have upstream development-only audit advisories; review `npm audit` when updating it. Production dependencies are checked separately with `npm audit --omit=dev`.
