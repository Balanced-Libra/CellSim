// RedCell — genome-based predator; cannot eat pellets, only live cells
class RedCell {
  static CLAMP = Cell.CLAMP; // reuse same ranges

  constructor(x, y, envParams, genes) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5);
    this.vy = (Math.random() - 0.5);
    this.params = envParams;
    this.genes = Cell.clampGenes({ ...genes });
    this.hue = Cell.hueFromGenes(this.genes, 0); // red base
    this.maxEnergy = Math.max(100, this.genes.reproThreshold + 40);
    this.energy = Math.min(this.maxEnergy * 0.55, this.genes.reproThreshold - 10);
    this.alive = true;
    this.digestQueue = [];          // used only for predation digestion
    this.lastReproMs = 0;
    this.reproCooldownMs = 900;
    this.lastBiteMs = 0;            // bite cooldown handled by dish
    this.isPredator = true;
  }

  // predator does not digest pellets from food system; only used when it eats prey
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

  findNearestFood(_) { return null; } // ignores pellets entirely

  tryReproduce(canvasWidth, canvasHeight, nowMs) {
    if (this.energy < this.genes.reproThreshold) return null;
    if (nowMs - this.lastReproMs < this.reproCooldownMs) return null;
    if (this.energy - this.genes.reproCost < 24) return null;

    this.energy -= this.genes.reproCost;
    this.lastReproMs = nowMs;

    const jx = (Math.random() - 0.5) * 2 * this.params.spawnJitter;
    const jy = (Math.random() - 0.5) * 2 * this.params.spawnJitter;
    const r = this.genes.radius;

    const child = new RedCell(
      Math.max(r, Math.min(canvasWidth  - r, this.x + jx)),
      Math.max(r, Math.min(canvasHeight - r, this.y + jy)),
      this.params,
      Cell.mutate(this.genes)
    );
    child.energy = Math.min(child.maxEnergy, child.genes.childStartEnergy);
    return child;
  }

  update(_foods, canvasWidth, canvasHeight, nowMs, allCells) {
    if (!this.alive) return;
  
    this.processDigestion(nowMs);
  
    // steer toward nearest live non-red prey if available
    let ax = 0, ay = 0;
    if (Array.isArray(allCells) && allCells.length) {
      let target = null, bestD2 = Infinity;
      for (let i = 0; i < allCells.length; i++) {
        const c = allCells[i];
        if (!c || !c.alive || (c instanceof RedCell)) continue;
        const dx = c.x - this.x, dy = c.y - this.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD2) { bestD2 = d2; target = c; }
      }
      if (target) {
        const dx = target.x - this.x, dy = target.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const urge = 0.8 + 0.2 * Math.min(1, this.energy / (this.maxEnergy * 0.55));
        ax += (dx / dist) * this.genes.acceleration * urge;
        ay += (dy / dist) * this.genes.acceleration * urge;
      }
    }
  
    // small random search jitter
    const jitter = 0.0025;
    ax += (Math.random() - 0.5) * jitter;
    ay += (Math.random() - 0.5) * jitter;
  
    // apply acceleration
    this.vx += ax;
    this.vy += ay;
  
    // friction
    this.vx *= this.genes.friction;
    this.vy *= this.genes.friction;
  
    // clamp speed
    let speed = Math.hypot(this.vx, this.vy);
    const maxV = this.genes.maxSpeed * (0.75 + 0.25 * Math.min(1, this.energy / (this.maxEnergy * 0.55)));
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
  
    // metabolism — slightly pricier motion
    const baselinePerTick = this.genes.baselineBurn / 60;
    const moveCostPerTick = (speed * 2.2) / 60;
    const sizeCostPerTick = (r - 6) * 0.025;
    this.energy -= (baselinePerTick + moveCostPerTick + sizeCostPerTick);
  
    if (this.energy <= 0) this.alive = false;
  }  

  draw(ctx) {
    if (!this.alive) return;
    const r = this.genes.radius;
    ctx.beginPath();
    ctx.fillStyle = `hsl(${this.hue}, 80%, 55%)`;
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
