import {
  HORIZON_Y,
  LOGICAL_HEIGHT,
  PALETTE,
  PICKUP_LABELS,
  TANK_INTERACT_RADIUS,
  UNIT_STATS,
  WORLD_WIDTH,
  getRoadCenterY,
  getRoadHalfWidth,
  toRoman,
} from './constants';
import type {
  BarracksState,
  CampState,
  CloudProp,
  ConqueredBase,
  CorpseProp,
  FloatingText,
  GroundDecal,
  Particle,
  PickupEntity,
  PlayerState,
  ProjectileEntity,
  SceneryProp,
  SoldierEntity,
  TankEntity,
  WeaponId,
} from './types';

export interface RenderState {
  time: number;
  cameraX: number;
  viewW: number;
  viewH: number;
  shakeX: number;
  shakeY: number;
  mouseWorldX: number;
  mouseWorldY: number;
  mouseScreenX: number;
  mouseScreenY: number;
  player: PlayerState;
  alliedCamp: CampState;
  conqueredBases: ConqueredBase[];
  enemyBarracks: BarracksState | null;
  worldWidth: number;
  sector: number;
  barracksConquered: number;
  tanks: TankEntity[];
  soldiers: SoldierEntity[];
  projectiles: ProjectileEntity[];
  pickups: PickupEntity[];
  particles: Particle[];
  corpses: CorpseProp[];
  decals: GroundDecal[];
  floatingTexts: FloatingText[];
  scenery: SceneryProp[];
  clouds: CloudProp[];
  showCrosshair: boolean;
  recoilBloom: number;
  showAimLaser: boolean;
  aimLaserOriginX: number;
  aimLaserOriginY: number;
  aimLaserAngle: number;
  aimLaserRange: number;
  aimLaserSpread: number;
  aimLaserColor: string;
  aimLaserFired: boolean;
  lockedTargetId: number | null;
  isAutoLocked: boolean;
  lockedTargetPos: { x: number; y: number; isBoss: boolean } | null;
  grenadePreview: {
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    radius: number;
  } | null;
}

interface DrawableItem {
  sortY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export class GameRenderer {
  public render(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { viewW, viewH, cameraX, shakeX, shakeY } = state;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Sky + Drifting Clouds + Parallax Hills
    this.drawSkyAndHills(ctx, state);

    // World space transform
    ctx.save();
    ctx.translate(Math.round(-cameraX + shakeX), Math.round(shakeY));

    // 2. Ground meadow + winding dirt road
    this.drawMeadowAndRoad(ctx, cameraX, viewW, viewH, state.worldWidth);

    // 3. Ground decals (scorch craters, tank tracks, stuck arrows)
    this.drawDecals(ctx, state.decals, cameraX, viewW);

    // 4. Ground scenery (grass tufts, rocks, pebbles, dirt patches)
    this.drawScenery(ctx, state.scenery, cameraX, viewW);

    // 5. Collect depth-sorted 2.5D entities (Y-sorted)
    const drawables: DrawableItem[] = [];

    // Historical Conquered Allied Outposts behind the front
    for (const b of state.conqueredBases) {
      if (b.x + 260 > cameraX && b.x - 240 < cameraX + viewW) {
        drawables.push({
          sortY: b.y + 40,
          draw: (c) =>
            this.drawAlliedCamp(
              c,
              { x: b.x, y: b.y, hp: 1, maxHp: 1, hitFlash: 0, flagPhase: 0 },
              state.time,
              b.name,
              false
            ),
        });
      }
    }

    // Active Allied Camp / Forward Command Post
    if (state.alliedCamp.x + 260 > cameraX && state.alliedCamp.x - 240 < cameraX + viewW) {
      drawables.push({
        sortY: state.alliedCamp.y + 40,
        draw: (c) =>
          this.drawAlliedCamp(
            c,
            state.alliedCamp,
            state.time,
            state.sector > 1 ? `ALLIED OUTPOST ${toRoman(state.sector - 1)}` : 'ALLIED CAMP',
            true
          ),
      });
    }

    // Active Enemy Barracks
    if (state.enemyBarracks) {
      const eb = state.enemyBarracks;
      if (eb.x + 260 > cameraX && eb.x - 260 < cameraX + viewW) {
        drawables.push({
          sortY: eb.y + 35,
          draw: (c) => this.drawEnemyCamp(c, eb, state.time),
        });
      }
    }


    // Corpses / defeated props
    for (const corpse of state.corpses) {
      if (corpse.x < cameraX - 100 || corpse.x > cameraX + viewW + 100) continue;
      drawables.push({
        sortY: corpse.y - 4,
        draw: (c) => this.drawCorpse(c, corpse),
      });
    }

    // Supply Crates / Pickups
    for (const p of state.pickups) {
      if (p.x < cameraX - 120 || p.x > cameraX + viewW + 120) continue;
      drawables.push({
        sortY: p.y,
        draw: (c) => this.drawPickup(c, p, state.time),
      });
    }

    // Tanks
    for (const tank of state.tanks) {
      if (tank.x < cameraX - 180 || tank.x > cameraX + viewW + 180) continue;
      const nearPlayer =
        state.player.alive &&
        state.player.inTankId === null &&
        tank.parachuteZ <= 2 &&
        Math.hypot(state.player.x - tank.x, state.player.y - tank.y) <= TANK_INTERACT_RADIUS;
      drawables.push({
        sortY: tank.y + 4,
        draw: (c) => this.drawTank(c, tank, state.time, nearPlayer),
      });
    }

    // Soldiers (Allies & Enemies)
    for (const s of state.soldiers) {
      if (s.x < cameraX - 120 || s.x > cameraX + viewW + 120) continue;
      drawables.push({
        sortY: s.y,
        draw: (c) => this.drawSoldier(c, s, state.time),
      });
    }

    // Player (when on foot)
    if (state.player.alive && state.player.inTankId === null) {
      drawables.push({
        sortY: state.player.y + 1,
        draw: (c) => this.drawPlayer(c, state.player, state.time),
      });
    }

    // Sort back-to-front by Y
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const item of drawables) {
      item.draw(ctx);
    }

    // 6. Tactical aim guide, lock-on reticle & live grenade blast ring
    this.drawAimGuide(ctx, state);
    if (state.grenadePreview) {
      this.drawGrenadePreview(ctx, state);
    }

    // 7. Projectiles (bullets, tracers, arrows, grenades, rockets, tank shells)
    this.drawProjectiles(ctx, state.projectiles, cameraX, viewW, state.time);

    // 7. Particles (explosions, smoke, muzzle flashes, shell casings, wood splinters, slashes)
    this.drawParticles(ctx, state.particles, cameraX, viewW);

    // 8. World-space floating score/callout text
    this.drawFloatingTexts(ctx, state.floatingTexts);

    ctx.restore(); // end world transform

    // 9. Offscreen indicators (for parachuting crates, uncrewed tank, or Boss incoming)
    this.drawOffscreenIndicators(ctx, state);

    // 10. Crisp Golden Aiming Crosshair
    if (state.showCrosshair) {
      this.drawCrosshair(ctx, state.mouseScreenX, state.mouseScreenY, state.recoilBloom, state.player.inTankId !== null);
    }

    ctx.restore();
  }

  private drawSkyAndHills(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { viewW, cameraX } = state;

    // Soft overcast painterly sky gradient matching reference artwork
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 35);
    skyGrad.addColorStop(0, '#b5cad7');
    skyGrad.addColorStop(0.52, '#d6e3ea');
    skyGrad.addColorStop(1, '#eef2f1');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, viewW, HORIZON_Y + 40);

    // Soft wispy painterly drifting clouds (no sharp arc-join artifacts!)
    for (const cl of state.clouds) {
      const span = viewW + 520;
      const sx = (((cl.x - cameraX * 0.08) % span) + span) % span - 260;
      this.drawCloud(ctx, sx, cl.y, cl.scale, cl.variant);
    }

    // Far misty blue-grey ridge (parallax 0.14)
    this.drawHillBand(ctx, viewW, cameraX * 0.14, HORIZON_Y - 46, 36, 0.0022, '#a7b6b2', 0.88);

    // Mid atmospheric sage-olive hills (parallax 0.28)
    this.drawHillBand(ctx, viewW, cameraX * 0.28, HORIZON_Y - 22, 28, 0.0031, '#92a18c', 0.96);

    // Near grassy rolling horizon ridge (parallax 0.50)
    this.drawHillBand(ctx, viewW, cameraX * 0.5, HORIZON_Y + 6, 19, 0.0044, '#7d8a66', 1.0, 'rgba(85, 96, 67, 0.55)');
  }

  private drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, variant: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const puffs: [number, number, number, number][] =
      variant % 2 === 0
        ? [
            [-68, 8, 56, 17],
            [-14, -4, 72, 22],
            [52, 6, 60, 18],
            [14, 12, 86, 16],
          ]
        : [
            [-58, 10, 52, 16],
            [6, -2, 68, 20],
            [64, 9, 48, 15],
            [-8, 13, 78, 15],
          ];

    // Soft cool overcast underside shadow
    ctx.fillStyle = 'rgba(176, 194, 206, 0.34)';
    for (const [px, py, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(px, py + 7, rx * 1.04, ry * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Painterly sunlit cream-white cloud body
    ctx.fillStyle = 'rgba(246, 250, 252, 0.62)';
    for (const [px, py, rx, ry] of puffs) {
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawHillBand(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    scrollX: number,
    baseY: number,
    amp: number,
    freq: number,
    fill: string,
    alpha: number,
    stroke?: string
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-10, LOGICAL_HEIGHT);
    const step = 24;
    for (let sx = -10; sx <= viewW + step; sx += step) {
      const wx = sx + scrollX;
      const y =
        baseY +
        Math.sin(wx * freq) * amp +
        Math.cos(wx * freq * 1.9 + 1.4) * (amp * 0.42) +
        Math.sin(wx * freq * 0.45) * (amp * 0.35);
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(viewW + 10, LOGICAL_HEIGHT);
    ctx.closePath();
    ctx.fill();

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMeadowAndRoad(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    viewW: number,
    viewH: number,
    worldWidth = WORLD_WIDTH
  ): void {
    const startX = Math.max(-40, Math.floor(cameraX / 32) * 32 - 64);
    const endX = Math.min(worldWidth + 60, cameraX + viewW + 96);
    const bottomY = Math.max(LOGICAL_HEIGHT, viewH) + 32;

    // Grass meadow gradient
    const grassGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, bottomY);
    grassGrad.addColorStop(0, '#858e67');
    grassGrad.addColorStop(0.22, PALETTE.grassBase);
    grassGrad.addColorStop(0.68, '#737c57');
    grassGrad.addColorStop(1, PALETTE.grassDark);
    ctx.fillStyle = grassGrad;
    ctx.fillRect(startX, HORIZON_Y + 8, endX - startX, bottomY - HORIZON_Y);

    // Subtle horizontal darker meadow contour bands for depth
    ctx.fillStyle = 'rgba(72, 80, 52, 0.14)';
    ctx.beginPath();
    ctx.moveTo(startX, 550);
    for (let x = startX; x <= endX; x += 64) {
      ctx.lineTo(x, 548 + Math.sin(x * 0.005) * 16);
    }
    ctx.lineTo(endX, bottomY);
    ctx.lineTo(startX, bottomY);
    ctx.closePath();
    ctx.fill();

    // Winding dirt road — layered organic hand-drawn ribbon
    const step = 28;
    const drawRoadRibbon = (
      widthScale: number,
      yOffset: number,
      fillStyle: string,
      strokeStyle?: string,
      lineWidth = 2
    ) => {
      ctx.beginPath();
      let first = true;
      for (let x = startX; x <= endX; x += step) {
        const cy = getRoadCenterY(x) + yOffset;
        const hw = getRoadHalfWidth(x) * widthScale + Math.sin(x * 0.023) * 4.5;
        if (first) {
          ctx.moveTo(x, cy - hw);
          first = false;
        } else {
          ctx.lineTo(x, cy - hw);
        }
      }
      for (let x = endX; x >= startX; x -= step) {
        const cy = getRoadCenterY(x) + yOffset;
        const hw = getRoadHalfWidth(x) * widthScale + Math.cos(x * 0.019) * 5;
        ctx.lineTo(x, cy + hw);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    // Outer earthy shoulder
    drawRoadRibbon(1.09, 2, PALETTE.roadEdge, 'rgba(66, 52, 34, 0.55)', 2);
    // Main ochre dirt track
    drawRoadRibbon(0.95, 0, PALETTE.roadFill);
    // Inner worn warm center path
    drawRoadRibbon(0.56, -2, PALETTE.roadCenter);

    // Subtle hand-inked rut lines inside the dirt road (signature comic detail from image.png)
    ctx.strokeStyle = 'rgba(116, 91, 60, 0.42)';
    ctx.lineWidth = 1.6;
    for (const laneMul of [-0.42, 0.36]) {
      ctx.beginPath();
      for (let x = startX; x <= endX; x += 32) {
        const cy = getRoadCenterY(x) + getRoadHalfWidth(x) * laneMul + Math.sin(x * 0.016) * 5;
        if (x === startX) ctx.moveTo(x, cy);
        else ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }
  }

  private drawDecals(ctx: CanvasRenderingContext2D, decals: GroundDecal[], cameraX: number, viewW: number): void {
    for (const d of decals) {
      if (d.x < cameraX - 120 || d.x > cameraX + viewW + 120) continue;
      const fade = Math.min(1, d.life / Math.min(4, d.maxLife * 0.35));
      ctx.save();
      ctx.globalAlpha = d.alpha * fade;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);

      if (d.kind === 'crater') {
        ctx.scale(1, 0.55);
        // Outer dirt ejecta ring
        ctx.fillStyle = '#5a4630';
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
        // Dark blast scorch interior
        ctx.fillStyle = '#2b241d';
        ctx.beginPath();
        ctx.arc(0, 0, d.radius * 0.68, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1b1713';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (d.kind === 'scorch') {
        ctx.scale(1, 0.55);
        ctx.fillStyle = '#2d2620';
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'track') {
        ctx.fillStyle = 'rgba(62, 49, 34, 0.5)';
        ctx.fillRect(-5, -13, 10, 5);
        ctx.fillRect(-5, 8, 10, 5);
      } else if (d.kind === 'arrow_stuck') {
        ctx.strokeStyle = '#5c3c22';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-14, -7);
        ctx.stroke();
        // Feather fletch
        ctx.strokeStyle = '#e5e0d5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-12, -6);
        ctx.lineTo(-16, -9);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawScenery(ctx: CanvasRenderingContext2D, scenery: SceneryProp[], cameraX: number, viewW: number): void {
    for (const s of scenery) {
      if (s.x < cameraX - 80 || s.x > cameraX + viewW + 80) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.scale, s.scale);

      if (s.kind === 'dirt_patch') {
        ctx.fillStyle = 'rgba(136, 114, 82, 0.38)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, 9, 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'grass') {
        ctx.strokeStyle = '#485233';
        ctx.lineWidth = 1.6;
        const blades = s.variant % 2 === 0 ? [-7, -2, 3, 8] : [-5, 0, 6];
        for (let i = 0; i < blades.length; i++) {
          const bx = blades[i];
          const bh = 8 + ((i + s.variant) % 3) * 3.5;
          ctx.beginPath();
          ctx.moveTo(bx * 0.45, 0);
          ctx.quadraticCurveTo(bx * 0.8, -bh * 0.6, bx, -bh);
          ctx.stroke();
        }
      } else if (s.kind === 'rock') {
        // Soft ground shadow
        ctx.fillStyle = 'rgba(26, 30, 20, 0.28)';
        ctx.beginPath();
        ctx.ellipse(2, 4, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Comic fieldstone
        ctx.fillStyle = s.variant % 2 === 0 ? '#918c7d' : '#858074';
        ctx.strokeStyle = '#332f28';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-13, 2);
        ctx.quadraticCurveTo(-12, -9, -1, -10);
        ctx.quadraticCurveTo(11, -10, 14, 1);
        ctx.quadraticCurveTo(12, 6, -2, 6);
        ctx.quadraticCurveTo(-12, 6, -13, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Top highlight facet
        ctx.fillStyle = 'rgba(222, 218, 205, 0.42)';
        ctx.beginPath();
        ctx.ellipse(-3, -5, 6, 2.8, -0.15, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'pebbles') {
        const coords = [
          [-10, 1, 3.2],
          [-3, -2, 2.4],
          [4, 2, 3.6],
          [11, -1, 2.2],
          [1, 5, 2.5],
        ];
        for (const [px, py, r] of coords) {
          ctx.fillStyle = '#a09884';
          ctx.strokeStyle = '#3c372f';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * 0.62, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  private drawAlliedCamp(
    ctx: CanvasRenderingContext2D,
    camp: CampState,
    time: number,
    label = 'ALLIED CAMP',
    showHpBar = true
  ): void {
    ctx.save();
    ctx.translate(camp.x, camp.y);

    // Ground cast shadow under wooden palisade
    ctx.fillStyle = 'rgba(20, 24, 16, 0.34)';
    ctx.beginPath();
    ctx.moveTo(-130, -35);
    ctx.lineTo(52, 58);
    ctx.lineTo(30, 74);
    ctx.lineTo(-148, -16);
    ctx.closePath();
    ctx.fill();

    // Tall Flagpole rising from behind the palisade
    const poleX = -56;
    const poleBottomY = -12;
    const poleTopY = -172;

    // Animated waving Blue Swallowtail Banner (matches image.png!)
    const wave1 = Math.sin(time * 5.2 + camp.flagPhase) * 6;
    const wave2 = Math.cos(time * 6.5 + camp.flagPhase) * 8;
    ctx.fillStyle = PALETTE.allyBlue;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(poleX + 4, poleTopY + 12);
    ctx.quadraticCurveTo(poleX + 48, poleTopY + 24 + wave1, poleX + 98, poleTopY + 42 + wave2);
    ctx.lineTo(poleX + 64, poleTopY + 54 + wave1 * 0.7);
    ctx.lineTo(poleX + 94, poleTopY + 74 + wave2 * 0.9);
    ctx.quadraticCurveTo(poleX + 44, poleTopY + 66 + wave1 * 0.5, poleX + 4, poleTopY + 62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Darker banner fold shadow
    ctx.fillStyle = PALETTE.allyBlueDark;
    ctx.beginPath();
    ctx.moveTo(poleX + 8, poleTopY + 46);
    ctx.quadraticCurveTo(poleX + 38, poleTopY + 52 + wave1 * 0.5, poleX + 64, poleTopY + 54 + wave1 * 0.7);
    ctx.lineTo(poleX + 44, poleTopY + 63 + wave1 * 0.4);
    ctx.lineTo(poleX + 8, poleTopY + 59);
    ctx.closePath();
    ctx.fill();

    // Flagpole timber
    ctx.fillStyle = '#734222';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.2;
    ctx.fillRect(poleX - 4, poleTopY, 8, poleBottomY - poleTopY);
    ctx.strokeRect(poleX - 4, poleTopY, 8, poleBottomY - poleTopY);

    // Finial spear/knob
    ctx.fillStyle = '#995e33';
    ctx.beginPath();
    ctx.arc(poleX, poleTopY - 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Angled wooden palisade stakes (10 chunky sharpened vertical logs)
    const numStakes = 10;
    const damageRatio = 1 - camp.hp / camp.maxHp;
    const flash = camp.hitFlash > 0;

    for (let i = 0; i < numStakes; i++) {
      const t = i / (numStakes - 1);
      const sx = -132 + t * 144;
      const sy = -42 + t * 88;
      const stakeH = 82 + ((i * 17) % 9);
      const stakeW = 19;

      // Stake side & front
      ctx.fillStyle = flash ? '#fff2cc' : i % 2 === 0 ? '#a85c2f' : '#964f26';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 2.2;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - stakeH + 14);
      ctx.lineTo(sx + stakeW * 0.5, sy - stakeH - (damageRatio > 0.5 && i % 3 === 1 ? -6 : 0));
      ctx.lineTo(sx + stakeW, sy - stakeH + 14);
      ctx.lineTo(sx + stakeW, sy + 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Lighter beveled right/top edge highlight
      ctx.fillStyle = 'rgba(235, 168, 108, 0.28)';
      ctx.beginPath();
      ctx.moveTo(sx + 2, sy - stakeH + 14);
      ctx.lineTo(sx + stakeW * 0.5, sy - stakeH + 2);
      ctx.lineTo(sx + stakeW * 0.5, sy + 2);
      ctx.lineTo(sx + 2, sy - 2);
      ctx.closePath();
      ctx.fill();

      // Wood grain ink detail
      ctx.strokeStyle = 'rgba(42, 22, 10, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx + 6, sy - stakeH + 24);
      ctx.lineTo(sx + 6, sy - 14);
      ctx.moveTo(sx + 13, sy - stakeH + 34);
      ctx.lineTo(sx + 13, sy - 6);
      ctx.stroke();
    }

    // Thick End Corner Post (right edge of palisade)
    const endX = 12;
    const endY = 46;
    ctx.fillStyle = flash ? '#fff2cc' : '#7b3e1d';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(endX + 16, endY + 9);
    ctx.lineTo(endX + 36, endY - 4);
    ctx.lineTo(endX + 36, endY - 76);
    ctx.lineTo(endX + 26, endY - 88);
    ctx.lineTo(endX + 16, endY - 70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Forged Iron Horizontal Reinforcing Strap with Rivets (signature detail from image.png!)
    ctx.fillStyle = '#40454e';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-134, -56);
    ctx.lineTo(28, 41);
    ctx.lineTo(48, 28);
    ctx.lineTo(48, 44);
    ctx.lineTo(28, 57);
    ctx.lineTo(-134, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Steel rivets along iron strap
    ctx.fillStyle = '#8b95a3';
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.4) / 8;
      const rx = -124 + t * 144;
      const ry = -42 + t * 88;
      ctx.beginPath();
      ctx.arc(rx, ry, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // World-space ALLIED CAMP label & crisp blue HP bar
    const barW = 126;
    const barH = 12;
    const barX = poleX - barW * 0.5 + 10;
    const barY = poleTopY - 26;
    const hpRatio = Math.max(0, camp.hp / camp.maxHp);

    ctx.font = '900 12px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#14171c';
    ctx.strokeText(label, barX + barW * 0.5, barY - 6);
    ctx.fillStyle = '#f5f8fc';
    ctx.fillText(label, barX + barW * 0.5, barY - 6);

    if (showHpBar) {
      ctx.fillStyle = '#1f2329';
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = hpRatio > 0.3 ? '#4da3ff' : '#ff5b4d';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
      // Gloss highlight
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(barX, barY, barW * hpRatio, barH * 0.4);
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
    } else {
      ctx.font = '800 10px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText('★ SECURED BASE', barX + barW * 0.5, barY + 8);
    }

    ctx.restore();
  }

  private drawEnemyCamp(ctx: CanvasRenderingContext2D, camp: BarracksState, time: number): void {
    ctx.save();
    ctx.translate(camp.x, camp.y);

    // Shadow
    ctx.fillStyle = 'rgba(20, 18, 16, 0.35)';
    ctx.beginPath();
    ctx.ellipse(30, 35, 110, 36, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Tall spiked iron-banded red war banner post
    const poleX = 48;
    const poleTopY = -178;

    // Crimson Tattered War Banner waving left
    const w1 = Math.sin(time * 5.8 + camp.flagPhase) * 7;
    const w2 = Math.cos(time * 7.1 + camp.flagPhase) * 9;
    ctx.fillStyle = PALETTE.enemyRed;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(poleX - 4, poleTopY + 14);
    ctx.quadraticCurveTo(poleX - 52, poleTopY + 26 + w1, poleX - 104, poleTopY + 42 + w2);
    ctx.lineTo(poleX - 68, poleTopY + 56 + w1 * 0.7);
    ctx.lineTo(poleX - 98, poleTopY + 78 + w2 * 0.9);
    ctx.quadraticCurveTo(poleX - 48, poleTopY + 68 + w1 * 0.5, poleX - 4, poleTopY + 64);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Banner skull/cross emblem
    ctx.fillStyle = '#1e1b17';
    ctx.font = '900 13px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚔', poleX - 52, poleTopY + 50 + w1 * 0.6);

    // Flagpole
    ctx.fillStyle = '#473024';
    ctx.fillRect(poleX - 4, poleTopY, 8, 180);
    ctx.strokeRect(poleX - 4, poleTopY, 8, 180);

    // Spiked dark timber battlements
    const flash = camp.hitFlash > 0;
    const damageRatio = Math.max(0, 1 - camp.hp / camp.maxHp);

    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const sx = -26 + t * 126;
      const sy = 44 - t * 84;
      const h = 84 + ((i * 13) % 10);
      ctx.fillStyle = flash ? '#fff2cc' : i % 2 === 0 ? '#5c3c2e' : '#4a2f24';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - h + 16);
      ctx.lineTo(sx + 9, sy - h - (damageRatio > 0.4 && i % 3 === 0 ? -10 : 0));
      ctx.lineTo(sx + 18, sy - h + 16);
      ctx.lineTo(sx + 18, sy - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Label & Enemy Health Bar!
    const barW = 146;
    const barH = 12;
    const barX = poleX - barW * 0.5 - 10;
    const barY = poleTopY - 26;
    const hpRatio = Math.max(0, camp.hp / camp.maxHp);

    ctx.font = '900 12px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#14171c';
    ctx.strokeText(camp.name || 'ENEMY BARRACKS', barX + barW * 0.5, barY - 6);
    ctx.fillStyle = flash ? '#fff07a' : '#ff7d78';
    ctx.fillText(camp.name || 'ENEMY BARRACKS', barX + barW * 0.5, barY - 6);

    ctx.fillStyle = '#1f2329';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = flash ? '#ffed85' : '#ff3644';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    // Gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(barX, barY, barW * hpRatio, barH * 0.4);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

    ctx.restore();
  }

  private drawTank(
    ctx: CanvasRenderingContext2D,
    tank: TankEntity,
    time: number,
    nearPlayer: boolean
  ): void {
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Parachute if air-dropping!
    if (tank.parachuteZ > 0.5) {
      const shadowScale = Math.max(0.35, 1 - tank.parachuteZ / 500);
      ctx.fillStyle = 'rgba(20, 24, 16, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 56 * shadowScale, 20 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      const sway = Math.sin(tank.parachuteSway) * 14;
      ctx.translate(sway, -tank.parachuteZ);

      // Triple heavy military parachutes
      for (const ox of [-38, 0, 38]) {
        const cy = -112 - (ox === 0 ? 14 : 0);
        ctx.strokeStyle = '#33362e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ox - 24, cy + 8);
        ctx.lineTo(-16, -24);
        ctx.moveTo(ox + 24, cy + 8);
        ctx.lineTo(16, -24);
        ctx.stroke();

        ctx.fillStyle = '#758554';
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(ox, cy + 10, 28, Math.PI, 0, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Dashed golden interaction circle (signature detail from image.png!)
      if (!tank.occupied) {
        ctx.save();
        ctx.scale(1, 0.44);
        ctx.rotate(time * (nearPlayer ? 0.9 : 0.3));
        ctx.strokeStyle = nearPlayer ? '#ffe259' : 'rgba(240, 198, 52, 0.72)';
        ctx.lineWidth = nearPlayer ? 3.5 : 2.5;
        ctx.setLineDash([11, 8]);
        ctx.beginPath();
        ctx.arc(0, 16, 76, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Ground contact shadow
      ctx.fillStyle = 'rgba(18, 22, 14, 0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 58, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle chassis bounce when driving or firing
    const bounceY = Math.sin(tank.chassisBounce) * 1.8;
    ctx.translate(0, bounceY);

    const flash = tank.hitFlash > 0;
    const f = tank.facing;

    // 1. Far-side tread (subtle peek behind hull)
    ctx.save();
    ctx.scale(f, 1);

    // Back track block
    ctx.fillStyle = '#2d312e';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    this.roundRect(ctx, -40, -18, 86, 22, 10);
    ctx.fill();
    ctx.stroke();

    // Main sloped tank chassis / hull (matches olive-green comic mini-tank in image.png!)
    ctx.fillStyle = flash ? '#eef8cc' : PALETTE.tankGreen;
    ctx.beginPath();
    ctx.moveTo(-48, -12);
    ctx.lineTo(-42, -32);
    ctx.lineTo(-16, -38);
    ctx.lineTo(28, -36);
    ctx.lineTo(50, -18);
    ctx.lineTo(48, -4);
    ctx.lineTo(-44, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shaded lower hull plate
    ctx.fillStyle = flash ? '#dff0b0' : PALETTE.tankGreenDark;
    ctx.beginPath();
    ctx.moveTo(-44, -15);
    ctx.lineTo(46, -15);
    ctx.lineTo(48, -4);
    ctx.lineTo(-44, -4);
    ctx.closePath();
    ctx.fill();

    // Sunlit top deck highlight
    ctx.fillStyle = PALETTE.tankGreenLight;
    ctx.beginPath();
    ctx.moveTo(-38, -30);
    ctx.lineTo(-14, -35);
    ctx.lineTo(24, -33);
    ctx.lineTo(36, -24);
    ctx.lineTo(-36, -24);
    ctx.closePath();
    ctx.fill();

    // Rear engine grill vents & small white star emblem
    ctx.strokeStyle = '#364a17';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-36 + i * 6, -28);
      ctx.lineTo(-32 + i * 6, -21);
      ctx.stroke();
    }

    // Near-side foreground caterpillar treads (tilted perspective like image.png!)
    ctx.fillStyle = '#3b403c';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, -48, -11, 90, 23, 11);
    ctx.fill();
    ctx.stroke();

    // Inner track dark recess
    ctx.fillStyle = '#252926';
    this.roundRect(ctx, -42, -6, 78, 13, 6);
    ctx.fill();

    // Animated spinning road wheels inside treads
    const wheelXs = [-32, -14, 4, 22, 34];
    for (const wx of wheelXs) {
      ctx.save();
      ctx.translate(wx, 0.5);
      ctx.rotate(tank.treadOffset * 0.14);
      ctx.fillStyle = '#6c7a52';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#262926';
      ctx.fillRect(-1.5, -4, 3, 8);
      ctx.restore();
    }

    // Animated tread notches around bottom/top
    ctx.fillStyle = '#1b1d1b';
    const notchPhase = ((tank.treadOffset % 12) + 12) % 12;
    for (let nx = -40 + notchPhase; nx <= 36; nx += 12) {
      ctx.fillRect(nx, 9.5, 4, 3);
      ctx.fillRect(-nx - 4, -12, 4, 2.5);
    }

    ctx.restore(); // end facing flip for chassis

    // 2. Turret & Rotating Main Cannon
    const turretX = f * -4;
    const turretY = -44;

    ctx.save();
    ctx.translate(turretX, turretY);

    // Cannon barrel aiming smoothly toward turretAngle
    ctx.save();
    ctx.rotate(tank.turretAngle);
    const kick = -tank.cannonRecoil;

    // Barrel shaft
    ctx.fillStyle = flash ? '#eef8cc' : PALETTE.tankGreen;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.fillRect(10 + kick, -6, 46, 12);
    ctx.strokeRect(10 + kick, -6, 46, 12);

    // Barrel top highlight
    ctx.fillStyle = PALETTE.tankGreenLight;
    ctx.fillRect(12 + kick, -4.5, 42, 3.5);

    // Muzzle collar
    ctx.fillStyle = PALETTE.tankGreenDark;
    ctx.fillRect(50 + kick, -7.5, 8, 15);
    ctx.strokeRect(50 + kick, -7.5, 8, 15);
    ctx.restore();

    // Rounded cartoon tank turret dome
    ctx.fillStyle = flash ? '#eef8cc' : PALETTE.tankGreen;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Turret highlight
    ctx.fillStyle = PALETTE.tankGreenLight;
    ctx.beginPath();
    ctx.ellipse(-4, -5, 16, 7, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Commander Hatch / Cupola
    ctx.fillStyle = PALETTE.tankGreenDark;
    ctx.beginPath();
    ctx.ellipse(-5, -13, 12, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // If occupied, show commander goggles peeking slightly or closed hatch star!
    if (tank.occupied) {
      // Cute player commander cap & goggles peeking out top hatch!
      ctx.fillStyle = '#738547';
      ctx.beginPath();
      ctx.arc(-5, -17, 7, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#a4d3e3';
      ctx.fillRect(-10, -19, 4.5, 3);
      ctx.fillRect(-4, -19, 4.5, 3);
    }

    ctx.restore(); // end turret

    // 3. World-space Tank Label & Green HP Bar (exact match to image.png!)
    const barW = 86;
    const barH = 10;
    const barX = -barW * 0.5;
    const barY = -82;
    const hpRatio = Math.max(0, tank.hp / tank.maxHp);

    const label = tank.occupied
      ? 'TANK [E EXIT]'
      : nearPlayer
        ? 'PRESS [E] ENTER'
        : 'TANK [E]';

    ctx.font = '900 11px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#151814';
    ctx.strokeText(label, 0, barY - 5);
    ctx.fillStyle = nearPlayer ? '#ffe96b' : '#f4f7f2';
    ctx.fillText(label, 0, barY - 5);

    ctx.fillStyle = '#1d211a';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = hpRatio > 0.35 ? '#75e038' : hpRatio > 0.18 ? '#f2b830' : '#eb473b';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(barX, barY, barW * hpRatio, barH * 0.38);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.7;
    ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // Cannon reload bar directly under HP bar when occupied and reloading
    if (tank.occupied && tank.cannonCooldown > 0) {
      const reloadRatio = 1 - Math.min(1, tank.cannonCooldown / 1.15);
      ctx.fillStyle = '#1d211a';
      ctx.fillRect(barX, barY + barH + 3, barW, 4);
      ctx.fillStyle = '#f5cb38';
      ctx.fillRect(barX, barY + barH + 3, barW * reloadRatio, 4);
    }

    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState, time: number): void {
    ctx.save();
    ctx.translate(p.x, p.y);

    // Invulnerability flicker after taking damage
    if (p.invulnTimer > 0 && p.dodgeTimer <= 0 && Math.floor(time * 20) % 2 === 0) {
      ctx.globalAlpha = 0.65;
    }

    // Ground contact shadow
    ctx.fillStyle = 'rgba(20, 24, 16, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 17, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle heroic golden floor ring beneath player so you never lose yourself in huge battles!
    ctx.strokeStyle = 'rgba(245, 203, 56, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 3, 21, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Combat roll rotation
    if (p.dodgeTimer > 0) {
      const rollProgress = 1 - p.dodgeTimer / 0.28;
      ctx.translate(0, -18);
      ctx.rotate(rollProgress * Math.PI * 2 * p.facing);
      ctx.translate(0, 18);
    }

    const moving = Math.hypot(p.vx, p.vy) > 12;
    const stride = moving ? Math.sin(p.walkPhase) : 0;
    const bob = moving ? Math.abs(Math.cos(p.walkPhase)) * 3.5 : Math.sin(time * 3.2) * 0.8;
    const flash = p.hitFlash > 0;

    ctx.save();
    ctx.scale(p.facing, 1);

    // Back leg
    this.drawBootLeg(ctx, -4 - stride * 7, -13, -6 - stride * 8, 1, '#4c544d', '#2b2d30');
    // Front leg
    this.drawBootLeg(ctx, 5 + stride * 7, -13, 6 + stride * 8, 2, '#5c665d', '#33363a');

    // Khaki/tan WWII-modern field jacket torso (exact color & pouches from image.png!)
    ctx.translate(0, -bob);
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.khaki;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.3;
    this.roundRect(ctx, -13, -36, 26, 25, 7);
    ctx.fill();
    ctx.stroke();

    // Jacket collar & chest pocket
    ctx.fillStyle = PALETTE.khakiDark;
    ctx.fillRect(-11, -24, 9, 7);
    ctx.strokeRect(-11, -24, 9, 7);
    // Gold/orange medal ribbon on chest (visible in image.png!)
    ctx.fillStyle = '#e8962e';
    ctx.fillRect(2, -31, 6, 3.5);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(2, -31, 6, 3.5);

    // Dark brown leather utility belt with ammo pouches
    ctx.fillStyle = '#5e4025';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    ctx.fillRect(-13.5, -18, 27, 6);
    ctx.strokeRect(-13.5, -18, 27, 6);
    // Pouches
    ctx.fillStyle = '#755231';
    ctx.fillRect(-10, -19, 6, 8);
    ctx.strokeRect(-10, -19, 6, 8);
    ctx.fillRect(3, -19, 6, 8);
    ctx.strokeRect(3, -19, 6, 8);

    // Head (charming cartoon face with mustache!)
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.skin;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.arc(1, -46, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rosy cheek
    ctx.fillStyle = 'rgba(224, 118, 102, 0.32)';
    ctx.beginPath();
    ctx.arc(7, -43, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Determined eyes
    ctx.fillStyle = '#181512';
    ctx.beginPath();
    ctx.arc(5, -47, 1.8, 0, Math.PI * 2);
    ctx.arc(10.5, -47, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Iconic brown mustache (straight from image.png!!)
    ctx.fillStyle = '#5c3920';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(2, -41.5);
    ctx.quadraticCurveTo(6, -44.5, 11.5, -41.5);
    ctx.quadraticCurveTo(9, -39, 6, -40.2);
    ctx.quadraticCurveTo(3.5, -39.2, 2, -41.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Olive WWII helmet/cap with Aviator Goggles!
    ctx.fillStyle = '#6f8245';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -50, 13.2, Math.PI * 1.04, Math.PI * 1.96);
    ctx.lineTo(15, -49);
    ctx.lineTo(-13, -49);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Goggle strap
    ctx.fillStyle = '#473624';
    ctx.fillRect(-12, -55, 24, 3.5);

    // Aviator Goggle Lenses on brow
    ctx.fillStyle = '#d4c373';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(2, -54, 4.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(10, -54, 4.2, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9dd4e6';
    ctx.beginPath();
    ctx.ellipse(2, -54, 2.8, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -54, 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // end facing flip before drawing world-angled weapon arm!

    // Aimed Weapon + Arm
    ctx.save();
    ctx.translate(0, -28 - bob);
    let localAngle = p.aimAngle;
    const flipped = Math.cos(localAngle) < 0;
    ctx.rotate(localAngle);
    if (flipped) {
      ctx.scale(1, -1);
    }

    const recoil = -p.weaponRecoil;
    // Khaki sleeve & hand gripping weapon
    ctx.fillStyle = PALETTE.khaki;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.1;
    this.roundRect(ctx, -2 + recoil * 0.4, -4, 15, 8.5, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.skin;
    ctx.beginPath();
    ctx.arc(13 + recoil * 0.5, 0.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.drawModernWeapon(ctx, p.activeWeapon, recoil, p.muzzleFlashTimer > 0, time);

    ctx.restore();
    ctx.restore();
  }

  private drawModernWeapon(
    ctx: CanvasRenderingContext2D,
    weapon: WeaponId,
    recoil: number,
    muzzleFlash: boolean,
    time: number
  ): void {
    ctx.save();
    ctx.translate(recoil, 0);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;

    let muzzleX = 26;
    let muzzleY = -3;

    if (weapon === 'pistol') {
      ctx.fillStyle = '#3b4048';
      ctx.fillRect(11, -6, 15, 5.5);
      ctx.strokeRect(11, -6, 15, 5.5);
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(11, -1, 5, 7);
      ctx.strokeRect(11, -1, 5, 7);
      muzzleX = 27;
      muzzleY = -3.5;
    } else if (weapon === 'shotgun') {
      // Wood stock + long steel barrel + pump forend
      ctx.fillStyle = '#7c4c28';
      ctx.fillRect(0, -2, 13, 6.5);
      ctx.strokeRect(0, -2, 13, 6.5);
      ctx.fillStyle = '#42474f';
      ctx.fillRect(11, -6, 23, 5.2);
      ctx.strokeRect(11, -6, 23, 5.2);
      ctx.fillStyle = '#8d5930';
      ctx.fillRect(18, -1, 10, 4.2);
      ctx.strokeRect(18, -1, 10, 4.2);
      muzzleX = 35;
      muzzleY = -3.5;
    } else if (weapon === 'rifle') {
      // Tactical assault rifle with curved mag & sight
      ctx.fillStyle = '#30343a';
      ctx.fillRect(1, -4, 10, 6);
      ctx.strokeRect(1, -4, 10, 6);
      ctx.fillStyle = '#484e57';
      ctx.fillRect(10, -6.5, 20, 7);
      ctx.strokeRect(10, -6.5, 20, 7);
      // Carry handle sight
      ctx.fillRect(13, -9.5, 11, 3);
      ctx.strokeRect(13, -9.5, 11, 3);
      // Barrel
      ctx.fillStyle = '#2a2e33';
      ctx.fillRect(30, -5, 9, 3.5);
      ctx.strokeRect(30, -5, 9, 3.5);
      // Curved magazine
      ctx.fillStyle = '#383d45';
      ctx.beginPath();
      ctx.moveTo(19, 0.5);
      ctx.lineTo(24, 0.5);
      ctx.lineTo(26, 10);
      ctx.lineTo(20, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      muzzleX = 40;
      muzzleY = -3.2;
    } else if (weapon === 'minigun') {
      // Heavy rotary multi-barrel gatling cannon
      ctx.fillStyle = '#3c4248';
      this.roundRect(ctx, 2, -7, 17, 13, 3);
      ctx.fill();
      ctx.stroke();
      // Spinning multi-barrels
      ctx.fillStyle = '#606870';
      ctx.fillRect(19, -5.5, 22, 9.5);
      ctx.strokeRect(19, -5.5, 22, 9.5);
      // Barrel lines shifting rapidly
      const shift = Math.floor(time * 40) % 2;
      ctx.strokeStyle = '#23272b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(19, -2.5 + shift);
      ctx.lineTo(41, -2.5 + shift);
      ctx.moveTo(19, 1 + shift);
      ctx.lineTo(41, 1 + shift);
      ctx.stroke();
      // Barrel clamp band
      ctx.fillStyle = '#c4962c';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.6;
      ctx.fillRect(33, -6.5, 4, 11.5);
      ctx.strokeRect(33, -6.5, 4, 11.5);
      muzzleX = 43;
      muzzleY = -1;
    } else if (weapon === 'rocket') {
      // Olive shoulder RPG/Bazooka launcher
      ctx.fillStyle = '#5c6e3b';
      ctx.fillRect(-10, -7, 42, 10);
      ctx.strokeRect(-10, -7, 42, 10);
      // Rear exhaust cone
      ctx.fillStyle = '#3f4d29';
      ctx.beginPath();
      ctx.moveTo(-10, -7);
      ctx.lineTo(-16, -9.5);
      ctx.lineTo(-16, 5.5);
      ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Red warhead nose cone peeking out front
      ctx.fillStyle = '#d43d32';
      ctx.beginPath();
      ctx.moveTo(32, -7.5);
      ctx.lineTo(40, -2);
      ctx.lineTo(32, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      muzzleX = 40;
      muzzleY = -2;
    }

    // Comic Star Muzzle Flash
    if (muzzleFlash) {
      ctx.save();
      ctx.translate(muzzleX, muzzleY);
      const scale = weapon === 'shotgun' || weapon === 'rocket' ? 1.45 : 1.0;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ff9d26';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 15 : 5.5;
        const px = Math.cos(a) * r + 5;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff9c4';
      ctx.beginPath();
      ctx.arc(4, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawSoldier(ctx: CanvasRenderingContext2D, s: SoldierEntity, time: number): void {
    ctx.save();
    ctx.translate(s.x, s.y);

    if (s.kind === 'siege_ram') {
      this.drawSiegeRam(ctx, s);
      ctx.restore();
      return;
    }

    if (s.kind === 'cavalry') {
      this.drawCavalry(ctx, s);
      ctx.restore();
      return;
    }

    const stats = UNIT_STATS[s.kind];
    const isAlly = s.faction === 'ally';
    const isBoss = s.kind === 'warlord';
    const scale = isBoss ? 1.42 : s.kind === 'knight' ? 1.18 : 1.0;

    // Ground shadow
    ctx.fillStyle = 'rgba(18, 22, 14, 0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 15 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    const moving = Math.hypot(s.vx, s.vy) > 10;
    const stride = moving ? Math.sin(s.walkPhase) : 0;
    const bob = moving ? Math.abs(Math.cos(s.walkPhase)) * 3 : Math.sin(time * 3 + s.bobSeed) * 0.6;
    const flash = s.hitFlash > 0;

    ctx.save();
    ctx.scale(s.facing * scale, scale);

    // Warlord billowing cloak behind body
    if (isBoss) {
      const capeWave = Math.sin(time * 7 + s.bobSeed) * 4;
      ctx.fillStyle = '#7d1620';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -34);
      ctx.quadraticCurveTo(-24, -18 + capeWave, -22, -2);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Animated legs with brown leather boots
    const pantColor = s.kind === 'knight' || isBoss ? '#464c56' : '#656970';
    const bootColor = s.kind === 'knight' || isBoss ? '#30353d' : '#734828';
    this.drawBootLeg(ctx, -4 - stride * 7, -12, -6 - stride * 8, 1, pantColor, bootColor);
    this.drawBootLeg(ctx, 4 + stride * 7, -12, 6 + stride * 8, 1.5, pantColor, bootColor);

    ctx.translate(0, -bob);

    // Back-hand weapon / shield setup
    const swing = s.attackAnim > 0 ? Math.sin(s.attackAnim * Math.PI) : 0;

    // Torso / Tunic / Plate Armor
    const tunicMain = flash
      ? '#ffffff'
      : s.kind === 'knight'
        ? isAlly
          ? '#8c99ad'
          : '#5a606c'
        : isBoss
          ? '#3a343b'
          : isAlly
            ? PALETTE.allyBlue
            : PALETTE.enemyRed;
    const tunicTrim = isBoss ? '#d9a834' : isAlly ? PALETTE.allyBlueDark : PALETTE.enemyRedDark;

    ctx.fillStyle = tunicMain;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.2;
    this.roundRect(ctx, -11, -34, 22, 23, 6);
    ctx.fill();
    ctx.stroke();

    // Belt or Armor Tabard Trim
    ctx.fillStyle = isBoss ? '#c9972a' : '#573a22';
    ctx.fillRect(-11, -17, 22, 4.5);
    ctx.strokeRect(-11, -17, 22, 4.5);

    if (s.kind === 'knight' || isBoss) {
      // Shoulder pauldron
      ctx.fillStyle = isBoss ? '#4d464f' : '#adb8c7';
      ctx.beginPath();
      ctx.arc(-9, -30, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tunic sash
      ctx.fillStyle = tunicTrim;
      ctx.fillRect(-4, -33, 8, 16);
    }

    // Quiver on back for Archers
    if (s.kind === 'archer') {
      ctx.fillStyle = '#754c29';
      ctx.beginPath();
      ctx.moveTo(-14, -36);
      ctx.lineTo(-9, -37);
      ctx.lineTo(-7, -21);
      ctx.lineTo(-13, -21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Head
    ctx.fillStyle = flash ? '#ffffff' : PALETTE.skin;
    ctx.beginPath();
    ctx.arc(1, -43, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cute expressive face (matching image.png!)
    if (s.kind !== 'knight' && !isBoss) {
      ctx.fillStyle = '#1b1815';
      ctx.beginPath();
      ctx.arc(4.5, -43.5, 1.6, 0, Math.PI * 2);
      ctx.arc(9.5, -43.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Small smile / determined expression
      ctx.strokeStyle = '#1b1815';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (isAlly) {
        ctx.arc(7, -40, 2.4, 0.15, Math.PI - 0.15);
      } else {
        ctx.moveTo(4.5, -39);
        ctx.lineTo(9.5, -39.5);
      }
      ctx.stroke();
    }

    // Helmet / Headgear
    if (isBoss) {
      // Horned dark iron great helm
      ctx.fillStyle = '#33363d';
      ctx.beginPath();
      ctx.arc(1, -45, 12, Math.PI * 0.9, Math.PI * 2.1);
      ctx.lineTo(12, -37);
      ctx.lineTo(-10, -37);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Glowing eye slit
      ctx.fillStyle = '#ff6a33';
      ctx.fillRect(3, -44, 7, 2.5);
      // Curved Viking/Warlord Horns
      ctx.fillStyle = '#e5d8b8';
      ctx.beginPath();
      ctx.moveTo(-7, -51);
      ctx.quadraticCurveTo(-18, -58, -14, -67);
      ctx.quadraticCurveTo(-10, -59, -3, -54);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, -51);
      ctx.quadraticCurveTo(18, -58, 16, -67);
      ctx.quadraticCurveTo(11, -59, 4, -54);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === 'knight') {
      // Visored Great Helm with colored plume
      ctx.fillStyle = isAlly ? '#aeb9c7' : '#4a505c';
      this.roundRect(ctx, -10, -55, 22, 20, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1c1f24';
      ctx.fillRect(1, -46, 10, 3);
      // Plume
      ctx.fillStyle = isAlly ? PALETTE.allyBlue : PALETTE.enemyRed;
      ctx.beginPath();
      ctx.moveTo(-2, -55);
      ctx.quadraticCurveTo(-16, -65, -18, -50);
      ctx.quadraticCurveTo(-9, -51, -2, -55);
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === 'archer') {
      // Hooded cap
      ctx.fillStyle = isAlly ? '#2845b8' : '#8f1e26';
      ctx.beginPath();
      ctx.arc(0, -47, 12, Math.PI * 0.95, Math.PI * 2.02);
      ctx.lineTo(-13, -44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Classic Medieval Kettle/Dome Steel Helmet (exact look from image.png!)
      ctx.fillStyle = isAlly ? '#a6b1bd' : '#434954';
      ctx.beginPath();
      ctx.arc(0, -47, 12.2, Math.PI, 0);
      ctx.lineTo(14.5, -45);
      ctx.quadraticCurveTo(0, -43, -14, -45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Helmet highlight
      ctx.fillStyle = isAlly ? 'rgba(240, 246, 255, 0.45)' : 'rgba(180, 190, 205, 0.25)';
      ctx.beginPath();
      ctx.ellipse(-3, -53, 5.5, 2.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Red Enemy Helmet Spike (just like the red soldier on the right of image.png!)
      if (!isAlly) {
        ctx.fillStyle = '#333840';
        ctx.beginPath();
        ctx.moveTo(-3, -58);
        ctx.lineTo(0, -66);
        ctx.lineTo(3, -58);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Weapon in right hand
    ctx.save();
    ctx.translate(6, -24);
    if (s.kind === 'archer') {
      // Wooden longbow
      const drawPull = swing * 7;
      ctx.strokeStyle = '#6b4222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(4, 0, 15, -Math.PI * 0.44, Math.PI * 0.44);
      ctx.stroke();
      // Bowstring
      ctx.strokeStyle = '#e8e2d0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(7, -14);
      ctx.lineTo(4 - drawPull, 0);
      ctx.lineTo(7, 14);
      ctx.stroke();
    } else if (s.kind === 'spearman') {
      const thrust = swing * 16;
      ctx.translate(thrust, 0);
      ctx.strokeStyle = '#6b4222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(30, -2);
      ctx.stroke();
      // Iron spear tip
      ctx.fillStyle = '#c8d1db';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(28, -5.5);
      ctx.lineTo(40, -2);
      ctx.lineTo(28, 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (isBoss) {
      // Massive double-bladed Warlord battleaxe
      ctx.rotate(-0.7 + swing * 2.1);
      ctx.fillStyle = '#5c3820';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 2;
      ctx.fillRect(-2, -34, 4.5, 40);
      ctx.strokeRect(-2, -34, 4.5, 40);
      ctx.fillStyle = '#bac4cf';
      ctx.beginPath();
      ctx.moveTo(2, -30);
      ctx.quadraticCurveTo(18, -36, 16, -16);
      ctx.quadraticCurveTo(8, -20, 2, -20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -30);
      ctx.quadraticCurveTo(-15, -35, -13, -18);
      ctx.quadraticCurveTo(-7, -21, -2, -21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Classic Medieval Iron Sword (swinging in crisp comic slash!)
      ctx.rotate(-0.55 + swing * 1.9);
      ctx.fillStyle = '#cbd4de';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(21, -3);
      ctx.lineTo(26, 0);
      ctx.lineTo(21, 3);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Crossguard & hilt
      ctx.fillStyle = '#805a32';
      ctx.fillRect(-2, -6, 3.5, 12);
      ctx.strokeRect(-2, -6, 3.5, 12);
    }
    ctx.restore();

    // Shield (Round wooden shield for Allies / White-rimmed shield for Red Enemies — matching image.png!)
    if (s.kind !== 'archer' && !isBoss) {
      ctx.save();
      ctx.translate(s.kind === 'knight' ? 8 : -5, -22);
      if (s.kind === 'knight') {
        // Kite Shield
        ctx.fillStyle = isAlly ? PALETTE.allyBlue : PALETTE.enemyRed;
        ctx.strokeStyle = '#d4dce6';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-8, -12);
        ctx.lineTo(8, -12);
        ctx.lineTo(9, 2);
        ctx.lineTo(0, 14);
        ctx.lineTo(-9, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        // Round Shield
        ctx.fillStyle = isAlly ? '#805734' : '#b83238';
        ctx.strokeStyle = isAlly ? '#9ca6b3' : '#ece8df';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9.5, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Outer ink outline
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 13.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Center iron boss
        ctx.fillStyle = '#b4bec9';
        ctx.beginPath();
        ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore(); // end facing & scale

    // Show clean mini HP bar ONLY if damaged (or always for Warlord boss / Heavy Knights)
    if (s.hp < s.maxHp || stats.isBoss) {
      const bw = stats.isBoss ? 64 : 30;
      const bh = stats.isBoss ? 7 : 4.5;
      const by = -(stats.height * (isBoss ? 1.16 : 1.08)) - 12;
      const ratio = Math.max(0, s.hp / s.maxHp);

      if (stats.isBoss) {
        ctx.font = '900 10px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#141414';
        ctx.lineWidth = 3;
        ctx.strokeText(stats.label.toUpperCase(), 0, by - 4);
        ctx.fillStyle = '#ffcb59';
        ctx.fillText(stats.label.toUpperCase(), 0, by - 4);
      }

      ctx.fillStyle = '#181a1c';
      ctx.fillRect(-bw * 0.5 - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = isAlly ? '#4ea3ff' : stats.isBoss ? '#ff8b2e' : '#e84343';
      ctx.fillRect(-bw * 0.5, by, bw * ratio, bh);
    }

    ctx.restore();
  }

  private drawCavalry(ctx: CanvasRenderingContext2D, s: SoldierEntity): void {
    const isAlly = s.faction === 'ally';
    const flash = s.hitFlash > 0;
    const gallop = Math.sin(s.walkPhase * 1.4);
    const gallop2 = Math.cos(s.walkPhase * 1.4);
    const bob = Math.abs(gallop) * 4;

    // Shadow
    ctx.fillStyle = 'rgba(18, 22, 14, 0.34)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 34, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.scale(s.facing, 1);
    ctx.translate(0, -bob);

    // Horse Legs (4 animated legs)
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    const drawHorseLeg = (hx: number, swing: number, shade: string) => {
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(hx - 3, -20);
      ctx.lineTo(hx + swing * 11, 2);
      ctx.lineTo(hx + swing * 11 + 5, 2);
      ctx.lineTo(hx + 3, -20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    drawHorseLeg(-17, -gallop, '#5c3c24');
    drawHorseLeg(15, gallop2, '#5c3c24');
    drawHorseLeg(-12, gallop, '#7a5030');
    drawHorseLeg(19, -gallop2, '#7a5030');

    // Tail
    ctx.fillStyle = '#332216';
    ctx.beginPath();
    ctx.moveTo(-25, -30);
    ctx.quadraticCurveTo(-39, -24 + gallop * 5, -34, -12);
    ctx.quadraticCurveTo(-28, -18, -23, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse Body + Team Cloth Caparison (Barding)
    ctx.fillStyle = flash ? '#ffffff' : '#7a5030';
    this.roundRect(ctx, -27, -38, 52, 22, 10);
    ctx.fill();
    ctx.stroke();

    // Draped Barding Cloth
    ctx.fillStyle = isAlly ? PALETTE.allyBlue : PALETTE.enemyRed;
    ctx.beginPath();
    ctx.moveTo(-25, -34);
    ctx.lineTo(24, -34);
    ctx.lineTo(22, -16);
    ctx.lineTo(10, -21);
    ctx.lineTo(0, -15);
    ctx.lineTo(-12, -21);
    ctx.lineTo(-24, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse Neck & Head
    ctx.fillStyle = flash ? '#ffffff' : '#7a5030';
    ctx.beginPath();
    ctx.moveTo(15, -34);
    ctx.lineTo(28, -54);
    ctx.lineTo(42, -46);
    ctx.lineTo(39, -39);
    ctx.lineTo(27, -41);
    ctx.lineTo(24, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horse Chamfron (Steel forehead armor)
    ctx.fillStyle = '#9aa6b5';
    ctx.beginPath();
    ctx.moveTo(28, -54);
    ctx.lineTo(41, -46);
    ctx.lineTo(38, -43);
    ctx.lineTo(27, -49);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rider on saddle
    ctx.fillStyle = isAlly ? '#96a5b8' : '#4f5561';
    this.roundRect(ctx, -9, -58, 19, 23, 5);
    ctx.fill();
    ctx.stroke();

    // Rider Helmet & Plume
    ctx.fillStyle = isAlly ? '#b8c3d1' : '#3d424d';
    this.roundRect(ctx, -7, -73, 17, 16, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isAlly ? PALETTE.allyBlue : PALETTE.enemyRed;
    ctx.beginPath();
    ctx.moveTo(-5, -72);
    ctx.quadraticCurveTo(-20, -78, -22, -64);
    ctx.quadraticCurveTo(-12, -66, -5, -72);
    ctx.fill();
    ctx.stroke();

    // Couched Jousting Lance
    const thrust = s.attackAnim > 0 ? Math.sin(s.attackAnim * Math.PI) * 18 : 0;
    ctx.fillStyle = '#c4ccd6';
    ctx.beginPath();
    ctx.moveTo(-8 + thrust, -46);
    ctx.lineTo(54 + thrust, -49);
    ctx.lineTo(54 + thrust, -46);
    ctx.lineTo(-8 + thrust, -41);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    if (s.hp < s.maxHp) {
      const bw = 44;
      const by = -88;
      ctx.fillStyle = '#181a1c';
      ctx.fillRect(-bw * 0.5 - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = isAlly ? '#4ea3ff' : '#e84343';
      ctx.fillRect(-bw * 0.5, by, bw * Math.max(0, s.hp / s.maxHp), 5);
    }
  }

  private drawSiegeRam(ctx: CanvasRenderingContext2D, s: SoldierEntity): void {
    const flash = s.hitFlash > 0;
    const ramSwing = s.attackAnim > 0 ? Math.sin(s.attackAnim * Math.PI) * 20 : 0;

    // Heavy Shadow
    ctx.fillStyle = 'rgba(18, 22, 14, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 58, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.scale(s.facing, 1);

    // Back Wheels
    this.drawWoodenWheel(ctx, -30, 0, 15, s.walkPhase);
    this.drawWoodenWheel(ctx, 28, 0, 15, s.walkPhase);

    // Suspended Iron-Capped Battering Log
    ctx.fillStyle = '#6e4526';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.fillRect(-34 + ramSwing, -26, 78, 15);
    ctx.strokeRect(-34 + ramSwing, -26, 78, 15);
    // Iron Ram Head
    ctx.fillStyle = '#4f5660';
    ctx.beginPath();
    ctx.moveTo(42 + ramSwing, -29);
    ctx.lineTo(58 + ramSwing, -18.5);
    ctx.lineTo(42 + ramSwing, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Heavy Timber A-Frame Roof Housing
    ctx.fillStyle = flash ? '#fff0cc' : '#734424';
    ctx.beginPath();
    ctx.moveTo(-50, -14);
    ctx.lineTo(-34, -64);
    ctx.lineTo(36, -64);
    ctx.lineTo(46, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Roof planks & forged iron straps
    ctx.fillStyle = '#5a341a';
    ctx.fillRect(-38, -50, 74, 8);
    ctx.strokeRect(-38, -50, 74, 8);
    ctx.fillStyle = '#3d424a';
    ctx.fillRect(-26, -64, 8, 50);
    ctx.strokeRect(-26, -64, 8, 50);
    ctx.fillRect(16, -64, 8, 50);
    ctx.strokeRect(16, -64, 8, 50);

    // Red Banner Pennant on Roof
    ctx.fillStyle = PALETTE.enemyRed;
    ctx.beginPath();
    ctx.moveTo(-4, -64);
    ctx.lineTo(-4, -84);
    ctx.lineTo(-26, -78);
    ctx.lineTo(-4, -71);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Foreground Wheels
    this.drawWoodenWheel(ctx, -34, 4, 16, s.walkPhase);
    this.drawWoodenWheel(ctx, 24, 4, 16, s.walkPhase);

    ctx.restore();

    // Siege Ram Boss HP Bar
    const bw = 78;
    const by = -94;
    ctx.font = '900 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 3;
    ctx.strokeText('SIEGE RAM', 0, by - 4);
    ctx.fillStyle = '#ff9a42';
    ctx.fillText('SIEGE RAM', 0, by - 4);
    ctx.fillStyle = '#181a1c';
    ctx.fillRect(-bw * 0.5 - 1, by - 1, bw + 2, 9);
    ctx.fillStyle = '#f25730';
    ctx.fillRect(-bw * 0.5, by, bw * Math.max(0, s.hp / s.maxHp), 7);
  }

  private drawWoodenWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, phase: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phase * 0.8);
    ctx.fillStyle = '#57361d';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#383d45';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#332010';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -r * 0.85, Math.sin(a) * -r * 0.85);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBootLeg(
    ctx: CanvasRenderingContext2D,
    hx: number,
    hy: number,
    fx: number,
    fy: number,
    pantColor: string,
    bootColor: string
  ): void {
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 8.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(fx, fy - 2);
    ctx.stroke();

    ctx.strokeStyle = pantColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(fx, fy - 4);
    ctx.stroke();

    // Boot
    ctx.fillStyle = bootColor;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(fx + 2, fy, 6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: PickupEntity, time: number): void {
    const meta = PICKUP_LABELS[p.kind];
    ctx.save();
    ctx.translate(p.x, p.y);

    // Shadow on ground
    const shadowScale = Math.max(0.35, 1 - p.z / 420);
    ctx.fillStyle = 'rgba(20, 24, 16, 0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 21 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing pickup aura when landed
    if (p.z <= 1) {
      const pulse = 0.55 + Math.sin(time * 5 + p.bobPhase) * 0.25;
      ctx.strokeStyle = meta.color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 3, 25 + pulse * 4, 9.5 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const sway = p.z > 1 ? Math.sin(p.swayPhase) * 10 : 0;
    const floatBob = p.z <= 1 ? Math.sin(time * 3.8 + p.bobPhase) * 2.2 : 0;
    ctx.translate(sway, -p.z - floatBob);

    // Parachute canopy while falling
    if (p.z > 1) {
      ctx.strokeStyle = '#383d2e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-24, -64);
      ctx.lineTo(-10, -14);
      ctx.moveTo(24, -64);
      ctx.lineTo(10, -14);
      ctx.moveTo(0, -68);
      ctx.lineTo(0, -14);
      ctx.stroke();

      ctx.fillStyle = '#859462';
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -60, 26, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Parachute panel ribs
      ctx.strokeStyle = 'rgba(30, 27, 23, 0.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -86);
      ctx.quadraticCurveTo(-10, -73, -10, -60);
      ctx.moveTo(0, -86);
      ctx.quadraticCurveTo(10, -73, 10, -60);
      ctx.stroke();
    }

    // Isometric Cartoon Military Supply Crate (exact olive crate with yellow latches from image.png!)
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2.1;

    // Top face
    ctx.fillStyle = '#7f9455';
    ctx.beginPath();
    ctx.moveTo(-16, -15);
    ctx.lineTo(2, -23);
    ctx.lineTo(18, -15);
    ctx.lineTo(0, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Left front face
    ctx.fillStyle = PALETTE.crateGreen;
    ctx.beginPath();
    ctx.moveTo(-16, -15);
    ctx.lineTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.lineTo(-16, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right shaded face
    ctx.fillStyle = PALETTE.crateDark;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(18, -15);
    ctx.lineTo(18, -1);
    ctx.lineTo(0, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bright yellow metal latches & straps (signature detail from image.png!)
    ctx.fillStyle = PALETTE.crateLatch;
    ctx.fillRect(-11, -11, 3.5, 9);
    ctx.fillRect(-5, -8, 3.5, 9);
    ctx.fillRect(6, -9, 3.5, 9);

    // Medkit red cross emblem or colored stripe
    if (p.kind === 'medkit') {
      ctx.fillStyle = '#f2f5f0';
      ctx.beginPath();
      ctx.arc(1, -15, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e03a3a';
      ctx.fillRect(-0.5, -18.5, 3, 7);
      ctx.fillRect(-2.5, -16.5, 7, 3);
    } else {
      // Accent tag strip on top
      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(1, -15, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp floating short label above crate
    ctx.font = '900 10px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#141712';
    ctx.strokeText(meta.short, 0, -28);
    ctx.fillStyle = meta.color;
    ctx.fillText(meta.short, 0, -28);

    ctx.restore();
  }

  private drawProjectiles(
    ctx: CanvasRenderingContext2D,
    projectiles: ProjectileEntity[],
    cameraX: number,
    viewW: number,
    time: number
  ): void {
    for (const p of projectiles) {
      if (p.x < cameraX - 100 || p.x > cameraX + viewW + 100) continue;

      if (p.kind === 'bullet' || p.kind === 'pellet') {
        // Glowing golden comic tracer streak (matching image.png!)
        const dx = p.x - p.prevX;
        const dy = p.y - p.prevY;
        const len = Math.hypot(dx, dy) || 1;
        const tailLen = p.kind === 'pellet' ? 18 : 34;
        const tx = p.x - (dx / len) * tailLen;
        const ty = p.y - p.z - (dy / len) * tailLen;

        ctx.save();
        const grad = ctx.createLinearGradient(tx, ty, p.x, p.y - p.z);
        grad.addColorStop(0, 'rgba(255, 232, 120, 0)');
        grad.addColorStop(0.55, p.color);
        grad.addColorStop(1, '#ffffff');
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.kind === 'pellet' ? 2.4 : 3.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y - p.z);
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'tank_shell') {
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(ang);
        // Blazing artillery shell streak
        const grad = ctx.createLinearGradient(-46, 0, 10, 0);
        grad.addColorStop(0, 'rgba(255, 150, 40, 0)');
        grad.addColorStop(0.6, '#ffae33');
        grad.addColorStop(1, '#fffde0');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(-46, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();

        ctx.fillStyle = '#ffe57f';
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(4, 0, 8, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'rocket') {
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(ang);
        // Exhaust flame cone
        ctx.fillStyle = '#ff8c24';
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(-24 - Math.random() * 8, 0);
        ctx.lineTo(-10, 4);
        ctx.closePath();
        ctx.fill();
        // Rocket body
        ctx.fillStyle = '#5a6b3d';
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.8;
        ctx.fillRect(-10, -3.5, 16, 7);
        ctx.strokeRect(-10, -3.5, 16, 7);
        // Red warhead
        ctx.fillStyle = '#db3b30';
        ctx.beginPath();
        ctx.moveTo(6, -5);
        ctx.lineTo(16, 0);
        ctx.lineTo(6, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'grenade') {
        // Ground shadow directly beneath grenade
        const sScale = Math.max(0.35, 1 - p.z / 200);
        ctx.fillStyle = 'rgba(20, 22, 16, 0.32)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 8 * sScale, 3.5 * sScale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(p.rotation);
        // Pineapple grenade
        ctx.fillStyle = '#556e35';
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6.2, 7.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Top fuse lever
        ctx.fillStyle = '#9da695';
        ctx.fillRect(-2.5, -10, 5, 3.5);
        ctx.strokeRect(-2.5, -10, 5, 3.5);
        // Flashing armed spark
        if (Math.floor(time * 18) % 2 === 0) {
          ctx.fillStyle = '#ffef6b';
          ctx.beginPath();
          ctx.arc(0, -11, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (p.kind === 'arrow') {
        // Ground shadow
        ctx.fillStyle = 'rgba(20, 22, 16, 0.18)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 7, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();

        const ang = Math.atan2(p.vy - p.vz, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(ang);
        ctx.strokeStyle = '#5e3c1f';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        // Steel arrowhead
        ctx.fillStyle = '#cfd6de';
        ctx.beginPath();
        ctx.moveTo(8, -3);
        ctx.lineTo(14, 0);
        ctx.lineTo(8, 3);
        ctx.closePath();
        ctx.fill();
        // White fletching
        ctx.strokeStyle = p.faction === 'ally' ? '#dce8ff' : '#ffd8d8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-12, -3);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-12, 3);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawCorpse(ctx: CanvasRenderingContext2D, c: CorpseProp): void {
    const fade = Math.min(1, c.life / 1.4);
    const isAlly = c.faction === 'ally';
    ctx.save();
    ctx.globalAlpha = fade;

    // Ground shadow beneath flying/fallen soldier
    const sScale = Math.max(0.4, 1 - c.z / 260);
    ctx.fillStyle = 'rgba(20, 24, 16, 0.24)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 3, 18 * sScale, 5 * sScale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(c.x, c.y - c.z);
    ctx.rotate(c.rotation);

    // Kicking boots / legs
    ctx.fillStyle = '#734828';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(-18, -3.5, 5, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-16, 4.5, 5, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tunic torso
    const tunic = isAlly ? PALETTE.allyBlue : PALETTE.enemyRed;
    ctx.fillStyle = tunic;
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    this.roundRect(ctx, -14, -8, 22, 16, 5);
    ctx.fill();
    ctx.stroke();

    // Belt
    ctx.fillStyle = '#573a22';
    ctx.fillRect(-7, -8, 4, 16);
    ctx.strokeRect(-7, -8, 4, 16);

    // Peach cartoon head with funny X-X defeated eyes
    ctx.fillStyle = PALETTE.skin;
    ctx.beginPath();
    ctx.arc(14, 0, 9.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cartoon X eyes
    ctx.strokeStyle = '#1b1815';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, -3);
    ctx.lineTo(14.5, 0.5);
    ctx.moveTo(14.5, -3);
    ctx.lineTo(11, 0.5);
    ctx.moveTo(11, 2.5);
    ctx.lineTo(14.5, 6);
    ctx.moveTo(14.5, 2.5);
    ctx.lineTo(11, 6);
    ctx.stroke();

    // Kettle / Spiked helmet tipped on top of head
    ctx.fillStyle = isAlly ? '#a4afb9' : '#424854';
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 0, 9.8, -Math.PI * 0.52, Math.PI * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cameraX: number, viewW: number): void {
    for (const pt of particles) {
      if (pt.x < cameraX - 180 || pt.x > cameraX + viewW + 180) continue;
      const t = 1 - pt.life / pt.maxLife;
      const size = pt.size + (pt.endSize - pt.size) * t;
      const alpha = pt.alpha * (1 - t);
      if (alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pt.x, pt.y - pt.z);

      if (pt.kind === 'ring') {
        ctx.scale(1, 0.52);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = Math.max(1.5, 6 * (1 - t));
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'slash') {
        ctx.rotate(pt.rotation);
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = Math.max(1.5, 4 * (1 - t));
        ctx.beginPath();
        ctx.arc(0, 0, size, -0.8, 0.8);
        ctx.stroke();
      } else if (pt.kind === 'casing') {
        ctx.rotate(pt.rotation);
        ctx.fillStyle = pt.color;
        ctx.strokeStyle = '#3d2f12';
        ctx.lineWidth = 0.8;
        ctx.fillRect(-size, -size * 0.45, size * 2, size * 0.9);
        ctx.strokeRect(-size, -size * 0.45, size * 2, size * 0.9);
      } else if (pt.kind === 'wood' || pt.kind === 'debris') {
        ctx.rotate(pt.rotation);
        ctx.fillStyle = pt.color;
        ctx.strokeStyle = PALETTE.outline;
        ctx.lineWidth = 1.2;
        ctx.fillRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6);
        ctx.strokeRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6);
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();
        if (pt.outline) {
          ctx.strokeStyle = 'rgba(28, 24, 20, 0.55)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
    for (const ft of texts) {
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${ft.size}px "Trebuchet MS", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#171512';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private drawOffscreenIndicators(ctx: CanvasRenderingContext2D, state: RenderState): void {
    if (!state.showCrosshair) return;
    const { cameraX, viewW } = state;
    const usedLeftYs: number[] = [];
    const usedRightYs: number[] = [];

    const drawEdgeBadge = (worldX: number, worldY: number, text: string, color: string) => {
      if (worldX >= cameraX - 24 && worldX <= cameraX + viewW + 24) return;
      const isLeft = worldX < cameraX - 24;
      const sx = isLeft ? 34 : viewW - 34;
      let sy = Math.max(130, Math.min(LOGICAL_HEIGHT - 130, worldY));
      const used = isLeft ? usedLeftYs : usedRightYs;
      for (const uy of used) {
        if (Math.abs(sy - uy) < 34) {
          sy = uy + 36;
        }
      }
      sy = Math.max(130, Math.min(LOGICAL_HEIGHT - 120, sy));
      used.push(sy);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(24, 26, 22, 0.86)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      this.roundRect(ctx, -28, -13, 56, 26, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '900 10px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isLeft ? `◀ ${text}` : `${text} ▶`, 0, 0);
      ctx.restore();
    };

    for (const tank of state.tanks) {
      if (!tank.occupied) {
        drawEdgeBadge(tank.x, tank.y - 30, 'TANK', '#86e342');
      }
    }

    // Offscreen Enemy Barracks objective marker
    if (
      state.enemyBarracks &&
      !state.enemyBarracks.destroyed &&
      (state.enemyBarracks.x < cameraX - 24 || state.enemyBarracks.x > cameraX + viewW + 24)
    ) {
      drawEdgeBadge(state.enemyBarracks.x, state.enemyBarracks.y - 25, 'BARRACKS', '#ff4d4d');
    }

    // Show at most 1 closest offscreen pickup (prioritizing newly parachuted crates)
    let bestPickup: PickupEntity | null = null;
    let bestDist = Infinity;
    for (const p of state.pickups) {
      if (p.x >= cameraX - 24 && p.x <= cameraX + viewW + 24) continue;
      const d = Math.abs(p.x - state.player.x) - (p.z > 5 ? 600 : 0);
      if (d < bestDist) {
        bestDist = d;
        bestPickup = p;
      }
    }
    if (bestPickup) {
      drawEdgeBadge(bestPickup.x, bestPickup.y - 20, 'DROP', '#f5cb38');
    }
  }

  private drawCrosshair(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    bloom: number,
    inTank: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);
    const gap = (inTank ? 9 : 6) + bloom * 10;
    const len = inTank ? 11 : 8;

    ctx.strokeStyle = 'rgba(20, 18, 14, 0.72)';
    ctx.lineWidth = 4;
    this.crosshairPaths(ctx, gap, len, inTank);

    ctx.strokeStyle = inTank ? '#ffdf59' : '#f7e063';
    ctx.lineWidth = 2;
    this.crosshairPaths(ctx, gap, len, inTank);

    ctx.fillStyle = '#fff9c4';
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private crosshairPaths(ctx: CanvasRenderingContext2D, gap: number, len: number, inTank: boolean): void {
    ctx.beginPath();
    ctx.moveTo(-gap - len, 0);
    ctx.lineTo(-gap, 0);
    ctx.moveTo(gap, 0);
    ctx.lineTo(gap + len, 0);
    ctx.moveTo(0, -gap - len);
    ctx.lineTo(0, -gap);
    ctx.moveTo(0, gap);
    ctx.lineTo(0, gap + len);
    ctx.stroke();

    if (inTank) {
      ctx.beginPath();
      ctx.arc(0, 0, gap + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  private drawAimGuide(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const {
      aimLaserOriginX,
      aimLaserOriginY,
      aimLaserAngle,
      aimLaserRange,
      aimLaserSpread,
      aimLaserColor,
      aimLaserFired,
      lockedTargetPos,
      isAutoLocked,
      time,
    } = state;

    // 1. Highlight locked enemy / barracks target (works on both desktop cursor snap & mobile Smart Lock)
    if (lockedTargetPos && state.player.alive) {
      this.drawTargetLock(ctx, lockedTargetPos.x, lockedTargetPos.y, lockedTargetPos.isBoss, isAutoLocked, time);
    }

    if (!state.showAimLaser) return;

    ctx.save();

    // Slightly softer guide when passively walking on mobile vs crisp active beam when firing/dragging
    if (!aimLaserFired && !isAutoLocked) {
      ctx.globalAlpha = 0.62;
    }

    // 2. Tactical laser beam / aim guide
    const endX = aimLaserOriginX + Math.cos(aimLaserAngle) * aimLaserRange;
    const endY = aimLaserOriginY + Math.sin(aimLaserAngle) * aimLaserRange;

    // Shotgun spread cone
    if (aimLaserSpread > 0.08) {
      const leftAngle = aimLaserAngle - aimLaserSpread * 0.5;
      const rightAngle = aimLaserAngle + aimLaserSpread * 0.5;
      const lx = aimLaserOriginX + Math.cos(leftAngle) * aimLaserRange;
      const ly = aimLaserOriginY + Math.sin(leftAngle) * aimLaserRange;
      const rx = aimLaserOriginX + Math.cos(rightAngle) * aimLaserRange;
      const ry = aimLaserOriginY + Math.sin(rightAngle) * aimLaserRange;

      // Soft wedge fill
      ctx.beginPath();
      ctx.moveTo(aimLaserOriginX, aimLaserOriginY);
      ctx.lineTo(lx, ly);
      ctx.arc(aimLaserOriginX, aimLaserOriginY, aimLaserRange, leftAngle, rightAngle);
      ctx.closePath();
      ctx.fillStyle = aimLaserFired ? 'rgba(255, 120, 50, 0.12)' : 'rgba(245, 206, 66, 0.07)';
      ctx.fill();

      // Flanking cone lines
      ctx.strokeStyle = aimLaserFired ? 'rgba(255, 140, 60, 0.5)' : 'rgba(245, 206, 66, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -time * 24;
      ctx.beginPath();
      ctx.moveTo(aimLaserOriginX, aimLaserOriginY);
      ctx.lineTo(lx, ly);
      ctx.moveTo(aimLaserOriginX, aimLaserOriginY);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    // Central laser / bullet trajectory line
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time * 36;
    ctx.lineWidth = aimLaserFired ? 2.5 : 1.8;
    ctx.strokeStyle = aimLaserColor;
    ctx.beginPath();
    ctx.moveTo(aimLaserOriginX, aimLaserOriginY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Soft laser glow underlay
    ctx.lineWidth = 5;
    ctx.strokeStyle = aimLaserFired ? 'rgba(255, 70, 40, 0.28)' : 'rgba(255, 225, 80, 0.18)';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(aimLaserOriginX, aimLaserOriginY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Tip pip
    ctx.fillStyle = aimLaserColor;
    ctx.beginPath();
    ctx.arc(endX, endY, aimLaserFired ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawTargetLock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    isBoss: boolean,
    isAutoLocked: boolean,
    time: number
  ): void {
    ctx.save();
    ctx.translate(x, y);

    const pulse = 1 + Math.sin(time * 12) * 0.08;
    const r = (isBoss ? 32 : 21) * pulse;
    const corner = isBoss ? 10 : 7;

    ctx.strokeStyle = isAutoLocked ? '#ffe047' : '#ff3d47';
    ctx.lineWidth = isAutoLocked ? 2.8 : 2.3;

    // Corner brackets [ ]
    ctx.beginPath();
    // Top-left
    ctx.moveTo(-r, -r + corner);
    ctx.lineTo(-r, -r);
    ctx.lineTo(-r + corner, -r);
    // Top-right
    ctx.moveTo(r - corner, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(r, -r + corner);
    // Bottom-right
    ctx.moveTo(r, r - corner);
    ctx.lineTo(r, r);
    ctx.lineTo(r - corner, r);
    // Bottom-left
    ctx.moveTo(-r + corner, r);
    ctx.lineTo(-r, r);
    ctx.lineTo(-r, r - corner);
    ctx.stroke();

    // Center target dot
    ctx.fillStyle = isAutoLocked ? '#ffe047' : '#ff3d47';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Crisp "AUTO" or "LOCK" tag
    ctx.font = '900 9px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#171512';
    const label = isAutoLocked ? 'AUTO' : 'TARGET';
    ctx.strokeText(label, 0, -r - 4);
    ctx.fillStyle = isAutoLocked ? '#ffe047' : '#ffdf59';
    ctx.fillText(label, 0, -r - 4);

    ctx.restore();
  }

  private drawGrenadePreview(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const gp = state.grenadePreview;
    if (!gp || !state.player.alive) return;

    const { startX, startY, targetX, targetY, radius } = gp;
    const { time, soldiers } = state;

    ctx.save();

    // 1. Highlight every enemy inside the grenade's actual blast footprint
    for (const s of soldiers) {
      if (s.faction !== 'enemy' || s.hp <= 0) continue;
      const dx = s.x - targetX;
      const dy = (s.y - targetY) * 1.35;
      if (Math.hypot(dx, dy) <= radius) {
        const r = UNIT_STATS[s.kind].radius + 6;
        ctx.save();
        ctx.translate(s.x, s.y + 2);
        ctx.scale(1, 0.45);
        ctx.strokeStyle = '#b9f542';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2. Perspective ground blast circle on the battlefield road
    const pulse = 1 + Math.sin(time * 10) * 0.03;
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.scale(1, 0.52);

    ctx.fillStyle = 'rgba(185, 245, 66, 0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(20, 24, 16, 0.65)';
    ctx.lineWidth = 4.2;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -time * 28;
    ctx.beginPath();
    ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#c6ff4d';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bullseye ring
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffe259';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 20);
    ctx.stroke();
    ctx.restore();

    // 3. Animated 2.5D parabolic arc from player hand to landing spot
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const arcHeight = 58 + dist * 0.22;
    const ctrlX = (startX + targetX) * 0.5;
    const ctrlY = Math.min(startY, targetY) - arcHeight;

    ctx.strokeStyle = 'rgba(20, 24, 16, 0.6)';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -time * 42;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);
    ctx.stroke();

    ctx.strokeStyle = '#d9ff66';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);
    ctx.stroke();

    ctx.restore();
  }
}
