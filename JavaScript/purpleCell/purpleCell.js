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
    this.hue = Cell.hueFromGenes(this.genes, 270);


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

  update(foods, canvasWidth, canvasHeight, nowMs, allCells) {
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
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const hunger = 0.8 + 0.2 * Math.min(1, this.energy / (this.maxEnergy * 0.65));
      const seekK = hunger * (1 - 0.35 * threat);
      this.vx += (dx / dist) * this.genes.acceleration * seekK;
      this.vy += (dy / dist) * this.genes.acceleration * seekK;
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
