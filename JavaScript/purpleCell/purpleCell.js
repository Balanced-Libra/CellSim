// PurpleCell — genome-based Purple cell (behavior purely from genes)
class PurpleCell {
  static CLAMP = Cell.CLAMP; // reuse same clamp ranges

  constructor(x, y, envParams, genes) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5);
    this.vy = (Math.random() - 0.5);
    this.params = envParams;
    this.genes = Cell.clampGenes({ ...genes });
    // Use !== undefined check instead of || to handle customHue = 0 (valid hue for red)
    this.hue = this.genes.customHue !== undefined ? this.genes.customHue : Cell.hueFromGenes(this.genes, 270);


    this.maxEnergy = Math.max(100, this.genes.reproThreshold + 40);
    this.energy = Math.min(this.maxEnergy * 0.65, this.genes.reproThreshold - 8);

    this.alive = true;
    this.digestQueue = [];
    this.lastReproMs = 0;
    this.reproCooldownMs = 1000;
  }

  queueDigest(amount, availableAtMs) { this.digestQueue.push({ amount, atMs: availableAtMs }); }
  processDigestion(nowMs) {
    if (!this.digestQueue.length) return;
    const keep = [];
    for (const it of this.digestQueue) {
      if (it.atMs <= nowMs) this.energy = Math.min(this.maxEnergy, this.energy + it.amount);
      else keep.push(it);
    }
    this.digestQueue = keep;
  }

  findNearestFood(foods) {
    let nearest = null, bestD2 = Infinity;
    for (const f of foods) {
      const dx = f.x - this.x, dy = f.y - this.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; nearest = f; }
    }
    return nearest;
  }

  tryReproduce(canvasWidth, canvasHeight, nowMs) {
    if (this.energy < this.genes.reproThreshold) return null;
    if (nowMs - this.lastReproMs < this.reproCooldownMs) return null;
    if (this.energy - this.genes.reproCost < 28) return null;

    this.energy -= this.genes.reproCost;
    this.lastReproMs = nowMs;

    const jx = (Math.random() - 0.5) * 2 * this.params.spawnJitter;
    const jy = (Math.random() - 0.5) * 2 * this.params.spawnJitter;

    const r = this.genes.radius;
    const newX = Math.max(r, Math.min(canvasWidth  - r, this.x + jx));
    const newY = Math.max(r, Math.min(canvasHeight - r, this.y + jy));

    const childGenes = Cell.mutate(this.genes);
    const child = new PurpleCell(newX, newY, this.params, childGenes);
    child.energy = Math.min(child.maxEnergy, child.genes.childStartEnergy);
    return child;
  }

  update(foods, canvasWidth, canvasHeight, nowMs, allCells, blocks) {
    if (!this.alive) return;
  
    this.processDigestion(nowMs);
  
    // Predator evasion (gentler but persistent)
    let threat = 0, axAway = 0, ayAway = 0;
    if (Array.isArray(allCells) && allCells.length) {
      let nearest = null, bestD2 = Infinity, ndx = 0, ndy = 0;
      for (let i = 0; i < allCells.length; i++) {
        const c = allCells[i];
        if (!c || !c.alive || !(c instanceof RedCell)) continue;
        const dx = c.x - this.x, dy = c.y - this.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD2) { bestD2 = d2; nearest = c; ndx = dx; ndy = dy; }
      }
      if (nearest) {
        const d = Math.sqrt(bestD2) || 1;
        const nx = -ndx / d, ny = -ndy / d;           // unit vector away
        const threatRadius = 130;                      // slightly larger awareness
        threat = Math.max(0, Math.min(1, (threatRadius - d) / threatRadius));
        const awayK = 1.4 * threat;                   // purple = smoother evasive response
        axAway = nx * this.genes.acceleration * awayK;
        ayAway = ny * this.genes.acceleration * awayK;
        this.vx += axAway;
        this.vy += ayAway;
      }
    }
  
    // Food seeking (diminish under threat)
    const target = this.findNearestFood(foods);
    let seekX = 0, seekY = 0;
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const hunger = 0.8 + 0.2 * Math.min(1, this.energy / (this.maxEnergy * 0.65));
      const seekK = hunger * (1 - 0.35 * threat);
      seekX = (dx / dist) * this.genes.acceleration * seekK;
      seekY = (dy / dist) * this.genes.acceleration * seekK;
    }

    // Continuous wall repulsion - keep away from walls (evolvable trait)
    let wallRepelX = 0, wallRepelY = 0;
    if (blocks && blocks.length > 0 && this.genes.wallAvoidance > 0) {
      const r = this.genes.radius;
      const bufferDist = r * 1.5;
      const maxRepelDist = r * 3;
      
      for (const b of blocks) {
        const bx = b.x, by = b.y, bw = 24, bh = 24;
        const blockRight = bx + bw;
        const blockBottom = by + bh;
        const closestX = Math.max(bx, Math.min(this.x, blockRight));
        const closestY = Math.max(by, Math.min(this.y, blockBottom));
        const dx = this.x - closestX;
        const dy = this.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        if (dist < maxRepelDist) {
          const repelStrength = this.genes.wallAvoidance * (1 - dist / maxRepelDist);
          if (dist < bufferDist) {
            const extraRepel = (bufferDist - dist) / bufferDist;
            wallRepelX += (dx / dist) * this.genes.acceleration * repelStrength * (1 + extraRepel);
            wallRepelY += (dy / dist) * this.genes.acceleration * repelStrength * (1 + extraRepel);
          } else {
            wallRepelX += (dx / dist) * this.genes.acceleration * repelStrength * 0.3;
            wallRepelY += (dy / dist) * this.genes.acceleration * repelStrength * 0.3;
          }
        }
      }
    }

    // Pathfinding: Check if direct path to target is blocked, navigate around if needed
    let pathfindX = 0, pathfindY = 0;
    if (target && blocks && blocks.length > 0 && this.genes.wallAvoidance > 0) {
      const r = this.genes.radius;
      const toTargetX = target.x - this.x;
      const toTargetY = target.y - this.y;
      const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
      
      let pathBlocked = false;
      const pathSteps = Math.ceil(toTargetDist / 10);
      for (let s = 1; s <= pathSteps; s++) {
        const testX = this.x + (toTargetX / pathSteps) * s;
        const testY = this.y + (toTargetY / pathSteps) * s;
        
        for (const b of blocks) {
          const bx = b.x, by = b.y, bw = 24, bh = 24;
          if (testX + r > bx && testX - r < bx + bw && testY + r > by && testY - r < by + bh) {
            pathBlocked = true;
            break;
          }
        }
        if (pathBlocked) break;
      }
      
      if (pathBlocked) {
        const searchRadius = r * 6;
        const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
        let bestGap = null;
        let bestGapScore = -Infinity;
        
        for (const angle of angles) {
          let clearPath = true;
          const steps = 8;
          for (let s = 1; s <= steps; s++) {
            const testX = this.x + Math.cos(angle) * (searchRadius * s / steps);
            const testY = this.y + Math.sin(angle) * (searchRadius * s / steps);
            
            for (const b of blocks) {
              const bx = b.x, by = b.y, bw = 24, bh = 24;
              if (testX + r > bx && testX - r < bx + bw && testY + r > by && testY - r < by + bh) {
                clearPath = false;
                break;
              }
            }
            if (!clearPath) break;
          }
          
          if (clearPath) {
            const toTargetDirX = toTargetX / toTargetDist;
            const toTargetDirY = toTargetY / toTargetDist;
            const alignment = Math.cos(angle) * toTargetDirX + Math.sin(angle) * toTargetDirY;
            const score = 1.0 + alignment * 3.0;
            
            if (score > bestGapScore) {
              bestGapScore = score;
              bestGap = { angle: angle };
            }
          }
        }
        
        if (bestGap) {
          const gapX = Math.cos(bestGap.angle);
          const gapY = Math.sin(bestGap.angle);
          const pathfindStrength = this.genes.wallAvoidance * 1.5;
          pathfindX = gapX * this.genes.acceleration * pathfindStrength;
          pathfindY = gapY * this.genes.acceleration * pathfindStrength;
        }
      }
    }

    // Apply all forces
    this.vx += seekX + wallRepelX + pathfindX;
    this.vy += seekY + wallRepelY + pathfindY;

    // Additional reactive avoidance for immediate obstacles
    if (blocks && blocks.length > 0 && this.genes.wallAvoidance > 0) {
      const r = this.genes.radius;
      const speed = Math.hypot(this.vx, this.vy);
      
      if (speed > 0.1) {
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        const lookAheadDist = r * 2;
        const aheadX = this.x + dirX * lookAheadDist;
        const aheadY = this.y + dirY * lookAheadDist;
        
        for (const b of blocks) {
          const bx = b.x, by = b.y, bw = 24, bh = 24;
          if (aheadX + r > bx && aheadX - r < bx + bw && aheadY + r > by && aheadY - r < by + bh) {
            const blockCenterX = bx + bw / 2;
            const blockCenterY = by + bh / 2;
            const toBlockX = blockCenterX - this.x;
            const toBlockY = blockCenterY - this.y;
            const perpX = -dirY;
            const perpY = dirX;
            const side = (toBlockX * perpX + toBlockY * perpY) > 0 ? 1 : -1;
            const avoidStrength = this.genes.wallAvoidance * 0.5;
            this.vx += perpX * side * this.genes.acceleration * avoidStrength;
            this.vy += perpY * side * this.genes.acceleration * avoidStrength;
            break;
          }
        }
      }
    }
  
    // glide/friction
    this.vx *= this.genes.friction;
    this.vy *= this.genes.friction;
  
    // clamp speed
    let speed = Math.hypot(this.vx, this.vy);
    const maxV = this.genes.maxSpeed * (0.8 + 0.2 * Math.min(1, this.energy / (this.maxEnergy * 0.65)));
    if (speed > maxV) {
      const s = maxV / (speed || 1);
      this.vx *= s; this.vy *= s;
      speed = maxV;
    }
  
    // integrate
    this.x += this.vx; this.y += this.vy;
  
    const r = this.genes.radius;
    if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); }
    if (this.x > canvasWidth - r) { this.x = canvasWidth - r; this.vx = -Math.abs(this.vx); }
    if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); }
    if (this.y > canvasHeight - r) { this.y = canvasHeight - r; this.vy = -Math.abs(this.vy); }

    // blocks - check collision and push cell out
    if (blocks && blocks.length > 0) {
      for (const b of blocks) {
        const bx = b.x, by = b.y, bw = 24, bh = 24;
        // Check if cell overlaps with block
        const cellLeft = this.x - r;
        const cellRight = this.x + r;
        const cellTop = this.y - r;
        const cellBottom = this.y + r;
        const blockRight = bx + bw;
        const blockBottom = by + bh;
        
        if (cellRight > bx && cellLeft < blockRight && cellBottom > by && cellTop < blockBottom) {
          // Calculate overlap on each axis
          const overlapX = Math.min(cellRight - bx, blockRight - cellLeft);
          const overlapY = Math.min(cellBottom - by, blockBottom - cellTop);
          
          // Push out along the axis with smallest overlap
          if (overlapX < overlapY) {
            // Push horizontally
            if (this.x < bx + bw / 2) {
              this.x = bx - r;
              this.vx = -Math.abs(this.vx) * 0.5; // bounce with some damping
            } else {
              this.x = blockRight + r;
              this.vx = Math.abs(this.vx) * 0.5;
            }
          } else {
            // Push vertically
            if (this.y < by + bh / 2) {
              this.y = by - r;
              this.vy = -Math.abs(this.vy) * 0.5;
            } else {
              this.y = blockBottom + r;
              this.vy = Math.abs(this.vy) * 0.5;
            }
          }
        }
      }
    }
  
    const baselinePerTick = this.genes.baselineBurn / 60;
    const moveCostPerTick = (speed * 1.6) / 60;
    const sizeCostPerTick = (r - 6) * 0.03;
    this.energy -= (baselinePerTick + moveCostPerTick + sizeCostPerTick);
  
    if (this.energy <= 0) this.alive = false;
  }  

  draw(ctx) {
    if (!this.alive) return;
    const r = this.genes.radius;
    ctx.beginPath();
    ctx.fillStyle = `hsl(${this.hue}, 80%, 60%)`;
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();

    const sp = Math.hypot(this.vx, this.vy) || 1;
    const eyeX = this.x + (this.vx / sp) * (r - 2);
    const eyeY = this.y + (this.vy / sp) * (r - 2);
    ctx.beginPath();
    ctx.fillStyle = '#0b0d10';
    ctx.arc(eyeX, eyeY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  reproduce(canvasWidth, canvasHeight) {
    return this.tryReproduce(canvasWidth, canvasHeight, performance.now());
  }
}
