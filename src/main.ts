import './style.css';
import { WEAPONS, WEAPON_ORDER } from './game/constants';
import { GameEngine } from './game/engine';
import type { HudSnapshot, WeaponId } from './game/types';

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required DOM element #${id}`);
  return el as T;
}

const canvas = mustGet<HTMLCanvasElement>('game-canvas');
const hudEl = mustGet<HTMLDivElement>('hud');
const titleOverlay = mustGet<HTMLElement>('title-overlay');
const pauseOverlay = mustGet<HTMLElement>('pause-overlay');
const gameoverOverlay = mustGet<HTMLElement>('gameover-overlay');

const hudWave = mustGet<HTMLSpanElement>('hud-wave');
const hudWaveBar = mustGet<HTMLDivElement>('hud-wave-bar');
const hudPlayerHp = mustGet<HTMLDivElement>('hud-player-hp');
const hudPlayerHpText = mustGet<HTMLSpanElement>('hud-player-hp-text');
const hudCampHp = mustGet<HTMLDivElement>('hud-camp-hp');
const hudCampHpText = mustGet<HTMLSpanElement>('hud-camp-hp-text');

const hudAllies = mustGet<HTMLElement>('hud-allies');
const hudEnemies = mustGet<HTMLElement>('hud-enemies');
const frontlineBlue = mustGet<HTMLDivElement>('frontline-blue');
const frontlinePlayerPin = mustGet<HTMLDivElement>('frontline-player-pin');
const frontlineTankPin = mustGet<HTMLDivElement>('frontline-tank-pin');

const hudScore = mustGet<HTMLSpanElement>('hud-score');
const hudKills = mustGet<HTMLSpanElement>('hud-kills');
const hudCombo = mustGet<HTMLSpanElement>('hud-combo');
const btnMute = mustGet<HTMLButtonElement>('btn-mute');
const btnPause = mustGet<HTMLButtonElement>('btn-pause');

const waveBanner = mustGet<HTMLDivElement>('wave-banner');
const waveBannerTitle = mustGet<HTMLDivElement>('wave-banner-title');
const waveBannerSub = mustGet<HTMLDivElement>('wave-banner-sub');
const pickupToast = mustGet<HTMLDivElement>('pickup-toast');

const weaponBar = mustGet<HTMLDivElement>('weapon-bar');
const tankBar = mustGet<HTMLDivElement>('tank-bar');
const controlsStrip = mustGet<HTMLDivElement>('controls-strip');

const titleHighscore = mustGet<HTMLDivElement>('title-highscore');
const titleHighscoreVal = mustGet<HTMLElement>('title-highscore-val');

const gameoverReason = mustGet<HTMLParagraphElement>('gameover-reason');
const goScore = mustGet<HTMLSpanElement>('go-score');
const goBest = mustGet<HTMLSpanElement>('go-best');
const goWave = mustGet<HTMLSpanElement>('go-wave');
const goKills = mustGet<HTMLSpanElement>('go-kills');
const goBreakdown = mustGet<HTMLDivElement>('go-breakdown');

const weaponButtons = new Map<WeaponId, { el: HTMLButtonElement; ammoEl: HTMLSpanElement }>();
let grenadeAmmoEl: HTMLSpanElement;

function buildWeaponBar(onSelect: (id: WeaponId) => void): void {
  weaponBar.innerHTML = '';

  for (const id of WEAPON_ORDER) {
    const def = WEAPONS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weapon-slot';
    btn.title = `${def.name} (Key ${def.key})`;

    const keySpan = document.createElement('span');
    keySpan.className = 'slot-key';
    keySpan.textContent = def.key;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'slot-name';
    nameSpan.textContent = def.shortName;

    const ammoSpan = document.createElement('span');
    ammoSpan.className = 'slot-ammo';
    ammoSpan.textContent = id === 'pistol' ? '∞' : '0';

    btn.append(keySpan, nameSpan, ammoSpan);
    btn.addEventListener('click', () => onSelect(id));
    weaponBar.appendChild(btn);
    weaponButtons.set(id, { el: btn, ammoEl: ammoSpan });
  }

  // Grenade indicator slot
  const gSlot = document.createElement('div');
  gSlot.className = 'weapon-slot grenade-slot';
  gSlot.title = 'Frag Grenades (Right-Click or G)';
  gSlot.innerHTML =
    '<span class="slot-key">RMB/G</span><span class="slot-name">FRAGS</span><span class="slot-ammo" id="slot-grenade-ammo">4</span>';
  weaponBar.appendChild(gSlot);
  grenadeAmmoEl = mustGet<HTMLSpanElement>('slot-grenade-ammo');
}

let lastPhase = '';

function renderHud(h: HudSnapshot): void {
  // Overlay switching
  if (h.phase !== lastPhase) {
    lastPhase = h.phase;
    titleOverlay.classList.toggle('hidden', h.phase !== 'title');
    pauseOverlay.classList.toggle('hidden', h.phase !== 'paused');
    gameoverOverlay.classList.toggle('hidden', h.phase !== 'gameover');
    hudEl.classList.toggle('hidden', h.phase === 'title');
    canvas.classList.toggle('playing-cursor', h.phase === 'playing');
  }

  if (h.highScore > 0) {
    titleHighscore.classList.remove('hidden');
    titleHighscoreVal.textContent = h.highScore.toLocaleString();
  }

  if (h.phase === 'title') return;

  // Vitals & Wave
  hudWave.textContent = `WAVE ${h.wave}`;
  hudWaveBar.style.width = `${Math.round(h.waveProgress * 100)}%`;

  const pRatio = Math.max(0, Math.min(1, h.playerHp / h.playerMaxHp));
  hudPlayerHp.style.width = `${Math.round(pRatio * 100)}%`;
  hudPlayerHp.classList.toggle('low', pRatio < 0.3);
  hudPlayerHpText.textContent = String(h.playerHp);

  const cRatio = Math.max(0, Math.min(1, h.campHp / h.campMaxHp));
  hudCampHp.style.width = `${Math.round(cRatio * 100)}%`;
  hudCampHpText.textContent = String(h.campHp);

  // Frontline
  hudAllies.textContent = String(h.alliesCount);
  hudEnemies.textContent = String(h.enemiesCount);
  frontlineBlue.style.width = `${Math.round(h.frontlineRatio * 100)}%`;
  frontlinePlayerPin.style.left = `${Math.round(h.playerRatio * 100)}%`;
  if (h.tankRatio !== null) {
    frontlineTankPin.classList.remove('hidden');
    frontlineTankPin.style.left = `${Math.round(h.tankRatio * 100)}%`;
  } else {
    frontlineTankPin.classList.add('hidden');
  }

  // Score & Kills
  hudScore.textContent = h.score.toLocaleString();
  hudKills.textContent = String(h.kills);
  if (h.combo > 1 && h.comboTimer > 0) {
    hudCombo.classList.remove('hidden');
    hudCombo.textContent = `x${h.combo}`;
  } else {
    hudCombo.classList.add('hidden');
  }

  btnMute.textContent = h.muted ? 'SFX OFF' : 'SFX ON';
  btnPause.textContent = h.phase === 'paused' ? 'RESUME' : 'PAUSE';

  // Wave banner
  if (h.waveBannerAlpha > 0.02) {
    waveBanner.classList.remove('hidden');
    waveBanner.style.opacity = String(Math.min(1, h.waveBannerAlpha));
    waveBannerTitle.textContent = h.waveBannerText;
    waveBannerSub.textContent = h.waveBannerSub;
  } else {
    waveBanner.classList.add('hidden');
  }

  // Toast
  if (h.pickupToastTimer > 0.05 && h.pickupToast) {
    pickupToast.classList.remove('hidden');
    pickupToast.textContent = h.pickupToast;
    pickupToast.style.opacity = String(Math.min(1, h.pickupToastTimer * 1.4));
  } else {
    pickupToast.classList.add('hidden');
  }

  // Weapon Bar vs Tank Controls Bar
  weaponBar.classList.toggle('hidden', h.inTank);
  tankBar.classList.toggle('hidden', !h.inTank);
  controlsStrip.classList.toggle('hidden', h.inTank);

  for (const id of WEAPON_ORDER) {
    const slot = weaponButtons.get(id);
    if (!slot) continue;
    const unlocked = h.unlockedWeapons[id];
    const ammo = h.ammo[id];
    const available = unlocked && (id === 'pistol' || ammo > 0);
    slot.el.classList.toggle('active', h.activeWeapon === id);
    slot.el.classList.toggle('locked', !available);
    slot.ammoEl.textContent = id === 'pistol' ? '∞' : unlocked ? String(ammo) : 'LOCKED';
  }
  grenadeAmmoEl.textContent = `${h.grenades}/${h.maxGrenades}`;

  // Game Over Debrief
  if (h.phase === 'gameover') {
    gameoverReason.textContent = h.gameOverReason;
    goScore.textContent = h.score.toLocaleString();
    goBest.textContent = h.highScore.toLocaleString();
    goWave.textContent = String(h.wave);
    goKills.textContent = String(h.kills);

    const mins = Math.floor(h.timeSurvived / 60);
    const secs = Math.floor(h.timeSurvived % 60);
    const chips: [string, string | number][] = [
      ['Time', `${mins}:${secs.toString().padStart(2, '0')}`],
      ['Footmen', h.breakdown.footman],
      ['Archers', h.breakdown.archer],
      ['Spearmen', h.breakdown.spearman],
      ['Knights', h.breakdown.knight],
      ['Cavalry', h.breakdown.cavalry],
      ['Siege/Boss', h.breakdown.siege_ram + h.breakdown.warlord],
      ['Tank Crushes', h.breakdown.roadkills],
    ];
    goBreakdown.innerHTML = chips
      .filter(([, val]) => val !== 0)
      .map(([label, val]) => `<span class="breakdown-chip">${label}: <strong>${val}</strong></span>`)
      .join('');
  }
}

const engine = new GameEngine(canvas, renderHud);
buildWeaponBar((id) => engine.selectWeapon(id));

mustGet<HTMLButtonElement>('btn-play').addEventListener('click', () => engine.startNewGame());
mustGet<HTMLButtonElement>('btn-resume').addEventListener('click', () => engine.togglePause());
mustGet<HTMLButtonElement>('btn-restart-pause').addEventListener('click', () => engine.startNewGame());
mustGet<HTMLButtonElement>('btn-retry').addEventListener('click', () => engine.startNewGame());
btnMute.addEventListener('click', () => engine.toggleMute());
btnPause.addEventListener('click', () => engine.togglePause());

engine.startLoop();
