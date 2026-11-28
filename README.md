# Back to Future

A 2.5D hand-illustrated cartoon battlefield action shooter where a modern soldier with modern weapons and a drivable battle tank helps a medieval Blue Army hold off endless escalating waves of Red medieval enemies.

**Play Live:** https://ragnar2801.github.io/BackToFuture/

## Features

- **Modern Firepower vs. Medieval Armies**: Fight alongside allied Blue footmen, archers, spearmen, and knights against waves of Red swordsmen, longbow archers, pikemen, heavy plate knights, warhorse cavalry, siege battering rams, and the Iron Warlord.
- **Full Modern Arsenal & Random Battlefield Drops**:
  - **M1911 Pistol** (`1`) — Reliable sidearm with unlimited ammo
  - **Trench Shotgun** (`2`) — Heavy 7-pellet close-range blast with big knockback
  - **Assault Rifle** (`3`) — High fire-rate automatic rifle
  - **Rotary Minigun** (`4`) — Rapid-fire multi-barrel shredder
  - **RPG Launcher** (`5`) — Smoke-trailing explosive rockets that blast armor and siege engines
  - **Frag Grenades** (`Right-Click` or `G`) — Arced bouncing frag grenades
  - **Drivable Battle Tank** (`E` to enter/exit) — 75mm main cannon, coaxial machine gun, and roadkill crushing!
  - **Parachute Supply Crates & Field Medkits** — Random weapons, ammo, tank airdrops, and camp/hero repairs drop dynamically onto the battlefield.
- **Endless Escalating Difficulty & Scoring**: Every kill earns points amplified by combo streaks, multi-kill callouts, tank crushes, and frontline push bonuses. High scores persist locally.
- **Desktop & Mobile Ready (2 Control Modes in Settings)**: Switch anytime on the Title screen or Pause menu between **Straight Aim** (forward-only horizontal aim + pure mobile FIRE button; movement lines up shots) and **Free Aim (360°)** (1:1 mouse aim on desktop, hybrid hold-to-auto-lock / drag-to-aim FIRE stick & drag-ring FRAG on mobile, with Aim Weight and Magnetism tuning).
- **Zero-Dependency Procedural Audio & Canvas Art**: Crisp 2.5D cartoon vector rendering, tactical laser aim guide, and synthesized Web Audio API sound effects.

## Controls

| Action | Desktop | Mobile (Portrait & Landscape) |
| --- | --- | --- |
| Move & Align / Kite / Drive Tank | `WASD` or `Arrow Keys` | Left Virtual Joystick (align lanes or kite freely while firing) |
| Shoot / Tank Cannon | **Straight Aim**: `Left-Click` or `Space`<br>**Free Aim**: `Mouse` (`1:1` Aim) + `Left-Click` | **Straight Aim**: Pure `FIRE` button (no aim stick)<br>**Free Aim**: Hold `FIRE` for Smart Auto-Lock, or **Drag** to aim |
| Frag Grenade / Tank Coax MG | **Straight Aim**: `Right-Click` or `G`<br>**Free Aim**: Hold/Release `Right-Click` or `G` (`Space` in Tank) | **Straight Aim**: Tap `FRAG` (straight lane lob)<br>**Free Aim**: Tap `FRAG` (Smart Lob) or **Drag** for Blast Ring (`MG` in Tank) |
| Enter / Exit Tank | `E` | `TANK` / `EXIT` button |
| Switch Weapons | `1`–`5`, `Q`, or `Mouse Wheel` | `SWAP` button (right thumb) or tap weapon slot on bottom bar |
| Combat Dodge Roll | `Shift` (`Space` in Free Aim) | `ROLL` button |
| Pause / Settings / Mute | `P` or `Esc` / `M` | `PAUSE` (Switch Control Mode, Aim Weight & Magnetism) / `SFX` |

## Development

```bash
npm install
npm run dev
```

Build standard production bundle or single-file standalone HTML:

```bash
npm run build
npm run build:single
```
