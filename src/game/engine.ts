import { SoundEngine } from './audio';
import {
  AIM_ASSIST_CONFIG,
  ALLIED_CAMP_MAX_HP,
  ALLIED_CAMP_X,
  ALLIED_CAMP_Y,
  ENEMY_CAMP_X,
  HORIZON_Y,
  LOGICAL_HEIGHT,
  PICKUP_LABELS,
  PLAYABLE_Y_MAX,
  PLAYABLE_Y_MIN,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  SECTOR_LENGTH,
  SECTOR_NAMES,
  TANK_INTERACT_RADIUS,
  TANK_MAX_HP,
  TANK_SPEED,
  UNIT_STATS,
  WEAPONS,
  WEAPON_ORDER,
  WORLD_WIDTH,
  getRoadCenterY,
  getRoadHalfWidth,
  toRoman,
} from './constants';
import { GameRenderer, type RenderState } from './renderer';
import type {
  AimWeightSetting,
  BarracksState,
  CampState,
  CloudProp,
  ConqueredBase,
  ControlMode,
  CorpseProp,
  Faction,
  FloatingText,
  GamePhase,
  GroundDecal,
  HudSnapshot,
  KillBreakdown,
  Particle,
  PickupEntity,
  PickupKind,
  PlayerState,
  ProjectileEntity,
  SceneryProp,
  SoldierEntity,
  TankEntity,
  UnitKind,
  WeaponId,
} from './types';

const HIGH_SCORE_KEY = 'back_to_future_high_score_v1';

const WAVE_SUBTITLES = [
  'MEDIEVAL VANGUARD',
  'LONGBOW ARCHERS',
  'IRON PIKE WALL',
  'HEAVY PLATE KNIGHTS',
  'WARHORSE CAVALRY',
  'SIEGE BATTERING RAM!',
  'THE IRON WARLORD!',
  'ROYAL CRUSADE',
  'ENDLESS HORDE',
];

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer = new GameRenderer();
  public sound = new SoundEngine();

  private rafId = 0;
  private lastTimestamp = 0;
  private viewW = 1280;
  private viewH = LOGICAL_HEIGHT;
  private scale = 1;
  private dpr = 1;

  private phase: GamePhase = 'title';
  private time = 0;
  private timeSurvived = 0;
  private hitstopTimer = 0;

  private nextId = 1;
  private cameraX = 0;
  private shakeMag = 0;
  private shakeX = 0;
  private shakeY = 0;
  private recoilBloom = 0;

  // Input state
  private keys = new Set<string>();
  private mouseScreenX = 860;
  private mouseScreenY = 260;
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private isTouchInput = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchFiring = false;
  private touchAimDragging = false;
  private touchAimX = 1;
  private touchAimY = 0;
  private touchPointActive = false;
  private touchTapQueued = false;
  private touchPointScreenX = 860;
  private touchPointScreenY = 260;
  private touchCoax = false;
  private combatStrafeTimer = 0;
  private grenadeAiming = false;
  private touchFragDragging = false;
  private touchFragX = 1;
  private touchFragY = 0;
  private lockedTargetId: number | null = null;
  private lockedTargetPos: { x: number; y: number; isBoss: boolean } | null = null;
  private isAutoLocked = false;
  private controlMode: ControlMode = 'touch_aim';
  private aimWeightSetting: AimWeightSetting = 'balanced';
  private aimAssistEnabled = true;
  private resizeTimers: number[] = [];

  // World entities & Sector Progression
  private player!: PlayerState;
  private alliedCamp!: CampState;
  private sector = 1;
  private barracksConquered = 0;
  private worldWidth = WORLD_WIDTH;
  private enemyBarracks: BarracksState | null = null;
  private conqueredBases: ConqueredBase[] = [];
  private tanks: TankEntity[] = [];
  private soldiers: SoldierEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private pickups: PickupEntity[] = [];
  private particles: Particle[] = [];
  private corpses: CorpseProp[] = [];
  private decals: GroundDecal[] = [];
  private floatingTexts: FloatingText[] = [];
  private scenery: SceneryProp[] = [];
  private clouds: CloudProp[] = [];

  // Wave & Scoring state
  private score = 0;
  private highScore = 0;
  private kills = 0;
  private wave = 1;
  private waveElapsed = 0;
  private waveDuration = 28;
  private waveKills = 0;
  private waveKillTarget = 16;
  private waveBannerText = '';
  private waveBannerSub = '';
  private waveBannerTimer = 0;
  private enemySpawnTimer = 0;
  private allySpawnTimer = 0;
  private pickupDropTimer = 10;
  private tankRespawnTimer = 0;
  private bossSpawnedForWave = 0;

  private combo = 1;
  private comboTimer = 0;
  private burstKillCount = 0;
  private burstKillWindow = 0;
  private playerCombatTimer = 0;
  private gameOverReason = '';
  private pickupToast = '';
  private pickupToastTimer = 0;
  private breakdown!: KillBreakdown;

  private hudCallback: (hud: HudSnapshot) => void;
  private hudThrottle = 0;

  constructor(canvas: HTMLCanvasElement, onHudUpdate: (hud: HudSnapshot) => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = ctx;
    this.hudCallback = onHudUpdate;

    try {
      const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
      if (saved) this.highScore = Math.max(0, parseInt(saved, 10) || 0);

      const savedControlMode = window.localStorage.getItem('bttf_control_mode');
      if (savedControlMode === 'touch_aim' || savedControlMode === 'twin_stick') {
        this.controlMode = savedControlMode;
      } else if (savedControlMode === 'free') {
        this.controlMode = 'twin_stick';
      }
      const savedWeight = window.localStorage.getItem('bttf_aim_weight') as AimWeightSetting | null;
      if (savedWeight && ['responsive', 'balanced', 'heavy'].includes(savedWeight)) {
        this.aimWeightSetting = savedWeight;
      }
      const savedAssist = window.localStorage.getItem('bttf_aim_assist');
      if (savedAssist !== null) {
        this.aimAssistEnabled = savedAssist === 'true';
      }
    } catch {
      // Ignore storage failures in sandboxed frames
    }

    this.generateWorldScenery();
    this.setupInitialWorld(true);
    this.bindEvents();
    this.handleResize();
  }

  public startLoop(): void {
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));

      this.update(dt);
      this.render();

      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  public destroy(): void {
    window.cancelAnimationFrame(this.rafId);
  }

  public startNewGame(): void {
    this.sound.unlock();
    this.resetTouchInputs();
    this.phase = 'playing';
    this.setupInitialWorld(false);
    this.handleResize();
    this.announceWave(1);
    this.sound.playWaveHorn();
    this.pushHud(true);
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.resetTouchInputs();
      this.pushHud(true);
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.handleResize();
      this.pushHud(true);
    }
  }

  public selectWeapon(id: WeaponId): void {
    if (this.phase !== 'playing' || !this.player.alive) return;
    if (!this.player.unlockedWeapons[id]) return;
    if (id !== 'pistol' && this.player.ammo[id] <= 0) return;
    if (this.player.activeWeapon !== id) {
      this.player.activeWeapon = id;
      this.player.spinUp = 0;
      this.pushHud(true);
    }
  }

  public toggleMute(): void {
    this.sound.unlock();
    this.sound.toggleMute();
    this.pushHud(true);
  }

  public setTouchMove(x: number, y: number): void {
    this.isTouchInput = true;
    this.sound.unlock();
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  public getControlMode(): ControlMode {
    return this.controlMode;
  }

  public setControlMode(mode: ControlMode): void {
    if (this.controlMode === mode) return;
    this.controlMode = mode;
    try {
      window.localStorage.setItem('bttf_control_mode', mode);
    } catch {}
    this.resetTouchInputs();
    this.pushHud(true);
  }

  public toggleControlMode(): void {
    this.setControlMode(this.controlMode === 'touch_aim' ? 'twin_stick' : 'touch_aim');
  }

  public setTouchAimPoint(active: boolean, clientX = 0, clientY = 0): void {
    this.isTouchInput = true;
    this.sound.unlock();
    if (!active || this.controlMode !== 'touch_aim' || this.phase !== 'playing' || !this.player.alive) {
      this.touchPointActive = false;
      return;
    }
    if (!this.touchPointActive) {
      this.touchTapQueued = true;
    }
    const rect = this.canvas.getBoundingClientRect();
    const safeScale = this.scale || 1;
    this.touchPointScreenX = (clientX - rect.left) / safeScale;
    this.touchPointScreenY = (clientY - rect.top) / safeScale;
    this.touchPointActive = true;
  }

  public setTouchFire(firing: boolean): void {
    this.setTouchFireControl(firing, false, 0, 0);
  }

  public setTouchFireControl(firing: boolean, dragging: boolean, aimX = 0, aimY = 0): void {
    const prevMode = !this.touchFiring ? 'idle' : this.touchAimDragging ? 'manual' : 'auto';
    this.isTouchInput = true;
    this.sound.unlock();
    this.touchFiring = firing;
    if (this.controlMode === 'twin_stick') {
      this.touchAimDragging = firing && dragging;
      if (dragging && Math.hypot(aimX, aimY) > 0.04) {
        this.touchAimX = aimX;
        this.touchAimY = aimY;
      }
      const nextMode = !this.touchFiring ? 'idle' : this.touchAimDragging ? 'manual' : 'auto';
      if (prevMode !== nextMode) {
        this.pushHud(true);
      }
    } else {
      this.touchAimDragging = false;
    }
  }

  public triggerFrag(): void {
    this.isTouchInput = true;
    this.sound.unlock();
    if (this.phase !== 'playing' || !this.player.alive || this.player.inTankId !== null) return;
    this.trySmartLobGrenade();
  }

  public setTouchFragAim(active: boolean, dragging: boolean, nx = 0, ny = 0): void {
    this.isTouchInput = true;
    this.sound.unlock();
    if (!active || this.phase !== 'playing' || !this.player.alive || this.player.inTankId !== null) {
      this.grenadeAiming = false;
      this.touchFragDragging = false;
      return;
    }
    if (dragging && this.player.grenades > 0) {
      this.grenadeAiming = true;
      this.touchFragDragging = true;
      this.touchFragX = nx;
      this.touchFragY = ny;
    } else {
      this.grenadeAiming = false;
      this.touchFragDragging = false;
    }
  }

  public releaseTouchFrag(wasDragged: boolean, nx = 0, ny = 0): void {
    this.isTouchInput = true;
    this.sound.unlock();
    this.grenadeAiming = false;
    this.touchFragDragging = false;
    if (this.phase !== 'playing' || !this.player.alive || this.player.inTankId !== null) return;

    if (wasDragged) {
      const target = this.computeTouchGrenadeTarget(nx, ny);
      this.tryThrowGrenadeAt(target.x, target.y);
    } else {
      this.trySmartLobGrenade();
    }
  }

  public setTouchCoax(firing: boolean): void {
    this.isTouchInput = true;
    this.sound.unlock();
    this.touchCoax = firing;
  }

  public setAimWeight(setting: AimWeightSetting): void {
    this.aimWeightSetting = setting;
    try {
      window.localStorage.setItem('bttf_aim_weight', setting);
    } catch {}
    this.pushHud(true);
  }

  public cycleAimWeight(): void {
    const cycle: Record<AimWeightSetting, AimWeightSetting> = {
      responsive: 'balanced',
      balanced: 'heavy',
      heavy: 'responsive',
    };
    this.setAimWeight(cycle[this.aimWeightSetting] || 'balanced');
  }

  public toggleAimAssist(): void {
    this.aimAssistEnabled = !this.aimAssistEnabled;
    try {
      window.localStorage.setItem('bttf_aim_assist', String(this.aimAssistEnabled));
    } catch {}
    this.pushHud(true);
  }

  private getSoldierAimY(s: SoldierEntity): number {
    return s.y - UNIT_STATS[s.kind].height * 0.48;
  }

  public getAimAssistTarget(
    originX: number,
    originY: number,
    desiredAngle: number,
    maxDist: number,
    coneAngle: number
  ): SoldierEntity | null {
    let bestTarget: SoldierEntity | null = null;
    let bestScore = -Infinity;

    for (const s of this.soldiers) {
      if (s.faction !== 'enemy' || s.hp <= 0) continue;
      const aimY = this.getSoldierAimY(s);
      const dx = s.x - originX;
      const dy = aimY - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist || dist < 16) continue;

      const angleTo = Math.atan2(dy, dx);
      const diff = Math.abs(Math.atan2(Math.sin(angleTo - desiredAngle), Math.cos(angleTo - desiredAngle)));
      if (diff > coneAngle) continue;

      const angleScore = 1 - diff / coneAngle;
      const distScore = 1 - dist / maxDist;
      const threatScore = s.kind === 'warlord' || s.kind === 'siege_ram' ? 1.5 : s.kind === 'cavalry' ? 1.3 : 1.0;
      const sticky = s.id === this.lockedTargetId ? 1.15 : 1.0;
      const score = (angleScore * 0.72 + distScore * 0.28) * threatScore * sticky;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = s;
      }
    }

    return bestTarget;
  }

  private findSmartLockTarget(
    originX: number,
    originY: number,
    weaponRange: number,
    projSpeed: number,
    explosive: boolean
  ): { angle: number; x: number; y: number; id: number | null; isBoss: boolean } | null {
    let bestSoldier: SoldierEntity | null = null;
    let bestScore = -Infinity;
    const scanMax = Math.max(weaponRange * 1.28, 780);

    for (const s of this.soldiers) {
      if (s.faction !== 'enemy' || s.hp <= 0) continue;
      const aimY = this.getSoldierAimY(s);
      const dx = s.x - originX;
      const dy = aimY - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > scanMax) continue;

      if (dist > 250 && (s.x < this.cameraX - 50 || s.x > this.cameraX + this.viewW + 95)) {
        continue;
      }

      const inRangeScore = dist <= weaponRange * 1.04 ? 1.55 : Math.max(0.1, 0.45 * (1 - (dist - weaponRange) / 360));
      const closeDanger = dist < 210 ? (1 - dist / 210) * 1.85 : 0;
      const distScore = 1 - Math.min(1, dist / scanMax);
      const threatMult =
        s.kind === 'warlord' || s.kind === 'siege_ram'
          ? explosive
            ? 1.45
            : 1.18
          : s.kind === 'cavalry' || s.kind === 'knight'
            ? explosive
              ? 1.28
              : 1.12
            : 1.0;

      const angTo = Math.atan2(dy, dx);
      const forwardCos = Math.cos(angTo - this.player.aimAngle);
      const forwardBias = dist < 165 ? 0 : forwardCos * 0.22;
      const stickyBonus = s.id === this.lockedTargetId ? 0.28 : 0;

      const total = (inRangeScore + closeDanger + distScore * 0.9 + forwardBias + stickyBonus) * threatMult;
      if (total > bestScore) {
        bestScore = total;
        bestSoldier = s;
      }
    }

    if (bestSoldier) {
      const aimY = this.getSoldierAimY(bestSoldier);
      const dist = Math.hypot(bestSoldier.x - originX, aimY - originY);
      const leadTime =
        projSpeed < 1100 ? Math.min(0.32, dist / projSpeed) * 0.62 : Math.min(0.08, dist / projSpeed) * 0.35;
      const leadX = bestSoldier.x + bestSoldier.vx * leadTime;
      const leadY = aimY + bestSoldier.vy * leadTime;
      return {
        angle: Math.atan2(leadY - originY, leadX - originX),
        x: bestSoldier.x,
        y: aimY,
        id: bestSoldier.id,
        isBoss: Boolean(UNIT_STATS[bestSoldier.kind].isBoss),
      };
    }

    if (this.enemyBarracks && !this.enemyBarracks.destroyed) {
      const eb = this.enemyBarracks;
      const bx = eb.x + 8;
      const by = eb.y - 36;
      const bDist = Math.hypot(bx - originX, by - originY);
      if (bDist <= weaponRange * 1.18 && eb.x <= this.cameraX + this.viewW + 140) {
        return {
          angle: Math.atan2(by - originY, bx - originX),
          x: bx,
          y: by,
          id: null,
          isBoss: true,
        };
      }
    }

    return null;
  }

  public triggerDodge(): void {
    this.isTouchInput = true;
    this.sound.unlock();
    if (this.phase === 'playing' && this.player.alive && this.player.inTankId === null) {
      this.tryDodgeRoll();
    }
  }

  public triggerTankToggle(): void {
    this.isTouchInput = true;
    this.sound.unlock();
    if (this.phase === 'playing' && this.player.alive) {
      this.tryToggleTank();
    }
  }

  public resetTouchInputs(): void {
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchFiring = false;
    this.touchAimDragging = false;
    this.touchPointActive = false;
    this.touchTapQueued = false;
    this.touchCoax = false;
    this.combatStrafeTimer = 0;
    this.grenadeAiming = false;
    this.touchFragDragging = false;
    this.lockedTargetId = null;
    this.lockedTargetPos = null;
    this.isAutoLocked = false;
  }

  private generateWorldScenery(): void {
    const rand = seededRandom(19851345);
    this.scenery = [];
    this.clouds = [];

    // Drifting sky clouds
    for (let i = 0; i < 11; i++) {
      this.clouds.push({
        x: rand() * 1900,
        y: 38 + rand() * 105,
        scale: 0.72 + rand() * 0.85,
        speed: 6 + rand() * 11,
        variant: i,
      });
    }

    this.generateSceneryForRange(60, this.worldWidth - 60, 290);
  }

  private generateSceneryForRange(minX: number, maxX: number, count = 280): void {
    const seed = Math.floor(Math.abs(minX * 17 + maxX * 31)) || 19851345;
    const rand = seededRandom(seed);

    for (let i = 0; i < count; i++) {
      const x = minX + rand() * (maxX - minX);
      const y = PLAYABLE_Y_MIN - 26 + rand() * (LOGICAL_HEIGHT - PLAYABLE_Y_MIN + 10);
      const roadY = getRoadCenterY(x);
      const roadHW = getRoadHalfWidth(x);
      const onRoad = Math.abs(y - roadY) < roadHW * 0.88;

      if (onRoad) {
        if (rand() < 0.3) {
          this.scenery.push({
            x,
            y,
            kind: 'pebbles',
            scale: 0.7 + rand() * 0.5,
            variant: (this.scenery.length + i) % 8,
          });
        }
        continue;
      }

      const roll = rand();
      const kind: SceneryProp['kind'] =
        roll < 0.56 ? 'grass' : roll < 0.76 ? 'rock' : roll < 0.9 ? 'pebbles' : 'dirt_patch';
      this.scenery.push({
        x,
        y,
        kind,
        scale: 0.72 + rand() * 0.65,
        variant: (this.scenery.length + i) % 8,
      });
    }

    this.scenery.sort((a, b) => a.y - b.y);
  }

  private setupInitialWorld(isTitleDemo: boolean): void {
    this.nextId = 1;
    this.timeSurvived = 0;
    this.hitstopTimer = 0;
    this.shakeMag = 0;
    this.recoilBloom = 0;

    this.score = 0;
    this.kills = 0;
    this.wave = 1;
    this.waveElapsed = 0;
    this.waveDuration = 28;
    this.waveKills = 0;
    this.waveKillTarget = 16;
    this.waveBannerTimer = 0;
    this.enemySpawnTimer = 1.4;
    this.allySpawnTimer = 2.6;
    this.pickupDropTimer = 11.5;
    this.tankRespawnTimer = 0;
    this.bossSpawnedForWave = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.burstKillCount = 0;
    this.burstKillWindow = 0;
    this.playerCombatTimer = 0;
    this.gameOverReason = '';
    this.pickupToast = '';
    this.pickupToastTimer = 0;

    this.breakdown = {
      footman: 0,
      archer: 0,
      spearman: 0,
      knight: 0,
      cavalry: 0,
      siege_ram: 0,
      warlord: 0,
      roadkills: 0,
    };

    this.sector = 1;
    this.barracksConquered = 0;
    this.worldWidth = WORLD_WIDTH;
    this.conqueredBases = [];

    this.alliedCamp = {
      x: ALLIED_CAMP_X,
      y: ALLIED_CAMP_Y,
      hp: ALLIED_CAMP_MAX_HP,
      maxHp: ALLIED_CAMP_MAX_HP,
      hitFlash: 0,
      flagPhase: 0,
    };

    this.enemyBarracks = {
      id: this.nextId++,
      sector: 1,
      name: `BARRACKS I: ${SECTOR_NAMES[0]}`,
      x: ENEMY_CAMP_X,
      y: getRoadCenterY(ENEMY_CAMP_X) - 4,
      hp: 1400,
      maxHp: 1400,
      hitFlash: 0,
      flagPhase: 1.4,
      faction: 'enemy',
      destroyed: false,
      collapseTimer: 0,
    };

    const startX = 435;
    const startY = getRoadCenterY(startX) + 18;
    this.player = {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      aimAngle: -0.05,
      facing: 1,
      activeWeapon: 'pistol',
      unlockedWeapons: {
        pistol: true,
        shotgun: false,
        rifle: false,
        minigun: false,
        rocket: false,
      },
      ammo: {
        pistol: Infinity,
        shotgun: 0,
        rifle: 0,
        minigun: 0,
        rocket: 0,
      },
      grenades: 4,
      maxGrenades: 12,
      fireCooldown: 0,
      grenadeCooldown: 0,
      weaponRecoil: 0,
      spinUp: 0,
      walkPhase: 0,
      inTankId: null,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      dodgeDirX: 1,
      dodgeDirY: 0,
      invulnTimer: 0,
      hitFlash: 0,
      muzzleFlashTimer: 0,
      alive: true,
    };

    this.tanks = [];
    this.soldiers = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles = [];
    this.corpses = [];
    this.decals = [];
    this.floatingTexts = [];

    // Signature drivable Tank right near the Allied Camp road (just like image.png!)
    this.spawnTank(480, getRoadCenterY(480) + 10, false);

    // Inviting military supply crates ahead on the road to pick up as you push forward!
    this.spawnPickup('rifle', 860, getRoadCenterY(860) + 64, false);
    this.spawnPickup('grenade', 1240, getRoadCenterY(1240) - 34, false);
    this.spawnPickup('shotgun', 1620, getRoadCenterY(1620) + 52, false);
    this.spawnPickup('rocket', 2080, getRoadCenterY(2080) - 24, false);

    // Starting clash of Blue Allies vs Red Enemies (echoing image.png immediately!)
    const initialAllies: [number, number, UnitKind][] = [
      [470, getRoadCenterY(470) - 90, 'footman'],
      [755, getRoadCenterY(755) + 46, 'footman'],
      [785, getRoadCenterY(785) + 20, 'footman'],
      [1045, getRoadCenterY(1045) - 6, 'footman'],
      [1095, getRoadCenterY(1095) - 34, 'footman'],
      [1135, getRoadCenterY(1135) - 18, 'footman'],
    ];
    for (const [ax, ay, kind] of initialAllies) {
      this.spawnSoldier('ally', kind, ax, ay);
    }

    const initialEnemies: [number, number, UnitKind][] = [
      [1190, getRoadCenterY(1190) - 12, 'footman'],
      [1235, getRoadCenterY(1235) + 22, 'footman'],
      [1295, getRoadCenterY(1295) - 36, 'footman'],
      [1385, getRoadCenterY(1385) + 8, 'footman'],
      [1480, getRoadCenterY(1480) - 20, 'footman'],
    ];
    for (const [ex, ey, kind] of initialEnemies) {
      this.spawnSoldier('enemy', kind, ex, ey);
    }

    this.cameraX = isTitleDemo ? 0 : Math.max(0, this.player.x - this.viewW * 0.34);
  }

  private scheduleResize(): void {
    this.handleResize();
    for (const id of this.resizeTimers) window.clearTimeout(id);
    this.resizeTimers = [
      window.setTimeout(() => this.handleResize(), 120),
      window.setTimeout(() => this.handleResize(), 320),
    ];
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.scheduleResize());
    window.addEventListener('orientationchange', () => {
      this.resetTouchInputs();
      this.scheduleResize();
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.scheduleResize());
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keys.clear();
        this.mouseDownLeft = false;
        this.mouseDownRight = false;
        this.resetTouchInputs();
      } else {
        this.scheduleResize();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      this.sound.unlock();

      if (e.repeat) return;

      if (e.code === 'KeyM') {
        this.toggleMute();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.phase === 'playing' || this.phase === 'paused') {
          this.togglePause();
        }
        return;
      }

      if (e.code === 'KeyR' && this.phase === 'gameover') {
        this.startNewGame();
        return;
      }

      if (this.phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        this.startNewGame();
        return;
      }

      if (this.phase !== 'playing' || !this.player.alive) return;

      if (e.code === 'KeyE') {
        this.tryToggleTank();
      } else if (e.code === 'KeyG') {
        if (this.player.inTankId === null && this.player.grenades > 0 && this.player.grenadeCooldown <= 0) {
          this.grenadeAiming = true;
        }
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        if (this.player.inTankId === null) {
          this.tryDodgeRoll();
        }
      } else if (e.code === 'Digit1') {
        this.selectWeapon('pistol');
      } else if (e.code === 'Digit2') {
        this.selectWeapon('shotgun');
      } else if (e.code === 'Digit3') {
        this.selectWeapon('rifle');
      } else if (e.code === 'Digit4') {
        this.selectWeapon('minigun');
      } else if (e.code === 'Digit5') {
        this.selectWeapon('rocket');
      } else if (e.code === 'KeyQ') {
        this.cycleWeapon(1);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyG' && this.grenadeAiming && !this.isTouchInput) {
        this.grenadeAiming = false;
        if (this.phase === 'playing' && this.player.alive && this.player.inTankId === null) {
          this.tryThrowFreeGrenade();
        }
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
      this.grenadeAiming = false;
      this.resetTouchInputs();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.isTouchInput = false;
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isTouchInput) return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouseScreenX = (e.clientX - rect.left) / this.scale;
      this.mouseScreenY = (e.clientY - rect.top) / this.scale;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.isTouchInput = false;
      this.sound.unlock();
      const rect = this.canvas.getBoundingClientRect();
      this.mouseScreenX = (e.clientX - rect.left) / this.scale;
      this.mouseScreenY = (e.clientY - rect.top) / this.scale;

      if (e.button === 0) {
        this.mouseDownLeft = true;
      } else if (e.button === 2) {
        this.mouseDownRight = true;
        if (
          this.phase === 'playing' &&
          this.player.alive &&
          this.player.inTankId === null &&
          this.player.grenades > 0 &&
          this.player.grenadeCooldown <= 0
        ) {
          this.grenadeAiming = true;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) {
        this.mouseDownRight = false;
        if (this.grenadeAiming && !this.isTouchInput) {
          this.grenadeAiming = false;
          if (this.phase === 'playing' && this.player.alive && this.player.inTankId === null) {
            this.tryThrowFreeGrenade();
          }
        }
      }
    });

    // Mark touch input and unlock audio on canvas touch without hijacking movement aim
    this.canvas.addEventListener(
      'touchstart',
      () => {
        this.isTouchInput = true;
        this.sound.unlock();
      },
      { passive: true }
    );

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.phase !== 'playing' || !this.player.alive) return;
        e.preventDefault();
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false }
    );
  }

  public handleResize(): void {
    const parent = this.canvas.parentElement;
    const vv = window.visualViewport;
    const cssW = Math.max(320, Math.round(vv ? vv.width : parent ? parent.clientWidth : window.innerWidth));
    const cssH = Math.max(240, Math.round(vv ? vv.height : parent ? parent.clientHeight : window.innerHeight));

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = cssH / LOGICAL_HEIGHT;
    const rawViewW = cssW / this.scale;

    if (rawViewW < 680) {
      // Narrow portrait viewport: scale by width so horizontal battlefield sightline stays generous
      this.viewW = 680;
      this.scale = cssW / this.viewW;
    } else if (rawViewW > 2000) {
      // Ultra-wide screen: scale up cleanly so there is never an unpainted right gap
      this.viewW = 2000;
      this.scale = cssW / this.viewW;
    } else {
      this.viewW = Math.ceil(rawViewW);
    }

    this.viewH = Math.ceil(cssH / this.scale);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);

    // Keep camera inside world bounds cleanly across orientation changes
    if (this.player) {
      this.cameraX = Math.max(0, Math.min(this.worldWidth - this.viewW, this.cameraX));
    }
  }

  public cycleWeapon(dir: 1 | -1 = 1): void {
    const available = WEAPON_ORDER.filter(
      (id) => this.player.unlockedWeapons[id] && (id === 'pistol' || this.player.ammo[id] > 0)
    );
    if (available.length <= 1) return;
    const idx = available.indexOf(this.player.activeWeapon);
    const next = available[(idx + dir + available.length) % available.length];
    this.selectWeapon(next);
  }

  private update(dt: number): void {
    this.time += dt;

    // Drifting sky clouds always animate smoothly
    for (const cl of this.clouds) {
      cl.x += cl.speed * dt;
    }

    if (this.phase === 'paused') {
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateShake(dt);
      return;
    }

    // Live title-screen attract skirmish!
    if (this.phase === 'title') {
      this.updateTitleAttract(dt);
      this.pushHud(false, dt);
      return;
    }

    if (this.phase === 'gameover') {
      this.updateParticlesAndProps(dt);
      this.updateShake(dt);
      this.pushHud(false, dt);
      return;
    }

    // Playing state
    this.timeSurvived += dt;
    this.playerCombatTimer += dt;
    if (this.waveBannerTimer > 0) this.waveBannerTimer = Math.max(0, this.waveBannerTimer - dt);
    if (this.pickupToastTimer > 0) this.pickupToastTimer = Math.max(0, this.pickupToastTimer - dt);
    if (this.alliedCamp.hitFlash > 0) this.alliedCamp.hitFlash = Math.max(0, this.alliedCamp.hitFlash - dt);

    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) this.combo = 1;
    }
    if (this.burstKillWindow > 0) {
      this.burstKillWindow = Math.max(0, this.burstKillWindow - dt);
      if (this.burstKillWindow === 0) this.burstKillCount = 0;
    }

    this.recoilBloom = Math.max(0, this.recoilBloom - dt * 3.8);

    this.updateWaveDirector(dt);
    this.updatePlayerAndTank(dt);
    this.updatePickups(dt);
    this.updateSoldiers(dt);
    this.updateProjectiles(dt);
    this.updateParticlesAndProps(dt);
    this.updateCamera(dt);
    this.updateShake(dt);
    this.pushHud(false, dt);
  }

  private updateTitleAttract(dt: number): void {
    // Keep a scenic live skirmish going on the title screen
    this.allySpawnTimer -= dt;
    this.enemySpawnTimer -= dt;
    const allies = this.soldiers.filter((s) => s.faction === 'ally').length;
    const enemies = this.soldiers.filter((s) => s.faction === 'enemy').length;
    if (this.allySpawnTimer <= 0 && allies < 9) {
      this.allySpawnTimer = 2.6;
      this.spawnSoldier('ally', 'footman', ALLIED_CAMP_X + 60, getRoadCenterY(ALLIED_CAMP_X + 60) + (Math.random() - 0.5) * 110);
    }
    if (this.enemySpawnTimer <= 0 && enemies < 10) {
      this.enemySpawnTimer = 2.4;
      this.spawnSoldier('enemy', Math.random() < 0.25 ? 'archer' : 'footman', this.viewW + 40, getRoadCenterY(this.viewW) + (Math.random() - 0.5) * 120);
    }
    this.alliedCamp.hp = ALLIED_CAMP_MAX_HP;
    this.updateSoldiers(dt, true);
    this.updateProjectiles(dt);
    this.updateParticlesAndProps(dt);
  }

  private updateWaveDirector(dt: number): void {
    this.waveElapsed += dt;

    // Advance endless escalating wave when either kill target or wave clock hits!
    if (this.waveKills >= this.waveKillTarget || this.waveElapsed >= this.waveDuration) {
      this.wave++;
      this.waveElapsed = 0;
      this.waveKills = 0;
      this.waveDuration = Math.min(44, 28 + this.wave * 2);
      this.waveKillTarget = Math.round(14 + this.wave * 6.5);
      this.announceWave(this.wave);
      this.sound.playWaveHorn();

      // Wave milestone reward: camp field repairs + allied rally squad!
      this.alliedCamp.hp = Math.min(this.alliedCamp.maxHp, this.alliedCamp.hp + 120);
      this.spawnFloatingText(this.alliedCamp.x + 40, this.alliedCamp.y - 120, 'REINFORCEMENTS!', '#66b5ff', 16);

      const rallyCount = Math.min(5, 2 + Math.floor(this.wave / 2));
      for (let i = 0; i < rallyCount; i++) {
        const allyKind: UnitKind =
          this.wave >= 4 && i === 0
            ? 'knight'
            : this.wave >= 3 && i === 1
              ? 'spearman'
              : this.wave >= 2 && i === 2
                ? 'archer'
                : 'footman';
        this.spawnSoldier(
          'ally',
          allyKind,
          this.alliedCamp.x + 40 + i * 28,
          getRoadCenterY(this.alliedCamp.x + 60) + (Math.random() - 0.5) * 120
        );
      }

      // Bonus parachute crate on every wave transition!
      this.dropParachuteCrate();
    }

    const enemyCampLimitX = this.enemyBarracks ? this.enemyBarracks.x : this.worldWidth - 100;

    // Spawn Boss / Siege Ram once per wave starting Wave 6+
    if (this.wave >= 6 && this.bossSpawnedForWave < this.wave && this.waveElapsed > 6) {
      this.bossSpawnedForWave = this.wave;
      const bossKind: UnitKind = this.wave % 2 === 0 ? 'siege_ram' : 'warlord';
      const spawnX = Math.min(enemyCampLimitX - 40, Math.max(this.cameraX + this.viewW + 120, this.alliedCamp.x + 1200));
      this.spawnSoldier('enemy', bossKind, spawnX, getRoadCenterY(spawnX));
      this.sound.playWaveHorn();
      this.showToast(
        bossKind === 'siege_ram' ? 'WARNING: SIEGE BATTERING RAM APPROACHING!' : 'WARNING: IRON WARLORD HAS ENTERED THE FIELD!'
      );
    }

    // Enemy continuous escalating spawner
    this.enemySpawnTimer -= dt;
    const enemyCount = this.soldiers.reduce((acc, s) => acc + (s.faction === 'enemy' ? 1 : 0), 0);
    const maxEnemies = Math.min(46, 14 + this.wave * 4);

    if (this.enemySpawnTimer <= 0 && enemyCount < maxEnemies) {
      const baseInterval = Math.max(0.75, 2.45 - this.wave * 0.19);
      this.enemySpawnTimer = baseInterval * (0.75 + Math.random() * 0.5);

      // Spawn a small squad of 1..3 enemies
      const squadSize = Math.min(4, 1 + Math.floor((this.wave + Math.random() * 2) / 2.2));
      const minSpawnX = Math.min(enemyCampLimitX - 60, Math.max(this.cameraX + this.viewW + 85, this.player.x + 640));

      for (let i = 0; i < squadSize; i++) {
        if (enemyCount + i >= maxEnemies) break;
        const kind = this.pickEnemyKindForWave(this.wave);
        const sx = Math.min(enemyCampLimitX - 20, minSpawnX + i * 38 + Math.random() * 55);
        const sy = Math.max(
          PLAYABLE_Y_MIN + 14,
          Math.min(PLAYABLE_Y_MAX - 14, getRoadCenterY(sx) + (Math.random() - 0.5) * 210)
        );
        this.spawnSoldier('enemy', kind, sx, sy);
      }
    }

    // Allied continuous steady reinforcements from active ALLIED CAMP
    this.allySpawnTimer -= dt;
    const allyCount = this.soldiers.reduce((acc, s) => acc + (s.faction === 'ally' ? 1 : 0), 0);
    const maxAllies = Math.min(20, 10 + Math.floor(this.wave * 1.1));
    if (this.allySpawnTimer <= 0 && allyCount < maxAllies) {
      this.allySpawnTimer = Math.max(1.75, 3.3 - Math.min(1.1, this.combo * 0.16));
      const r = Math.random();
      let kind: UnitKind = 'footman';
      if (this.wave >= 4 && r < 0.18) kind = 'knight';
      else if (this.wave >= 3 && r < 0.38) kind = 'spearman';
      else if (this.wave >= 2 && r < 0.56) kind = 'archer';

      const sy = Math.max(
        PLAYABLE_Y_MIN + 20,
        Math.min(PLAYABLE_Y_MAX - 20, getRoadCenterY(this.alliedCamp.x + 70) + (Math.random() - 0.5) * 165)
      );
      this.spawnSoldier('ally', kind, this.alliedCamp.x + 45, sy);
    }

    // Periodic parachute supply crates
    this.pickupDropTimer -= dt;
    if (this.pickupDropTimer <= 0) {
      this.pickupDropTimer = Math.max(8.5, 13.5 - this.wave * 0.35);
      if (this.pickups.length < 7) {
        this.dropParachuteCrate();
      }
    }

    // Tank replacement airdrop if all tanks destroyed
    if (this.tanks.length === 0) {
      if (this.tankRespawnTimer <= 0) {
        this.tankRespawnTimer = 28;
      } else {
        this.tankRespawnTimer -= dt;
        if (this.tankRespawnTimer <= 0) {
          const dropX = Math.max(this.alliedCamp.x + 180, Math.min(this.worldWidth - 480, this.player.x + 120));
          const dropY = getRoadCenterY(dropX);
          this.spawnTank(dropX, dropY, true);
          this.showToast('TANK AIRDROP INBOUND! PRESS [E] TO BOARD!');
          this.sound.playPickup(true);
        }
      }
    }
  }

  private pickEnemyKindForWave(wave: number): UnitKind {
    const r = Math.random();
    if (wave === 1) return 'footman';
    if (wave === 2) return r < 0.32 ? 'archer' : 'footman';
    if (wave === 3) {
      if (r < 0.25) return 'spearman';
      if (r < 0.5) return 'archer';
      return 'footman';
    }
    if (wave === 4) {
      if (r < 0.2) return 'knight';
      if (r < 0.42) return 'spearman';
      if (r < 0.65) return 'archer';
      return 'footman';
    }
    if (wave === 5) {
      if (r < 0.18) return 'cavalry';
      if (r < 0.38) return 'knight';
      if (r < 0.58) return 'spearman';
      if (r < 0.78) return 'archer';
      return 'footman';
    }
    // Wave 6+ intense combined arms!
    if (r < 0.06 && wave >= 7) return 'siege_ram';
    if (r < 0.24) return 'cavalry';
    if (r < 0.48) return 'knight';
    if (r < 0.68) return 'spearman';
    if (r < 0.85) return 'archer';
    return 'footman';
  }

  private dropParachuteCrate(): void {
    const activeTank = this.tanks[0];
    const needHeal =
      this.player.hp < this.player.maxHp * 0.62 ||
      this.alliedCamp.hp < this.alliedCamp.maxHp * 0.68 ||
      (activeTank && activeTank.hp < activeTank.maxHp * 0.45);

    const pool: PickupKind[] = ['rifle', 'shotgun', 'grenade', 'rocket', 'ammo_all'];
    if (this.wave >= 2) pool.push('minigun', 'rocket');
    if (this.wave >= 3) pool.push('minigun');
    if (needHeal) pool.push('medkit', 'medkit');
    else pool.push('medkit');

    const kind = pool[Math.floor(Math.random() * pool.length)];
    const anchorX = this.player.x;
    const dropX = Math.max(
      this.alliedCamp.x + 180,
      Math.min(this.worldWidth - 320, anchorX + 120 + (Math.random() - 0.3) * 440)
    );
    const dropY = Math.max(
      PLAYABLE_Y_MIN + 26,
      Math.min(PLAYABLE_Y_MAX - 24, getRoadCenterY(dropX) + (Math.random() - 0.5) * 180)
    );

    this.spawnPickup(kind, dropX, dropY, true);
  }

  private announceWave(wave: number): void {
    this.waveBannerText = `WAVE ${wave}`;
    this.waveBannerSub = WAVE_SUBTITLES[Math.min(WAVE_SUBTITLES.length - 1, wave - 1)];
    this.waveBannerTimer = 3.2;
  }

  private showToast(msg: string): void {
    this.pickupToast = msg;
    this.pickupToastTimer = 2.8;
  }

  private updatePlayerAndTank(dt: number): void {
    const p = this.player;
    if (!p.alive) return;

    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.grenadeCooldown = Math.max(0, p.grenadeCooldown - dt);
    p.weaponRecoil = Math.max(0, p.weaponRecoil - dt * 42);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.muzzleFlashTimer = Math.max(0, p.muzzleFlashTimer - dt);

    // Gentle out-of-combat health recovery
    if (this.playerCombatTimer > 4.5 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 4.5 * dt);
    }

    // Update all tanks (parachuting, cooldowns, damage smoke)
    for (const tank of this.tanks) {
      tank.cannonCooldown = Math.max(0, tank.cannonCooldown - dt);
      tank.coaxCooldown = Math.max(0, tank.coaxCooldown - dt);
      tank.cannonRecoil = Math.max(0, tank.cannonRecoil - dt * 36);
      tank.hitFlash = Math.max(0, tank.hitFlash - dt);

      for (const [eid, cd] of tank.roadkillCooldowns) {
        if (cd - dt <= 0) tank.roadkillCooldowns.delete(eid);
        else tank.roadkillCooldowns.set(eid, cd - dt);
      }

      if (tank.parachuteZ > 0) {
        tank.parachuteSway += dt * 2.4;
        tank.parachuteZ = Math.max(0, tank.parachuteZ - 115 * dt);
        if (tank.parachuteZ === 0) {
          this.addShake(7);
          this.spawnDustBurst(tank.x, tank.y + 8, 18);
          this.sound.playExplosion(0.45);
        }
      }

      // Critical damage dark engine smoke
      if (tank.hp < tank.maxHp * 0.35) {
        tank.smokeTimer -= dt;
        if (tank.smokeTimer <= 0) {
          tank.smokeTimer = 0.09;
          this.particles.push({
            x: tank.x - tank.facing * 26 + (Math.random() - 0.5) * 12,
            y: tank.y - 26,
            z: 8,
            vx: -tank.facing * 20 + (Math.random() - 0.5) * 18,
            vy: -14,
            vz: 48,
            size: 7,
            endSize: 22,
            color: tank.hp < tank.maxHp * 0.18 && Math.random() < 0.35 ? '#ff7b29' : '#3a3b38',
            alpha: 0.72,
            life: 0.7,
            maxLife: 0.7,
            gravity: -15,
            kind: 'smoke',
            rotation: 0,
            vRot: 0,
          });
        }
      }
    }

    // Movement Input Vector (keyboard + analog virtual move stick)
    let moveX = this.touchMoveX;
    let moveY = this.touchMoveY;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const wep = WEAPONS[p.activeWeapon];
    const activeTank = p.inTankId !== null ? this.tanks.find((t) => t.id === p.inTankId) ?? null : null;
    if (p.inTankId !== null && !activeTank) {
      p.inTankId = null;
    }
    const inTank = activeTank !== null;
    const originX = activeTank ? activeTank.x + activeTank.facing * -4 : p.x;
    const originY = inTank ? p.y - 44 : p.y - 28;
    const isTouchDirect = this.isTouchInput && this.controlMode === 'touch_aim';
    const touchDirectFiring = isTouchDirect && (this.touchPointActive || this.touchTapQueued);
    this.touchTapQueued = false;

    // Firing inputs: LMB on desktop, direct battlefield touch in Touch-to-Shoot, or FIRE stick in Twin-Stick
    const wantFire = this.mouseDownLeft || touchDirectFiring || (this.controlMode === 'twin_stick' && this.touchFiring);
    const wantCoax = this.mouseDownRight || this.keys.has('Space') || this.touchCoax;

    let targetAimAngle = p.aimAngle;
    this.lockedTargetId = null;
    this.lockedTargetPos = null;
    this.isAutoLocked = false;

    // Post-fire Combat Strafe grace window so rapid tap-firing while kiting never spins you backward!
    if (this.isTouchInput && (touchDirectFiring || this.touchFiring || (inTank && this.touchCoax))) {
      this.combatStrafeTimer = isTouchDirect ? 0.55 : 0.65;
    } else {
      this.combatStrafeTimer = Math.max(0, this.combatStrafeTimer - dt);
    }

    if (!this.isTouchInput) {
      // Desktop: Instant 1:1 mouse aim + subtle cursor-space chest magnetism when hovering an enemy
      const worldMouseX = this.cameraX + this.mouseScreenX;
      targetAimAngle = Math.atan2(this.mouseScreenY - originY, worldMouseX - originX);

      if (this.aimAssistEnabled) {
        const maxRange = (inTank ? 880 : wep.range) * 1.15;
        let bestCursorEnemy: SoldierEntity | null = null;
        let bestCursorDist = Infinity;

        for (const s of this.soldiers) {
          if (s.faction !== 'enemy' || s.hp <= 0) continue;
          const aimY = this.getSoldierAimY(s);
          if (Math.hypot(s.x - originX, aimY - originY) > maxRange) continue;
          const captureR = UNIT_STATS[s.kind].radius + 26;
          const cDist = Math.hypot(s.x - worldMouseX, aimY - this.mouseScreenY);
          if (cDist <= captureR && cDist < bestCursorDist) {
            bestCursorDist = cDist;
            bestCursorEnemy = s;
          }
        }

        if (bestCursorEnemy) {
          const aimY = this.getSoldierAimY(bestCursorEnemy);
          const captureR = UNIT_STATS[bestCursorEnemy.kind].radius + 26;
          this.lockedTargetId = bestCursorEnemy.id;
          this.lockedTargetPos = {
            x: bestCursorEnemy.x,
            y: aimY,
            isBoss: Boolean(UNIT_STATS[bestCursorEnemy.kind].isBoss),
          };
          const exactAng = Math.atan2(aimY - originY, bestCursorEnemy.x - originX);
          const angDiff = Math.atan2(Math.sin(exactAng - targetAimAngle), Math.cos(exactAng - targetAimAngle));
          const pull = 0.55 + 0.3 * (1 - bestCursorDist / captureR);
          targetAimAngle += angDiff * pull;
        }
      }
    } else if (touchDirectFiring) {
      // Mobile Touch-to-Shoot: Aim & fire directly at the player's fingertip on the battlefield!
      const worldTouchX = this.cameraX + this.touchPointScreenX;
      const worldTouchY = this.touchPointScreenY;
      const dx = worldTouchX - originX;
      const dy = worldTouchY - originY;
      if (Math.hypot(dx, dy) > 10) {
        targetAimAngle = Math.atan2(dy, dx);
      }

      if (this.aimAssistEnabled) {
        const maxRange = (inTank ? 920 : wep.range) * 1.18;
        let bestTouchEnemy: SoldierEntity | null = null;
        let bestTouchDist = Infinity;

        for (const s of this.soldiers) {
          if (s.faction !== 'enemy' || s.hp <= 0) continue;
          const aimY = this.getSoldierAimY(s);
          if (Math.hypot(s.x - originX, aimY - originY) > maxRange) continue;
          const captureR = UNIT_STATS[s.kind].radius + 36;
          const cDist = Math.hypot(s.x - worldTouchX, aimY - worldTouchY);
          if (cDist <= captureR && cDist < bestTouchDist) {
            bestTouchDist = cDist;
            bestTouchEnemy = s;
          }
        }

        if (bestTouchEnemy) {
          const aimY = this.getSoldierAimY(bestTouchEnemy);
          const captureR = UNIT_STATS[bestTouchEnemy.kind].radius + 36;
          this.lockedTargetId = bestTouchEnemy.id;
          this.lockedTargetPos = {
            x: bestTouchEnemy.x,
            y: aimY,
            isBoss: Boolean(UNIT_STATS[bestTouchEnemy.kind].isBoss),
          };
          const exactAng = Math.atan2(aimY - originY, bestTouchEnemy.x - originX);
          const angDiff = Math.atan2(Math.sin(exactAng - targetAimAngle), Math.cos(exactAng - targetAimAngle));
          const pull = 0.68 + 0.32 * (1 - bestTouchDist / captureR);
          targetAimAngle += angDiff * pull;
        } else if (this.enemyBarracks && !this.enemyBarracks.destroyed) {
          const eb = this.enemyBarracks;
          const bx = eb.x + 8;
          const by = eb.y - 36;
          if (Math.hypot(bx - worldTouchX, by - worldTouchY) <= 74 && Math.hypot(bx - originX, by - originY) <= maxRange) {
            this.lockedTargetPos = { x: bx, y: by, isBoss: true };
            targetAimAngle = Math.atan2(by - originY, bx - originX);
          }
        }
      }
    } else if (this.controlMode === 'twin_stick' && this.touchAimDragging) {
      // Mobile Twin-Stick Manual Drag Override: direct 360° skillshot aim
      const yScale = inTank ? 0.82 : 0.88;
      targetAimAngle = Math.atan2(this.touchAimY * yScale, this.touchAimX);

      if (this.aimAssistEnabled) {
        const assistTarget = this.getAimAssistTarget(
          originX,
          originY,
          targetAimAngle,
          AIM_ASSIST_CONFIG.maxRange,
          AIM_ASSIST_CONFIG.coneAngle
        );
        if (assistTarget) {
          const aimY = this.getSoldierAimY(assistTarget);
          this.lockedTargetId = assistTarget.id;
          this.lockedTargetPos = {
            x: assistTarget.x,
            y: aimY,
            isBoss: Boolean(UNIT_STATS[assistTarget.kind].isBoss),
          };
          const targetAng = Math.atan2(aimY - originY, assistTarget.x - originX);
          const angDiff = Math.atan2(Math.sin(targetAng - targetAimAngle), Math.cos(targetAng - targetAimAngle));
          const pull = AIM_ASSIST_CONFIG.magneticPull * (1 - Math.abs(angDiff) / AIM_ASSIST_CONFIG.coneAngle);
          targetAimAngle += angDiff * pull;
        }
      }
    } else if (this.grenadeAiming && this.touchFragDragging) {
      targetAimAngle = Math.atan2(this.touchFragY * 0.85, this.touchFragX);
    } else if (
      (this.controlMode === 'twin_stick' && (wantFire || (inTank && wantCoax) || this.combatStrafeTimer > 0)) ||
      (isTouchDirect && inTank && wantCoax)
    ) {
      // Mobile Smart Auto-Lock + Combat Strafe (Twin-Stick fire/strafe, or Tank MG button without touching battlefield)
      const lock = this.findSmartLockTarget(
        originX,
        originY,
        inTank ? 880 : wep.range,
        inTank ? 980 : wep.speed,
        inTank || wep.explosiveRadius > 0
      );
      if (lock) {
        targetAimAngle = lock.angle;
        this.lockedTargetId = lock.id;
        this.lockedTargetPos = { x: lock.x, y: lock.y, isBoss: lock.isBoss };
        this.isAutoLocked = true;
      } else if (this.enemyBarracks && !this.enemyBarracks.destroyed && this.enemyBarracks.x > p.x) {
        if (Math.cos(targetAimAngle) < 0.2) {
          targetAimAngle = 0;
        }
      }
    } else if (isTouchDirect && this.combatStrafeTimer > 0) {
      // Brief kiting grace after lifting finger in Touch-to-Shoot so soldier holds firing stance
      targetAimAngle = p.aimAngle;
    } else if (mag > 0.14) {
      const yScale = inTank ? 0.72 : 0.78;
      targetAimAngle = Math.atan2(moveY * yScale, moveX);
      if (this.aimAssistEnabled) {
        const assistTarget = this.getAimAssistTarget(
          originX,
          originY,
          targetAimAngle,
          AIM_ASSIST_CONFIG.maxRange,
          AIM_ASSIST_CONFIG.coneAngle
        );
        if (assistTarget) {
          const aimY = this.getSoldierAimY(assistTarget);
          this.lockedTargetId = assistTarget.id;
          this.lockedTargetPos = {
            x: assistTarget.x,
            y: aimY,
            isBoss: Boolean(UNIT_STATS[assistTarget.kind].isBoss),
          };
          const targetAng = Math.atan2(aimY - originY, assistTarget.x - originX);
          const angDiff = Math.atan2(Math.sin(targetAng - targetAimAngle), Math.cos(targetAng - targetAimAngle));
          targetAimAngle += angDiff * AIM_ASSIST_CONFIG.magneticPull;
        }
      }
    }

    const instantAim = (!this.isTouchInput || touchDirectFiring) && this.aimWeightSetting !== 'heavy';
    const touchTurnSpeed =
      this.aimWeightSetting === 'responsive' ? 48 : this.aimWeightSetting === 'heavy' ? 20 : 36;

    // DRIVING TANK MODE
    if (activeTank) {
      const tank = activeTank;
      tank.vx = moveX * TANK_SPEED;
      tank.vy = moveY * TANK_SPEED * 0.78;
      tank.x = Math.max(ALLIED_CAMP_X + 75, Math.min(this.worldWidth - 155, tank.x + tank.vx * dt));
      tank.y = Math.max(PLAYABLE_Y_MIN + 10, Math.min(PLAYABLE_Y_MAX - 8, tank.y + tank.vy * dt));

      const speed = Math.hypot(tank.vx, tank.vy);
      if (wantFire || wantCoax || this.combatStrafeTimer > 0 || !this.isTouchInput) {
        tank.facing = Math.cos(targetAimAngle) >= 0 ? 1 : -1;
      } else if (Math.abs(tank.vx) > 8) {
        tank.facing = tank.vx >= 0 ? 1 : -1;
      }
      if (instantAim) {
        tank.turretAngle = targetAimAngle;
      } else {
        const rate = !this.isTouchInput ? 26 : touchDirectFiring ? 24 : touchTurnSpeed * 0.85;
        const diff = Math.atan2(Math.sin(targetAimAngle - tank.turretAngle), Math.cos(targetAimAngle - tank.turretAngle));
        const maxStep = rate * dt;
        tank.turretAngle += Math.max(-maxStep, Math.min(maxStep, diff));
      }

      if (speed > 10) {
        const driveSign = tank.vx * tank.facing < -8 ? -1 : 1;
        tank.treadOffset += speed * dt * driveSign * 0.55;
        tank.chassisBounce += dt * 19;
        tank.trackTimer -= dt;
        if (tank.trackTimer <= 0) {
          tank.trackTimer = 0.085;
          this.addDecal({
            x: tank.x,
            y: tank.y + 4,
            kind: 'track',
            radius: 14,
            angle: Math.atan2(tank.vy, tank.vx),
            alpha: 0.45,
            life: 16,
            maxLife: 16,
          });
        }
      }

      // Sync player position to tank
      p.x = tank.x;
      p.y = tank.y;
      p.vx = tank.vx;
      p.vy = tank.vy;
      p.aimAngle = tank.turretAngle;
      p.facing = tank.facing;

      if (this.isTouchInput) {
        if (touchDirectFiring) {
          this.mouseScreenX = this.touchPointScreenX;
          this.mouseScreenY = this.touchPointScreenY;
        } else {
          this.mouseScreenX = p.x - this.cameraX + Math.cos(p.aimAngle) * 310;
          this.mouseScreenY = originY + Math.sin(p.aimAngle) * 310;
        }
      }

      // Tank ROADKILL crushing enemy infantry!
      if (speed > 45) {
        for (const s of this.soldiers) {
          if (s.faction !== 'enemy') continue;
          if (tank.roadkillCooldowns.has(s.id)) continue;
          const dx = s.x - tank.x;
          const dy = (s.y - tank.y) * 1.65;
          if (Math.hypot(dx, dy) < 52 + UNIT_STATS[s.kind].radius * 0.5) {
            tank.roadkillCooldowns.set(s.id, 0.55);
            const crushDmg = s.kind === 'siege_ram' || s.kind === 'warlord' ? 55 : 135;
            const wasAlive = s.hp > 0;
            this.damageSoldier(s, crushDmg, tank.vx * 1.9, tank.vy * 1.4 - 60, 1.0, true);
            this.addShake(4);
            this.sound.playHit();
            if (wasAlive && s.hp <= 0) {
              this.breakdown.roadkills++;
              this.score += 50 * this.combo;
              this.spawnFloatingText(s.x, s.y - 52, 'CRUSH! +50', '#96f255', 14);
            }
          }
        }
      }

      // Fire 75mm Main Cannon (Left Click, Direct Touch, or Mobile FIRE Stick)
      if (wantFire && tank.cannonCooldown <= 0) {
        this.fireTankCannon(tank);
      }

      // Fire Coaxial Machine Gun (Right Click, Space, or Touch MG)
      if (wantCoax && tank.coaxCooldown <= 0) {
        this.fireTankCoax(tank);
      }

      return;
    }

    // ON-FOOT MODE
    if (p.dodgeTimer > 0) {
      p.dodgeTimer = Math.max(0, p.dodgeTimer - dt);
      p.vx = p.dodgeDirX * PLAYER_SPEED * 2.15;
      p.vy = p.dodgeDirY * PLAYER_SPEED * 1.85;
    } else {
      p.vx = moveX * PLAYER_SPEED;
      p.vy = moveY * PLAYER_SPEED * 0.85;
    }

    p.x = Math.max(ALLIED_CAMP_X + 36, Math.min(this.worldWidth - 135, p.x + p.vx * dt));
    p.y = Math.max(PLAYABLE_Y_MIN, Math.min(PLAYABLE_Y_MAX, p.y + p.vy * dt));

    if (instantAim) {
      p.aimAngle = targetAimAngle;
    } else {
      const rate = !this.isTouchInput ? 32 : touchDirectFiring ? 28 : touchTurnSpeed;
      const diff = Math.atan2(Math.sin(targetAimAngle - p.aimAngle), Math.cos(targetAimAngle - p.aimAngle));
      const maxStep = rate * dt;
      p.aimAngle += Math.max(-maxStep, Math.min(maxStep, diff));
    }
    p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;

    // Authentic backpedal boot stride when retreating while firing forward!
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 10) {
      const walkSign = p.vx * p.facing < -12 ? -1 : 1;
      p.walkPhase += dt * 13.5 * walkSign;
    }

    // Keep aim coordinates synced
    if (this.isTouchInput) {
      if (touchDirectFiring) {
        this.mouseScreenX = this.touchPointScreenX;
        this.mouseScreenY = this.touchPointScreenY;
      } else {
        const crosshairDist = Math.min(300, wep.range * 0.44);
        this.mouseScreenX = p.x - this.cameraX + Math.cos(p.aimAngle) * crosshairDist;
        this.mouseScreenY = originY + Math.sin(p.aimAngle) * crosshairDist;
      }
    }

    // Firing active modern weapon
    if (wantFire && p.dodgeTimer <= 0) {
      if (wep.spinUpTime && p.spinUp < wep.spinUpTime) {
        p.spinUp += dt;
      } else if (p.fireCooldown <= 0) {
        this.firePlayerWeapon();
      }
    } else {
      p.spinUp = Math.max(0, p.spinUp - dt * 1.4);
    }
  }

  private tryDodgeRoll(): void {
    const p = this.player;
    if (p.dodgeCooldown > 0 || p.dodgeTimer > 0) return;

    let dx = this.touchMoveX;
    let dy = this.touchMoveY;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    const m = Math.hypot(dx, dy);
    if (m > 0.1) {
      dx /= m;
      dy /= m;
    } else {
      dx = p.facing;
      dy = 0;
    }

    p.dodgeDirX = dx;
    p.dodgeDirY = dy;
    p.dodgeTimer = 0.28;
    p.dodgeCooldown = 0.85;
    p.invulnTimer = Math.max(p.invulnTimer, 0.34);
    this.sound.playDodge();
    this.spawnDustBurst(p.x, p.y, 7);
  }

  private tryToggleTank(): void {
    const p = this.player;
    this.grenadeAiming = false;
    this.touchFragDragging = false;
    this.touchCoax = false;
    this.touchTapQueued = false;
    p.spinUp = 0;
    p.muzzleFlashTimer = 0;

    if (p.inTankId !== null) {
      const tank = this.tanks.find((t) => t.id === p.inTankId);
      if (tank) {
        tank.occupied = false;
        tank.vx = 0;
        tank.vy = 0;
        p.x = tank.x - tank.facing * 22;
        p.y = Math.min(PLAYABLE_Y_MAX - 10, tank.y + 38);
      }
      p.inTankId = null;
      p.fireCooldown = Math.max(p.fireCooldown, 0.2);
      p.invulnTimer = 0.35;
      this.sound.playTankToggle(false);
      this.pushHud(true);
      return;
    }

    // Find closest grounded tank within interact radius
    let nearest: TankEntity | null = null;
    let bestDist = TANK_INTERACT_RADIUS;
    for (const t of this.tanks) {
      if (t.parachuteZ > 2) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        nearest = t;
      }
    }
    if (nearest) {
      nearest.occupied = true;
      nearest.cannonCooldown = Math.max(nearest.cannonCooldown, 0.2);
      nearest.coaxCooldown = Math.max(nearest.coaxCooldown, 0.2);
      p.inTankId = nearest.id;
      p.x = nearest.x;
      p.y = nearest.y;
      this.sound.playTankToggle(true);
      this.showToast('TANK BOARDED! LMB: 75mm CANNON • RMB/SPACE: COAX MG');
      this.pushHud(true);
    }
  }

  private firePlayerWeapon(): void {
    const p = this.player;
    if (p.inTankId !== null) return;
    const wep = WEAPONS[p.activeWeapon];

    if (wep.id !== 'pistol' && p.ammo[wep.id] <= 0) {
      this.fallbackToAvailableWeapon();
      return;
    }

    if (wep.id !== 'pistol') {
      p.ammo[wep.id] = Math.max(0, p.ammo[wep.id] - 1);
    }

    p.fireCooldown = wep.fireRate;
    p.weaponRecoil = wep.recoilKick;
    p.muzzleFlashTimer = 0.055;
    this.recoilBloom = Math.min(1.4, this.recoilBloom + (wep.id === 'shotgun' || wep.id === 'rocket' ? 0.85 : 0.25));
    this.sound.playWeapon(wep.id);

    const originX = p.x + Math.cos(p.aimAngle) * wep.muzzleOffset;
    const originY = p.y - 28 + Math.sin(p.aimAngle) * wep.muzzleOffset;

    if (wep.id === 'rocket') {
      this.addShake(6.5);
      this.projectiles.push({
        id: this.nextId++,
        kind: 'rocket',
        faction: 'ally',
        x: originX,
        y: originY + 22,
        z: 22,
        vx: Math.cos(p.aimAngle) * wep.speed,
        vy: Math.sin(p.aimAngle) * wep.speed,
        vz: 0,
        prevX: originX,
        prevY: originY + 22,
        prevZ: 22,
        damage: wep.damage,
        knockback: wep.knockback,
        armorPiercing: wep.armorPiercing,
        explosiveRadius: wep.explosiveRadius,
        life: wep.range / wep.speed,
        maxLife: wep.range / wep.speed,
        color: wep.tracerColor,
        bounces: 0,
        smokeTimer: 0,
        rotation: p.aimAngle,
      });
      // Backblast smoke puff
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: p.x - Math.cos(p.aimAngle) * 20,
          y: p.y - 26 - Math.sin(p.aimAngle) * 14,
          z: 0,
          vx: -Math.cos(p.aimAngle) * (80 + Math.random() * 60),
          vy: -Math.sin(p.aimAngle) * 40 + (Math.random() - 0.5) * 35,
          vz: 18,
          size: 6,
          endSize: 20,
          color: '#d4d0c5',
          alpha: 0.72,
          life: 0.45,
          maxLife: 0.45,
          gravity: -10,
          kind: 'smoke',
          rotation: 0,
          vRot: 0,
        });
      }
    } else {
      if (wep.id === 'shotgun') this.addShake(4.8);
      else if (wep.id === 'minigun') this.addShake(1.6);
      else if (wep.id === 'rifle') this.addShake(1.2);

      for (let i = 0; i < wep.pellets; i++) {
        const spread = (Math.random() - 0.5) * wep.spread;
        const ang = p.aimAngle + spread;
        const spd = wep.speed * (0.94 + Math.random() * 0.12);
        this.projectiles.push({
          id: this.nextId++,
          kind: wep.pellets > 1 ? 'pellet' : 'bullet',
          faction: 'ally',
          x: originX,
          y: originY + 26,
          z: 26,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          vz: 0,
          prevX: originX,
          prevY: originY + 26,
          prevZ: 26,
          damage: wep.damage,
          knockback: wep.knockback,
          armorPiercing: wep.armorPiercing,
          explosiveRadius: 0,
          life: wep.range / spd,
          maxLife: wep.range / spd,
          color: wep.tracerColor,
          bounces: 0,
          smokeTimer: 0,
          rotation: ang,
        });
      }

      // Eject brass shell casing!
      this.particles.push({
        x: p.x + Math.cos(p.aimAngle) * 10,
        y: p.y,
        z: 28,
        vx: -p.facing * (45 + Math.random() * 55),
        vy: (Math.random() - 0.5) * 35,
        vz: 110 + Math.random() * 55,
        size: wep.id === 'shotgun' ? 3.5 : 2.4,
        endSize: wep.id === 'shotgun' ? 3.5 : 2.4,
        color: wep.id === 'shotgun' ? '#c93c34' : '#e6c24c',
        alpha: 1,
        life: 0.75,
        maxLife: 0.75,
        gravity: 480,
        kind: 'casing',
        rotation: Math.random() * 6,
        vRot: (Math.random() - 0.5) * 22,
      });
    }

    if (wep.id !== 'pistol' && p.ammo[wep.id] <= 0) {
      this.fallbackToAvailableWeapon();
    }
  }

  private fallbackToAvailableWeapon(): void {
    const order: WeaponId[] = ['minigun', 'rifle', 'shotgun', 'rocket', 'pistol'];
    for (const id of order) {
      if (this.player.unlockedWeapons[id] && (id === 'pistol' || this.player.ammo[id] > 0)) {
        this.player.activeWeapon = id;
        this.player.spinUp = 0;
        this.showToast(`OUT OF AMMO — SWITCHED TO ${WEAPONS[id].shortName}`);
        this.pushHud(true);
        return;
      }
    }
  }

  private computeTouchGrenadeTarget(nx: number, ny: number): { x: number; y: number } {
    const p = this.player;
    const minRange = 75;
    const maxRange = 465;
    const rawMag = Math.min(1, Math.hypot(nx, ny));
    const ang = rawMag > 0.04 ? Math.atan2(ny * 0.85, nx) : p.aimAngle;
    const dist = minRange + rawMag * (maxRange - minRange);
    const tx = Math.max(ALLIED_CAMP_X + 40, Math.min(this.worldWidth - 60, p.x + Math.cos(ang) * dist));
    const ty = Math.max(PLAYABLE_Y_MIN + 8, Math.min(PLAYABLE_Y_MAX - 8, p.y + Math.sin(ang) * dist));
    return { x: tx, y: ty };
  }

  private getGrenadePreviewTarget(): { x: number; y: number } {
    const p = this.player;
    if (this.isTouchInput && this.touchFragDragging) {
      return this.computeTouchGrenadeTarget(this.touchFragX, this.touchFragY);
    }
    const rawX = this.cameraX + this.mouseScreenX;
    const rawY = Math.max(PLAYABLE_Y_MIN + 8, Math.min(PLAYABLE_Y_MAX - 8, this.mouseScreenY));
    const dx = rawX - p.x;
    const dy = rawY - p.y;
    const dist = Math.min(470, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    return {
      x: Math.max(ALLIED_CAMP_X + 40, Math.min(this.worldWidth - 60, p.x + Math.cos(ang) * dist)),
      y: Math.max(PLAYABLE_Y_MIN + 8, Math.min(PLAYABLE_Y_MAX - 8, p.y + Math.sin(ang) * dist)),
    };
  }

  private trySmartLobGrenade(): void {
    const p = this.player;
    if (p.grenades <= 0 || p.grenadeCooldown > 0) return;

    let bestX = p.x + Math.cos(p.aimAngle) * 290;
    let bestY = Math.max(PLAYABLE_Y_MIN + 14, Math.min(PLAYABLE_Y_MAX - 14, p.y + Math.sin(p.aimAngle) * 180));
    let bestScore = -Infinity;

    for (const s of this.soldiers) {
      if (s.faction !== 'enemy' || s.hp <= 0) continue;
      const leadX = s.x + s.vx * 0.42;
      const leadY = Math.max(PLAYABLE_Y_MIN + 10, Math.min(PLAYABLE_Y_MAX - 10, s.y + s.vy * 0.42));
      const d = Math.hypot(leadX - p.x, leadY - p.y);
      if (d > 485 || d < 45) continue;
      if (s.x < this.cameraX - 30 || s.x > this.cameraX + this.viewW + 70) continue;

      let clusterScore =
        s.kind === 'warlord' || s.kind === 'siege_ram' ? 2.4 : s.kind === 'knight' || s.kind === 'cavalry' ? 1.6 : 1.0;
      for (const other of this.soldiers) {
        if (other === s || other.faction !== 'enemy' || other.hp <= 0) continue;
        if (Math.hypot(other.x - leadX, (other.y - leadY) * 1.35) <= 122) {
          clusterScore += 0.85;
        }
      }
      const rangeFactor = 1 - (Math.abs(d - 240) / 485) * 0.25;
      const score = clusterScore * rangeFactor;
      if (score > bestScore) {
        bestScore = score;
        bestX = leadX;
        bestY = leadY;
      }
    }

    if (bestScore === -Infinity && this.enemyBarracks && !this.enemyBarracks.destroyed) {
      const eb = this.enemyBarracks;
      if (Math.hypot(eb.x - p.x, eb.y - p.y) <= 490) {
        bestX = eb.x - 10;
        bestY = eb.y;
      }
    }

    this.tryThrowGrenadeAt(bestX, bestY);
  }

  private tryThrowFreeGrenade(): void {
    const target = this.getGrenadePreviewTarget();
    this.tryThrowGrenadeAt(target.x, target.y);
  }

  private tryThrowGrenadeAt(targetX: number, targetY: number): void {
    const p = this.player;
    if (p.grenades <= 0 || p.grenadeCooldown > 0) return;

    p.grenades--;
    p.grenadeCooldown = 0.55;
    this.sound.playDodge();

    const clampedY = Math.max(PLAYABLE_Y_MIN, Math.min(PLAYABLE_Y_MAX, targetY));
    const dx = targetX - p.x;
    const dy = clampedY - p.y;
    const dist = Math.min(470, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    p.facing = Math.cos(ang) >= 0 ? 1 : -1;

    // Exact bounce-settle integral (0.859s air flight + 0.56x post-bounce skid = 1.03s) so grenade detonates on bullseye!
    const effectiveTime = 1.03;
    const startX = p.x + Math.cos(ang) * 14;
    const startY = p.y + Math.sin(ang) * 10;
    const remDist = Math.max(12, dist - 14);

    this.projectiles.push({
      id: this.nextId++,
      kind: 'grenade',
      faction: 'ally',
      x: startX,
      y: startY,
      z: 30,
      vx: (Math.cos(ang) * remDist) / effectiveTime,
      vy: (Math.sin(ang) * remDist) / effectiveTime,
      vz: 240,
      prevX: startX,
      prevY: startY,
      prevZ: 30,
      damage: 165,
      knockback: 360,
      armorPiercing: 1.0,
      explosiveRadius: 128,
      life: 1.18,
      maxLife: 1.18,
      color: '#6b823f',
      bounces: 0,
      smokeTimer: 0,
      rotation: 0,
    });
    this.pushHud(true);
  }

  private fireTankCannon(tank: TankEntity): void {
    tank.cannonCooldown = 1.12;
    tank.cannonRecoil = 14;
    tank.chassisBounce += 1.6;
    this.recoilBloom = 1.3;
    this.addShake(11);
    this.sound.playTankCannon();

    const turretX = tank.x + tank.facing * -4;
    const turretY = tank.y - 44;
    const muzzleX = turretX + Math.cos(tank.turretAngle) * 58;
    const muzzleY = turretY + Math.sin(tank.turretAngle) * 58;

    this.projectiles.push({
      id: this.nextId++,
      kind: 'tank_shell',
      faction: 'ally',
      x: muzzleX,
      y: muzzleY + 34,
      z: 34,
      vx: Math.cos(tank.turretAngle) * 980,
      vy: Math.sin(tank.turretAngle) * 980,
      vz: 0,
      prevX: muzzleX,
      prevY: muzzleY + 34,
      prevZ: 34,
      damage: 240,
      knockback: 460,
      armorPiercing: 1.0,
      explosiveRadius: 155,
      life: 1.15,
      maxLife: 1.15,
      color: '#ffbf47',
      bounces: 0,
      smokeTimer: 0,
      rotation: tank.turretAngle,
    });

    // Huge comic muzzle blast smoke & fire!
    for (let i = 0; i < 12; i++) {
      const a = tank.turretAngle + (Math.random() - 0.5) * 0.85;
      const spd = 90 + Math.random() * 160;
      this.particles.push({
        x: muzzleX,
        y: muzzleY + 34,
        z: 34,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.6,
        vz: (Math.random() - 0.3) * 40,
        size: i < 5 ? 12 : 8,
        endSize: i < 5 ? 2 : 24,
        color: i < 5 ? '#ffbe42' : '#d8d4c8',
        alpha: 0.9,
        life: i < 5 ? 0.14 : 0.42,
        maxLife: i < 5 ? 0.14 : 0.42,
        gravity: -15,
        kind: i < 5 ? 'fire' : 'smoke',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  private fireTankCoax(tank: TankEntity): void {
    tank.coaxCooldown = 0.085;
    this.sound.playTankCoax();
    this.recoilBloom = Math.min(1.0, this.recoilBloom + 0.18);

    const turretX = tank.x + tank.facing * -4;
    const turretY = tank.y - 42;
    const ang = tank.turretAngle + (Math.random() - 0.5) * 0.075;
    const muzzleX = turretX + Math.cos(ang) * 32;
    const muzzleY = turretY + Math.sin(ang) * 32;

    this.projectiles.push({
      id: this.nextId++,
      kind: 'bullet',
      faction: 'ally',
      x: muzzleX,
      y: muzzleY + 32,
      z: 32,
      vx: Math.cos(ang) * 1340,
      vy: Math.sin(ang) * 1340,
      vz: 0,
      prevX: muzzleX,
      prevY: muzzleY + 32,
      prevZ: 32,
      damage: 20,
      knockback: 75,
      armorPiercing: 0.45,
      explosiveRadius: 0,
      life: 0.68,
      maxLife: 0.68,
      color: '#ffea75',
      bounces: 0,
      smokeTimer: 0,
      rotation: ang,
    });
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.bobPhase += dt * 2;
      pk.life -= dt;

      if (pk.z > 0) {
        pk.swayPhase += dt * 3.1;
        pk.z = Math.max(0, pk.z - 86 * dt);
        if (pk.z === 0) {
          this.spawnDustBurst(pk.x, pk.y, 6);
        }
      }

      if (pk.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }

      // Auto-pickup when player (on foot OR driving Tank!) rolls over grounded crate
      if (pk.z <= 8 && p.alive) {
        const pickupRadius = p.inTankId !== null ? 78 : 58;
        if (Math.hypot(p.x - pk.x, (p.y - pk.y) * 1.25) <= pickupRadius) {
          this.collectPickup(pk);
          this.pickups.splice(i, 1);
        }
      }
    }
  }

  private collectPickup(pk: PickupEntity): void {
    const p = this.player;
    const meta = PICKUP_LABELS[pk.kind];

    if (pk.kind === 'shotgun' || pk.kind === 'rifle' || pk.kind === 'minigun' || pk.kind === 'rocket') {
      const wep = WEAPONS[pk.kind];
      const wasUnlocked = p.unlockedWeapons[pk.kind];
      p.unlockedWeapons[pk.kind] = true;
      p.ammo[pk.kind] = Math.min(wep.maxAmmo, p.ammo[pk.kind] + wep.pickupAmmo);
      // Auto-equip newly unlocked weapon (or if currently on pistol)
      if (!wasUnlocked || p.activeWeapon === 'pistol') {
        p.activeWeapon = pk.kind;
        p.spinUp = 0;
      }
      this.sound.playPickup(!wasUnlocked);
    } else if (pk.kind === 'grenade') {
      p.grenades = Math.min(p.maxGrenades, p.grenades + 4);
      this.sound.playPickup(false);
    } else if (pk.kind === 'medkit') {
      p.hp = Math.min(p.maxHp, p.hp + 55);
      this.alliedCamp.hp = Math.min(this.alliedCamp.maxHp, this.alliedCamp.hp + 180);
      for (const t of this.tanks) {
        t.hp = Math.min(t.maxHp, t.hp + 140);
      }
      this.sound.playPickup(true);
    } else if (pk.kind === 'ammo_all') {
      p.grenades = Math.min(p.maxGrenades, p.grenades + 3);
      for (const id of WEAPON_ORDER) {
        if (id !== 'pistol' && p.unlockedWeapons[id]) {
          p.ammo[id] = Math.min(WEAPONS[id].maxAmmo, p.ammo[id] + Math.ceil(WEAPONS[id].pickupAmmo * 0.75));
        }
      }
      this.sound.playPickup(true);
    }

    this.score += 50;
    this.spawnFloatingText(pk.x, pk.y - 36, meta.label, meta.color, 14);
    this.showToast(`PICKED UP: ${meta.label}`);
    this.pushHud(true);
  }

  private updateSoldiers(dt: number, titleDemo = false): void {
    const p = this.player;

    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      const s = this.soldiers[i];
      const stats = UNIT_STATS[s.kind];

      s.hitFlash = Math.max(0, s.hitFlash - dt);
      s.attackTimer = Math.max(0, s.attackTimer - dt);
      if (s.attackAnim > 0) s.attackAnim = Math.max(0, s.attackAnim - dt * 3.8);

      // Apply knockback decay
      s.x += s.knockVx * dt;
      s.y += s.knockVy * dt;
      s.knockVx *= Math.pow(0.002, dt);
      s.knockVy *= Math.pow(0.002, dt);

      // Acquire nearest opposing target
      const enemyCampLimitX = this.enemyBarracks ? this.enemyBarracks.x : this.worldWidth - 100;
      let targetX = s.faction === 'ally' ? enemyCampLimitX - 70 : this.alliedCamp.x + 65;
      let targetY = getRoadCenterY(s.x) + s.preferredLaneOffset;
      let targetSoldier: SoldierEntity | null = null;
      let targetIsPlayer = false;
      let targetTank: TankEntity | null = null;
      let targetIsCamp = false;
      let targetIsBarracks = false;
      let bestScore = Infinity;

      const aggroRange = stats.isRanged ? 460 : 340;

      // Check opposing soldiers
      for (const other of this.soldiers) {
        if (other.faction === s.faction || other.hp <= 0) continue;
        const d = Math.hypot(other.x - s.x, (other.y - s.y) * 1.35);
        if (d < aggroRange && d < bestScore) {
          bestScore = d;
          targetSoldier = other;
        }
      }

      // Allies target enemy barracks if in range or no enemy soldiers ahead!
      if (s.faction === 'ally' && this.enemyBarracks && !this.enemyBarracks.destroyed) {
        const eb = this.enemyBarracks;
        const bDist = Math.hypot(eb.x - 45 - s.x, (eb.y - s.y) * 0.7);
        if (bDist < (stats.isRanged ? 460 : 220) && (targetSoldier === null || bDist < bestScore * 0.85)) {
          bestScore = bDist;
          targetSoldier = null;
          targetIsBarracks = true;
        }
      }

      // Enemies can also target the Player, Tanks, and Allied Camp!
      if (s.faction === 'enemy' && !titleDemo) {
        // Siege ram strongly prioritizes Allied Camp unless blocked
        const campDist = Math.hypot(this.alliedCamp.x + 45 - s.x, (this.alliedCamp.y - s.y) * 0.7);
        if (campDist < (s.kind === 'siege_ram' ? 3200 : 210) && (s.kind === 'siege_ram' || campDist < bestScore * 0.9)) {
          bestScore = campDist;
          targetSoldier = null;
          targetIsCamp = true;
        }

        if (s.kind !== 'siege_ram') {
          for (const t of this.tanks) {
            if (t.parachuteZ > 2) continue;
            const d = Math.hypot(t.x - s.x, (t.y - s.y) * 1.3);
            if (d < aggroRange * 0.95 && d < bestScore) {
              bestScore = d;
              targetSoldier = null;
              targetIsCamp = false;
              targetTank = t;
            }
          }

          if (p.alive && p.inTankId === null) {
            const d = Math.hypot(p.x - s.x, (p.y - s.y) * 1.3);
            if (d < aggroRange * 0.95 && d < bestScore * 1.08) {
              bestScore = d;
              targetSoldier = null;
              targetTank = null;
              targetIsCamp = false;
              targetIsPlayer = true;
            }
          }
        }
      }

      if (targetSoldier) {
        targetX = targetSoldier.x;
        targetY = targetSoldier.y;
      } else if (targetTank) {
        targetX = targetTank.x;
        targetY = targetTank.y;
      } else if (targetIsPlayer) {
        targetX = p.x;
        targetY = p.y;
      } else if (targetIsCamp) {
        targetX = this.alliedCamp.x + 42;
        targetY = Math.max(this.alliedCamp.y - 65, Math.min(this.alliedCamp.y + 65, s.y));
      } else if (targetIsBarracks && this.enemyBarracks) {
        targetX = this.enemyBarracks.x - 45;
        targetY = Math.max(PLAYABLE_Y_MIN + 25, Math.min(PLAYABLE_Y_MAX - 25, s.y));
      }

      const dx = targetX - s.x;
      const dy = targetY - s.y;
      const dist = Math.hypot(dx, dy);

      const effectiveRange =
        stats.attackRange +
        (targetTank ? 38 : targetIsCamp ? 42 : targetIsBarracks ? 48 : targetSoldier ? UNIT_STATS[targetSoldier.kind].radius * 0.5 : 10);

      const hasTarget = targetSoldier !== null || targetTank !== null || targetIsPlayer || targetIsCamp || targetIsBarracks;

      if (hasTarget && dist <= effectiveRange) {
        s.vx = 0;
        s.vy = 0;
        if (Math.abs(dx) > 4) s.facing = dx >= 0 ? 1 : -1;

        if (s.attackTimer <= 0) {
          s.attackTimer = stats.attackCooldown * (0.88 + Math.random() * 0.24);
          s.attackAnim = 1;

          if (stats.isRanged) {
            this.fireArcherArrow(s, targetX, targetY);
          } else {
            this.performMeleeHit(s, targetSoldier, targetTank, targetIsPlayer, targetIsCamp, targetIsBarracks);
          }
        }
      } else {
        // March toward target + gentle soft separation from neighbors so troops spread across road!
        let dirX = dist > 1 ? dx / dist : s.faction === 'ally' ? 1 : -1;
        let dirY = dist > 1 ? dy / dist : 0;

        let sepX = 0;
        let sepY = 0;
        for (let j = 0; j < this.soldiers.length; j++) {
          if (i === j) continue;
          const o = this.soldiers[j];
          const sx = s.x - o.x;
          const sy = s.y - o.y;
          const d2 = sx * sx + sy * sy;
          const minSep = (stats.radius + UNIT_STATS[o.kind].radius) * 0.92;
          if (d2 > 0.1 && d2 < minSep * minSep) {
            const d = Math.sqrt(d2);
            const push = (minSep - d) / minSep;
            sepX += (sx / d) * push * 1.1;
            sepY += (sy / d) * push * 1.1;
          }
        }

        const speedScale = s.faction === 'enemy' ? 1 + Math.min(0.45, (this.wave - 1) * 0.04) : 1;
        const moveSpd = stats.speed * speedScale;
        const fx = dirX + sepX * 0.65;
        const fy = dirY + sepY * 0.65;
        const fm = Math.hypot(fx, fy) || 1;

        s.vx = (fx / fm) * moveSpd;
        s.vy = (fy / fm) * moveSpd * 0.78;
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        if (Math.abs(s.vx) > 6) s.facing = s.vx >= 0 ? 1 : -1;
        s.walkPhase += dt * (s.kind === 'cavalry' ? 14 : 10.5);
      }

      // Clamp to battlefield bounds
      const enemyBoundX = this.enemyBarracks ? this.enemyBarracks.x + 85 : this.worldWidth - 18;
      s.x = Math.max(ALLIED_CAMP_X + 24, Math.min(enemyBoundX, s.x));
      s.y = Math.max(PLAYABLE_Y_MIN, Math.min(PLAYABLE_Y_MAX, s.y));

      // Allied soldiers that reach Enemy War Camp rally back slightly or attack its gates
      if (titleDemo && s.faction === 'ally' && s.x > this.viewW - 40) {
        s.x = this.viewW - 40;
      }
    }
  }

  private performMeleeHit(
    attacker: SoldierEntity,
    targetSoldier: SoldierEntity | null,
    targetTank: TankEntity | null,
    targetIsPlayer: boolean,
    targetIsCamp: boolean,
    targetIsBarracks = false
  ): void {
    const stats = UNIT_STATS[attacker.kind];
    const dmg = attacker.faction === 'enemy' ? stats.damage * (1 + (this.wave - 1) * 0.06) : stats.damage;

    // Comic white sword slash swoosh
    this.particles.push({
      x: attacker.x + attacker.facing * 20,
      y: attacker.y - 24,
      z: 0,
      vx: attacker.facing * 20,
      vy: 0,
      vz: 0,
      size: attacker.kind === 'warlord' ? 28 : 17,
      endSize: attacker.kind === 'warlord' ? 36 : 22,
      color: 'rgba(255, 252, 240, 0.85)',
      alpha: 0.85,
      life: 0.14,
      maxLife: 0.14,
      gravity: 0,
      kind: 'slash',
      rotation: attacker.facing > 0 ? 0 : Math.PI,
      vRot: 0,
    });

    if (targetSoldier && targetSoldier.hp > 0) {
      this.damageSoldier(targetSoldier, dmg, attacker.facing * 85, 0, 0.35, false);
      this.sound.playSwordClash();
    } else if (targetTank) {
      const reduced = Math.max(4, dmg * (attacker.kind === 'siege_ram' ? 1.1 : 0.45));
      this.damageTank(targetTank, reduced);
      this.sound.playArmorClink();
    } else if (targetIsPlayer) {
      this.damagePlayer(dmg * 0.72);
      this.sound.playSwordClash();
    } else if (targetIsCamp) {
      this.damageAlliedCamp(dmg * (attacker.kind === 'siege_ram' ? 2.2 : 1.0));
      this.sound.playHit();
    } else if (targetIsBarracks) {
      this.damageEnemyBarracks(dmg * (attacker.kind === 'knight' ? 1.5 : 1.0));
      this.sound.playSwordClash();
    }
  }

  private fireArcherArrow(archer: SoldierEntity, tx: number, ty: number): void {
    const dx = tx - archer.x;
    const dy = ty - archer.y;
    const dist = Math.max(80, Math.hypot(dx, dy));
    const spd = 470;
    const flight = dist / spd;
    const gravity = 390;

    this.sound.playArrowShoot();
    this.projectiles.push({
      id: this.nextId++,
      kind: 'arrow',
      faction: archer.faction,
      x: archer.x + archer.facing * 12,
      y: archer.y,
      z: 30,
      vx: dx / flight + (Math.random() - 0.5) * 32,
      vy: dy / flight + (Math.random() - 0.5) * 24,
      vz: 0.5 * gravity * flight,
      prevX: archer.x,
      prevY: archer.y,
      prevZ: 30,
      damage: UNIT_STATS.archer.damage * (archer.faction === 'enemy' ? 1 + (this.wave - 1) * 0.05 : 1),
      knockback: 45,
      armorPiercing: 0.25,
      explosiveRadius: 0,
      life: flight + 0.35,
      maxLife: flight + 0.35,
      color: '#d8cfb8',
      bounces: 0,
      smokeTimer: 0,
      rotation: 0,
    });
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.prevX = pr.x;
      pr.prevY = pr.y;
      pr.prevZ = pr.z;
      pr.life -= dt;

      if (pr.kind === 'grenade') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.z += pr.vz * dt;
        pr.vz -= 640 * dt;
        pr.rotation += dt * 11;

        // Ground bounce!
        if (pr.z <= 0) {
          pr.z = 0;
          if (Math.abs(pr.vz) > 65 && pr.bounces < 2) {
            pr.vz = -pr.vz * 0.45;
            pr.vx *= 0.56;
            pr.vy *= 0.56;
            pr.bounces++;
            this.sound.playGrenadeBounce();
            this.spawnDustBurst(pr.x, pr.y, 3);
          } else {
            pr.vz = 0;
            pr.vx *= Math.pow(0.05, dt);
            pr.vy *= Math.pow(0.05, dt);
          }
        }

        if (pr.life <= 0) {
          this.triggerExplosion(pr.x, pr.y, pr.explosiveRadius, pr.damage, pr.knockback, true);
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      if (pr.kind === 'arrow') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.z += pr.vz * dt;
        pr.vz -= 390 * dt;

        // Check arrow hit when descending into body height
        let hit = false;
        if (pr.z < 52 && pr.z > 0) {
          for (const s of this.soldiers) {
            if (s.faction === pr.faction || s.hp <= 0) continue;
            const r = UNIT_STATS[s.kind].radius + 6;
            if (Math.hypot(s.x - pr.x, (s.y - pr.y) * 1.4) < r) {
              this.damageSoldier(s, pr.damage, pr.vx * 0.14, 0, pr.armorPiercing, false);
              hit = true;
              break;
            }
          }
          if (!hit && pr.faction === 'enemy' && this.phase === 'playing') {
            for (const t of this.tanks) {
              if (t.parachuteZ > 2) continue;
              if (Math.hypot(t.x - pr.x, (t.y - pr.y) * 1.4) < 42) {
                this.damageTank(t, pr.damage * 0.35);
                this.sound.playArmorClink();
                hit = true;
                break;
              }
            }
          }
          if (!hit && pr.faction === 'enemy' && p.alive && p.inTankId === null && this.phase === 'playing') {
            if (Math.hypot(p.x - pr.x, (p.y - pr.y) * 1.4) < 20) {
              this.damagePlayer(pr.damage * 0.7);
              hit = true;
            }
          }
          if (!hit && pr.faction === 'ally' && this.enemyBarracks && !this.enemyBarracks.destroyed) {
            const eb = this.enemyBarracks;
            if (
              pr.x >= eb.x - 50 &&
              pr.x <= eb.x + 85 &&
              pr.y >= eb.y - 120 &&
              pr.y <= eb.y + 60
            ) {
              this.damageEnemyBarracks(pr.damage);
              this.sound.playArmorClink();
              hit = true;
            }
          }
        }

        if (hit) {
          this.projectiles.splice(i, 1);
          continue;
        }

        if (pr.z <= 0 || pr.life <= 0) {
          this.addDecal({
            x: pr.x,
            y: pr.y,
            kind: 'arrow_stuck',
            radius: 10,
            angle: pr.vx >= 0 ? 0 : Math.PI,
            alpha: 0.8,
            life: 9,
            maxLife: 9,
          });
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      // High-velocity modern firearms, rockets, & tank shells!
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      if (pr.kind === 'rocket' || pr.kind === 'tank_shell') {
        pr.smokeTimer -= dt;
        if (pr.smokeTimer <= 0) {
          pr.smokeTimer = pr.kind === 'rocket' ? 0.018 : 0.024;
          this.particles.push({
            x: pr.x,
            y: pr.y,
            z: pr.z,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 16,
            vz: 14,
            size: pr.kind === 'rocket' ? 6.5 : 5.5,
            endSize: pr.kind === 'rocket' ? 19 : 14,
            color: pr.kind === 'rocket' ? '#e6e2d8' : '#f2d9a0',
            alpha: 0.72,
            life: 0.42,
            maxLife: 0.42,
            gravity: -10,
            kind: 'smoke',
            rotation: 0,
            vRot: 0,
          });
        }
      }

      // Collision check against enemy soldiers (segment-aware approximation)
      let hitTarget = false;
      const impactY = pr.y;
      for (const s of this.soldiers) {
        if (s.faction === pr.faction || s.hp <= 0) continue;
        const stats = UNIT_STATS[s.kind];
        const rx = stats.radius + (pr.explosiveRadius > 0 ? 12 : 6);
        // Check against body visual center (y - 24 matches projectile y - z!)
        const bodyCenterY = s.y - stats.height * 0.48;
        const projVisualY = pr.y - pr.z;
        const dx = Math.abs(s.x - pr.x);
        const dy = Math.abs(bodyCenterY - projVisualY);

        if (dx < rx + 10 && dy < stats.height * 0.56) {
          hitTarget = true;
          if (pr.explosiveRadius > 0) {
            this.triggerExplosion(pr.x, s.y, pr.explosiveRadius, pr.damage, pr.knockback, true);
          } else {
            const ang = Math.atan2(pr.vy, pr.vx);
            this.damageSoldier(
              s,
              pr.damage,
              Math.cos(ang) * pr.knockback,
              Math.sin(ang) * pr.knockback * 0.4,
              pr.armorPiercing,
              true
            );
            this.spawnHitSparks(pr.x, projVisualY, stats.armor > 0.3 ? '#ffe875' : '#ff5247', 4);
          }
          break;
        }
      }

      // Direct projectile hits on active Enemy Barracks!
      if (!hitTarget && pr.faction === 'ally' && this.enemyBarracks && !this.enemyBarracks.destroyed) {
        const eb = this.enemyBarracks;
        if (
          pr.x >= eb.x - 55 &&
          pr.x <= eb.x + 85 &&
          pr.y >= eb.y - 130 &&
          pr.y <= eb.y + 65
        ) {
          hitTarget = true;
          const dmgMul = pr.kind === 'tank_shell' ? 1.7 : pr.kind === 'rocket' ? 1.4 : 0.88;
          this.damageEnemyBarracks(pr.damage * dmgMul);
          if (pr.explosiveRadius > 0) {
            this.triggerExplosion(pr.x, pr.y, pr.explosiveRadius, pr.damage, pr.knockback, true);
          } else {
            this.spawnHitSparks(pr.x, pr.y - pr.z, '#ffe875', 5);
            this.sound.playHit();
          }
        }
      }

      if (hitTarget) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (pr.life <= 0 || pr.x < 0 || pr.x > this.worldWidth || pr.y < HORIZON_Y - 70 || pr.y > LOGICAL_HEIGHT + 40) {
        if (pr.explosiveRadius > 0 && pr.x > 0 && pr.x < this.worldWidth) {
          this.triggerExplosion(pr.x, Math.max(PLAYABLE_Y_MIN, Math.min(PLAYABLE_Y_MAX, impactY)), pr.explosiveRadius, pr.damage, pr.knockback, true);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private triggerExplosion(
    x: number,
    y: number,
    radius: number,
    maxDamage: number,
    knockback: number,
    fromPlayer: boolean
  ): void {
    const scale = radius / 125;
    this.sound.playExplosion(scale);
    this.addShake(Math.min(18, 9 * scale));
    if (scale >= 1.05) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);
    }

    // Scorched crater decal on battlefield ground
    this.addDecal({
      x,
      y: Math.max(PLAYABLE_Y_MIN, Math.min(PLAYABLE_Y_MAX, y)),
      kind: 'crater',
      radius: radius * 0.34,
      angle: Math.random() * Math.PI * 2,
      alpha: 0.72,
      life: 28,
      maxLife: 28,
    });

    // Expanding shockwave ring
    this.particles.push({
      x,
      y,
      z: 4,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 16,
      endSize: radius * 1.08,
      color: '#ffe875',
      alpha: 0.9,
      life: 0.3,
      maxLife: 0.3,
      gravity: 0,
      kind: 'ring',
      rotation: 0,
      vRot: 0,
    });

    // Layered comic fireball + dark smoke + flying dirt debris!
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (40 + Math.random() * 190) * scale;
      const isFire = i < 11;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 14,
        z: 10 + Math.random() * 14,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.55,
        vz: 40 + Math.random() * 160,
        size: isFire ? (16 + Math.random() * 14) * scale : (12 + Math.random() * 10) * scale,
        endSize: isFire ? 2 : 34 * scale,
        color: isFire
          ? i < 4
            ? '#fff9bf'
            : i < 8
              ? '#ffbe33'
              : '#f05a24'
          : '#3d3934',
        alpha: isFire ? 0.96 : 0.78,
        life: isFire ? 0.25 + Math.random() * 0.18 : 0.55 + Math.random() * 0.35,
        maxLife: isFire ? 0.43 : 0.9,
        gravity: isFire ? -20 : -35,
        kind: isFire ? 'fire' : 'smoke',
        rotation: 0,
        vRot: 0,
        outline: !isFire,
      });
    }

    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        z: 8,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.5,
        vz: 140 + Math.random() * 180,
        size: 5 + Math.random() * 4,
        endSize: 3,
        color: i % 2 === 0 ? '#6e583b' : '#ffcf47',
        alpha: 1,
        life: 0.65,
        maxLife: 0.65,
        gravity: 540,
        kind: 'debris',
        rotation: Math.random() * 6,
        vRot: (Math.random() - 0.5) * 18,
      });
    }

    // Apply blast damage & dramatic radial launch to all enemies in radius!
    for (const s of this.soldiers) {
      if (s.faction !== 'enemy' || s.hp <= 0) continue;
      const dx = s.x - x;
      const dy = (s.y - y) * 1.35;
      const d = Math.hypot(dx, dy);
      if (d <= radius) {
        const falloff = 1 - (d / radius) * 0.62;
        const ang = Math.atan2(s.y - y, s.x - x);
        this.damageSoldier(
          s,
          maxDamage * falloff,
          Math.cos(ang) * knockback * falloff,
          Math.sin(ang) * knockback * 0.45 * falloff,
          1.0,
          fromPlayer
        );
      }
    }

    // Blast damage to active Enemy Barracks!
    if (this.enemyBarracks && !this.enemyBarracks.destroyed) {
      const eb = this.enemyBarracks;
      const bdx = eb.x + 10 - x;
      const bdy = (eb.y - 20 - y) * 1.2;
      const bd = Math.hypot(bdx, bdy);
      if (bd <= radius + 55) {
        const falloff = 1 - (bd / (radius + 55)) * 0.5;
        this.damageEnemyBarracks(maxDamage * falloff * 0.95);
      }
    }
  }

  private damageSoldier(
    s: SoldierEntity,
    rawDmg: number,
    kbX: number,
    kbY: number,
    armorPiercing: number,
    creditedToPlayer: boolean
  ): void {
    const stats = UNIT_STATS[s.kind];
    const effectiveArmor = stats.armor * (1 - armorPiercing);
    const dmg = Math.max(2, rawDmg * (1 - effectiveArmor));

    s.hp -= dmg;
    s.hitFlash = 0.1;

    const kbResist = s.kind === 'siege_ram' ? 0.08 : s.kind === 'warlord' ? 0.25 : s.kind === 'knight' ? 0.45 : 1.0;
    s.knockVx += kbX * kbResist;
    s.knockVy += kbY * kbResist;

    if (effectiveArmor > 0.2 && creditedToPlayer) {
      this.sound.playArmorClink();
    } else if (creditedToPlayer) {
      this.sound.playHit();
    }

    if (s.hp <= 0) {
      const idx = this.soldiers.indexOf(s);
      if (idx >= 0) this.soldiers.splice(idx, 1);

      // Launch flying cartoon ragdoll corpse!
      this.corpses.push({
        x: s.x,
        y: s.y,
        vx: kbX * 0.75 + (Math.random() - 0.5) * 40,
        vy: kbY * 0.45,
        z: 10,
        vz: Math.min(260, 70 + Math.hypot(kbX, kbY) * 0.45),
        rotation: 0,
        vRot: (kbX >= 0 ? 1 : -1) * (5 + Math.random() * 6),
        faction: s.faction,
        kind: s.kind,
        facing: s.facing,
        life: 4.5,
        maxLife: 4.5,
      });

      if (s.kind === 'siege_ram') {
        this.spawnWoodSplinters(s.x, s.y - 24, 18);
      }

      if (s.faction === 'enemy' && this.phase === 'playing') {
        this.waveKills++;
        if (creditedToPlayer) {
          this.registerPlayerKill(s);
        } else {
          // Small assist points when your blue army secures a kill!
          this.score += Math.round(stats.score * 0.25);
        }
      }
    }
  }

  private registerPlayerKill(s: SoldierEntity): void {
    const stats = UNIT_STATS[s.kind];
    this.kills++;
    this.breakdown[s.kind]++;

    // Combo escalation
    this.comboTimer = 3.6;
    this.burstKillWindow = 0.42;
    this.burstKillCount++;
    if (this.kills % 2 === 0 && this.combo < 5) {
      this.combo = Math.min(5, this.combo + 1);
    }

    const frontlineBonus = this.player.x > this.alliedCamp.x + 1200 ? 1.25 : 1.0;
    const pts = Math.round(stats.score * this.combo * frontlineBonus);
    this.score += pts;

    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
      } catch {
        // Ignore storage restrictions
      }
    }

    this.spawnFloatingText(
      s.x,
      s.y - 44,
      `+${pts}`,
      this.combo >= 3 ? '#ffe24d' : '#fff7cf',
      stats.isBoss ? 19 : 13
    );

    // Fun anachronistic multi-kill callouts!
    if (this.burstKillCount === 3) {
      this.spawnFloatingText(s.x, s.y - 68, 'TRIPLE KILL!', '#ffae38', 16);
    } else if (this.burstKillCount === 5) {
      this.spawnFloatingText(s.x, s.y - 74, 'ANACHRONISM!!', '#ff6438', 18);
      this.score += 250;
    } else if (this.burstKillCount === 7) {
      this.spawnFloatingText(s.x, s.y - 78, 'TIME PARADOX!!', '#ffe859', 20);
      this.score += 500;
    }

    // Small chance a fallen elite/boss drops an extra battlefield supply crate!
    const dropChance = stats.isBoss ? 0.9 : s.kind === 'knight' || s.kind === 'cavalry' ? 0.22 : 0.045;
    if (Math.random() < dropChance && this.pickups.length < 8) {
      const kinds: PickupKind[] = ['grenade', 'rifle', 'shotgun', 'rocket', 'medkit', 'minigun'];
      const chosen = kinds[Math.floor(Math.random() * kinds.length)];
      this.spawnPickup(chosen, s.x, s.y, false);
    }
  }

  private damagePlayer(dmg: number): void {
    const p = this.player;
    if (!p.alive || p.invulnTimer > 0) return;

    p.hp = Math.max(0, p.hp - dmg);
    p.hitFlash = 0.16;
    p.invulnTimer = 0.24;
    this.playerCombatTimer = 0;
    this.addShake(4.5);
    this.spawnHitSparks(p.x, p.y - 26, '#ff4747', 6);

    if (p.hp <= 0) {
      p.alive = false;
      this.triggerGameOver('YOU FELL IN BATTLE');
    }
  }

  private damageTank(tank: TankEntity, dmg: number): void {
    tank.hp = Math.max(0, tank.hp - dmg);
    tank.hitFlash = 0.12;
    this.spawnHitSparks(tank.x + (Math.random() - 0.5) * 40, tank.y - 24, '#ffe066', 4);

    if (tank.hp <= 0) {
      const idx = this.tanks.indexOf(tank);
      if (idx >= 0) this.tanks.splice(idx, 1);

      // Dramatic tank destruction — safely eject player if inside!
      if (this.player.inTankId === tank.id) {
        this.player.inTankId = null;
        this.touchCoax = false;
        this.player.spinUp = 0;
        this.player.fireCooldown = Math.max(this.player.fireCooldown, 0.2);
        this.player.x = tank.x - 24;
        this.player.y = Math.min(PLAYABLE_Y_MAX - 14, tank.y + 30);
        this.player.invulnTimer = 1.1;
        this.showToast('TANK DESTROYED! BAILED OUT SAFELY!');
      }
      this.triggerExplosion(tank.x, tank.y, 145, 160, 320, true);
      this.tankRespawnTimer = 28;
      this.pushHud(true);
    }
  }

  private damageAlliedCamp(dmg: number): void {
    this.alliedCamp.hp = Math.max(0, this.alliedCamp.hp - dmg);
    this.alliedCamp.hitFlash = 0.14;
    this.spawnWoodSplinters(this.alliedCamp.x + 18, this.alliedCamp.y - 12, 5);
    this.addShake(3.2);

    if (this.alliedCamp.hp <= 0) {
      this.triggerGameOver('THE ALLIED CAMP HAS FALLEN');
    }
  }

  private damageEnemyBarracks(dmg: number): void {
    if (!this.enemyBarracks || this.enemyBarracks.destroyed) return;
    this.enemyBarracks.hp = Math.max(0, this.enemyBarracks.hp - dmg);
    this.enemyBarracks.hitFlash = 0.16;
    this.spawnWoodSplinters(this.enemyBarracks.x + 20, this.enemyBarracks.y - 14, 6);
    this.addShake(Math.min(9, dmg * 0.08 + 1.8));

    this.spawnFloatingText(
      this.enemyBarracks.x + (Math.random() - 0.5) * 50,
      this.enemyBarracks.y - 120 - Math.random() * 25,
      `-${Math.round(dmg)}`,
      '#ff7b72',
      15
    );

    if (this.enemyBarracks.hp <= 0) {
      this.conquerEnemyBarracks();
    }
  }

  private conquerEnemyBarracks(): void {
    if (!this.enemyBarracks || this.enemyBarracks.destroyed) return;
    this.enemyBarracks.destroyed = true;
    this.enemyBarracks.hp = 0;
    this.barracksConquered++;

    const conqueredX = this.enemyBarracks.x;
    const conqueredY = this.enemyBarracks.y;

    // Fireworks / explosions
    this.triggerExplosion(conqueredX + 30, conqueredY - 10, 240, 0, 320, false);
    for (let k = 0; k < 5; k++) {
      this.triggerExplosion(
        conqueredX - 30 + Math.random() * 110,
        conqueredY - 40 + Math.random() * 55,
        140,
        0,
        180,
        false
      );
    }
    this.spawnWoodSplinters(conqueredX + 20, conqueredY - 20, 32);
    this.addShake(22);
    this.sound.playWaveHorn();

    // Score & Combos
    const scoreGain = 4000 + (this.sector - 1) * 1500;
    this.score += scoreGain;
    this.combo += 4;
    this.comboTimer = 10;
    this.kills += 5;
    this.spawnFloatingText(
      conqueredX + 20,
      conqueredY - 160,
      `+${scoreGain.toLocaleString()} BARRACKS CONQUERED!`,
      '#ffd54f',
      24
    );

    // Supply drops & tank replacement
    this.spawnPickup('ammo_all', conqueredX - 60, conqueredY - 20, false);
    this.spawnPickup('medkit', conqueredX - 120, conqueredY + 20, false);
    const activeTank = this.tanks.find((t) => t.hp > 0);
    if (!activeTank || activeTank.hp < activeTank.maxHp * 0.45) {
      this.spawnTank(conqueredX - 180, getRoadCenterY(conqueredX - 180), true);
    }

    // Record old camp as secured base behind us
    this.conqueredBases.push({
      x: this.alliedCamp.x,
      y: this.alliedCamp.y,
      name: this.sector === 1 ? 'MAIN ALLIED FORTRESS' : `ALLIED OUTPOST ${toRoman(this.sector - 1)}`,
    });

    // Move active allied forward camp
    this.alliedCamp.x = conqueredX;
    this.alliedCamp.y = conqueredY;
    this.alliedCamp.hp = this.alliedCamp.maxHp;
    this.alliedCamp.hitFlash = 0;

    // Rally 4 allied soldiers immediately
    for (let i = 0; i < 4; i++) {
      const allyKind: UnitKind = i === 0 ? 'knight' : i === 1 ? 'spearman' : 'footman';
      this.spawnSoldier(
        'ally',
        allyKind,
        conqueredX + 35 + i * 28,
        getRoadCenterY(conqueredX + 35) + (Math.random() - 0.5) * 80
      );
    }

    // Advance sector & expand world
    this.sector++;
    const nextBarracksX = conqueredX + SECTOR_LENGTH;
    this.worldWidth = nextBarracksX + 380;
    this.generateSceneryForRange(conqueredX + 60, this.worldWidth - 60, 270);

    // Spawn next enemy barracks
    const nextMaxHp = 1400 + (this.sector - 1) * 950;
    const sectorTitle = SECTOR_NAMES[(this.sector - 1) % SECTOR_NAMES.length];
    this.enemyBarracks = {
      id: this.nextId++,
      sector: this.sector,
      name: `BARRACKS ${toRoman(this.sector)}: ${sectorTitle}`,
      x: nextBarracksX,
      y: getRoadCenterY(nextBarracksX) - 4,
      hp: nextMaxHp,
      maxHp: nextMaxHp,
      hitFlash: 0,
      flagPhase: 1.4,
      faction: 'enemy',
      destroyed: false,
      collapseTimer: 0,
    };

    // Defending vanguard squad for new sector
    const bossKind: UnitKind = this.sector % 2 === 0 ? 'siege_ram' : 'warlord';
    this.spawnSoldier('enemy', bossKind, nextBarracksX - 320, getRoadCenterY(nextBarracksX - 320));
    for (let i = 0; i < 3; i++) {
      this.spawnSoldier('enemy', 'knight', nextBarracksX - 220 - i * 40, getRoadCenterY(nextBarracksX - 220) + (i - 1) * 45);
    }

    this.waveBannerText = `SECTOR ${this.sector} UNLOCKED!`;
    this.waveBannerSub = `PUSH FORWARD TO ${this.enemyBarracks.name}`;
    this.waveBannerTimer = 4.2;
    this.showToast(`BARRACKS CONQUERED! PUSH FORWARD TO BARRACKS ${toRoman(this.sector)}!`);
  }

  private triggerGameOver(reason: string): void {
    this.phase = 'gameover';
    this.gameOverReason = reason;
    this.mouseDownLeft = false;
    this.mouseDownRight = false;
    this.resetTouchInputs();
    this.addShake(12);
    this.sound.playExplosion(1.1);
    this.pushHud(true);
  }

  private updateParticlesAndProps(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pt.vz -= pt.gravity * dt;
      pt.rotation += pt.vRot * dt;
      if (pt.z < 0) {
        pt.z = 0;
        pt.vz = -pt.vz * 0.35;
        pt.vx *= 0.6;
        pt.vy *= 0.6;
      }
    }

    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.corpses.splice(i, 1);
        continue;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.vz -= 540 * dt;
      if (c.z <= 0) {
        c.z = 0;
        c.vz = 0;
        c.vx *= Math.pow(0.01, dt);
        c.vy *= Math.pow(0.01, dt);
        c.vRot *= Math.pow(0.01, dt);
      } else {
        c.rotation += c.vRot * dt;
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].life -= dt;
      if (this.decals[i].life <= 0) this.decals.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private updateCamera(dt: number): void {
    // Follow player smoothly with subtle look-ahead toward mouse aim or facing direction
    const lookLead = this.isTouchInput
      ? this.player.facing * Math.min(110, this.viewW * 0.12)
      : (this.mouseScreenX - this.viewW * 0.5) * 0.16;
    const desired = this.player.x - this.viewW * 0.42 + lookLead;
    const clamped = Math.max(0, Math.min(this.worldWidth - this.viewW, desired));
    this.cameraX += (clamped - this.cameraX) * Math.min(1, dt * 6.5);
  }

  private addShake(mag: number): void {
    this.shakeMag = Math.min(22, Math.max(this.shakeMag, mag));
  }

  private updateShake(dt: number): void {
    if (this.shakeMag > 0.1) {
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeMag = Math.max(0, this.shakeMag - dt * 36);
    } else {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  private spawnTank(x: number, y: number, airdrop: boolean): void {
    this.tanks.push({
      id: this.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: TANK_MAX_HP,
      maxHp: TANK_MAX_HP,
      facing: 1,
      turretAngle: -0.04,
      cannonCooldown: 0,
      coaxCooldown: 0,
      cannonRecoil: 0,
      treadOffset: 0,
      chassisBounce: 0,
      hitFlash: 0,
      roadkillCooldowns: new Map(),
      parachuteZ: airdrop ? 430 : 0,
      parachuteSway: 0,
      occupied: false,
      smokeTimer: 0,
      trackTimer: 0,
    });
  }

  private spawnSoldier(faction: Faction, kind: UnitKind, x: number, y: number): void {
    const stats = UNIT_STATS[kind];
    const hpScale = faction === 'enemy' ? 1 + (this.wave - 1) * 0.1 : 1 + Math.min(0.6, (this.wave - 1) * 0.05);
    const maxHp = Math.round(stats.maxHp * hpScale);
    this.soldiers.push({
      id: this.nextId++,
      faction,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      facing: faction === 'ally' ? 1 : -1,
      walkPhase: Math.random() * Math.PI * 2,
      attackTimer: 0.25 + Math.random() * 0.35,
      attackAnim: 0,
      hitFlash: 0,
      knockVx: 0,
      knockVy: 0,
      preferredLaneOffset: (Math.random() - 0.5) * 140,
      targetId: null,
      bobSeed: Math.random() * 10,
      elite: this.wave >= 5 && faction === 'enemy' && Math.random() < 0.15,
    });
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, parachute: boolean): void {
    this.pickups.push({
      id: this.nextId++,
      kind,
      x,
      y,
      z: parachute ? 390 : 0,
      vz: 0,
      swayPhase: Math.random() * Math.PI * 2,
      bobPhase: Math.random() * Math.PI * 2,
      life: 48,
      label: PICKUP_LABELS[kind].label,
    });
  }

  private addDecal(decal: GroundDecal): void {
    this.decals.push(decal);
    if (this.decals.length > 140) {
      this.decals.shift();
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, size = 14): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -42,
      text,
      color,
      size,
      life: 1.05,
      maxLife: 1.05,
    });
  }

  private spawnHitSparks(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        z: 0,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        vz: 40 + Math.random() * 60,
        size: 3.5,
        endSize: 0.5,
        color,
        alpha: 1,
        life: 0.24,
        maxLife: 0.24,
        gravity: 340,
        kind: 'spark',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  private spawnDustBurst(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 65;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 8,
        z: 2,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.4,
        vz: 24 + Math.random() * 35,
        size: 6,
        endSize: 16,
        color: '#b8a484',
        alpha: 0.65,
        life: 0.42,
        maxLife: 0.42,
        gravity: -8,
        kind: 'dust',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  private spawnWoodSplinters(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 170;
      this.particles.push({
        x,
        y,
        z: 18,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd * 0.5,
        vz: 110 + Math.random() * 130,
        size: 7 + Math.random() * 4,
        endSize: 4,
        color: i % 2 === 0 ? '#9c562c' : '#6e3b1e',
        alpha: 1,
        life: 0.65,
        maxLife: 0.65,
        gravity: 520,
        kind: 'wood',
        rotation: Math.random() * 6,
        vRot: (Math.random() - 0.5) * 16,
      });
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);

    const activeTank =
      this.player.inTankId !== null ? this.tanks.find((t) => t.id === this.player.inTankId) ?? null : null;

    const showGrenadePreview =
      this.phase === 'playing' &&
      this.player.alive &&
      this.player.inTankId === null &&
      this.grenadeAiming &&
      this.player.grenades > 0;
    const grenadeTarget = showGrenadePreview ? this.getGrenadePreviewTarget() : null;

    const touchDirectActive =
      this.phase === 'playing' &&
      this.player.alive &&
      this.isTouchInput &&
      this.controlMode === 'touch_aim' &&
      this.touchPointActive &&
      !showGrenadePreview;

    const state: RenderState = {
      time: this.time,
      cameraX: this.cameraX,
      viewW: this.viewW,
      viewH: this.viewH,
      shakeX: this.shakeX,
      shakeY: this.shakeY,
      mouseWorldX: this.cameraX + this.mouseScreenX,
      mouseWorldY: this.mouseScreenY,
      mouseScreenX: this.mouseScreenX,
      mouseScreenY: this.mouseScreenY,
      player: this.player,
      alliedCamp: this.alliedCamp,
      conqueredBases: this.conqueredBases,
      enemyBarracks: this.enemyBarracks,
      worldWidth: this.worldWidth,
      sector: this.sector,
      barracksConquered: this.barracksConquered,
      tanks: this.tanks,
      soldiers: this.soldiers,
      projectiles: this.projectiles,
      pickups: this.pickups,
      particles: this.particles,
      corpses: this.corpses,
      decals: this.decals,
      floatingTexts: this.floatingTexts,
      scenery: this.scenery,
      clouds: this.clouds,
      showCrosshair: this.phase === 'playing' && !this.isTouchInput,
      recoilBloom: this.recoilBloom,
      lockedTargetId: this.lockedTargetId,
      isAutoLocked: this.phase === 'playing' && this.isAutoLocked,
      lockedTargetPos: this.phase === 'playing' ? this.lockedTargetPos : null,
      grenadePreview: grenadeTarget
        ? {
            startX: this.player.x,
            startY: this.player.y - 30,
            targetX: grenadeTarget.x,
            targetY: grenadeTarget.y,
            radius: 128,
          }
        : null,
      touchReticle: touchDirectActive
        ? {
            x: this.touchPointScreenX,
            y: this.touchPointScreenY,
            firing: true,
            inTank: activeTank !== null,
          }
        : null,
    };

    this.renderer.render(ctx, state);
    ctx.restore();
  }

  private pushHud(force: boolean, dt = 0): void {
    this.hudThrottle -= dt;
    if (!force && this.hudThrottle > 0) return;
    this.hudThrottle = 0.08;

    const activeTank = this.tanks[0] ?? null;
    const nearTank =
      this.player.alive &&
      this.player.inTankId === null &&
      this.tanks.some(
        (t) => t.parachuteZ <= 2 && Math.hypot(t.x - this.player.x, t.y - this.player.y) <= TANK_INTERACT_RADIUS
      );

    const activeEnemyX = this.enemyBarracks ? this.enemyBarracks.x : ENEMY_CAMP_X;
    const sectorOrigin = this.alliedCamp.x;
    const sectorSpan = Math.max(1, activeEnemyX - sectorOrigin);

    let alliesCount = 0;
    let enemiesCount = 0;
    let frontlineX = this.player.x;
    let enemyMinX = activeEnemyX;
    for (const s of this.soldiers) {
      if (s.faction === 'ally') alliesCount++;
      else {
        enemiesCount++;
        if (s.x < enemyMinX) enemyMinX = s.x;
      }
    }
    if (enemiesCount > 0) frontlineX = enemyMinX;

    const currentIdx = WEAPON_ORDER.indexOf(this.player.activeWeapon);
    let nextWep: WeaponId = this.player.activeWeapon;
    for (let i = 1; i < WEAPON_ORDER.length; i++) {
      const candidate = WEAPON_ORDER[(currentIdx + i) % WEAPON_ORDER.length];
      if (this.player.unlockedWeapons[candidate] && (candidate === 'pistol' || this.player.ammo[candidate] > 0)) {
        nextWep = candidate;
        break;
      }
    }

    this.hudCallback({
      phase: this.phase,
      score: this.score,
      highScore: this.highScore,
      kills: this.kills,
      wave: this.wave,
      waveProgress: Math.min(1, Math.max(this.waveKills / this.waveKillTarget, this.waveElapsed / this.waveDuration)),
      waveBannerText: this.waveBannerText,
      waveBannerSub: this.waveBannerSub,
      waveBannerAlpha: Math.min(1, this.waveBannerTimer),
      combo: this.combo,
      comboTimer: this.comboTimer,
      playerHp: Math.ceil(this.player.hp),
      playerMaxHp: this.player.maxHp,
      campHp: Math.ceil(this.alliedCamp.hp),
      campMaxHp: this.alliedCamp.maxHp,
      barracksConquered: this.barracksConquered,
      sector: this.sector,
      enemyCampHp: this.enemyBarracks ? Math.ceil(this.enemyBarracks.hp) : 0,
      enemyCampMaxHp: this.enemyBarracks ? this.enemyBarracks.maxHp : 1,
      enemyCampName: this.enemyBarracks ? this.enemyBarracks.name : '',
      inTank: this.player.inTankId !== null,
      tankHp: activeTank ? Math.ceil(activeTank.hp) : 0,
      tankMaxHp: activeTank ? activeTank.maxHp : TANK_MAX_HP,
      tankAlive: activeTank !== null,
      tankPrompt: nearTank,
      activeWeapon: this.player.activeWeapon,
      unlockedWeapons: { ...this.player.unlockedWeapons },
      ammo: { ...this.player.ammo },
      grenades: this.player.grenades,
      maxGrenades: this.player.maxGrenades,
      alliesCount,
      enemiesCount,
      frontlineRatio: Math.max(0, Math.min(1, (frontlineX - sectorOrigin) / sectorSpan)),
      playerRatio: Math.max(0, Math.min(1, (this.player.x - sectorOrigin) / sectorSpan)),
      tankRatio: activeTank
        ? Math.max(0, Math.min(1, (activeTank.x - sectorOrigin) / sectorSpan))
        : null,
      muted: this.sound.isMuted(),
      gameOverReason: this.gameOverReason,
      timeSurvived: this.timeSurvived,
      breakdown: { ...this.breakdown },
      pickupToast: this.pickupToast,
      pickupToastTimer: this.pickupToastTimer,
      controlMode: this.controlMode,
      aimWeight: this.aimWeightSetting,
      aimAssist: this.aimAssistEnabled,
      nextWeaponId: nextWep,
      touchAimMode:
        this.controlMode === 'twin_stick' && this.touchFiring
          ? this.touchAimDragging
            ? 'manual'
            : 'auto'
          : 'idle',
    });
  }
}
