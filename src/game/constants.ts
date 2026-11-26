import type { PickupKind, UnitKind, UnitStats, WeaponDef, WeaponId } from './types';

export const WORLD_WIDTH = 3400;
export const LOGICAL_HEIGHT = 720;
export const HORIZON_Y = 235;
export const PLAYABLE_Y_MIN = 278;
export const PLAYABLE_Y_MAX = 665;

export const ALLIED_CAMP_X = 148;
export const ALLIED_CAMP_Y = 392;
export const ALLIED_CAMP_MAX_HP = 1200;

export const ENEMY_CAMP_X = 3240;
export const ENEMY_CAMP_Y = 398;

export const PLAYER_MAX_HP = 130;
export const PLAYER_SPEED = 225;
export const TANK_MAX_HP = 450;
export const TANK_SPEED = 178;
export const TANK_INTERACT_RADIUS = 96;

export const PALETTE = {
  outline: '#1e1b17',
  skyTop: '#b7cbd7',
  skyMid: '#d5e2e8',
  skyBottom: '#ebf0ef',
  hillFar: '#a0b0aa',
  hillMid: '#8a9982',
  hillNear: '#7a8764',
  grassBase: '#7c855f',
  grassDark: '#69724e',
  grassLight: '#8d966c',
  roadEdge: '#977d59',
  roadFill: '#b59970',
  roadCenter: '#c7ae84',
  allyBlue: '#3559e8',
  allyBlueDark: '#233cb0',
  allyBlueLight: '#5a7df5',
  enemyRed: '#cc2f39',
  enemyRedDark: '#941c25',
  enemyRedLight: '#e6505a',
  skin: '#f2c59d',
  skinShade: '#d9a77e',
  khaki: '#c2a669',
  khakiDark: '#9e844d',
  tankGreen: '#82a93b',
  tankGreenDark: '#618229',
  tankGreenLight: '#a3c955',
  crateGreen: '#6a7d47',
  crateDark: '#4f5e34',
  crateLatch: '#dec74b',
  gold: '#f5cb38',
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'minigun', 'rocket'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    key: '1',
    name: 'M1911 Pistol',
    shortName: 'PISTOL',
    fireRate: 0.21,
    damage: 30,
    pellets: 1,
    spread: 0.032,
    speed: 1220,
    knockback: 105,
    range: 760,
    maxAmmo: Infinity,
    pickupAmmo: Infinity,
    explosiveRadius: 0,
    armorPiercing: 0.25,
    recoilKick: 5,
    muzzleOffset: 24,
    tracerColor: '#fff08a',
    accentColor: '#e6c555',
  },
  shotgun: {
    id: 'shotgun',
    key: '2',
    name: 'Trench Shotgun',
    shortName: 'SHOTGUN',
    fireRate: 0.62,
    damage: 21,
    pellets: 7,
    spread: 0.23,
    speed: 1060,
    knockback: 225,
    range: 480,
    maxAmmo: 64,
    pickupAmmo: 22,
    explosiveRadius: 0,
    armorPiercing: 0.35,
    recoilKick: 12,
    muzzleOffset: 30,
    tracerColor: '#ffd966',
    accentColor: '#d97b38',
  },
  rifle: {
    id: 'rifle',
    key: '3',
    name: 'Assault Rifle',
    shortName: 'RIFLE',
    fireRate: 0.095,
    damage: 25,
    pellets: 1,
    spread: 0.055,
    speed: 1360,
    knockback: 82,
    range: 860,
    maxAmmo: 210,
    pickupAmmo: 65,
    explosiveRadius: 0,
    armorPiercing: 0.5,
    recoilKick: 6.5,
    muzzleOffset: 32,
    tracerColor: '#fff299',
    accentColor: '#66b55a',
  },
  minigun: {
    id: 'minigun',
    key: '4',
    name: 'Rotary Minigun',
    shortName: 'MINIGUN',
    fireRate: 0.05,
    damage: 19,
    pellets: 1,
    spread: 0.105,
    speed: 1420,
    knockback: 72,
    range: 860,
    maxAmmo: 360,
    pickupAmmo: 150,
    explosiveRadius: 0,
    armorPiercing: 0.55,
    recoilKick: 4.5,
    muzzleOffset: 34,
    tracerColor: '#ffe359',
    accentColor: '#e8a035',
    spinUpTime: 0.16,
  },
  rocket: {
    id: 'rocket',
    key: '5',
    name: 'RPG Launcher',
    shortName: 'ROCKET',
    fireRate: 0.92,
    damage: 205,
    pellets: 1,
    spread: 0.015,
    speed: 740,
    knockback: 420,
    range: 1050,
    maxAmmo: 18,
    pickupAmmo: 6,
    explosiveRadius: 142,
    armorPiercing: 1.0,
    recoilKick: 15,
    muzzleOffset: 32,
    tracerColor: '#ff7b33',
    accentColor: '#e04838',
  },
};

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  footman: {
    kind: 'footman',
    label: 'Footman',
    maxHp: 58,
    speed: 86,
    damage: 11,
    attackRange: 44,
    attackCooldown: 0.92,
    radius: 17,
    height: 46,
    armor: 0.05,
    score: 100,
  },
  archer: {
    kind: 'archer',
    label: 'Archer',
    maxHp: 44,
    speed: 78,
    damage: 11,
    attackRange: 335,
    attackCooldown: 1.65,
    radius: 16,
    height: 44,
    armor: 0,
    score: 150,
    isRanged: true,
  },
  spearman: {
    kind: 'spearman',
    label: 'Spearman',
    maxHp: 82,
    speed: 92,
    damage: 15,
    attackRange: 64,
    attackCooldown: 1.05,
    radius: 18,
    height: 48,
    armor: 0.16,
    score: 175,
  },
  knight: {
    kind: 'knight',
    label: 'Heavy Knight',
    maxHp: 195,
    speed: 68,
    damage: 24,
    attackRange: 52,
    attackCooldown: 1.2,
    radius: 21,
    height: 54,
    armor: 0.45,
    score: 300,
  },
  cavalry: {
    kind: 'cavalry',
    label: 'War Cavalry',
    maxHp: 155,
    speed: 152,
    damage: 26,
    attackRange: 66,
    attackCooldown: 0.95,
    radius: 26,
    height: 62,
    armor: 0.28,
    score: 350,
  },
  siege_ram: {
    kind: 'siege_ram',
    label: 'Siege Ram',
    maxHp: 520,
    speed: 44,
    damage: 55,
    attackRange: 72,
    attackCooldown: 1.9,
    radius: 42,
    height: 68,
    armor: 0.55,
    score: 800,
    isBoss: true,
  },
  warlord: {
    kind: 'warlord',
    label: 'Iron Warlord',
    maxHp: 640,
    speed: 78,
    damage: 36,
    attackRange: 64,
    attackCooldown: 1.15,
    radius: 26,
    height: 68,
    armor: 0.48,
    score: 1200,
    isBoss: true,
  },
};

export const PICKUP_LABELS: Record<PickupKind, { label: string; color: string; short: string }> = {
  shotgun: { label: 'TRENCH SHOTGUN +22', color: '#e68c3a', short: 'SHOTGUN' },
  rifle: { label: 'ASSAULT RIFLE +65', color: '#78cc66', short: 'AR-15' },
  minigun: { label: 'ROTARY MINIGUN +150', color: '#f2b838', short: 'MINIGUN' },
  rocket: { label: 'RPG LAUNCHER +6', color: '#eb5646', short: 'ROCKETS' },
  grenade: { label: 'FRAG GRENADES +4', color: '#a8cf48', short: 'FRAGS' },
  medkit: { label: 'MEDKIT & CAMP REPAIR', color: '#5ce08b', short: 'REPAIR' },
  ammo_all: { label: 'MUNITIONS CRATE', color: '#f5d442', short: 'AMMO' },
};

/** Smooth curving dirt road center Y along the battlefield (matches image.png's winding path). */
export function getRoadCenterY(x: number): number {
  return 402 + Math.sin(x * 0.0042 - 0.8) * 32 + Math.cos(x * 0.0019 + 0.4) * 18;
}

/** Smooth organic half-width of the dirt road at coordinate x. */
export function getRoadHalfWidth(x: number): number {
  return 68 + Math.sin(x * 0.007 + 1.1) * 9 + Math.cos(x * 0.0031) * 6;
}

export const SECTOR_LENGTH = 3100;

export const SECTOR_NAMES = [
  'VANGUARD OUTPOST',
  'IRON GARRISON',
  'WARLORD\'S BASTION',
  'CITADEL OF ASH',
  'ROYAL FORTRESS',
  'SHADOW STRONGHOLD',
  'DREAD CITADEL',
  'IMPERIAL REDOUBT',
];

export function toRoman(num: number): string {
  const romans: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let res = '';
  for (const [v, s] of romans) {
    while (num >= v) {
      res += s;
      num -= v;
    }
  }
  return res || 'I';
}

