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
- **Desktop & Mobile Ready**: Full keyboard/mouse support plus responsive portrait & landscape multi-touch controls (auto-centering Left Move & Aim stick, dedicated Right `FIRE` trigger button, and tactile `SWAP`, `FRAG`/`MG`, `ROLL`, and `TANK` buttons).
- **Zero-Dependency Procedural Audio & Canvas Art**: Crisp 2.5D cartoon vector rendering and synthesized Web Audio API sound effects.

## Controls

| Action | Desktop | Mobile (Portrait & Landscape) |
| --- | --- | --- |
| Move & Aim / Drive Tank | `WASD` or `Arrow Keys` | Left Virtual Joystick (aims straight in movement direction) |
| Shoot / Tank Cannon | `Mouse` + `Left-Click` | Right `FIRE` button (morphs to `CANNON` in Tank) |
| Frag Grenade / Tank Coax MG | `Right-Click` or `G` (`Space` in Tank) | `FRAG` button (morphs to hold `MG` in Tank) |
| Enter / Exit Tank | `E` | `TANK` / `EXIT` button |
| Switch Weapons | `1`–`5`, `Q`, or `Mouse Wheel` | `SWAP` button (right thumb) or tap weapon slot on bottom bar |
| Combat Dodge Roll | `Shift` or `Space` | `ROLL` button |
| Pause / Mute & Aim Tuning | `P` or `Esc` / `M` | `PAUSE` (tune Aim Weight & Sticky Magnetism) / `SFX` |

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
