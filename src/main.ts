import './style.css';
import { WEAPONS, WEAPON_ORDER } from './game/constants';
import { GameEngine } from './game/engine';
import type { ControlMode, HudSnapshot, WeaponId } from './game/types';

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
const frontlineTitle = mustGet<HTMLSpanElement>('frontline-title');

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

const touchControls = mustGet<HTMLDivElement>('touch-controls');
const touchMoveZone = mustGet<HTMLDivElement>('touch-move-zone');
const moveStickBase = mustGet<HTMLDivElement>('move-stick-base');
const moveStickKnob = mustGet<HTMLDivElement>('move-stick-knob');
const touchBtnFire = mustGet<HTMLButtonElement>('touch-btn-fire');
const fireStickKnob = mustGet<HTMLDivElement>('fire-stick-knob');
const touchFireLabel = mustGet<HTMLSpanElement>('touch-fire-label');
const touchFireSub = mustGet<HTMLElement>('touch-fire-sub');
const touchBtnSwap = mustGet<HTMLButtonElement>('touch-btn-swap');
const touchSwapWep = mustGet<HTMLElement>('touch-swap-wep');
const touchBtnTank = mustGet<HTMLButtonElement>('touch-btn-tank');
const touchBtnRoll = mustGet<HTMLButtonElement>('touch-btn-roll');
const touchBtnFrag = mustGet<HTMLButtonElement>('touch-btn-frag');
const touchFragLabel = mustGet<HTMLSpanElement>('touch-frag-label');
const touchFragCount = mustGet<HTMLElement>('touch-frag-count');

const titleHighscore = mustGet<HTMLDivElement>('title-highscore');
const titleHighscoreVal = mustGet<HTMLElement>('title-highscore-val');
const titleTouchLegend = mustGet<HTMLDivElement>('title-touch-legend');

const btnTitleModeTouch = mustGet<HTMLButtonElement>('btn-title-mode-touch');
const btnTitleModeStick = mustGet<HTMLButtonElement>('btn-title-mode-stick');
const btnPauseModeTouch = mustGet<HTMLButtonElement>('btn-pause-mode-touch');
const btnPauseModeStick = mustGet<HTMLButtonElement>('btn-pause-mode-stick');
const controlModeDesc = mustGet<HTMLParagraphElement>('control-mode-desc');
const btnToggleWeight = mustGet<HTMLButtonElement>('btn-toggle-weight');
const btnToggleAssist = mustGet<HTMLButtonElement>('btn-toggle-assist');

const gameoverReason = mustGet<HTMLParagraphElement>('gameover-reason');
const goScore = mustGet<HTMLSpanElement>('go-score');
const goBest = mustGet<HTMLSpanElement>('go-best');
const goWave = mustGet<HTMLSpanElement>('go-wave');
const goKills = mustGet<HTMLSpanElement>('go-kills');
const goBreakdown = mustGet<HTMLDivElement>('go-breakdown');

const weaponButtons = new Map<WeaponId, { el: HTMLButtonElement; ammoEl: HTMLSpanElement }>();
let grenadeAmmoEl: HTMLSpanElement;
let isInTank = false;
let currentControlMode: ControlMode = 'touch_aim';

function detectAndEnableTouchUi(): void {
  const coarse =
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window;
  if (coarse) {
    document.body.classList.add('is-touch');
  }
  window.addEventListener(
    'touchstart',
    () => {
      document.body.classList.add('is-touch');
    },
    { passive: true }
  );
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      document.body.classList.remove('is-touch');
    }
  });
}

interface VirtualStickHandle {
  reset: () => void;
}

interface VirtualStickOptions {
  zoneEl?: HTMLElement;
  isFloating?: boolean;
  onOverflowTouchStart?: (touch: Touch) => void;
}

function bindVirtualStick(
  baseEl: HTMLElement,
  knobEl: HTMLElement,
  onChange: (active: boolean, nx: number, ny: number, distRatio: number) => void,
  options?: VirtualStickOptions
): VirtualStickHandle {
  let activeTouchId: number | null = null;
  let activeMousePointerId: number | null = null;
  let anchorClientX = 0;
  let anchorClientY = 0;

  const targetListenerEl = options?.zoneEl ?? baseEl;

  const updateFromClient = (clientX: number, clientY: number) => {
    const width = baseEl.offsetWidth || 112;
    const maxRadius = Math.max(24, width * 0.38);

    const dx = clientX - anchorClientX;
    const dy = clientY - anchorClientY;
    const rawDist = Math.hypot(dx, dy);

    const clampedDist = Math.min(maxRadius, rawDist);
    const ang = Math.atan2(dy, dx);
    const kx = rawDist > 0.5 ? Math.cos(ang) * clampedDist : 0;
    const ky = rawDist > 0.5 ? Math.sin(ang) * clampedDist : 0;

    knobEl.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;

    const ratio = clampedDist / maxRadius;
    const deadzone = 0.12;
    if (ratio < deadzone) {
      onChange(true, 0, 0, ratio);
    } else {
      const scaled = (ratio - deadzone) / (1 - deadzone);
      onChange(true, Math.cos(ang) * scaled, Math.sin(ang) * scaled, ratio);
    }
  };

  const reset = () => {
    activeTouchId = null;
    activeMousePointerId = null;
    baseEl.classList.remove('active');
    knobEl.style.transform = 'translate3d(0, 0, 0)';
    if (options?.isFloating) {
      baseEl.style.transform = '';
    }
    onChange(false, 0, 0, 0);
  };

  // True multi-touch tracking by touch.identifier across window so thumbs never drop near screen edges!
  targetListenerEl.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add('is-touch');
      const touch = e.changedTouches[0];
      if (!touch) return;
      if (activeTouchId !== null) {
        options?.onOverflowTouchStart?.(touch);
        return;
      }
      activeTouchId = touch.identifier;
      baseEl.classList.add('active');

      if (options?.isFloating && options.zoneEl) {
        // Dynamically anchor base pixel-perfectly under thumb touchdown within the capture zone
        const zoneRect = options.zoneEl.getBoundingClientRect();
        const halfW = (baseEl.offsetWidth || 112) * 0.5;
        const halfH = (baseEl.offsetHeight || 112) * 0.5;
        const clampedX = Math.max(halfW + 4, Math.min(zoneRect.width - halfW - 4, touch.clientX - zoneRect.left));
        const clampedY = Math.max(halfH + 4, Math.min(zoneRect.height - halfH - 4, touch.clientY - zoneRect.top));
        const defaultCenterLeft = baseEl.offsetLeft + halfW;
        const defaultCenterTop = baseEl.offsetTop + halfH;
        const offX = clampedX - defaultCenterLeft;
        const offY = clampedY - defaultCenterTop;
        baseEl.style.transform = `translate3d(${offX.toFixed(1)}px, ${offY.toFixed(1)}px, 0)`;
        anchorClientX = zoneRect.left + clampedX;
        anchorClientY = zoneRect.top + clampedY;
      } else {
        const rect = baseEl.getBoundingClientRect();
        anchorClientX = rect.left + rect.width * 0.5;
        anchorClientY = rect.top + rect.height * 0.5;
      }

      updateFromClient(touch.clientX, touch.clientY);
    },
    { passive: false }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === activeTouchId) {
          e.preventDefault();
          updateFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false }
  );

  const onTouchEnd = (e: TouchEvent) => {
    if (activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        reset();
        break;
      }
    }
  };
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // Non-touch pointer fallback (desktop/stylus emulation)
  baseEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || activeMousePointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    activeMousePointerId = e.pointerId;
    baseEl.classList.add('active');
    try {
      baseEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    const rect = baseEl.getBoundingClientRect();
    anchorClientX = rect.left + rect.width * 0.5;
    anchorClientY = rect.top + rect.height * 0.5;
    updateFromClient(e.clientX, e.clientY);
  });

  baseEl.addEventListener('pointermove', (e) => {
    if (activeMousePointerId === null || e.pointerId !== activeMousePointerId) return;
    e.preventDefault();
    updateFromClient(e.clientX, e.clientY);
  });

  const endMousePointer = (e: PointerEvent) => {
    if (activeMousePointerId === null || e.pointerId !== activeMousePointerId) return;
    reset();
  };
  baseEl.addEventListener('pointerup', endMousePointer);
  baseEl.addEventListener('pointercancel', endMousePointer);
  baseEl.addEventListener('lostpointercapture', () => {
    if (activeMousePointerId !== null) reset();
  });

  return { reset };
}

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
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(id);
    });
    weaponBar.appendChild(btn);
    weaponButtons.set(id, { el: btn, ammoEl: ammoSpan });
  }

  // Grenade indicator slot (desktop HUD)
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
  isInTank = h.inTank;

  // Overlay switching
  if (h.phase !== lastPhase) {
    lastPhase = h.phase;
    titleOverlay.classList.toggle('hidden', h.phase !== 'title');
    pauseOverlay.classList.toggle('hidden', h.phase !== 'paused');
    gameoverOverlay.classList.toggle('hidden', h.phase !== 'gameover');
    hudEl.classList.toggle('hidden', h.phase === 'title');
    touchControls.classList.toggle('hidden', h.phase !== 'playing');
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
  frontlineTitle.textContent = `SECTOR ${h.sector}`;
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

  // Sync Control Mode UI (body class, legends, settings buttons)
  const modeChanged = currentControlMode !== h.controlMode;
  currentControlMode = h.controlMode;
  const isTwinStick = h.controlMode === 'twin_stick';
  document.body.classList.toggle('control-mode-twin-stick', isTwinStick);
  document.body.classList.toggle('control-mode-touch-aim', !isTwinStick);

  btnTitleModeTouch.classList.toggle('active', !isTwinStick);
  btnTitleModeStick.classList.toggle('active', isTwinStick);
  btnPauseModeTouch.classList.toggle('active', !isTwinStick);
  btnPauseModeStick.classList.toggle('active', isTwinStick);

  const weightLabels = {
    responsive: 'SNAPPY',
    balanced: 'BALANCED',
    heavy: 'HEAVY',
  };
  btnToggleWeight.textContent = `AIM WEIGHT: ${weightLabels[h.aimWeight] || 'BALANCED'}`;
  btnToggleAssist.textContent = `MAGNETISM: ${h.aimAssist ? 'ON' : 'OFF'}`;

  if (isTwinStick) {
    controlModeDesc.textContent =
      'Mobile: Hold the corner FIRE stick for Smart Auto-Lock, or drag it for 360° manual aim.';
  } else {
    controlModeDesc.textContent =
      'Mobile: Touch & hold directly on any enemy or spot on the battlefield to aim and auto-fire.';
  }

  if (modeChanged || titleTouchLegend.dataset.mode !== h.controlMode) {
    titleTouchLegend.dataset.mode = h.controlMode;
    if (isTwinStick) {
      titleTouchLegend.innerHTML =
        '<span><strong>Left Stick</strong> Move &amp; Kite</span>' +
        '<span><strong>Fire Stick</strong> Hold Auto-Aim • Drag Aim</span>' +
        '<span><strong>Frag</strong> Tap Auto • Drag Ring</span>';
    } else {
      titleTouchLegend.innerHTML =
        '<span><strong>Left Stick</strong> Move &amp; Kite</span>' +
        '<span><strong>Touch Battlefield</strong> Aim &amp; Auto-Fire</span>' +
        '<span><strong>Frag</strong> Tap Auto • Drag Ring</span>';
    }
  }

  // Weapon Bar vs Tank Controls Bar
  weaponBar.classList.toggle('hidden', h.inTank);
  tankBar.classList.toggle('hidden', !h.inTank);
  controlsStrip.classList.toggle('hidden', h.inTank);

  // Mobile dynamic touch buttons
  touchBtnSwap.classList.toggle('hidden', h.inTank);
  const nextDef = WEAPONS[h.nextWeaponId];
  touchSwapWep.textContent = nextDef ? nextDef.shortName : 'PISTOL';

  touchBtnTank.classList.toggle('hidden', !h.inTank && !h.tankPrompt);
  touchBtnTank.textContent = h.inTank ? 'EXIT' : 'TANK';
  touchBtnRoll.classList.toggle('hidden', h.inTank);
  touchBtnFrag.classList.toggle('coax-mode', h.inTank);
  touchBtnFire.classList.toggle('tank-fire-mode', h.inTank);
  if (h.inTank) {
    touchFragLabel.textContent = 'MG';
    touchFragCount.textContent = 'HOLD';
    touchFireLabel.textContent = 'CANNON';
    touchFireSub.textContent =
      h.touchAimMode === 'manual' ? 'AIM • 75MM' : h.touchAimMode === 'auto' ? 'AUTO • 75MM' : '75MM';
  } else {
    touchFragLabel.textContent = 'FRAG';
    touchFragCount.textContent = String(h.grenades);
    touchFireLabel.textContent = 'FIRE';
    const wepShort = WEAPONS[h.activeWeapon].shortName;
    touchFireSub.textContent =
      h.touchAimMode === 'manual' ? `AIM • ${wepShort}` : h.touchAimMode === 'auto' ? `AUTO • ${wepShort}` : wepShort;
  }

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
      ['Barracks Conquered', h.barracksConquered],
      ['Sector Reached', h.sector],
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

detectAndEnableTouchUi();
const engine = new GameEngine(canvas, renderHud);
buildWeaponBar((id) => engine.selectWeapon(id));

// Wire Direct Battlefield Touch-to-Shoot (touch & hold anywhere on battlefield to aim & auto-fire)
let battlefieldAimTouchId: number | null = null;

const stopBattlefieldAimTouch = () => {
  battlefieldAimTouchId = null;
  engine.setTouchAimPoint(false);
};

const claimBattlefieldAimTouch = (touch: Touch) => {
  if (currentControlMode !== 'touch_aim' || battlefieldAimTouchId !== null) return;
  battlefieldAimTouchId = touch.identifier;
  engine.setTouchAimPoint(true, touch.clientX, touch.clientY);
};

canvas.addEventListener(
  'touchstart',
  (e) => {
    document.body.classList.add('is-touch');
    if (currentControlMode !== 'touch_aim') return;
    e.preventDefault();
    if (battlefieldAimTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    claimBattlefieldAimTouch(t);
  },
  { passive: false }
);

window.addEventListener(
  'touchmove',
  (e) => {
    if (battlefieldAimTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === battlefieldAimTouchId) {
        e.preventDefault();
        engine.setTouchAimPoint(true, t.clientX, t.clientY);
        break;
      }
    }
  },
  { passive: false }
);

const endBattlefieldAimTouch = (e: TouchEvent) => {
  if (battlefieldAimTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === battlefieldAimTouchId) {
      stopBattlefieldAimTouch();
      break;
    }
  }
};
window.addEventListener('touchend', endBattlefieldAimTouch, { passive: true });
window.addEventListener('touchcancel', endBattlefieldAimTouch, { passive: true });

// Wire multi-touch Left Move Joystick (decoupled from aim during combat so kiting is effortless!)
const moveStick = bindVirtualStick(
  moveStickBase,
  moveStickKnob,
  (active, nx, ny) => {
    if (!active) {
      engine.setTouchMove(0, 0);
    } else {
      engine.setTouchMove(nx, ny);
    }
  },
  {
    zoneEl: touchMoveZone,
    isFloating: true,
    onOverflowTouchStart: (touch) => {
      // If left thumb is already steering, a second tap inside the move zone shoots directly at that spot!
      claimBattlefieldAimTouch(touch);
    },
  }
);

// Wire Right FIRE Stick (active in Twin-Stick mode: Hold for Smart Auto-Lock, Drag for 360° manual aim)
let fireTouchId: number | null = null;
let fireMousePointerId: number | null = null;
let fireAnchorX = 0;
let fireAnchorY = 0;
let fireDragging = false;

const stopTouchFire = () => {
  fireTouchId = null;
  fireMousePointerId = null;
  fireDragging = false;
  touchBtnFire.classList.remove('pressed', 'dragging');
  fireStickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
  engine.setTouchFireControl(false, false, 0, 0);
};

const updateFireStickFromClient = (clientX: number, clientY: number) => {
  if (currentControlMode !== 'twin_stick') return;

  const dx = clientX - fireAnchorX;
  const dy = clientY - fireAnchorY;
  const dist = Math.hypot(dx, dy);
  const maxTravel = Math.max(24, (touchBtnFire.offsetWidth || 112) * 0.34);

  if (!fireDragging && dist >= 16) {
    fireDragging = true;
  }

  if (fireDragging) {
    const clamped = Math.min(maxTravel, dist);
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * clamped;
    const ky = Math.sin(ang) * clamped;
    fireStickKnob.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0px)`;
    touchBtnFire.classList.add('dragging');
    engine.setTouchFireControl(true, true, Math.cos(ang), Math.sin(ang));
  } else {
    fireStickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
    touchBtnFire.classList.remove('dragging');
    engine.setTouchFireControl(true, false, 0, 0);
  }
};

touchBtnFire.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('is-touch');
    if (fireTouchId !== null || currentControlMode !== 'twin_stick') return;
    const t = e.changedTouches[0];
    if (!t) return;
    fireTouchId = t.identifier;
    fireAnchorX = t.clientX;
    fireAnchorY = t.clientY;
    fireDragging = false;
    touchBtnFire.classList.add('pressed');
    updateFireStickFromClient(t.clientX, t.clientY);
  },
  { passive: false }
);

window.addEventListener(
  'touchmove',
  (e) => {
    if (fireTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === fireTouchId) {
        e.preventDefault();
        updateFireStickFromClient(t.clientX, t.clientY);
        break;
      }
    }
  },
  { passive: false }
);

const endFireTouch = (e: TouchEvent) => {
  if (fireTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === fireTouchId) {
      stopTouchFire();
      break;
    }
  }
};
window.addEventListener('touchend', endFireTouch, { passive: true });
window.addEventListener('touchcancel', endFireTouch, { passive: true });

touchBtnFire.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || fireMousePointerId !== null || currentControlMode !== 'twin_stick') return;
  e.preventDefault();
  e.stopPropagation();
  fireMousePointerId = e.pointerId;
  fireAnchorX = e.clientX;
  fireAnchorY = e.clientY;
  fireDragging = false;
  touchBtnFire.classList.add('pressed');
  try {
    touchBtnFire.setPointerCapture(e.pointerId);
  } catch {}
  updateFireStickFromClient(e.clientX, e.clientY);
});

touchBtnFire.addEventListener('pointermove', (e) => {
  if (fireMousePointerId === null || e.pointerId !== fireMousePointerId) return;
  e.preventDefault();
  updateFireStickFromClient(e.clientX, e.clientY);
});

const endFireMouse = (e: PointerEvent) => {
  if (fireMousePointerId === null || e.pointerId !== fireMousePointerId) return;
  stopTouchFire();
};
window.addEventListener('pointerup', endFireMouse);
window.addEventListener('pointercancel', endFireMouse);

// Wire Right FRAG / Tank Coax MG Button (Tap: Smart Lob • Drag: Aim Blast Ring • Tank: Hold Coax MG)
let fragTouchId: number | null = null;
let fragMousePointerId: number | null = null;
let fragIsCoax = false;
let fragAnchorX = 0;
let fragAnchorY = 0;
let fragDragging = false;
let fragNx = 0;
let fragNy = 0;

const resetFragUi = (cancelOnly: boolean) => {
  const wasCoax = fragIsCoax;
  const wasDragged = fragDragging;
  const nx = fragNx;
  const ny = fragNy;

  fragTouchId = null;
  fragMousePointerId = null;
  fragIsCoax = false;
  fragDragging = false;
  fragNx = 0;
  fragNy = 0;
  touchBtnFrag.classList.remove('pressed', 'aiming');
  touchBtnFrag.style.transform = '';

  if (wasCoax) {
    engine.setTouchCoax(false);
  } else if (cancelOnly) {
    engine.setTouchFragAim(false, false, 0, 0);
  } else {
    engine.releaseTouchFrag(wasDragged, nx, ny);
  }
};

const updateFragStickFromClient = (clientX: number, clientY: number) => {
  if (fragIsCoax) return;
  const dx = clientX - fragAnchorX;
  const dy = clientY - fragAnchorY;
  const dist = Math.hypot(dx, dy);
  const maxThrowDrag = 66;

  if (!fragDragging && dist >= 13) {
    fragDragging = true;
  }

  if (fragDragging) {
    const ratio = Math.min(1, Math.max(0.08, (dist - 10) / (maxThrowDrag - 10)));
    const ang = Math.atan2(dy, dx);
    fragNx = Math.cos(ang) * ratio;
    fragNy = Math.sin(ang) * ratio;
    const knobShift = Math.min(18, dist * 0.32);
    touchBtnFrag.style.transform = `translate3d(${(Math.cos(ang) * knobShift).toFixed(1)}px, ${(Math.sin(ang) * knobShift).toFixed(1)}px, 0)`;
    touchBtnFrag.classList.add('aiming');
    engine.setTouchFragAim(true, true, fragNx, fragNy);
  }
};

touchBtnFrag.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('is-touch');
    if (fragTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    fragTouchId = t.identifier;
    fragAnchorX = t.clientX;
    fragAnchorY = t.clientY;
    fragDragging = false;
    fragNx = 0;
    fragNy = 0;
    touchBtnFrag.classList.add('pressed');
    if (isInTank) {
      fragIsCoax = true;
      engine.setTouchCoax(true);
    } else {
      fragIsCoax = false;
      engine.setTouchFragAim(true, false, 0, 0);
    }
  },
  { passive: false }
);

window.addEventListener(
  'touchmove',
  (e) => {
    if (fragTouchId === null || fragIsCoax) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === fragTouchId) {
        e.preventDefault();
        updateFragStickFromClient(t.clientX, t.clientY);
        break;
      }
    }
  },
  { passive: false }
);

window.addEventListener(
  'touchend',
  (e) => {
    if (fragTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fragTouchId) {
        resetFragUi(false);
        break;
      }
    }
  },
  { passive: true }
);

window.addEventListener(
  'touchcancel',
  (e) => {
    if (fragTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === fragTouchId) {
        resetFragUi(true);
        break;
      }
    }
  },
  { passive: true }
);

touchBtnFrag.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || fragMousePointerId !== null) return;
  e.preventDefault();
  e.stopPropagation();
  fragMousePointerId = e.pointerId;
  fragAnchorX = e.clientX;
  fragAnchorY = e.clientY;
  fragDragging = false;
  fragNx = 0;
  fragNy = 0;
  touchBtnFrag.classList.add('pressed');
  try {
    touchBtnFrag.setPointerCapture(e.pointerId);
  } catch {}
  if (isInTank) {
    fragIsCoax = true;
    engine.setTouchCoax(true);
  } else {
    fragIsCoax = false;
    engine.setTouchFragAim(true, false, 0, 0);
  }
});

touchBtnFrag.addEventListener('pointermove', (e) => {
  if (fragMousePointerId === null || e.pointerId !== fragMousePointerId || fragIsCoax) return;
  e.preventDefault();
  updateFragStickFromClient(e.clientX, e.clientY);
});

window.addEventListener('pointerup', (e) => {
  if (fragMousePointerId === null || e.pointerId !== fragMousePointerId) return;
  resetFragUi(false);
});
window.addEventListener('pointercancel', (e) => {
  if (fragMousePointerId === null || e.pointerId !== fragMousePointerId) return;
  resetFragUi(true);
});

let lastIsLandscape = window.innerWidth >= window.innerHeight;

const resetAllTouchUi = () => {
  moveStick.reset();
  stopBattlefieldAimTouch();
  stopTouchFire();
  resetFragUi(true);
  engine.resetTouchInputs();
};

window.addEventListener('orientationchange', () => {
  lastIsLandscape = window.innerWidth >= window.innerHeight;
  resetAllTouchUi();
});
window.addEventListener('resize', () => {
  const nowLandscape = window.innerWidth >= window.innerHeight;
  if (nowLandscape !== lastIsLandscape) {
    lastIsLandscape = nowLandscape;
    resetAllTouchUi();
  }
});
window.addEventListener('blur', resetAllTouchUi);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetAllTouchUi();
});

function bindInstantTap(el: HTMLElement, onTap: () => void): void {
  el.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.add('is-touch');
      el.classList.add('pressed');
      onTap();
    },
    { passive: false }
  );
  const clear = () => el.classList.remove('pressed');
  el.addEventListener('touchend', clear, { passive: true });
  el.addEventListener('touchcancel', clear, { passive: true });
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    onTap();
  });
}

bindInstantTap(touchBtnSwap, () => engine.cycleWeapon(1));
bindInstantTap(touchBtnTank, () => engine.triggerTankToggle());
bindInstantTap(touchBtnRoll, () => engine.triggerDodge());

const applyControlMode = (mode: ControlMode) => {
  resetAllTouchUi();
  engine.setControlMode(mode);
};

btnTitleModeTouch.addEventListener('click', () => applyControlMode('touch_aim'));
btnTitleModeStick.addEventListener('click', () => applyControlMode('twin_stick'));
btnPauseModeTouch.addEventListener('click', () => applyControlMode('touch_aim'));
btnPauseModeStick.addEventListener('click', () => applyControlMode('twin_stick'));
btnToggleWeight.addEventListener('click', () => engine.cycleAimWeight());
btnToggleAssist.addEventListener('click', () => engine.toggleAimAssist());

mustGet<HTMLButtonElement>('btn-play').addEventListener('click', () => {
  resetAllTouchUi();
  engine.startNewGame();
});
mustGet<HTMLButtonElement>('btn-resume').addEventListener('click', () => {
  resetAllTouchUi();
  engine.togglePause();
});
mustGet<HTMLButtonElement>('btn-restart-pause').addEventListener('click', () => {
  resetAllTouchUi();
  engine.startNewGame();
});
mustGet<HTMLButtonElement>('btn-retry').addEventListener('click', () => {
  resetAllTouchUi();
  engine.startNewGame();
});
btnMute.addEventListener('click', () => engine.toggleMute());
btnPause.addEventListener('click', () => {
  resetAllTouchUi();
  engine.togglePause();
});

engine.startLoop();
