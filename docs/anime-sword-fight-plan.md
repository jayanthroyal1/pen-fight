# Anime Sword Fight: decisions and build plan

Follows `WildPlayers_3D_Anime_Sword_Fighting_Development_Handbook.pdf`. Where this file and the handbook differ, this file is the decision.

## Decisions

| Area | Decision |
|---|---|
| Engine | Babylon.js + Havok, for this game only. The rest of the platform stays on Three.js + Rapier. |
| Characters | Free ready-made models from different makers, auto-rigged and animated through Mixamo by Jayanth. |
| Licences | Friends-only for now. Record every model's source and licence anyway, in case it goes public. |
| Protected characters | Goku, Naruto, Luffy and Ichigo are not built. Four original heroes take their place. |
| Roster | 4 original heroes + Kaelis, Ryujin and Zarok, after the originality review the handbook asks for. |
| View | Third-person 3D arena with a lock-on camera. |
| Match | 1 vs 1 duels. Bosses use phases, not helpers. |
| Story | Rewritten in three acts around Zarok, Ryujin and Kaelis, with lesser foes between. |
| Scope | The whole game is upgraded together, and released only when approved. |
| Old game | The stick man game stays live until the new one is approved on a real phone. |
| Target phone | Mid-range Android at 30 FPS, 60 on better phones. First download about 15 to 25 MB. |
| Effects | Anime sparks and energy by default. Stylised blood is a setting, off to start. |
| Controls | Left joystick. Right: Light, Heavy, Guard (tap to parry), Dodge. Powers in a small row. No jump button. Automatic lock-on. |
| Stamina | Dodge and Heavy cost stamina. Light attacks are free. |

## Known risks

- Mixed free models may clash in style, and animations may slide or clip until fixed per fighter.
- Seven different models are heavier than one shared body, which works against the download and phone targets.
- Few free models are truly anime. Toon shading and outlines will carry much of the look.
- Babylon.js and Havok add a large download for this one game, so it must load only when the game opens.
- Touch play in a 3D arena needs testing on a real phone early, before the art is finished.

## Build order

Everything ships together, but it is proven in this order, so problems show up early.

1. Add Babylon.js and Havok in their own loaded-on-demand chunk, with one arena and a placeholder fighter (handbook M0).
2. Find free models, and write the shortlist with sources and licences for Mixamo.
3. Port the combat to attack data: startup, active and recovery windows, swept blade checks, the handbook's hit order, dodge with invulnerability, clashes and stamina (M2).
4. Lock-on camera, joystick controls and the character controller, then test on a phone (M3).
5. Load the first Mixamo fighter, with toon shading and outlines (M1).
6. Villain AI for Zarok, Ryujin and Kaelis, sharing the player's rules (M4).
7. All seven fighters, the three-act story and the choosing screen (M5).
8. Effects, intros and finishers (M6).
9. Quality tiers and device testing, then replace the stick man game once approved (M7).

## Progress

Open the build at `#/play/blade-rift`. It isn't listed anywhere in the app yet.

- Done: steps 1, 3, 4 and 6 in first form, and the story and hero choice from step 7, on placeholder fighters. Working title: Blade of the Rift.
- Engine download: about 3.7 MB before compression, loaded only when the game opens.
- Done: real Mixamo fighters and clips, converted with `node scripts/convert-fighters.mjs`. All 7 fighters and 15 clips come to 8.6 MB.
- The model files stay out of the public repo (`public/fighters/` and `assets-incoming/` are ignored), because Mixamo's terms restrict sharing raw files. A deployed build shows stand-ins until they're hosted somewhere else.
- Hosting: Cloudflare R2, chosen on 2026-11-06 after Jayanth's internet provider blocked `*.supabase.co` with a notice citing a MeitY order under the IT Act, 2000. Run `node scripts/upload-fighters.mjs` after `npx wrangler@4 login`. Files are unlisted, not truly private.
- Done: joystick and buttons can be moved, resized and faded from Pause, then Customize controls.
- Not done: finishers and intros (step 8), device testing (step 9), per-model sword fitting.
- Model shortlist: `docs/fighter-models-shortlist.md`.

## Needed from Jayanth

- A free Adobe account for Mixamo, about 15 minutes per fighter once the shortlist is ready.
- A mid-range Android phone to test on.
