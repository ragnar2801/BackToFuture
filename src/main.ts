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
const aimStickBase = mustGet<HTMLDivElement>('aim-stick-base');
const aimStickKnob = mustGet<HTMLDivElement>('aim-stick-knob');
const aimStickLabel = mustGet<HTMLSpanElement>('aim-stick-label');
const touchBtnSwap = mustGet<HTMLButtonElement>('touch-btn-swap');
const touchSwapWep = mustGet<HTMLElement>('touch-swap-wep');
const touchBtnTank = mustGet<HTMLButtonElement>('touch-btn-tank');
const touchBtnRoll = mustGet<HTMLButtonElement>('touch-btn-roll');
const touchBtnFrag = mustGet<HTMLButtonElement>('touch-btn-frag');
const touchFragLabel = mustGet<HTMLSpanElement>('touch-frag-label');
const touchFragCount = mustGet<HTMLElement>('touch-frag-count');

const btnToggleWeight = mustGet<HTMLButtonElement>('btn-toggle-weight');
const btnToggleAssist = mustGet<HTMLButtonElement>('btn-toggle-assist');
const btnToggleQuicktap = mustGet<HTMLButtonElement>('btn-toggle-quicktap');

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
let isInTank = false;

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
    { passive: true, once: true }
  );
}

interface VirtualStickHandle {
  reset: () => void;
}

interface VirtualStickOptions {
  zoneEl?: HTMLElement;
  isFloating?: boolean;
  onTap?: () => void;
}

function bindVirtualStick(
  baseEl: HTMLElement,
  knobEl: HTMLElement,
  onChange: (active: boolean, nx: number, ny: number, distRatio: number) => void,
  options?: VirtualStickOptions
): VirtualStickHandle {
  let activeTouchId: number | null = null;
  let activeMousePointerId: number | null = null;
  let touchStartTime = 0;
  let maxTouchDist = 0;

  const targetListenerEl = options?.zoneEl ?? baseEl;

  const updateFromClient = (clientX: number, clientY: number) => {
    const rect = baseEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(24, rect.width * 0.38);

    const dx = clientX - cx;
    const dy = clientY - cy;
    const rawDist = Math.hypot(dx, dy);
    maxTouchDist = Math.max(maxTouchDist, rawDist);

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
      if (activeTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      activeTouchId = touch.identifier;
      touchStartTime = performance.now();
      maxTouchDist = 0;
      baseEl.classList.add('active');

      if (options?.isFloating && options.zoneEl) {
        // Dynamically anchor base under thumb touchdown within the capture zone
        const zoneRect = options.zoneEl.getBoundingClientRect();
        const halfW = (baseEl.offsetWidth || 112) * 0.5;
        const halfH = (baseEl.offsetHeight || 112) * 0.5;
        const clampedX = Math.max(halfW + 4, Math.min(zoneRect.width - halfW - 4, touch.clientX - zoneRect.left));
        const clampedY = Math.max(halfH + 4, Math.min(zoneRect.height - halfH - 4, touch.clientY - zoneRect.top));
        // Default base center
        const defaultCenterLeft = 24 + halfW;
        const defaultCenterTop = zoneRect.height - 24 - halfH;
        const offX = clampedX - defaultCenterLeft;
        const offY = clampedY - defaultCenterTop;
        baseEl.style.transform = `translate3d(${offX.toFixed(1)}px, ${offY.toFixed(1)}px, 0)`;
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
        const elapsed = performance.now() - touchStartTime;
        if (options?.onTap && elapsed < 240 && maxTouchDist < 16) {
          options.onTap();
        }
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

  // Weapon Bar vs Tank Controls Bar
  weaponBar.classList.toggle('hidden', h.inTank);
  tankBar.classList.toggle('hidden', !h.inTank);
  controlsStrip.classList.toggle('hidden', h.inTank);

  // Mobile dynamic touch buttons
  touchBtnSwap.classList.toggle('hidden', h.inTank);
  const nextDef = WEAPONS[h.nextWeaponId];
  touchSwapWep.textContent = nextDef ? nextDef.shortName : 'PISTOL';

  btnToggleWeight.textContent = `AIM WEIGHT: ${h.aimWeight.toUpperCase()}`;
  btnToggleAssist.textContent = `MAGNETISM: ${h.aimAssist ? 'ON' : 'OFF'}`;
  btnToggleQuicktap.textContent = `QUICK-TAP: ${h.quickTapAutoAim ? 'ON' : 'OFF'}`;

  touchBtnTank.classList.toggle('hidden', !h.inTank && !h.tankPrompt);
  touchBtnTank.textContent = h.inTank ? 'EXIT' : 'TANK';
  touchBtnRoll.classList.toggle('hidden', h.inTank);
  touchBtnFrag.classList.toggle('coax-mode', h.inTank);
  if (h.inTank) {
    touchFragLabel.textContent = 'MG';
    touchFragCount.textContent = 'HOLD';
    aimStickLabel.textContent = 'CANNON';
  } else {
    touchFragLabel.textContent = 'FRAG';
    touchFragCount.textContent = String(h.grenades);
    aimStickLabel.textContent = 'AIM & FIRE';
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

// Wire multi-touch virtual joysticks & action buttons
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
  }
);

const aimStick = bindVirtualStick(
  aimStickBase,
  aimStickKnob,
  (active, nx, ny, ratio) => {
    if (!active) {
      engine.setTouchAim(false, 0, 0, 0, false);
      aimStickKnob.classList.remove('aiming', 'firing');
      aimStickLabel.textContent = isInTank ? 'CANNON' : 'AIM & FIRE';
    } else {
      const isFiring = ratio >= 0.40;
      engine.setTouchAim(true, nx, ny, ratio, isFiring);
      if (isFiring) {
        aimStickKnob.classList.add('firing');
        aimStickKnob.classList.remove('aiming');
        aimStickLabel.textContent = isInTank ? 'FIRING' : 'FIRING!';
      } else if (ratio >= 0.14) {
        aimStickKnob.classList.add('aiming');
        aimStickKnob.classList.remove('firing');
        aimStickLabel.textContent = isInTank ? 'AIMING' : 'AIMING';
      } else {
        aimStickKnob.classList.remove('aiming', 'firing');
        aimStickLabel.textContent = isInTank ? 'CANNON' : 'AIM & FIRE';
      }
    }
  },
  {
    onTap: () => engine.quickTapAutoFire(),
  }
);

let coaxTouchId: number | null = null;
let coaxMousePointerId: number | null = null;
let lastIsLandscape = window.innerWidth >= window.innerHeight;

const resetAllTouchUi = () => {
  moveStick.reset();
  aimStick.reset();
  coaxTouchId = null;
  coaxMousePointerId = null;
  touchBtnFrag.classList.remove('pressed');
  engine.setTouchCoax(false);
  engine.resetTouchInputs();
};

// Reset active sticks cleanly when device actually flips orientation (not on tiny address-bar resizes!)
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

touchBtnFrag.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('is-touch');
    if (isInTank) {
      const t = e.changedTouches[0];
      if (!t) return;
      coaxTouchId = t.identifier;
      touchBtnFrag.classList.add('pressed');
      engine.setTouchCoax(true);
    } else {
      touchBtnFrag.classList.add('pressed');
      engine.triggerGrenade();
    }
  },
  { passive: false }
);

const endCoaxTouch = (e: TouchEvent) => {
  touchBtnFrag.classList.remove('pressed');
  if (coaxTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === coaxTouchId) {
      coaxTouchId = null;
      engine.setTouchCoax(false);
      break;
    }
  }
};
window.addEventListener('touchend', endCoaxTouch, { passive: true });
window.addEventListener('touchcancel', endCoaxTouch, { passive: true });

touchBtnFrag.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  e.preventDefault();
  e.stopPropagation();
  if (isInTank) {
    coaxMousePointerId = e.pointerId;
    touchBtnFrag.classList.add('pressed');
    engine.setTouchCoax(true);
  } else {
    engine.triggerGrenade();
  }
});

const endCoaxMouse = (e: PointerEvent) => {
  if (coaxMousePointerId === null || e.pointerId !== coaxMousePointerId) return;
  coaxMousePointerId = null;
  touchBtnFrag.classList.remove('pressed');
  engine.setTouchCoax(false);
};
window.addEventListener('pointerup', endCoaxMouse);
window.addEventListener('pointercancel', endCoaxMouse);

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

btnToggleWeight.addEventListener('click', () => engine.cycleAimWeight());
btnToggleAssist.addEventListener('click', () => engine.toggleAimAssist());
btnToggleQuicktap.addEventListener('click', () => engine.toggleQuickTap());

engine.startLoop();
