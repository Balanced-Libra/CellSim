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
    baselineBurn: [0.8, 2.0]          // energy/sec
  };

  constructor(x, y, envParams, genes) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5);
    this.vy = (Math.random() - 0.5);
    this.params = envParams;                      // spawnJitter, etc.
    this.genes = Cell.clampGenes({ ...genes });
    this.hue = Cell.hueFromGenes(this.genes, 210);


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
    // Gaussian noise (stdev as % of value), then clamp
    const g = { ...parentGenes };
    const N = (pct) => 1 + Cell.randn() * pct;

    g.radius           = Math.round(Cell.clamp(g.radius * N(0.04), Cell.CLAMP.radius));
    g.maxSpeed         = Cell.clamp(g.maxSpeed       * N(0.06), Cell.CLAMP.maxSpeed);
    g.acceleration     = Cell.clamp(g.acceleration   * N(0.08), Cell.CLAMP.acceleration);
    g.friction         = Cell.clamp(g.friction       * N(0.02), Cell.CLAMP.friction);
    g.digestionDelay   = Math.round(Cell.clamp(g.digestionDelay * N(0.12), Cell.CLAMP.digestionDelay));
    g.reproThreshold   = Math.round(Cell.clamp(g.reproThreshold * N(0.07), Cell.CLAMP.reproThreshold));
    g.reproCost        = Math.round(Cell.clamp(g.reproCost      * N(0.07), Cell.CLAMP.reproCost));
    g.childStartEnergy = Math.round(Cell.clamp(g.childStartEnergy * N(0.08), Cell.CLAMP.childStartEnergy));
    g.baselineBurn     = Cell.clamp(g.baselineBurn   * N(0.06), Cell.CLAMP.baselineBurn);
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

  update(foods, canvasWidth, canvasHeight, nowMs, allCells) {
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
    if (target) {
      const dx = target.x - this.x, dy = target.y - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const hunger = 0.7 + 0.3 * Math.min(1, this.energy / (this.maxEnergy * 0.6));
      const seekK = hunger * (1 - 0.5 * threat);
      this.vx += (dx / dist) * this.genes.acceleration * seekK;
      this.vy += (dy / dist) * this.genes.acceleration * seekK;
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
