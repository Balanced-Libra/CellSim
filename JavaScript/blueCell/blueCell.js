// Cell class — genome-based Blue cell (behavior purely from genes)
class Cell {
  static CLAMP = {
    radius: [4, 9],
    maxSpeed: [1.1, 2.6],
    acceleration: [0.045, 0.14],
    friction: [0.93, 0.99],
    digestionDelay: [150, 1200],      // ms
    reproThreshold: [50, 130],
    reproCost: [20, 70],
    childStartEnergy: [15, 60],
    baselineBurn: [0.8, 2.0],        // energy/sec
    wallAvoidance: [0, 1],           // 0 = no avoidance, 1 = strong avoidance
    mutationRate: [0, 1]             // 0 = low mutation, 1 = high mutation (inheritable)
  };

  constructor(x, y, envParams, genes) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5);
    this.vy = (Math.random() - 0.5);
    this.params = envParams;                      // spawnJitter, etc.
    this.genes = Cell.clampGenes({ ...genes });
    // Use !== undefined check instead of || to handle customHue = 0 (valid hue for red)
    this.hue = this.genes.customHue !== undefined ? this.genes.customHue : Cell.hueFromGenes(this.genes, 210);


    // Energy tank derived from threshold to keep scale consistent
    this.maxEnergy = Math.max(100, this.genes.reproThreshold + 40);
    this.energy = Math.min(this.maxEnergy * 0.6, this.genes.reproThreshold - 10);

    this.alive = true;
    this.digestQueue = [];
    this.lastReproMs = 0;
    this.reproCooldownMs = 800;
  }

  static clamp(v, [lo, hi]) { return Math.max(lo, Math.min(hi, v)); }
  static clampGenes(g) {
    const C = Cell.CLAMP;
    g.radius          = Cell.clamp(g.radius,          C.radius);
    g.maxSpeed        = Cell.clamp(g.maxSpeed,        C.maxSpeed);
    g.acceleration    = Cell.clamp(g.acceleration,    C.acceleration);
    g.friction        = Cell.clamp(g.friction,        C.friction);
    g.digestionDelay  = Cell.clamp(g.digestionDelay,  C.digestionDelay);
    g.reproThreshold  = Cell.clamp(g.reproThreshold,  C.reproThreshold);
    g.reproCost       = Cell.clamp(g.reproCost,       C.reproCost);
    g.childStartEnergy= Cell.clamp(g.childStartEnergy,C.childStartEnergy);
    g.baselineBurn    = Cell.clamp(g.baselineBurn,    C.baselineBurn);
    g.wallAvoidance   = Cell.clamp(g.wallAvoidance !== undefined ? g.wallAvoidance : 0.3, C.wallAvoidance);
    g.mutationRate    = Cell.clamp(g.mutationRate !== undefined ? g.mutationRate : 0.1, C.mutationRate);
    return g;
  }

  static randn() {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  static mutate(parentGenes) {
    // Get mutation rate (inheritable trait) - now represents probability of mutation
    const mutationRate = parentGenes.mutationRate !== undefined ? parentGenes.mutationRate : 0.1;
    
    // Copy parent genes - offspring starts identical to parent
    const g = { ...parentGenes };
    // Preserve customCellName so offspring stay in the same species group
    if (parentGenes.customCellName) {
      g.customCellName = parentGenes.customCellName;
    }
    
    // If mutation rate is 0, no mutations occur at all - return exact copy
    if (mutationRate <= 0 || Math.abs(mutationRate) < 0.0001) {
      // Explicitly preserve all traits, including customHue
      if (parentGenes.customHue !== undefined) {
        g.customHue = parentGenes.customHue;
      }
      g.mutationRate = 0; // Ensure it stays 0
      return g;
    }
    
    // Mutation ranges for each trait (percentage of parent value that can vary)
    // These define how much a trait can deviate from parent when mutation occurs
    const mutationRanges = {
      radius: 0.10,           // ±10% of parent value
      maxSpeed: 0.12,         // ±12% of parent value
      acceleration: 0.15,     // ±15% of parent value
      friction: 0.05,         // ±5% of parent value
      digestionDelay: 0.20,   // ±20% of parent value
      reproThreshold: 0.15,   // ±15% of parent value
      reproCost: 0.15,        // ±15% of parent value
      childStartEnergy: 0.20, // ±20% of parent value
      baselineBurn: 0.12,     // ±12% of parent value
      wallAvoidance: 0.15     // ±15% of parent value
    };
    
    // For each trait, check if mutation occurs (based on mutationRate probability)
    // When mutation occurs, apply gradual change within range of parent value
    const shouldMutate = (traitName) => {
      // mutationRate is the probability (0-1) that this trait will mutate
      return Math.random() < mutationRate;
    };
    
    const applyGradualMutation = (parentValue, range, clampMin, clampMax) => {
      // Calculate mutation amount within range (±range% of parent value)
      // Higher mutation rates can have slightly wider effective ranges, but still gradual
      const effectiveRange = range * (0.5 + mutationRate * 0.5); // 50-100% of base range based on rate
      const mutationAmount = (Math.random() - 0.5) * 2 * effectiveRange; // -range to +range
      const newValue = parentValue * (1 + mutationAmount);
      return Cell.clamp(newValue, [clampMin, clampMax]);
    };
    
    // Apply chance-based gradual mutations to each trait
    if (shouldMutate('radius')) {
      g.radius = Math.round(applyGradualMutation(parentGenes.radius, mutationRanges.radius, Cell.CLAMP.radius[0], Cell.CLAMP.radius[1]));
    }
    if (shouldMutate('maxSpeed')) {
      g.maxSpeed = applyGradualMutation(parentGenes.maxSpeed, mutationRanges.maxSpeed, Cell.CLAMP.maxSpeed[0], Cell.CLAMP.maxSpeed[1]);
    }
    if (shouldMutate('acceleration')) {
      g.acceleration = applyGradualMutation(parentGenes.acceleration, mutationRanges.acceleration, Cell.CLAMP.acceleration[0], Cell.CLAMP.acceleration[1]);
    }
    if (shouldMutate('friction')) {
      g.friction = applyGradualMutation(parentGenes.friction, mutationRanges.friction, Cell.CLAMP.friction[0], Cell.CLAMP.friction[1]);
    }
    if (shouldMutate('digestionDelay')) {
      g.digestionDelay = Math.round(applyGradualMutation(parentGenes.digestionDelay, mutationRanges.digestionDelay, Cell.CLAMP.digestionDelay[0], Cell.CLAMP.digestionDelay[1]));
    }
    if (shouldMutate('reproThreshold')) {
      g.reproThreshold = Math.round(applyGradualMutation(parentGenes.reproThreshold, mutationRanges.reproThreshold, Cell.CLAMP.reproThreshold[0], Cell.CLAMP.reproThreshold[1]));
    }
    if (shouldMutate('reproCost')) {
      g.reproCost = Math.round(applyGradualMutation(parentGenes.reproCost, mutationRanges.reproCost, Cell.CLAMP.reproCost[0], Cell.CLAMP.reproCost[1]));
    }
    if (shouldMutate('childStartEnergy')) {
      g.childStartEnergy = Math.round(applyGradualMutation(parentGenes.childStartEnergy, mutationRanges.childStartEnergy, Cell.CLAMP.childStartEnergy[0], Cell.CLAMP.childStartEnergy[1]));
    }
    if (shouldMutate('baselineBurn')) {
      g.baselineBurn = applyGradualMutation(parentGenes.baselineBurn, mutationRanges.baselineBurn, Cell.CLAMP.baselineBurn[0], Cell.CLAMP.baselineBurn[1]);
    }
    if (shouldMutate('wallAvoidance')) {
      g.wallAvoidance = applyGradualMutation(parentGenes.wallAvoidance, mutationRanges.wallAvoidance, Cell.CLAMP.wallAvoidance[0], Cell.CLAMP.wallAvoidance[1]);
    }
    
    // Color mutation (for custom cells) - chance-based and always gradual
    if (parentGenes.customHue !== undefined) {
      if (shouldMutate('customHue')) {
        // Always mutate within a hue range around parent (never completely random)
        // Base range: ±30 degrees, scales with mutation rate up to ±60 degrees
        const minHueRange = 30;  // degrees
        const maxHueRange = 60;  // degrees
        const hueRange = minHueRange + (maxHueRange - minHueRange) * mutationRate;
        
        // Apply gradual mutation: parent hue ± hueRange
        const hueMutation = (Math.random() - 0.5) * 2 * hueRange;
        g.customHue = (parentGenes.customHue + hueMutation + 360) % 360;
      } else {
        // No mutation - preserve parent color exactly
        g.customHue = parentGenes.customHue;
      }
    }
    
    // Mutation rate itself can mutate (chance-based, gradual)
    // Use a fixed small base probability (5%) for mutation rate to mutate
    // This allows strains to evolve high or low mutation rates over time
    const mutationRateMutationProbability = 0.05;
    if (Math.random() < mutationRateMutationProbability && mutationRate > 0) {
      // Gradual mutation of mutation rate itself (±10% of parent value)
      const mutationRateRange = 0.10;
      const mutationRateMutation = (Math.random() - 0.5) * 2 * mutationRateRange;
      g.mutationRate = Cell.clamp(mutationRate * (1 + mutationRateMutation), Cell.CLAMP.mutationRate);
      // Ensure it doesn't go below 0
      if (g.mutationRate < 0 || Math.abs(g.mutationRate) < 0.0001) {
        g.mutationRate = 0;
      }
    } else {
      // Preserve parent's mutation rate
      g.mutationRate = mutationRate;
    }
    
    return g;
  }

  static hueFromGenes(genes, baseHue) {
    const C = Cell.CLAMP;
    const norm = (k) => {
      const [lo, hi] = C[k];
      return (genes[k] - lo) / (hi - lo);
    };
    const w = {
      radius: 1.0,
      maxSpeed: 1.2,
      acceleration: 1.2,
      friction: 0.8,
      digestionDelay: 0.6,
      reproThreshold: 0.7,
      reproCost: 0.5,
      childStartEnergy: 0.5,
      baselineBurn: 0.8
    };
    let num = 0, den = 0;
    for (const k in w) {
      num += Math.max(0, Math.min(1, norm(k))) * w[k];
      den += w[k];
    }
    const s = den ? num / den : 0.5;   // 0..1 signature
    const span = 26;                    // ±13° spread around species base
    const jitter = (Math.random() - 0.5) * 2; // ±1°
    const h = baseHue + (s - 0.5) * span + jitter;
    return (h % 360 + 360) % 360;
  }
  

  queueDigest(amount, availableAtMs) {
    this.digestQueue.push({ amount, atMs: availableAtMs });
  }

  processDigestion(nowMs) {
    if (!this.digestQueue.length) return;
    const keep = [];
    for (const it of this.digestQueue) {
      if (it.atMs <= nowMs) {
        this.energy = Math.min(this.maxEnergy, this.energy + it.amount);
      } else {
        keep.push(it);
      }
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
    if (this.energy - this.genes.reproCost < 20) return null; // keep parent viable

    this.energy -= this.genes.reproCost;
    this.lastReproMs = nowMs;

    const jx = (Math.random() - 0.5) * 2 * this.params.spawnJitter;
    const jy = (Math.random() - 0.5) * 2 * this.params.spawnJitter;

    const newX = Math.max(this.genes.radius, Math.min(canvasWidth  - this.genes.radius,  this.x + jx));
    const newY = Math.max(this.genes.radius, Math.min(canvasHeight - this.genes.radius,  this.y + jy));

    const child = new Cell(newX, newY, this.params, Cell.mutate(this.genes));
    child.energy = Math.min(child.maxEnergy, child.genes.childStartEnergy);
    return child;
  }

  update(foods, canvasWidth, canvasHeight, nowMs, allCells, blocks) {
    if (!this.alive) return;
  
    this.processDigestion(nowMs);
  
    // Predator evasion (away acceleration scaled by proximity)
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
        const nx = -ndx / d, ny = -ndy / d;           // unit vector away from predator
        const threatRadius = 120;                      // pixels
        threat = Math.max(0, Math.min(1, (threatRadius - d) / threatRadius));
        const awayK = 1.8 * threat;                   // blue = sharper evasive response
        axAway = nx * this.genes.acceleration * awayK;
        ayAway = ny * this.genes.acceleration * awayK;
        this.vx += axAway;
        this.vy += ayAway;
      }
    }
  
    // Food seeking (diminish when threatened)
    const target = this.findNearestFood(foods);
    let seekX = 0, seekY = 0;
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const hunger = 0.7 + 0.3 * Math.min(1, this.energy / (this.maxEnergy * 0.6));
      const seekK = hunger * (1 - 0.5 * threat);
      seekX = (dx / dist) * this.genes.acceleration * seekK;
      seekY = (dy / dist) * this.genes.acceleration * seekK;
    }

    // Continuous wall repulsion - keep away from walls (evolvable trait)
    // This creates a buffer zone so cells don't press against walls
    let wallRepelX = 0, wallRepelY = 0;
    if (blocks && blocks.length > 0 && this.genes.wallAvoidance > 0) {
      const r = this.genes.radius;
      const bufferDist = r * 1.5; // Buffer zone around walls
      const maxRepelDist = r * 3; // Maximum distance to feel repulsion
      
      for (const b of blocks) {
        const bx = b.x, by = b.y, bw = 24, bh = 24;
        const blockRight = bx + bw;
        const blockBottom = by + bh;
        
        // Find closest point on block to cell
        const closestX = Math.max(bx, Math.min(this.x, blockRight));
        const closestY = Math.max(by, Math.min(this.y, blockBottom));
        const dx = this.x - closestX;
        const dy = this.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        if (dist < maxRepelDist) {
          // Repulsion strength increases as we get closer
          const repelStrength = this.genes.wallAvoidance * (1 - dist / maxRepelDist);
          if (dist < bufferDist) {
            // Strong repulsion when too close
            const extraRepel = (bufferDist - dist) / bufferDist;
            wallRepelX += (dx / dist) * this.genes.acceleration * repelStrength * (1 + extraRepel);
            wallRepelY += (dy / dist) * this.genes.acceleration * repelStrength * (1 + extraRepel);
          } else {
            // Gentle repulsion to maintain buffer
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
      
      // Check if direct path to target is blocked
      let pathBlocked = false;
      const pathSteps = Math.ceil(toTargetDist / 10); // Check every 10 pixels
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
        // Direct path is blocked, find best gap to navigate around
        const searchRadius = r * 6; // Search further for gaps
        const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
        let bestGap = null;
        let bestGapScore = -Infinity;
        
        for (const angle of angles) {
          let clearPath = true;
          const steps = 8; // Check more steps for longer paths
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
            // Score based on alignment with target direction
            const toTargetDirX = toTargetX / toTargetDist;
            const toTargetDirY = toTargetY / toTargetDist;
            const alignment = Math.cos(angle) * toTargetDirX + Math.sin(angle) * toTargetDirY;
            const score = 1.0 + alignment * 3.0; // Strong preference for gaps toward target
            
            if (score > bestGapScore) {
              bestGapScore = score;
              bestGap = { angle: angle };
            }
          }
        }
        
        if (bestGap) {
          // Steer toward the gap
          const gapX = Math.cos(bestGap.angle);
          const gapY = Math.sin(bestGap.angle);
          const pathfindStrength = this.genes.wallAvoidance * 1.5; // Strong pathfinding
          pathfindX = gapX * this.genes.acceleration * pathfindStrength;
          pathfindY = gapY * this.genes.acceleration * pathfindStrength;
        }
      }
    }

    // Apply all forces
    this.vx += seekX + wallRepelX + pathfindX;
    this.vy += seekY + wallRepelY + pathfindY;

    // Additional reactive avoidance for immediate obstacles (supplementary to continuous repulsion)
    // This handles cases where the cell is already very close to a wall
    if (blocks && blocks.length > 0 && this.genes.wallAvoidance > 0) {
      const r = this.genes.radius;
      const speed = Math.hypot(this.vx, this.vy);
      
      if (speed > 0.1) {
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        const lookAheadDist = r * 2;
        const aheadX = this.x + dirX * lookAheadDist;
        const aheadY = this.y + dirY * lookAheadDist;
        
        // Quick check for immediate obstacle
        for (const b of blocks) {
          const bx = b.x, by = b.y, bw = 24, bh = 24;
          if (aheadX + r > bx && aheadX - r < bx + bw && aheadY + r > by && aheadY - r < by + bh) {
            // Immediate obstacle ahead, apply perpendicular avoidance
            const blockCenterX = bx + bw / 2;
            const blockCenterY = by + bh / 2;
            const toBlockX = blockCenterX - this.x;
            const toBlockY = blockCenterY - this.y;
            const perpX = -dirY;
            const perpY = dirX;
            const side = (toBlockX * perpX + toBlockY * perpY) > 0 ? 1 : -1;
            const avoidStrength = this.genes.wallAvoidance * 0.5; // Moderate strength
            this.vx += perpX * side * this.genes.acceleration * avoidStrength;
            this.vy += perpY * side * this.genes.acceleration * avoidStrength;
            break;
          }
        }
      }
    }
  
    // friction
    this.vx *= this.genes.friction;
    this.vy *= this.genes.friction;
  
    // clamp speed
    let speed = Math.hypot(this.vx, this.vy);
    const maxV = this.genes.maxSpeed * (0.75 + 0.25 * Math.min(1, this.energy / (this.maxEnergy * 0.6)));
    if (speed > maxV) {
      const s = maxV / (speed || 1);
      this.vx *= s; this.vy *= s;
      speed = maxV;
    }
  
    // integrate
    this.x += this.vx; this.y += this.vy;
  
    // walls
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
  
    // metabolism
    const baselinePerTick = this.genes.baselineBurn / 60;
    const moveCostPerTick = (speed * 2.0) / 60;
    const sizeCostPerTick = (r - 6) * 0.02;
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
