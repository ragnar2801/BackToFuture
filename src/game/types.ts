export type WeaponId = 'pistol' | 'shotgun' | 'rifle' | 'minigun' | 'rocket';

export type Faction = 'ally' | 'enemy';

export type UnitKind =
  | 'footman'
  | 'archer'
  | 'spearman'
  | 'knight'
  | 'cavalry'
  | 'siege_ram'
  | 'warlord';

export type PickupKind =
  | 'shotgun'
  | 'rifle'
  | 'minigun'
  | 'rocket'
  | 'grenade'
  | 'medkit'
  | 'ammo_all';

export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface WeaponDef {
  id: WeaponId;
  key: string;
  name: string;
  shortName: string;
  fireRate: number; // seconds between shots
  damage: number;
  pellets: number;
  spread: number; // radians
  speed: number;
  knockback: number;
  range: number;
  maxAmmo: number; // Infinity for pistol
  pickupAmmo: number;
  explosiveRadius: number;
  armorPiercing: number; // 0..1 fraction of enemy armor ignored
  recoilKick: number;
  muzzleOffset: number;
  tracerColor: string;
  accentColor: string;
  spinUpTime?: number;
  turnRate?: number; // radians per second rotational weight / inertia
}

export type AimWeightSetting = 'responsive' | 'balanced' | 'heavy';

export interface UnitStats {
  kind: UnitKind;
  label: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  radius: number;
  height: number;
  armor: number; // flat/fractional damage reduction vs small arms (0..0.65)
  score: number;
  isRanged?: boolean;
  isBoss?: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  aimAngle: number;
  facing: 1 | -1;
  activeWeapon: WeaponId;
  unlockedWeapons: Record<WeaponId, boolean>;
  ammo: Record<WeaponId, number>;
  grenades: number;
  maxGrenades: number;
  fireCooldown: number;
  grenadeCooldown: number;
  weaponRecoil: number;
  spinUp: number;
  walkPhase: number;
  inTankId: number | null;
  dodgeTimer: number;
  dodgeCooldown: number;
  dodgeDirX: number;
  dodgeDirY: number;
  invulnTimer: number;
  hitFlash: number;
  muzzleFlashTimer: number;
  alive: boolean;
}

export interface TankEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  turretAngle: number;
  cannonCooldown: number;
  coaxCooldown: number;
  cannonRecoil: number;
  treadOffset: number;
  chassisBounce: number;
  hitFlash: number;
  roadkillCooldowns: Map<number, number>;
  parachuteZ: number; // >0 while air-dropping
  parachuteSway: number;
  occupied: boolean;
  smokeTimer: number;
  trackTimer: number;
}

export interface SoldierEntity {
  id: number;
  faction: Faction;
  kind: UnitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  walkPhase: number;
  attackTimer: number;
  attackAnim: number; // 0..1 swing animation
  hitFlash: number;
  knockVx: number;
  knockVy: number;
  preferredLaneOffset: number;
  targetId: number | null;
  bobSeed: number;
  elite: boolean;
}

export interface ProjectileEntity {
  id: number;
  kind: 'bullet' | 'pellet' | 'rocket' | 'tank_shell' | 'arrow' | 'grenade';
  faction: Faction;
  x: number;
  y: number;
  z: number; // height above ground for 2.5D arcs (grenades, arrows)
  vx: number;
  vy: number;
  vz: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  damage: number;
  knockback: number;
  armorPiercing: number;
  explosiveRadius: number;
  life: number;
  maxLife: number;
  color: string;
  bounces: number;
  smokeTimer: number;
  rotation: number;
}

export interface PickupEntity {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  z: number; // >0 while parachuting down
  vz: number;
  swayPhase: number;
  bobPhase: number;
  life: number;
  label: string;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  endSize: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  kind: 'spark' | 'smoke' | 'fire' | 'blood' | 'casing' | 'wood' | 'dust' | 'ring' | 'debris' | 'slash';
  rotation: number;
  vRot: number;
  outline?: boolean;
}

export interface CorpseProp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  rotation: number;
  vRot: number;
  faction: Faction;
  kind: UnitKind;
  facing: 1 | -1;
  life: number;
  maxLife: number;
}

export interface GroundDecal {
  x: number;
  y: number;
  kind: 'crater' | 'track' | 'scorch' | 'arrow_stuck';
  radius: number;
  angle: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface SceneryProp {
  x: number;
  y: number;
  kind: 'grass' | 'rock' | 'pebbles' | 'bush' | 'dirt_patch';
  scale: number;
  variant: number;
}

export interface CloudProp {
  x: number;
  y: number;
  scale: number;
  speed: number;
  variant: number;
}

export interface BarracksState {
  id: number;
  sector: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  flagPhase: number;
  faction: Faction;
  destroyed: boolean;
  collapseTimer: number;
}

export interface ConqueredBase {
  x: number;
  y: number;
  name: string;
}

export interface CampState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  flagPhase: number;
}

export interface KillBreakdown {
  footman: number;
  archer: number;
  spearman: number;
  knight: number;
  cavalry: number;
  siege_ram: number;
  warlord: number;
  roadkills: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  score: number;
  highScore: number;
  kills: number;
  wave: number;
  waveProgress: number; // 0..1
  waveBannerText: string;
  waveBannerSub: string;
  waveBannerAlpha: number;
  combo: number;
  comboTimer: number;
  playerHp: number;
  playerMaxHp: number;
  campHp: number;
  campMaxHp: number;
  barracksConquered: number;
  sector: number;
  enemyCampHp: number;
  enemyCampMaxHp: number;
  enemyCampName: string;
  inTank: boolean;
  tankHp: number;
  tankMaxHp: number;
  tankAlive: boolean;
  tankPrompt: boolean;
  activeWeapon: WeaponId;
  unlockedWeapons: Record<WeaponId, boolean>;
  ammo: Record<WeaponId, number>;
  grenades: number;
  maxGrenades: number;
  alliesCount: number;
  enemiesCount: number;
  frontlineRatio: number; // 0..1 across current sector
  playerRatio: number; // 0..1 across current sector
  tankRatio: number | null;
  muted: boolean;
  gameOverReason: string;
  timeSurvived: number;
  breakdown: KillBreakdown;
  pickupToast: string;
  pickupToastTimer: number;
  aimWeight: AimWeightSetting;
  aimAssist: boolean;
  quickTapAutoAim: boolean;
  nextWeaponId: WeaponId;
}

