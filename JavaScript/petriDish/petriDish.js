// PetriDish class - manages the environment and simulation
class PetriDish {
  constructor(canvasId, hudId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.hud = document.getElementById(hudId);
    this.box = this.canvas.parentElement;
    this.containerEl = this.box.parentElement;


    // Simulation state
    this.cells = [];
    this.foods = [];
    this.nutrients = []; // pending food spawns from dead cells: {x,y,atMs,count}
    this.deadBodies = []; // visible corpses until nutrient release: {x,y,radius,hue,removeAt}
    this.blocks = []; // placed blocks: {x,y}
    this.customCells = []; // saved custom cell configurations: [{name, genes, type, color, hue}, ...]

    // Environment parameters
    this.params = {
      cell: {
        radius: 6,
        maxSpeed: 1.9,
        acceleration: 0.08,
        friction: 0.96,
        spawnJitter: 4
      },
      food: {
        radius: 4,
        nutrition: 25,
        grow: {
          enabled: true,
          intervalMs: 6000,   // default = rate 1 (slowest)
          jitterMs: 400,
          offsetMin: 2.2,
          offsetMax: 2.8,
          attempts: 14
        }
      },

      death: {
        nutrientDelayMs: 8000,   // default = decay level 5 (longest)
        pelletsMin: 1,
        pelletsMax: 2
      },

      gridCellSize: 24
    };

    // Tools config
    this.params.tools = {
      kill: { radius: 18 },  // eraser radius in pixels
      block: { size: 24 }    // block size in pixels (fits grid)
    };


    // Genetic priors (no hardcoded behavior — phenotype emerges from genes)
    this.priors = {
      blue: {
        radius: 6,
        maxSpeed: 1.9,
        acceleration: 0.08,
        friction: 0.96,
        digestionDelay: 300,
        reproThreshold: 70,
        reproCost: 35,
        childStartEnergy: 25,
        baselineBurn: 1.2,
        wallAvoidance: 0.3,
        mutationRate: 0.1
      },
      purple: {
        radius: 7,
        maxSpeed: 1.65,
        acceleration: 0.072,
        friction: 0.985,
        digestionDelay: 320,
        reproThreshold: 85,
        reproCost: 40,
        childStartEnergy: 32,
        baselineBurn: 1.35,
        wallAvoidance: 0.35,
        mutationRate: 0.1
      },
      red: { // predator prior (nerfed)
        radius: 6,
        maxSpeed: 1.85,
        acceleration: 0.085,
        friction: 0.945,
        digestionDelay: 260,
        reproThreshold: 110,
        reproCost: 50,
        childStartEnergy: 24,
        baselineBurn: 1.7,
        wallAvoidance: 0.4,
        mutationRate: 0.1
      }
    };

    // Predation tuning
    this.predation = {
      nutritionPerKill: 35,  // less energy per kill
      biteCooldownMs: 450,   // slower kill rate
      eatFactor: 1.0
    };

    // Collision tuning
    this.collision = {
      restitution: 0.92,  // <1 → small energy loss
      lossK: 0.6,         // energy loss scale vs relative normal speed
      softRange: 1.15,    // start repelling at 115% of sum radii
      softK: 0.03         // repulsion strength
    };



    // Track spawn modes (both can be off, but only one can be on at a time)
    this.spawnFoodMode = false;
    this.spawnCellMode = false;
    this.selectedCellType = null; // choose after click
    this.selectedCustomCell = null; // selected custom cell for spawning


    // Auto-food spawn state
    this.autoFood = {
      enabled: false,
      intervalMs: 2000, // default = "medium"
      timer: null
    };
    // Simulation control
    this.paused = false;
    this.fullscreen = false;

    // Tools
    this.mode = 'spawn';             // 'spawn' | 'kill'
    this.kill = { active: false };   // dragging flag
    this.term = { hist: [], idx: -1 }; // mini terminal history
    this.foodDraw = { active: false, lastAt: 0, lastX: 0, lastY: 0, minIntervalMs: 35, minDist: 10 };
    this.cellDraw = { active: false, lastAt: 0, lastX: 0, lastY: 0, minIntervalMs: 90, minDist: 22 };
    this.blockDraw = { active: false, lastGridX: -1, lastGridY: -1 };




    // Stats state
    this.stats = {
      history: { blue: [], purple: [], red: [], custom: {}, food: [], maxLen: 180 }, // custom is now an object keyed by customCellName

      lastSample: 0,
      limits: {
        radius: { min: 4, max: 9 },
        speed: { min: 1.1, max: 2.6 },
        accel: { min: 0.045, max: 0.14 },
        friction: { min: 0.93, max: 0.99 },
        digestionDelay: { min: 150, max: 1200 },  // ms
        reproThreshold: { min: 50, max: 130 },
        reproCost: { min: 20, max: 70 },
        childStartEnergy: { min: 15, max: 60 },
        baselineBurn: { min: 0.8, max: 2.0 }    // energy/sec
      }
    };
    
    // Track custom species DOM elements (keyed by customCellName)
    this.customSpeciesElements = new Map(); // Map<customCellName, {countEl, meterEl, sparkEl, traitEls}>



    // Initialize the simulation
    this.init();
  }

  init() {
    // Set up canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Set up click handler to add food or cell
    this.canvas.addEventListener('pointerdown', (e) => this.handleCanvasClick(e));
    // Drag-to-food (hold to paint pellets)
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'kill') return;
      if (!this.spawnFoodMode) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(this.params.food.radius,
        Math.min(this.canvas.width - this.params.food.radius, e.clientX - rect.left));
      const y = Math.max(this.params.food.radius,
        Math.min(this.canvas.height - this.params.food.radius, e.clientY - rect.top));
      this.foodDraw.active = true;
      this.foodDraw.lastAt = performance.now();
      this.foodDraw.lastX = x;
      this.foodDraw.lastY = y;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.mode === 'kill') return;
      
      // Handle block drag
      if (this.mode === 'block' && this.blockDraw.active) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const gridSize = this.params.gridCellSize;
        const gx = Math.floor(x / gridSize) * gridSize;
        const gy = Math.floor(y / gridSize) * gridSize;
        
        // If we moved to a new grid cell, place a block there
        if (gx !== this.blockDraw.lastGridX || gy !== this.blockDraw.lastGridY) {
          if (this.placeBlockAtGrid(gx, gy)) {
            this.blockDraw.lastGridX = gx;
            this.blockDraw.lastGridY = gy;
          }
        }
        return;
      }
      
      // Handle food drag
      if (!this.spawnFoodMode || !this.foodDraw.active) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(this.params.food.radius,
        Math.min(this.canvas.width - this.params.food.radius, e.clientX - rect.left));
      const y = Math.max(this.params.food.radius,
        Math.min(this.canvas.height - this.params.food.radius, e.clientY - rect.top));

      const now = performance.now();
      const dx = x - this.foodDraw.lastX;
      const dy = y - this.foodDraw.lastY;
      const d2 = dx * dx + dy * dy;

      if (d2 >= this.foodDraw.minDist * this.foodDraw.minDist ||
        (now - this.foodDraw.lastAt) >= this.foodDraw.minIntervalMs) {
        this.addFood(x, y);
        this.foodDraw.lastX = x;
        this.foodDraw.lastY = y;
        this.foodDraw.lastAt = now;
      }
    });

    window.addEventListener('pointerup', () => { 
      this.foodDraw.active = false;
      this.blockDraw.active = false;
    });
    this.canvas.addEventListener('pointerleave', () => { 
      this.foodDraw.active = false;
      this.blockDraw.active = false;
    });
    // Drag-to-cell (hold to paint cells)
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'kill') return;
      if (!this.spawnCellMode) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(this.params.cell.radius,
        Math.min(this.canvas.width - this.params.cell.radius, e.clientX - rect.left));
      const y = Math.max(this.params.cell.radius,
        Math.min(this.canvas.height - this.params.cell.radius, e.clientY - rect.top));
      this.cellDraw.active = true;
      this.cellDraw.lastAt = performance.now();
      this.cellDraw.lastX = x;
      this.cellDraw.lastY = y;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.mode === 'kill') return;
      if (!this.spawnCellMode || !this.cellDraw.active) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(this.params.cell.radius,
        Math.min(this.canvas.width - this.params.cell.radius, e.clientX - rect.left));
      const y = Math.max(this.params.cell.radius,
        Math.min(this.canvas.height - this.params.cell.radius, e.clientY - rect.top));

      const now = performance.now();
      const dx = x - this.cellDraw.lastX;
      const dy = y - this.cellDraw.lastY;
      const d2 = dx * dx + dy * dy;

      if (d2 >= this.cellDraw.minDist * this.cellDraw.minDist ||
        (now - this.cellDraw.lastAt) >= this.cellDraw.minIntervalMs) {
        this.addCell(x, y);
        this.cellDraw.lastX = x;
        this.cellDraw.lastY = y;
        this.cellDraw.lastAt = now;
      }
    });

    window.addEventListener('pointerup', () => { this.cellDraw.active = false; });
    this.canvas.addEventListener('pointerleave', () => { this.cellDraw.active = false; });

    // Drag-to-kill listeners
    const getCanvasPos = (evt) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(this.canvas.width, evt.clientX - rect.left));
      const y = Math.max(0, Math.min(this.canvas.height, evt.clientY - rect.top));
      return { x, y };
    };

    const killAtEvent = (evt) => {
      if (this.mode !== 'kill') return;
      const { x, y } = getCanvasPos(evt);
      this.killAt(x, y);
      evt.preventDefault();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'kill') return;
      this.kill.active = true;
      killAtEvent(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'kill' || !this.kill.active) return;
      killAtEvent(e);
    });
    window.addEventListener('pointerup', () => { this.kill.active = false; });
    this.canvas.addEventListener('pointerleave', () => { this.kill.active = false; });

    // Set up the spawn buttons
    const spawnFoodBtn = document.getElementById('spawnFoodBtn');
    const spawnCellBtn = document.getElementById('spawnCellBtn');
    const killBtn = document.getElementById('killBtn');
    const blockBtn = document.getElementById('blockBtn');
    const cellPanel = document.getElementById('cellPanel');
    const pauseBtn = document.getElementById('pauseBtn');
    const wipeBtn = document.getElementById('wipeBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const growSlider = document.getElementById('growRate');
    const growValue = document.getElementById('growRateVal');
    this.$growSlider = growSlider;
    this.$growVal = growValue;


    // Food button works as before
    spawnFoodBtn.addEventListener('click', () => this.toggleSpawnMode('food'));

    // Spawn Cell button logic:
    // - If already active -> deselect (turn off) and clear color/type
    // - If inactive -> open chooser panel (no spawning yet)
    spawnCellBtn.addEventListener('click', (ev) => {
      // Always disable Kill tool and Block tool when entering cell flow
      this.mode = 'spawn';
      this.kill.active = false;
      if (killBtn) killBtn.classList.remove('active');
      if (blockBtn) blockBtn.classList.remove('active');
      this.canvas.classList.remove('kill-cursor');

      // If currently active, clicking toggles OFF
      if (this.spawnCellMode) {
        this.spawnCellMode = false;
        this.selectedCellType = null;
        this.selectedCustomCell = null;
        spawnCellBtn.classList.remove('active', 'type-blue', 'type-purple', 'type-red');
        spawnCellBtn.setAttribute('aria-expanded', 'false');
        if (cellPanel) cellPanel.hidden = true;
        return;
      }

      // If inactive, open the chooser (no mode yet)
      if (cellPanel) {
        cellPanel.hidden = false;
        spawnCellBtn.classList.add('active');
        spawnCellBtn.setAttribute('aria-expanded', 'true');
      }
    });

    // Handle selection of Blue/Purple -> close panel, set type, activate mode
    if (cellPanel) {
      const optBtns = Array.from(cellPanel.querySelectorAll('.cell-opt'));
      optBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-type'); // "blue" | "purple" | "red"
          this.selectedCellType = (t === 'purple' || t === 'red') ? t : 'blue';
          this.selectedCustomCell = null; // Clear custom cell selection

          // Kill tool and Block tool must be off
          this.mode = 'spawn';
          this.kill.active = false;
          if (killBtn) killBtn.classList.remove('active');
          if (blockBtn) blockBtn.classList.remove('active');
          this.canvas.classList.remove('kill-cursor');

          // Visually mark the button color + active state
          spawnCellBtn.classList.remove('type-blue', 'type-purple', 'type-red');
          spawnCellBtn.classList.add('active', `type-${this.selectedCellType}`);

          // Activate cell mode; turn off food mode
          this.spawnCellMode = true;
          this.spawnFoodMode = false;
          const sfb = document.getElementById('spawnFoodBtn');
          if (sfb) sfb.classList.remove('active');

          // Close panel
          cellPanel.hidden = true;
          spawnCellBtn.setAttribute('aria-expanded', 'false');
        });
      });

      // Wire up Create/Custom button
      const createBtn = document.getElementById('createCellBtn');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          if (this.customCells.length > 0) {
            // Show list of saved custom cells
            this.showCustomCellList();
          } else {
            // Show creation modal for first time
          this.showCustomCellModal();
          }
          spawnCellBtn.classList.remove('active');
          spawnCellBtn.setAttribute('aria-expanded', 'false');
        });
      }
    }

    // Click outside -> close chooser if it’s open and mode not yet active
    document.addEventListener('pointerdown', (e) => {
      if (!cellPanel || cellPanel.hidden) return;
      const within = cellPanel.contains(e.target) || spawnCellBtn.contains(e.target);
      if (!within && !this.spawnCellMode) {
        cellPanel.hidden = true;
        spawnCellBtn.classList.remove('active');
        spawnCellBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Kill tool toggle (exclusive with spawn modes)
    if (killBtn) {
      killBtn.addEventListener('click', () => {
        const enable = this.mode !== 'kill';
        this.mode = enable ? 'kill' : 'spawn';
        killBtn.classList.toggle('active', enable);

        // turn off Spawn Food + Spawn Cell
        this.spawnFoodMode = false;
        this.spawnCellMode = false;
        this.selectedCellType = null;
        this.selectedCustomCell = null;
        const spawnFoodBtnEl = document.getElementById('spawnFoodBtn');
        const spawnCellBtnEl = document.getElementById('spawnCellBtn');
        if (spawnFoodBtnEl) spawnFoodBtnEl.classList.remove('active');
        if (spawnCellBtnEl) spawnCellBtnEl.classList.remove('active', 'type-blue', 'type-purple', 'type-red');
        const cp = document.getElementById('cellPanel'); if (cp) cp.hidden = true;
        
        // turn off block button
        if (blockBtn) blockBtn.classList.remove('active');

        // cursor
        this.canvas.classList.toggle('kill-cursor', enable);
      });

      // Block tool toggle
      if (blockBtn) {
        blockBtn.addEventListener("click", () => {
          const enable = this.mode !== "block";
          this.mode = enable ? "block" : "spawn";
          blockBtn.classList.toggle("active", enable);
          // turn off other modes
          this.spawnFoodMode = false;
          this.spawnCellMode = false;
          this.selectedCellType = null;
          this.selectedCustomCell = null;
          const spawnFoodBtnEl = document.getElementById("spawnFoodBtn");
          const spawnCellBtnEl = document.getElementById("spawnCellBtn");
          if (spawnFoodBtnEl) spawnFoodBtnEl.classList.remove("active");
          if (spawnCellBtnEl) spawnCellBtnEl.classList.remove("active", "type-blue", "type-purple", "type-red");
          const cp = document.getElementById("cellPanel"); if (cp) cp.hidden = true;
          // turn off kill
          const killBtnEl = document.getElementById("killBtn");
          if (killBtnEl) killBtnEl.classList.remove("active");
          this.canvas.classList.remove("kill-cursor");
        });
      }
    }

    // Food growth rate slider
    if (growSlider) {
      // initialize from current config
      const cfg = this.params?.food?.grow || {};
      let rate = 0;
      if (cfg.enabled !== false) {
        const table = { 1: 6000, 2: 4500, 3: 3000, 4: 2000, 5: 1200 };
        // pick nearest mapped interval
        const cur = cfg.intervalMs ?? 3000;
        let best = 3, bestDiff = Infinity;
        for (const [k, v] of Object.entries(table)) {
          const d = Math.abs(v - cur);
          if (d < bestDiff) { bestDiff = d; best = Number(k); }
        }
        rate = (cfg.enabled === false) ? 0 : best;
      }
      growSlider.value = String(rate);
      if (growValue) growValue.textContent = String(rate);

      growSlider.addEventListener('input', () => {
        const r = parseInt(growSlider.value, 10);
        this.setFoodGrowRate(r);
        if (growValue) growValue.textContent = String(r);
      });
    }


    // Full Screen toggle
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        this.fullscreen = !this.fullscreen;
        const wrap = document.querySelector('.wrap');
        if (wrap) wrap.classList.toggle('is-fullscreen', this.fullscreen);
        fullscreenBtn.classList.toggle('active', this.fullscreen);
        fullscreenBtn.setAttribute('aria-pressed', String(this.fullscreen));
        fullscreenBtn.textContent = this.fullscreen ? '🗗' : '⛶';
        fullscreenBtn.setAttribute('title', this.fullscreen ? 'Exit full screen' : 'Full screen');
        fullscreenBtn.setAttribute('aria-label', this.fullscreen ? 'Exit full screen' : 'Full screen');
        this.resizeCanvas();

      });
    }


    // Freeze/Unfreeze toggle
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.paused = !this.paused;
        pauseBtn.classList.toggle('active', this.paused);
        pauseBtn.setAttribute('aria-pressed', String(this.paused));
        pauseBtn.textContent = this.paused ? 'Unfreeze' : 'Freeze';
        
        // Trigger freeze animation
        const freezeOverlay = document.getElementById('freezeOverlay');
        if (freezeOverlay) {
          if (this.paused) {
            // Freezing - fade in animation
            freezeOverlay.classList.remove('fade-out', 'active');
            freezeOverlay.classList.add('fade-in');
            setTimeout(() => {
              freezeOverlay.classList.remove('fade-in');
              freezeOverlay.classList.add('active');
            }, 400);
          } else {
            // Unfreezing - fade out animation
            freezeOverlay.classList.remove('fade-in', 'active');
            freezeOverlay.classList.add('fade-out');
            setTimeout(() => {
              freezeOverlay.classList.remove('fade-out');
            }, 600);
          }
        }
      });
    }

    // Wipe all entities (cells, foods, corpses, pending nutrients)
    if (wipeBtn) {
      wipeBtn.addEventListener('click', () => this.wipeAll());
    }

    // Auto-food UI (attached panel with 3 fixed options)
    const autoBtn = document.getElementById('autoFoodBtn');
    const panel = document.getElementById('autoFoodPanel');
    const optButtons = Array.from(panel.querySelectorAll('.auto-opt'));

    // Clock behavior:
    // - If auto is ON: turn it OFF and close panel.
    // - If auto is OFF: open panel (no spawning yet).
    autoBtn.addEventListener('click', () => {
      if (this.autoFood.enabled) {
        this.stopAutoFood();
        this.autoFood.enabled = false;
        autoBtn.classList.remove('active');
        panel.hidden = true;
      } else {
        panel.hidden = false;
        autoBtn.classList.add('active');
      }
    });

    // Choose a speed -> enable auto + activate Spawn Food mode
    optButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const ms = Number(btn.getAttribute('data-ms')) || 2000;
        this.setAutoFoodRate(ms);

        panel.hidden = true;
        this.autoFood.enabled = true;
        this.startAutoFood();
        autoBtn.classList.add('active');

        // Visually/logic activate Spawn Food mode
        this.spawnFoodMode = true;
        this.spawnCellMode = false;
        const spawnFoodBtn = document.getElementById('spawnFoodBtn');
        const spawnCellBtn = document.getElementById('spawnCellBtn');
        if (spawnFoodBtn) spawnFoodBtn.classList.add('active');
        if (spawnCellBtn) spawnCellBtn.classList.remove('active', 'type-blue', 'type-purple', 'type-red');
        const cp2 = document.getElementById('cellPanel'); if (cp2) cp2.hidden = true;
        this.mode = 'spawn';
        const killBtnEl2 = document.getElementById('killBtn');
        const blockBtnEl2 = document.getElementById('blockBtn');
        if (killBtnEl2) killBtnEl2.classList.remove('active');
        if (blockBtnEl2) blockBtnEl2.classList.remove('active');
        this.canvas.classList.remove('kill-cursor');

      });
    });

    // Optional: click outside closes the chooser when auto is still OFF
    document.addEventListener('pointerdown', (ev) => {
      if (!panel.hidden) {
        const within = panel.contains(ev.target) || autoBtn.contains(ev.target);
        if (!within && !this.autoFood.enabled) {
          panel.hidden = true;
          autoBtn.classList.remove('active');
        }
      }
    });


    // Shift-tip element (left of Spawn Cell) — unchanged
    let shiftTip = document.getElementById('shiftTip');
    if (!shiftTip) {
      shiftTip = document.createElement('div');
      shiftTip.id = 'shiftTip';
      shiftTip.className = 'shift-tip';
      shiftTip.textContent = 'Tip: Hold Shift to spawn purple';
      shiftTip.hidden = true;
      (spawnCellBtn.parentElement || document.body).appendChild(shiftTip);
    }

    // Stats DOM refs
    this.$countBlue = document.getElementById('countBlue');
    this.$countPurple = document.getElementById('countPurple');
    this.$countRed = document.getElementById('countRed');
    this.$countCustom = document.getElementById('countCustom');
    this.$meterBlue = document.getElementById('meterBlue');
    this.$meterPurple = document.getElementById('meterPurple');
    this.$meterRed = document.getElementById('meterRed');
    this.$meterCustom = document.getElementById('meterCustom');
    this.$sparkBlue = document.getElementById('sparkBlue');
    this.$sparkPurple = document.getElementById('sparkPurple');
    this.$sparkRed = document.getElementById('sparkRed');
    this.$sparkCustom = document.getElementById('sparkCustom');
    this.$sparkFood = document.getElementById('sparkFood');


    this.$radiusBlue = document.getElementById('radiusBlue');
    this.$radiusPurple = document.getElementById('radiusPurple');
    this.$radiusRed = document.getElementById('radiusRed');
    this.$radiusCustom = document.getElementById('radiusCustom');
    this.$speedBlue = document.getElementById('speedBlue');
    this.$speedPurple = document.getElementById('speedPurple');
    this.$speedRed = document.getElementById('speedRed');
    this.$speedCustom = document.getElementById('speedCustom');
    this.$accelBlue = document.getElementById('accelBlue');
    this.$accelPurple = document.getElementById('accelPurple');
    this.$accelRed = document.getElementById('accelRed');
    this.$accelCustom = document.getElementById('accelCustom');

    this.$frictionBlue = document.getElementById('frictionBlue');
    this.$frictionPurple = document.getElementById('frictionPurple');
    this.$frictionRed = document.getElementById('frictionRed');
    this.$frictionCustom = document.getElementById('frictionCustom');
    this.$digestBlue = document.getElementById('digestBlue');
    this.$digestPurple = document.getElementById('digestPurple');
    this.$digestRed = document.getElementById('digestRed');
    this.$digestCustom = document.getElementById('digestCustom');
    this.$thresholdBlue = document.getElementById('thresholdBlue');
    this.$thresholdPurple = document.getElementById('thresholdPurple');
    this.$thresholdRed = document.getElementById('thresholdRed');
    this.$thresholdCustom = document.getElementById('thresholdCustom');
    this.$reproCostBlue = document.getElementById('reproCostBlue');
    this.$reproCostPurple = document.getElementById('reproCostPurple');
    this.$reproCostRed = document.getElementById('reproCostRed');
    this.$reproCostCustom = document.getElementById('reproCostCustom');
    this.$childEnergyBlue = document.getElementById('childEnergyBlue');
    this.$childEnergyPurple = document.getElementById('childEnergyPurple');
    this.$childEnergyRed = document.getElementById('childEnergyRed');
    this.$childEnergyCustom = document.getElementById('childEnergyCustom');
    this.$burnBlue = document.getElementById('burnBlue');
    this.$burnPurple = document.getElementById('burnPurple');
    this.$burnRed = document.getElementById('burnRed');
    this.$burnCustom = document.getElementById('burnCustom');
    // Mini terminal DOM
    this.$termOut = document.getElementById('termOut');
    this.$termIn = document.getElementById('termIn');
    if (this.$termIn) {
      this.$termIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = e.target.value.trim();
          if (cmd) { this.execCommand(cmd); this.term.hist.push(cmd); this.term.idx = this.term.hist.length; }
          e.target.value = '';
        } else if (e.key === 'ArrowUp') {
          if (this.term.hist.length) {
            this.term.idx = Math.max(0, this.term.idx - 1);
            this.$termIn.value = this.term.hist[this.term.idx] || '';
            e.preventDefault();
          }
        } else if (e.key === 'ArrowDown') {
          if (this.term.hist.length) {
            this.term.idx = Math.min(this.term.hist.length, this.term.idx + 1);
            this.$termIn.value = (this.term.idx < this.term.hist.length) ? this.term.hist[this.term.idx] : '';
            e.preventDefault();
          }
        }
      });
    }


    // Start simulation loop
    this.startSimulation();

  }

  // Toggle spawn mode and update button + tip appearance
  toggleSpawnMode(mode) {
    const tip = document.getElementById('shiftTip');

    if (mode === 'food') {
      // ensure Kill and Block are off
      this.mode = 'spawn';
      const killBtnEl = document.getElementById('killBtn');
      const blockBtnEl = document.getElementById('blockBtn');
      if (killBtnEl) killBtnEl.classList.remove('active');
      if (blockBtnEl) blockBtnEl.classList.remove('active');
      this.canvas.classList.remove('kill-cursor');

      // toggle food mode
      this.spawnFoodMode = !this.spawnFoodMode;

      if (this.spawnFoodMode) {
        // turn off cell mode + visuals
        this.spawnCellMode = false;
        const scb = document.getElementById('spawnCellBtn');
        if (scb) scb.classList.remove('active', 'type-blue', 'type-purple', 'type-red');
        const cp = document.getElementById('cellPanel'); if (cp) cp.hidden = true;
        if (tip) tip.hidden = true;
      }

      // update food button appearance
      const spawnFoodBtnEl = document.getElementById('spawnFoodBtn');
      if (spawnFoodBtnEl) spawnFoodBtnEl.classList.toggle('active', this.spawnFoodMode);

    } else if (mode === 'cell') {
      // ensure Kill and Block are off
      this.mode = 'spawn';
      const killBtnEl = document.getElementById('killBtn');
      const blockBtnEl = document.getElementById('blockBtn');
      if (killBtnEl) killBtnEl.classList.remove('active');
      if (blockBtnEl) blockBtnEl.classList.remove('active');
      this.canvas.classList.remove('kill-cursor');

      // toggle cell mode
      this.spawnCellMode = !this.spawnCellMode;

      if (this.spawnCellMode) {
        // turn off food mode
        this.spawnFoodMode = false;
        const sfb = document.getElementById('spawnFoodBtn');
        if (sfb) sfb.classList.remove('active');
      }

      // update cell button appearance
      const spawnCellBtnEl = document.getElementById('spawnCellBtn');
      if (spawnCellBtnEl) spawnCellBtnEl.classList.toggle('active', this.spawnCellMode);

      // tip visibility
      if (tip) tip.hidden = !this.spawnCellMode;
    }

  }

  resizeCanvas() {
    // Size the drawing surface to the visual canvas box
    const boxRect = this.box.getBoundingClientRect();
    const gridSize = this.params.gridCellSize;
    
    // Round canvas dimensions to nearest multiple of grid cell size
    // This ensures only complete grid cells are visible (no clipped squares)
    const rawWidth = Math.floor(boxRect.width);
    const rawHeight = Math.floor(boxRect.height);
    this.canvas.width = Math.floor(rawWidth / gridSize) * gridSize;
    this.canvas.height = Math.floor(rawHeight / gridSize) * gridSize;

    // Make side panels match the *canvas*'s visual rectangle exactly
    const contRect = (this.containerEl || this.box.parentElement).getBoundingClientRect();
    const crect = this.canvas.getBoundingClientRect();
    const top = Math.round(crect.top - contRect.top);
    const h = Math.floor(crect.height);

    const left = document.getElementById('leftStats');
    const right = document.getElementById('rightStats');
    if (left) { left.style.top = `${top}px`; left.style.height = `${h}px`; left.style.bottom = 'auto'; }
    if (right) { right.style.top = `${top}px`; right.style.height = `${h}px`; right.style.bottom = 'auto'; }
  }



  // Helper function to place a block at a grid position
  placeBlockAtGrid(gx, gy) {
    const gridSize = this.params.gridCellSize;
    // Only allow block placement within complete grid cells
    const effectiveWidth = Math.floor(this.canvas.width / gridSize) * gridSize;
    const effectiveHeight = Math.floor(this.canvas.height / gridSize) * gridSize;
    
    if (gx >= 0 && gx < effectiveWidth && gy >= 0 && gy < effectiveHeight) {
      const existing = this.blocks.find(b => b.x === gx && b.y === gy);
      if (!existing) {
        this.blocks.push({ x: gx, y: gy });
        // Remove any food pellets that overlap with the new block
        this.removeFoodInBlock(gx, gy);
        return true;
      }
    }
    return false;
  }

  handleCanvasClick(event) {

    if (this.mode === "block") {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const gridSize = this.params.gridCellSize;
      const gx = Math.floor(x / gridSize) * gridSize;
      const gy = Math.floor(y / gridSize) * gridSize;
      
      // Place the initial block
      this.placeBlockAtGrid(gx, gy);
      
      // Start drag mode for blocks
      this.blockDraw.active = true;
      this.blockDraw.lastGridX = gx;
      this.blockDraw.lastGridY = gy;
      return;
    } if (this.mode === 'kill') return;

    // Only spawn if a mode is active
    if (!this.spawnFoodMode && !this.spawnCellMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(this.params.food.radius,
      Math.min(this.canvas.width - this.params.food.radius, event.clientX - rect.left));
    const y = Math.max(this.params.food.radius,
      Math.min(this.canvas.height - this.params.food.radius, event.clientY - rect.top));

    if (this.spawnCellMode) {
      // Hold Shift to spawn a purple cell for this click
      const prev = this.selectedCellType;
      if (event.shiftKey) this.selectedCellType = 'purple';
      this.addCell(x, y);
      this.selectedCellType = prev;
    } else if (this.spawnFoodMode) {
      this.addFood(x, y);
    }
  }

  // ---- Auto food spawning helpers ----
  addFoodRandom() {
    const R = this.params.food.radius;
    const maxAttempts = 50; // Try up to 50 times to find a valid position
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.max(R,
        Math.min(this.canvas.width - R,
        Math.random() * this.canvas.width));
      const y = Math.max(R,
        Math.min(this.canvas.height - R,
        Math.random() * this.canvas.height));
      if (this.addFood(x, y)) {
        return; // Successfully added food
      }
    }
    // If we couldn't find a valid position after maxAttempts, give up
  }

  autoSpawnTick = () => {
    if (!this.autoFood.enabled) return;
    this.addFoodRandom();
    // reschedule the next tick with the current interval
    this.autoFood.timer = setTimeout(this.autoSpawnTick, this.autoFood.intervalMs);
  };

  startAutoFood() {
    this.stopAutoFood(); // in case it was running
    this.autoFood.timer = setTimeout(this.autoSpawnTick, this.autoFood.intervalMs);
  }

  stopAutoFood() {
    if (this.autoFood.timer) {
      clearTimeout(this.autoFood.timer);
      this.autoFood.timer = null;
    }
  }

  setAutoFoodRate(ms) {
    this.autoFood.intervalMs = ms;
    // If running, restart the schedule with the new rate
    if (this.autoFood.enabled) {
      this.startAutoFood();
    }
  }

  // Clear all simulation entities
  wipeAll() {
    this.cells = [];
    this.foods = [];
    this.blocks = [];
    if (this.nutrients) this.nutrients = [];
    if (this.deadBodies) this.deadBodies = [];
  }




  addCell(x, y, customGenes = null) {
    let genes, cell;
    
    // Check if a custom cell is selected
    if (this.selectedCustomCell && !customGenes) {
      customGenes = JSON.parse(JSON.stringify(this.selectedCustomCell.genes));
      // Add customCellName to genes so we can track this species separately
      customGenes.customCellName = this.selectedCustomCell.name;
      this.selectedCellType = this.selectedCustomCell.type;
    }
    
    if (customGenes) {
      genes = customGenes;
      if (this.selectedCellType === "red") {
        cell = new RedCell(x, y, this.params.cell, genes);
      } else if (this.selectedCellType === "purple") {
        cell = new PurpleCell(x, y, this.params.cell, genes);
      } else {
        cell = new Cell(x, y, this.params.cell, genes);
      }
    } else {
      if (this.selectedCellType === "purple") {
        genes = JSON.parse(JSON.stringify(this.priors.purple));
        cell = new PurpleCell(x, y, this.params.cell, genes);
      } else if (this.selectedCellType === "red") {
        genes = JSON.parse(JSON.stringify(this.priors.red));
        cell = new RedCell(x, y, this.params.cell, genes);
      } else {
        genes = JSON.parse(JSON.stringify(this.priors.blue));
        cell = new Cell(x, y, this.params.cell, genes);
      }
    }
    if (!customGenes) {
      // Check for overlap
      const cr = genes.radius;
      const overlapping = this.cells.some(c => {
        const dx = c.x - x, dy = c.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < c.genes.radius + cr;
      }) || this.blocks.some(b => {
        const bx = b.x, by = b.y, bw = 24, bh = 24;
        return x + cr > bx && x - cr < bx + bw && y + cr > by && y - cr < by + bh;
      });
      if (overlapping) return;
    }
    this.cells.push(cell);
  }


  // Helper function to check if a point overlaps with any block
  isPointInBlock(x, y, radius = 0) {
    if (!this.blocks || this.blocks.length === 0) return false;
    const bw = 24, bh = 24; // block width and height
    for (const b of this.blocks) {
      const bx = b.x, by = b.y;
      // Check if point (with optional radius) overlaps with block
      if (x + radius > bx && x - radius < bx + bw && y + radius > by && y - radius < by + bh) {
        return true;
      }
    }
    return false;
  }

  // Remove food pellets that overlap with a block at the given position
  removeFoodInBlock(blockX, blockY) {
    const bw = 24, bh = 24; // block width and height
    const R = this.params.food.radius;
    const blockRight = blockX + bw;
    const blockBottom = blockY + bh;
    
    // Filter out food pellets that overlap with the block
    this.foods = this.foods.filter(f => {
      if (!f) return false;
      // Check if food pellet overlaps with block
      const foodLeft = f.x - R;
      const foodRight = f.x + R;
      const foodTop = f.y - R;
      const foodBottom = f.y + R;
      
      // If food overlaps with block, remove it
      if (foodRight > blockX && foodLeft < blockRight && foodBottom > blockY && foodTop < blockBottom) {
        return false; // Remove this food
      }
      return true; // Keep this food
    });
  }

  addFood(x, y, nowMs = performance.now()) {
    // Don't add food if it would be in a block
    const R = this.params.food.radius;
    if (this.isPointInBlock(x, y, R)) {
      return false; // Food not added
    }
    const g = this.params.food.grow;
    const next = g ? (nowMs + g.intervalMs + (Math.random() * 2 - 1) * (g.jitterMs || 0)) : 0;
    this.foods.push({ x, y, nextGrowMs: next });
    return true; // Food added successfully
  }


  // Update simulation state
  update(nowMs) {
    // Update kinematics/energy
    const babies = [];
    for (const cell of this.cells) {
      cell.update(this.foods, this.canvas.width, this.canvas.height, nowMs, this.cells, this.blocks);

      if (cell.alive) {
        const baby = cell.tryReproduce(this.canvas.width, this.canvas.height, nowMs);
        if (baby) babies.push(baby);
      }
    }

    // Resolve cell–cell collisions (elastic impulse + soft repulsion)
    this.resolveCollisions();

    // Predator → prey consumption
    this.checkPredation(nowMs);


    // Eating → add to digestion queues
    this.checkEating(nowMs);

    // Remove dead cells and schedule nutrient drops + leave corpses
    if (this.cells.length) {
      const alive = [];
      for (const c of this.cells) {
        if (c.alive) {
          alive.push(c);
        } else {
          if (c.killed === true) {
            // eaten by predator → drop a small, faster nutrient to feed prey only
            const releaseAt = nowMs + Math.max(600, this.params.death.nutrientDelayMs * 0.5);
            const count = 1; // tiny drip
            this.nutrients.push({ x: c.x, y: c.y, atMs: releaseAt, count });

            const r = (c.genes && c.genes.radius) ? c.genes.radius : this.params.cell.radius;
            const hue = (typeof c.hue === 'number') ? c.hue : 210;
            this.deadBodies.push({ x: c.x, y: c.y, radius: r, hue, removeAt: releaseAt });
            continue;
          }

          const releaseAt = nowMs + this.params.death.nutrientDelayMs;
          const count = Math.floor(Math.random() * (this.params.death.pelletsMax - this.params.death.pelletsMin + 1)) + this.params.death.pelletsMin;

          this.nutrients.push({ x: c.x, y: c.y, atMs: releaseAt, count });

          const r = (c.genes && c.genes.radius) ? c.genes.radius : this.params.cell.radius;
          const hue = (typeof c.hue === 'number') ? c.hue : 210;
          this.deadBodies.push({ x: c.x, y: c.y, radius: r, hue, removeAt: releaseAt });
        }
      }
      this.cells = alive;
    }


    // Dead cells consumed by fungus → spawn new fungus
    if (this.nutrients.length) {
      const keep = [];
      for (const n of this.nutrients) {
        if (n.atMs <= nowMs) {
          for (let i = 0; i < n.count; i++) {
            const jx = (Math.random() - 0.5) * 6;
            const jy = (Math.random() - 0.5) * 6;
            const fx = Math.max(this.params.food.radius, Math.min(this.canvas.width - this.params.food.radius, n.x + jx));
            const fy = Math.max(this.params.food.radius, Math.min(this.canvas.height - this.params.food.radius, n.y + jy));
            this.addFood(fx, fy);
          }
        } else {
          keep.push(n);
        }
      }
      this.nutrients = keep;
    }
    // Passive fungus growth → spreading spores
    this.growFood(nowMs);


    // Remove decomposed bodies
    if (this.deadBodies.length) {
      this.deadBodies = this.deadBodies.filter(b => b.removeAt > nowMs);
    }


    // Append babies at end to avoid affecting current tick
    if (babies.length) this.cells.push(...babies);
  }

  // Check if cells are eating fungus and handle digestion queueing (no instant reproduction)
  checkEating(nowMs) {
    const cellSize = this.params.gridCellSize;
    const cols = Math.ceil(this.canvas.width / cellSize);
    const rows = Math.ceil(this.canvas.height / cellSize);

    // Create grid for spatial partitioning
    const grid = new Array(cols * rows);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = [];
    }

    // Place foods in grid
    for (let i = 0; i < this.foods.length; i++) {
      const food = this.foods[i];
      const gridX = Math.floor(food.x / cellSize);
      const gridY = Math.floor(food.y / cellSize);

      if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
        grid[gridY * cols + gridX].push(i);
      }
    }

    const eatenFoodIndices = new Set();

    // Check each cell against nearby foods
    for (const cell of this.cells) {
      const cellGridX = Math.floor(cell.x / cellSize);
      const cellGridY = Math.floor(cell.y / cellSize);

      // Check surrounding grid cells
      for (let gy = cellGridY - 1; gy <= cellGridY + 1; gy++) {
        if (gy < 0 || gy >= rows) continue;

        for (let gx = cellGridX - 1; gx <= cellGridX + 1; gx++) {
          if (gx < 0 || gx >= cols) continue;

          const foodIndices = grid[gy * cols + gx];

          for (const foodIndex of foodIndices) {
            if (eatenFoodIndices.has(foodIndex)) continue;

            const food = this.foods[foodIndex];
            const distance = Math.sqrt(
              Math.pow(food.x - cell.x, 2) +
              Math.pow(food.y - cell.y, 2)
            );

            if (distance <= (cell.genes ? (cell.genes.radius + this.params.food.radius) : this.params.cell.radius + this.params.food.radius)) {
              if (!(cell instanceof RedCell)) {
                eatenFoodIndices.add(foodIndex);
                if (typeof cell.queueDigest === 'function') {
                  const delay = (cell.genes && cell.genes.digestionDelay) ? cell.genes.digestionDelay : 300;
                  cell.queueDigest(this.params.food.nutrition, nowMs + delay);
                }
              }
              break;
            }

          }
        }
      }
    }

    // Remove eaten foods
    if (eatenFoodIndices.size > 0) {
      this.foods = this.foods.filter((_, index) => !eatenFoodIndices.has(index));
    }
  }

  // Render the simulation
  render() {
    // Clear canvas with background color
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--box');
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw corpses (below live cells)
    this.drawDeadBodies();

    // Draw foods
    this.drawFoods();

    // Draw blocks
    this.drawBlocks();

    // Draw cells
    this.drawCells();

    // Update HUD
    this.updateHUD();
  }


  drawGrid() {
    this.ctx.beginPath();
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
    this.ctx.strokeStyle = gridColor;
    this.ctx.lineWidth = 1;

    const gridSize = this.params.gridCellSize;

    // Draw grid lines to fill entire canvas (no gaps)
    // Vertical lines
    for (let x = 0.5; x < this.canvas.width; x += gridSize) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
    }

    // Horizontal lines
    for (let y = 0.5; y < this.canvas.height; y += gridSize) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
    }

    this.ctx.stroke();
  }

  drawFoods() {
    const foodColor = getComputedStyle(document.documentElement).getPropertyValue('--food');
    this.ctx.fillStyle = foodColor;

    for (const food of this.foods) {
      this.ctx.beginPath();
      this.ctx.arc(food.x, food.y, this.params.food.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  drawBlocks() {
    this.ctx.fillStyle = "#333";
    for (const b of this.blocks) {
      this.ctx.fillRect(b.x, b.y, this.params.gridCellSize, this.params.gridCellSize);
    }
  }

  drawCells() {
    for (const cell of this.cells) {
      cell.draw(this.ctx);
    }
  }

  drawDeadBodies() {
    for (const b of this.deadBodies) {
      this.ctx.beginPath();
      this.ctx.fillStyle = `hsl(${b.hue}, 60%, 45%)`;
      this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }


  updateHUD() {
    this.hud.textContent = `Cells: ${this.cells.length}   Food: ${this.foods.length}`;
  }

  startSimulation() {
    const simulationLoop = (t) => {
      const now = t || performance.now();
      if (!this.paused) {
        this.update(now);
      }
      this.render();
      this.updateStats(now);
      requestAnimationFrame(simulationLoop);
    };
    requestAnimationFrame(simulationLoop);
  }
  updateStats(nowMs) {
    // Define avg helper function first
    const avg = (arr, fn) => arr.length ? arr.reduce((s, o) => s + fn(o), 0) / arr.length : 0;
    
    const blues = [];
    const purples = [];
    const reds = [];
    const customGroups = new Map(); // Map<customCellName, cells[]>
    
    for (const c of this.cells) {
      if (c instanceof PurpleCell) purples.push(c);
      else if (c instanceof RedCell) reds.push(c);
      else if (c instanceof Cell) {
        // Check if it's a custom cell (has customCellName in genes)
        if (c.genes && c.genes.customCellName) {
          const name = c.genes.customCellName;
          if (!customGroups.has(name)) {
            customGroups.set(name, []);
          }
          customGroups.get(name).push(c);
        } else {
          blues.push(c);
        }
      }
    }

    const bCount = blues.length;
    const pCount = purples.length;
    const rCount = reds.length;
    const totalCustomCount = Array.from(customGroups.values()).reduce((sum, cells) => sum + cells.length, 0);
    const total = bCount + pCount + rCount + totalCustomCount;
    const fCount = this.foods.length;


    // Show/hide population bars based on whether cells exist or have existed
    const hasBlue = bCount > 0 || this.stats.history.blue.some(v => v > 0);
    const hasPurple = pCount > 0 || this.stats.history.purple.some(v => v > 0);
    const hasRed = rCount > 0 || this.stats.history.red.some(v => v > 0);
    
    // Blue population
    if (this.$countBlue) {
      this.$countBlue.textContent = bCount;
      const statLineBlue = this.$countBlue.closest('.stat-line');
      const meterBlueParent = this.$meterBlue?.parentElement;
      if (statLineBlue) statLineBlue.style.display = hasBlue ? 'flex' : 'none';
      if (meterBlueParent) meterBlueParent.style.display = hasBlue ? 'block' : 'none';
    }
    const bluePct = total ? Math.round((bCount / total) * 100) : 0;
    if (this.$meterBlue) {
      this.$meterBlue.style.width = bluePct + '%';
    }
    
    // Purple population
    if (this.$countPurple) {
      this.$countPurple.textContent = pCount;
      const statLinePurple = this.$countPurple.closest('.stat-line');
      const meterPurpleParent = this.$meterPurple?.parentElement;
      if (statLinePurple) statLinePurple.style.display = hasPurple ? 'flex' : 'none';
      if (meterPurpleParent) meterPurpleParent.style.display = hasPurple ? 'block' : 'none';
    }
    const purplePct = total ? Math.round((pCount / total) * 100) : 0;
    if (this.$meterPurple) {
      this.$meterPurple.style.width = purplePct + '%';
    }
    
    // Red population
    if (this.$countRed) {
      this.$countRed.textContent = rCount;
      const statLineRed = this.$countRed.closest('.stat-line');
      const meterRedParent = this.$meterRed?.parentElement;
      if (statLineRed) statLineRed.style.display = hasRed ? 'flex' : 'none';
      if (meterRedParent) meterRedParent.style.display = hasRed ? 'block' : 'none';
    }
    const redPct = total ? Math.round((rCount / total) * 100) : 0;
    if (this.$meterRed) {
      this.$meterRed.style.width = redPct + '%';
    }
    
    // Hide old single custom stat line if it exists
    const oldStatLineCustom = document.getElementById('statLineCustom');
    const oldMeterCustomParent = document.getElementById('meterCustomParent');
    if (oldStatLineCustom) oldStatLineCustom.style.display = 'none';
    if (oldMeterCustomParent) oldMeterCustomParent.style.display = 'none';
    
    // Process each custom species separately (by customCellName)
    const activeCustomNames = new Set();
    for (const [customCellName, customCells] of customGroups.entries()) {
      activeCustomNames.add(customCellName);
      const elements = this.getCustomSpeciesElements(customCellName);
      if (!elements) continue;
      
      const count = customCells.length;
      const avgHue = customCells.reduce((sum, c) => sum + (c.genes?.customHue || c.hue || 210), 0) / count;
      
      // Update population display
      elements.countEl.textContent = count;
      const hasData = count > 0 || (this.stats.history.custom[customCellName] && this.stats.history.custom[customCellName].some(v => v > 0));
      elements.statLine.style.display = hasData ? 'flex' : 'none';
      elements.meterParent.style.display = hasData ? 'block' : 'none';
      
      const pct = total ? Math.round((count / total) * 100) : 0;
      elements.meterEl.style.width = pct + '%';
      elements.meterEl.style.background = `hsl(${avgHue}, 80%, 60%)`;
      
      // Update history and sparkline
      if (nowMs - this.stats.lastSample >= 500) {
        if (!this.stats.history.custom[customCellName]) {
          this.stats.history.custom[customCellName] = [];
        }
        this.pushHistory(this.stats.history.custom[customCellName], count);
        
        if (count > 0 || this.stats.history.custom[customCellName].some(v => v > 0)) {
          this.drawSpark(elements.sparkEl, this.stats.history.custom[customCellName], `hsl(${avgHue}, 80%, 60%)`);
          elements.sparkEl.style.display = 'block';
        } else {
          elements.sparkEl.style.display = 'none';
          while (elements.sparkEl.firstChild) elements.sparkEl.removeChild(elements.sparkEl.firstChild);
        }
      }
      
      // Update trait meters
      const traitValues = {
        radius: avg(customCells, o => o.genes.radius),
        speed: avg(customCells, o => o.genes.maxSpeed),
        accel: avg(customCells, o => o.genes.acceleration),
        friction: avg(customCells, o => o.genes.friction),
        digest: avg(customCells, o => o.genes.digestionDelay),
        threshold: avg(customCells, o => o.genes.reproThreshold),
        reproCost: avg(customCells, o => o.genes.reproCost),
        childEnergy: avg(customCells, o => o.genes.childStartEnergy),
        burn: avg(customCells, o => o.genes.baselineBurn)
      };
      
      const traitLimits = {
        radius: this.stats.limits.radius,
        speed: this.stats.limits.speed,
        accel: this.stats.limits.accel,
        friction: this.stats.limits.friction,
        digest: this.stats.limits.digestionDelay,
        threshold: this.stats.limits.reproThreshold,
        reproCost: this.stats.limits.reproCost,
        childEnergy: this.stats.limits.childStartEnergy,
        burn: this.stats.limits.baselineBurn
      };
      
      Object.keys(traitValues).forEach(traitName => {
        const el = elements.traitEls[traitName];
        if (el) {
          el.style.width = this.toPct(traitValues[traitName], traitLimits[traitName]) + '%';
          el.style.background = `hsl(${avgHue}, 80%, 60%)`;
          el.parentElement.style.display = hasData ? 'block' : 'none';
        }
      });
    }
    
    // Remove elements for extinct custom species
    for (const customCellName of this.customSpeciesElements.keys()) {
      if (!activeCustomNames.has(customCellName)) {
        const history = this.stats.history.custom[customCellName];
        const hasHistory = history && history.some(v => v > 0);
        if (!hasHistory) {
          this.removeCustomSpeciesElements(customCellName);
        }
      }
    }

    if (nowMs - this.stats.lastSample >= 500) {
      this.stats.lastSample = nowMs;
      this.pushHistory(this.stats.history.blue, bCount);
      this.pushHistory(this.stats.history.purple, pCount);
      this.pushHistory(this.stats.history.red, rCount);
      this.pushHistory(this.stats.history.food, fCount);
      // Custom species history is handled in the custom species loop above
      
      // Only draw sparklines if there's actual data (current count > 0 or history has non-zero values)
      if (bCount > 0 || this.stats.history.blue.some(v => v > 0)) {
      this.drawSpark(this.$sparkBlue, this.stats.history.blue, '#58a6ff');
        if (this.$sparkBlue) this.$sparkBlue.style.display = 'block';
      } else {
        if (this.$sparkBlue) {
          this.$sparkBlue.style.display = 'none';
          while (this.$sparkBlue.firstChild) this.$sparkBlue.removeChild(this.$sparkBlue.firstChild);
        }
      }
      
      if (pCount > 0 || this.stats.history.purple.some(v => v > 0)) {
      this.drawSpark(this.$sparkPurple, this.stats.history.purple, 'hsl(270,80%,60%)');
        if (this.$sparkPurple) this.$sparkPurple.style.display = 'block';
      } else {
        if (this.$sparkPurple) {
          this.$sparkPurple.style.display = 'none';
          while (this.$sparkPurple.firstChild) this.$sparkPurple.removeChild(this.$sparkPurple.firstChild);
        }
      }
      
      if (rCount > 0 || this.stats.history.red.some(v => v > 0)) {
      this.drawSpark(this.$sparkRed, this.stats.history.red, 'hsl(0,80%,60%)');
        if (this.$sparkRed) this.$sparkRed.style.display = 'block';
      } else {
        if (this.$sparkRed) {
          this.$sparkRed.style.display = 'none';
          while (this.$sparkRed.firstChild) this.$sparkRed.removeChild(this.$sparkRed.firstChild);
        }
      }
      
      // Custom species sparklines are handled in the custom species loop above
      
      if (fCount > 0 || this.stats.history.food.some(v => v > 0)) {
      this.drawSpark(this.$sparkFood, this.stats.history.food, 'hsl(140,80%,60%)');
        if (this.$sparkFood) this.$sparkFood.style.display = 'block';
      } else {
        if (this.$sparkFood) {
          this.$sparkFood.style.display = 'none';
          while (this.$sparkFood.firstChild) this.$sparkFood.removeChild(this.$sparkFood.firstChild);
        }
      }
    }



    const bRadius = avg(blues, o => o.genes.radius);
    const pRadius = avg(purples, o => o.genes.radius);
    const rRadius = avg(reds, o => o.genes.radius);
    const bSpeed = avg(blues, o => o.genes.maxSpeed);
    const pSpeed = avg(purples, o => o.genes.maxSpeed);
    const rSpeed = avg(reds, o => o.genes.maxSpeed);
    const bAccel = avg(blues, o => o.genes.acceleration);
    const pAccel = avg(purples, o => o.genes.acceleration);
    const rAccel = avg(reds, o => o.genes.acceleration);

    const bFric = avg(blues, o => o.genes.friction);
    const pFric = avg(purples, o => o.genes.friction);
    const rFric = avg(reds, o => o.genes.friction);
    const bDelay = avg(blues, o => o.genes.digestionDelay);
    const pDelay = avg(purples, o => o.genes.digestionDelay);
    const rDelay = avg(reds, o => o.genes.digestionDelay);
    const bThresh = avg(blues, o => o.genes.reproThreshold);
    const pThresh = avg(purples, o => o.genes.reproThreshold);
    const rThresh = avg(reds, o => o.genes.reproThreshold);
    const bCost = avg(blues, o => o.genes.reproCost);
    const pCost = avg(purples, o => o.genes.reproCost);
    const rCost = avg(reds, o => o.genes.reproCost);
    const bChild = avg(blues, o => o.genes.childStartEnergy);
    const pChild = avg(purples, o => o.genes.childStartEnergy);
    const rChild = avg(reds, o => o.genes.childStartEnergy);
    const bBurn = avg(blues, o => o.genes.baselineBurn);
    const pBurn = avg(purples, o => o.genes.baselineBurn);
    const rBurn = avg(reds, o => o.genes.baselineBurn);

    // Show/hide trait meters based on whether cells exist or have existed
    const showTraitMeter = (meterEl, hasData) => {
      if (meterEl) {
        meterEl.parentElement.style.display = hasData ? 'block' : 'none';
      }
    };
    
    if (this.$radiusBlue) {
      this.$radiusBlue.style.width = this.toPct(bRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusBlue, hasBlue);
    }
    if (this.$radiusPurple) {
      this.$radiusPurple.style.width = this.toPct(pRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusPurple, hasPurple);
    }
    if (this.$radiusRed) {
      this.$radiusRed.style.width = this.toPct(rRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusRed, hasRed);
    }
    // Custom species trait meters are handled in the custom species loop above
    
    if (this.$radiusBlue) {
      this.$radiusBlue.style.width = this.toPct(bRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusBlue, hasBlue);
    }
    if (this.$radiusPurple) {
      this.$radiusPurple.style.width = this.toPct(pRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusPurple, hasPurple);
    }
    if (this.$radiusRed) {
      this.$radiusRed.style.width = this.toPct(rRadius, this.stats.limits.radius) + '%';
      showTraitMeter(this.$radiusRed, hasRed);
    }
    
    if (this.$speedBlue) {
      this.$speedBlue.style.width = this.toPct(bSpeed, this.stats.limits.speed) + '%';
      showTraitMeter(this.$speedBlue, hasBlue);
    }
    if (this.$speedPurple) {
      this.$speedPurple.style.width = this.toPct(pSpeed, this.stats.limits.speed) + '%';
      showTraitMeter(this.$speedPurple, hasPurple);
    }
    if (this.$speedRed) {
      this.$speedRed.style.width = this.toPct(rSpeed, this.stats.limits.speed) + '%';
      showTraitMeter(this.$speedRed, hasRed);
    }
    
    if (this.$accelBlue) {
      this.$accelBlue.style.width = this.toPct(bAccel, this.stats.limits.accel) + '%';
      showTraitMeter(this.$accelBlue, hasBlue);
    }
    if (this.$accelPurple) {
      this.$accelPurple.style.width = this.toPct(pAccel, this.stats.limits.accel) + '%';
      showTraitMeter(this.$accelPurple, hasPurple);
    }
    if (this.$accelRed) {
      this.$accelRed.style.width = this.toPct(rAccel, this.stats.limits.accel) + '%';
      showTraitMeter(this.$accelRed, hasRed);
    }

    if (this.$frictionBlue) {
      this.$frictionBlue.style.width = this.toPct(bFric, this.stats.limits.friction) + '%';
      showTraitMeter(this.$frictionBlue, hasBlue);
    }
    if (this.$frictionPurple) {
      this.$frictionPurple.style.width = this.toPct(pFric, this.stats.limits.friction) + '%';
      showTraitMeter(this.$frictionPurple, hasPurple);
    }
    if (this.$frictionRed) {
      this.$frictionRed.style.width = this.toPct(rFric, this.stats.limits.friction) + '%';
      showTraitMeter(this.$frictionRed, hasRed);
    }
    
    if (this.$digestBlue) {
      this.$digestBlue.style.width = this.toPct(bDelay, this.stats.limits.digestionDelay) + '%';
      showTraitMeter(this.$digestBlue, hasBlue);
    }
    if (this.$digestPurple) {
      this.$digestPurple.style.width = this.toPct(pDelay, this.stats.limits.digestionDelay) + '%';
      showTraitMeter(this.$digestPurple, hasPurple);
    }
    if (this.$digestRed) {
      this.$digestRed.style.width = this.toPct(rDelay, this.stats.limits.digestionDelay) + '%';
      showTraitMeter(this.$digestRed, hasRed);
    }
    
    if (this.$thresholdBlue) {
      this.$thresholdBlue.style.width = this.toPct(bThresh, this.stats.limits.reproThreshold) + '%';
      showTraitMeter(this.$thresholdBlue, hasBlue);
    }
    if (this.$thresholdPurple) {
      this.$thresholdPurple.style.width = this.toPct(pThresh, this.stats.limits.reproThreshold) + '%';
      showTraitMeter(this.$thresholdPurple, hasPurple);
    }
    if (this.$thresholdRed) {
      this.$thresholdRed.style.width = this.toPct(rThresh, this.stats.limits.reproThreshold) + '%';
      showTraitMeter(this.$thresholdRed, hasRed);
    }
    
    if (this.$reproCostBlue) {
      this.$reproCostBlue.style.width = this.toPct(bCost, this.stats.limits.reproCost) + '%';
      showTraitMeter(this.$reproCostBlue, hasBlue);
    }
    if (this.$reproCostPurple) {
      this.$reproCostPurple.style.width = this.toPct(pCost, this.stats.limits.reproCost) + '%';
      showTraitMeter(this.$reproCostPurple, hasPurple);
    }
    if (this.$reproCostRed) {
      this.$reproCostRed.style.width = this.toPct(rCost, this.stats.limits.reproCost) + '%';
      showTraitMeter(this.$reproCostRed, hasRed);
    }
    
    if (this.$childEnergyBlue) {
      this.$childEnergyBlue.style.width = this.toPct(bChild, this.stats.limits.childStartEnergy) + '%';
      showTraitMeter(this.$childEnergyBlue, hasBlue);
    }
    if (this.$childEnergyPurple) {
      this.$childEnergyPurple.style.width = this.toPct(pChild, this.stats.limits.childStartEnergy) + '%';
      showTraitMeter(this.$childEnergyPurple, hasPurple);
    }
    if (this.$childEnergyRed) {
      this.$childEnergyRed.style.width = this.toPct(rChild, this.stats.limits.childStartEnergy) + '%';
      showTraitMeter(this.$childEnergyRed, hasRed);
    }
    
    if (this.$burnBlue) {
      this.$burnBlue.style.width = this.toPct(bBurn, this.stats.limits.baselineBurn) + '%';
      showTraitMeter(this.$burnBlue, hasBlue);
    }
    if (this.$burnPurple) {
      this.$burnPurple.style.width = this.toPct(pBurn, this.stats.limits.baselineBurn) + '%';
      showTraitMeter(this.$burnPurple, hasPurple);
    }
    if (this.$burnRed) {
      this.$burnRed.style.width = this.toPct(rBurn, this.stats.limits.baselineBurn) + '%';
      showTraitMeter(this.$burnRed, hasRed);
    }

  }

  toPct(val, range) {
    if (!isFinite(val)) return 0;
    const min = range.min, max = range.max;
    const v = Math.max(min, Math.min(max, val));
    return Math.round(((v - min) / (max - min)) * 100);
  }

  pushHistory(arr, v) {
    arr.push(v);
    const max = this.stats.history.maxLen;
    if (arr.length > max) arr.splice(0, arr.length - max);
  }
  
  // Get or create DOM elements for a custom species (by customCellName)
  getCustomSpeciesElements(customCellName) {
    if (!this.customSpeciesElements.has(customCellName)) {
      const leftStats = document.getElementById('leftStats');
      const rightStats = document.getElementById('rightStats');
      if (!leftStats || !rightStats) return null;
      
      // Create population stat line and meter
      const statLine = document.createElement('div');
      statLine.className = 'stat-line';
      statLine.style.display = 'none';
      const span = document.createElement('span');
      span.textContent = customCellName;
      const strong = document.createElement('strong');
      strong.id = `countCustom${customCellName.replace(/\s+/g, '')}`;
      strong.textContent = '0';
      statLine.appendChild(span);
      statLine.appendChild(strong);
      
      // Insert after Red, before spark-wrap
      const redMeter = document.getElementById('meterRed')?.parentElement;
      const sparkWrap = leftStats.querySelector('.spark-wrap');
      if (redMeter && redMeter.nextSibling) {
        leftStats.insertBefore(statLine, sparkWrap);
      } else {
        leftStats.insertBefore(statLine, sparkWrap);
      }
      
      const meterParent = document.createElement('div');
      meterParent.className = 'meter';
      meterParent.style.display = 'none';
      const meterFill = document.createElement('div');
      const nameId = customCellName.replace(/\s+/g, '');
      meterFill.id = `meterCustom${nameId}`;
      meterFill.className = 'fill';
      meterFill.style.width = '0%';
      meterParent.appendChild(meterFill);
      leftStats.insertBefore(meterParent, sparkWrap);
      
      // Create sparkline
      const spark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      spark.id = `sparkCustom${nameId}`;
      spark.setAttribute('class', 'spark');
      spark.setAttribute('viewBox', '0 0 200 40');
      spark.setAttribute('preserveAspectRatio', 'none');
      spark.style.display = 'none';
      sparkWrap.appendChild(spark);
      
      // Create trait meters for right panel
      const traitEls = {};
      const traitMappings = {
        radius: 'radius',
        speed: 'speed',
        accel: 'accel',
        friction: 'friction',
        digest: 'digest',
        threshold: 'threshold',
        reproCost: 'reproCost',
        childEnergy: 'childEnergy',
        burn: 'burn'
      };
      
      Object.entries(traitMappings).forEach(([key, idPrefix]) => {
        // Find the trait block by looking for the Red meter's parent's parent
        const redMeter = rightStats.querySelector(`#${idPrefix}Red`);
        if (redMeter) {
          const traitBlock = redMeter.parentElement?.parentElement;
          if (traitBlock) {
            const meterParent = document.createElement('div');
            meterParent.className = 'meter';
            meterParent.style.display = 'none';
            const meterFill = document.createElement('div');
            meterFill.id = `${idPrefix}Custom${nameId}`;
            meterFill.className = 'fill';
            meterFill.style.width = '0%';
            meterParent.appendChild(meterFill);
            traitBlock.appendChild(meterParent);
            traitEls[key] = meterFill;
          }
        }
      });
      
      this.customSpeciesElements.set(customCellName, {
        statLine,
        countEl: strong,
        meterEl: meterFill,
        meterParent,
        sparkEl: spark,
        traitEls
      });
    }
    return this.customSpeciesElements.get(customCellName);
  }
  
  // Remove custom species elements when species is extinct
  removeCustomSpeciesElements(customCellName) {
    const elements = this.customSpeciesElements.get(customCellName);
    if (elements) {
      if (elements.statLine) elements.statLine.remove();
      if (elements.meterParent) elements.meterParent.remove();
      if (elements.sparkEl) elements.sparkEl.remove();
      Object.values(elements.traitEls || {}).forEach(el => {
        if (el && el.parentElement) el.parentElement.remove();
      });
      this.customSpeciesElements.delete(customCellName);
      // Also remove from history
      delete this.stats.history.custom[customCellName];
    }
  }

  drawSpark(svg, data, color) {
    if (!svg || data.length < 2) return;
    const W = 200, H = 40, pad = 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const max = Math.max(1, ...data);
    const step = (W - pad * 2) / (data.length - 1);
    let d = '';
    for (let i = 0; i < data.length; i++) {
      const x = pad + i * step;
      const y = H - pad - (data[i] / max) * (H - pad * 2);
      d += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d.trim());
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  }
  appendTerm(line) {
    if (!this.$termOut) return;
    const el = this.$termOut;
    const stamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent += `[${stamp}] ${line}\n`;
    // cap output
    const maxChars = 8000;
    if (el.textContent.length > maxChars) {
      el.textContent = el.textContent.slice(el.textContent.length - maxChars);
    }
    el.scrollTop = el.scrollHeight;
  }

  execCommand(cmd) {
    // spawn <food|blue|purple|red> N
    const m = cmd.match(/^\s*spawn\s+(food|blue|purple|red)\s+(\d+)\s*$/i);
    if (m) {
      const kind = m[1].toLowerCase();
      const n = Math.max(1, Math.min(500, parseInt(m[2], 10) || 0));
      if (kind === 'food') {
        this.spawnRandomFood(n);
        this.appendTerm(`spawned ${n} food pellets`);
      } else {
        this.spawnRandomCells(kind, n);
        this.appendTerm(`spawned ${n} ${kind} cells`);
      }
      return;
    }

    // grow rate 0–5 (0 = off)
    const g = cmd.match(/^\s*grow\s+rate\s+([0-5])\s*$/i);
    if (g) {
      const rate = parseInt(g[1], 10);
      const ms = this.setFoodGrowRate(rate);
      this.appendTerm(ms ? `food growth rate set to ${rate} (${ms} ms between buds)`
        : `food growth disabled`);
      if (this.$growSlider) this.$growSlider.value = String(rate);
      if (this.$growVal) this.$growVal.textContent = String(rate);
      return;
    }

    // decay 1–5 (corpse → food delay; 5 = longest)
    const d = cmd.match(/^\s*decay\s+([1-5])\s*$/i);
    if (d) {
      const lvl = parseInt(d[1], 10);
      const ms = this.setDecayLevel(lvl);
      this.appendTerm(`decay set to ${lvl} (${ms} ms corpse→food)`);
      return;
    }

    // auto food 1–3
    const a = cmd.match(/^\s*auto\s+food\s+([1-3])\s*$/i);
    if (a) {
      const level = parseInt(a[1], 10);
      const ms = this.setAutoFoodLevel(level, true);
      const autoBtn = document.getElementById('autoFoodBtn');
      if (autoBtn) autoBtn.classList.add('active');
      const spawnFoodBtn = document.getElementById('spawnFoodBtn');
      const spawnCellBtn = document.getElementById('spawnCellBtn');
      const killBtn = document.getElementById('killBtn');
      const blockBtn = document.getElementById('blockBtn');
      this.spawnFoodMode = true;
      this.spawnCellMode = false;
      this.mode = 'spawn';
      if (spawnFoodBtn) spawnFoodBtn.classList.add('active');
      if (spawnCellBtn) spawnCellBtn.classList.remove('active');
      if (killBtn) killBtn.classList.remove('active');
      if (blockBtn) blockBtn.classList.remove('active');
      this.canvas.classList.remove('kill-cursor');
      this.appendTerm(`auto food set to ${level} (${ms} ms)`);
      return;
    }

    // wipe / wipe food / wipe blue|purple|red
    const w = cmd.match(/^\s*wipe(?:\s+(food|blue|purple|red))?\s*$/i);
    if (w) {
      const target = w[1] ? w[1].toLowerCase() : null;
      if (!target) {
        this.wipeAll();
        this.appendTerm('wiped all (cells, food, corpses, pending)');
      } else if (target === 'food') {
        this.wipeFoodOnly();
        this.appendTerm('wiped food only');
      } else {
        const count = this.wipeCellsOfType(target);
        this.appendTerm(`wiped ${count} ${target} cells`);
      }
      return;
    }

    // help
    if (/^\s*help\s*$/i.test(cmd)) {
      this.appendTerm(
        'spawn food N | spawn blue N | spawn purple N | spawn red N'
      );
      this.appendTerm(
        'grow rate 0-5 (0=off, 1=slow … 5=fast) | decay 1-5 (corpse→food delay)'
      );
      this.appendTerm(
        'auto food 1-3 (slow..fast) | wipe | wipe food | wipe blue|purple|red'
      );
      return;
    }

    this.appendTerm(`unknown command: ${cmd}`);
  }

  setFoodGrowRate(rate) {
    const cfg = this.params?.food?.grow;
    if (!cfg) return 0;

    const r = Math.max(0, Math.min(5, rate | 0));

    if (r === 0) {
      cfg.enabled = false;
      for (const f of this.foods) {
        if (f) f.nextGrowMs = Number.POSITIVE_INFINITY;
      }
      return 0; // signals "disabled"
    }

    cfg.enabled = true;

    // 1=slow … 5=fast
    const table = { 1: 6000, 2: 4500, 3: 3000, 4: 2000, 5: 1200 };
    cfg.intervalMs = table[r];
    cfg.jitterMs = Math.round(cfg.intervalMs * 0.25);

    // reschedule existing pellets to the new cadence
    const now = performance.now();
    for (const f of this.foods) {
      if (!f) continue;
      f.nextGrowMs = now + cfg.intervalMs + (Math.random() * 2 - 1) * (cfg.jitterMs || 0);
    }
    return cfg.intervalMs;
  }

  setDecayLevel(level) {
    // 1..5 → ms; 3 ~= old default 3000ms
    const table = { 1: 2000, 2: 4000, 3: 6000, 4: 8000, 5: 10000 };
    const lvl = Math.max(1, Math.min(5, level | 0));
    const ms = table[lvl];

    // apply for future deaths
    this.params.death.nutrientDelayMs = ms;

    // leave already-scheduled corpses/foods as-is
    return ms;
  }


  setAutoFoodLevel(level, enable = true) {
    const map = { 1: 3000, 2: 2000, 3: 1000 }; // matches UI panel speeds
    const clamped = Math.max(1, Math.min(3, level | 0));
    const ms = map[clamped];
    this.setAutoFoodRate(ms);
    if (enable) {
      this.autoFood.enabled = true;
      this.startAutoFood();
    }
    return ms;
  }
  wipeFoodOnly() {
    this.foods = [];
    if (this.nutrients) this.nutrients = [];  // also clear pending drips so food doesn’t reappear
  }

  wipeCellsOfType(type) {
    let removed = 0;
    const keep = [];
    for (const c of this.cells) {
      let isType = false;
      if (type === 'purple') isType = (c instanceof PurpleCell);
      else if (type === 'red') isType = (c instanceof RedCell);
      else if (type === 'blue') isType = (c instanceof Cell) && !(c instanceof PurpleCell) && !(c instanceof RedCell);
      if (isType) removed++; else keep.push(c);
    }
    this.cells = keep;
    return removed;
  }


  spawnRandomFood(n) {
    for (let i = 0; i < n; i++) this.addFoodRandom();
  }

  spawnRandomCells(kind, n) {
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < n; i++) {
      const pri = this.priors[kind] || this.priors.blue;
      const r = pri.radius ?? this.params.cell.radius;
      const x = Math.random() * (W - 2 * r) + r;
      const y = Math.random() * (H - 2 * r) + r;
      let genes = JSON.parse(JSON.stringify(pri));
      let cell;
      if (kind === 'purple') cell = new PurpleCell(x, y, this.params.cell, genes);
      else if (kind === 'red') cell = new RedCell(x, y, this.params.cell, genes);
      else cell = new Cell(x, y, this.params.cell, genes);
      this.cells.push(cell);
    }
  }
  growFood(nowMs) {
    const cfg = this.params.food.grow;
    if (!cfg || !cfg.enabled) return;

    const R = this.params.food.radius;
    const W = this.canvas.width, H = this.canvas.height;
    const minSep = R * 2.05;          // strict non-overlap
    const minSep2 = minSep * minSep;
    const minDist = R * cfg.offsetMin; // where to try budding
    const maxDist = R * cfg.offsetMax;
    const tries = cfg.attempts || 10;

    // index-based loop so new pellets added this tick don't immediately grow
    for (let i = 0; i < this.foods.length; i++) {
      const f = this.foods[i];
      if (!f) continue;

      if (!f.nextGrowMs) f.nextGrowMs = nowMs + cfg.intervalMs;
      if (nowMs < f.nextGrowMs) continue;

      // reschedule parent regardless of success to avoid tight retry loops
      f.nextGrowMs = nowMs + cfg.intervalMs + (Math.random() * 2 - 1) * (cfg.jitterMs || 0);

      let placed = false;
      for (let k = 0; k < tries && !placed; k++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        let nx = f.x + Math.cos(ang) * dist;
        let ny = f.y + Math.sin(ang) * dist;

        // clamp inside bounds
        nx = Math.max(R, Math.min(W - R, nx));
        ny = Math.max(R, Math.min(H - R, ny));

        // check non-overlap with existing pellets
        let ok = true;
        for (let j = 0; j < this.foods.length; j++) {
          const g = this.foods[j];
          const dx = g.x - nx, dy = g.y - ny;
          if (dx * dx + dy * dy < minSep2) { ok = false; break; }
        }

        // check non-overlap with blocks
        if (ok && this.isPointInBlock(nx, ny, R)) {
          ok = false;
        }

        if (ok) {
          this.addFood(nx, ny, nowMs);
          placed = true;
        }
      }
    }
  }


  resolveCollisions() {
    const cells = this.cells;
    if (cells.length < 2) return;

    const size = this.params.gridCellSize;
    const cols = Math.ceil(this.canvas.width / size);
    const rows = Math.ceil(this.canvas.height / size);
    const grid = Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];

    // Pair de-duplication guard
    const visited = new Set();

    // Index cells
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c.alive) continue;
      const gx = Math.floor(c.x / size);
      const gy = Math.floor(c.y / size);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        grid[gy * cols + gx].push(i);
      }
    }

    const e = this.collision.restitution;
    const softR = this.collision.softRange;
    const softK = this.collision.softK;
    const lossK = this.collision.lossK;

    // Pairwise within neighborhood
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const yy = gy + dy;
          if (yy < 0 || yy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = gx + dx;
            if (xx < 0 || xx >= cols) continue;

            const a = grid[gy * cols + gx];
            const b = grid[yy * cols + xx];

            // Same cell if (dx,dy)==(0,0), but we'll handle pairs with i<j
            for (let ii = 0; ii < a.length; ii++) {
              const i = a[ii];
              for (let jj = 0; jj < b.length; jj++) {
                const j = b[jj];
                if (i >= j) continue; // avoid double / self

                const ci = cells[i], cj = cells[j];
                const key = i < j ? (i + '|' + j) : (j + '|' + i);
                if (visited.has(key)) continue;
                visited.add(key);

                if (!ci.alive || !cj.alive) continue;

                const ri = ci.genes ? ci.genes.radius : this.params.cell.radius;
                const rj = cj.genes ? cj.genes.radius : this.params.cell.radius;

                const dx = cj.x - ci.x;
                const dy = cj.y - ci.y;
                const dist = Math.hypot(dx, dy) || 1e-6;
                const nx = dx / dist, ny = dy / dist;

                const sumR = ri + rj;

                // Soft repulsion to avoid sticky jitter near contact
                if (dist < sumR * softR) {
                  const repel = (sumR * softR - dist) * softK;
                  ci.vx -= nx * repel; ci.vy -= ny * repel;
                  cj.vx += nx * repel; cj.vy += ny * repel;
                }

                if (dist >= sumR) continue; // not overlapping

                // Positional correction (split overlap)
                const overlap = sumR - dist;
                const corr = overlap * 0.5;
                ci.x -= nx * corr; ci.y -= ny * corr;
                cj.x += nx * corr; cj.y += ny * corr;

                // Elastic impulse along normal (equal mass)
                const rvx = ci.vx - cj.vx;
                const rvy = ci.vy - cj.vy;
                const vn = rvx * nx + rvy * ny; // relative normal speed
                if (vn > 0) continue; // separating already

                const jImpulse = -(1 + e) * vn / 2; // equal mass
                ci.vx += jImpulse * nx;
                ci.vy += jImpulse * ny;
                cj.vx -= jImpulse * nx;
                cj.vy -= jImpulse * ny;

                // Small energy loss proportional to impact speed
                const loss = Math.min(2, Math.abs(vn) * lossK);
                if (typeof ci.energy === 'number') ci.energy = Math.max(0, ci.energy - loss);
                if (typeof cj.energy === 'number') cj.energy = Math.max(0, cj.energy - loss);
              }
            }
          }
        }
      }
    }
  }
  killAt(x, y) {
    const rr = this.params.tools.kill.radius;
    const r2 = rr * rr;
    
    // Kill cells within radius
    for (const c of this.cells) {
      if (!c.alive) continue;
      const dx = c.x - x, dy = c.y - y;
      if (dx * dx + dy * dy <= r2) {
        // Manual kill → normal decomposition (do not set c.killed)
        c.alive = false;
      }
    }
    
    // Delete blocks within radius
    const blockSize = this.params.gridCellSize;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      // Block center
      const blockCenterX = b.x + blockSize / 2;
      const blockCenterY = b.y + blockSize / 2;
      // Distance from kill point to block center
      const dx = blockCenterX - x;
      const dy = blockCenterY - y;
      const dist2 = dx * dx + dy * dy;
      
      // Delete block if kill point is within radius of block center, or if kill point is inside block
      if (dist2 <= r2 || (x >= b.x && x <= b.x + blockSize && y >= b.y && y <= b.y + blockSize)) {
        this.blocks.splice(i, 1);
      }
    }
  }


  checkPredation(nowMs) {
    const cells = this.cells;
    if (!cells.length) return;

    // Spatial grid
    const size = this.params.gridCellSize;
    const cols = Math.ceil(this.canvas.width / size);
    const rows = Math.ceil(this.canvas.height / size);
    const grid = Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];

    // index all cells
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c.alive) continue;
      const gx = Math.floor(c.x / size);
      const gy = Math.floor(c.y / size);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        grid[gy * cols + gx].push(i);
      }
    }

    const eatF = this.predation.eatFactor;
    const biteCD = this.predation.biteCooldownMs;
    const nutrition = this.predation.nutritionPerKill;

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const bucket = grid[gy * cols + gx];
        for (let bi = 0; bi < bucket.length; bi++) {
          const i = bucket[bi];
          const pred = cells[i];
          if (!pred.alive || !(pred instanceof RedCell)) continue;
          if (nowMs - pred.lastBiteMs < biteCD) continue;
          if (pred.energy > pred.maxEnergy * 0.8) continue; // skip hunting when satiated


          // scan neighbors in 3x3 cells
          let ate = false;
          for (let dy = -1; dy <= 1 && !ate; dy++) {
            const yy = gy + dy; if (yy < 0 || yy >= rows) continue;
            for (let dx = -1; dx <= 1 && !ate; dx++) {
              const xx = gx + dx; if (xx < 0 || xx >= cols) continue;
              const neigh = grid[yy * cols + xx];
              for (let nj = 0; nj < neigh.length; nj++) {
                const j = neigh[nj];
                if (j === i) continue;
                const prey = cells[j];
                if (!prey.alive || (prey instanceof RedCell)) continue; // cannot eat reds or dead

                const ri = pred.genes ? pred.genes.radius : this.params.cell.radius;
                const rj = prey.genes ? prey.genes.radius : this.params.cell.radius;
                const dx2 = prey.x - pred.x, dy2 = prey.y - pred.y;
                const dist = Math.hypot(dx2, dy2) || 1e-6;
                const sumR = (ri + rj) * eatF;

                if (dist <= sumR) {
                  // consume prey
                  prey.alive = false;
                  prey.killed = true;
                  pred.lastBiteMs = nowMs;
                  if (typeof pred.queueDigest === 'function') {
                    const delay = (pred.genes && pred.genes.digestionDelay) ? pred.genes.digestionDelay : 250;
                    pred.queueDigest(nutrition, nowMs + delay);
                  }
                  ate = true;
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  showCustomCellModal() {
    const modal = document.getElementById("customCellModal");
    modal.hidden = false; modal.style.display = 'flex';
    modal.style.display = 'flex';
    // Update value displays
    const form = document.getElementById("customCellForm");
    const inputs = form.querySelectorAll("input[type=\"range\"]");
    inputs.forEach(input => {
      const valSpan = document.getElementById(input.id + "Val");
      if (valSpan) {
        // Format mutationRate to show as percentage
        if (input.id === "mutationRate") {
          valSpan.textContent = (parseFloat(input.value) * 100).toFixed(0) + "%";
        } else {
        valSpan.textContent = input.value;
        }
        input.addEventListener("input", () => {
          if (input.id === "mutationRate") {
            valSpan.textContent = (parseFloat(input.value) * 100).toFixed(0) + "%";
          } else {
          valSpan.textContent = input.value;
          }
        });
      }
    });
    // Handle submit
    form.onsubmit = (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const genes = {
        radius: parseFloat(formData.get("radius")),
        maxSpeed: parseFloat(formData.get("maxSpeed")),
        acceleration: parseFloat(formData.get("acceleration")),
        friction: parseFloat(formData.get("friction")),
        digestionDelay: parseInt(formData.get("digestionDelay")),
        reproThreshold: parseInt(formData.get("reproThreshold")),
        reproCost: parseInt(formData.get("reproCost")),
        childStartEnergy: parseInt(formData.get("childStartEnergy")),
        baselineBurn: parseFloat(formData.get("baselineBurn")),
        mutationRate: parseFloat(formData.get("mutationRate")) || 0.1
      };
      const type = formData.get("type");
      const color = formData.get("color");
      // Convert color to hue
      const rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      let h;
      if (!rgb) {
        h = type === "carnivore" ? 0 : 210;
      } else {
        const r = parseInt(rgb[1], 16) / 255;
        const g = parseInt(rgb[2], 16) / 255;
        const b = parseInt(rgb[3], 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) h = 0;
        else if (max === r) h = (60 * ((g - b) / (max - min)) + 360) % 360;
        else if (max === g) h = 60 * ((b - r) / (max - min)) + 120;
        else h = 60 * ((r - g) / (max - min)) + 240;
      }
      genes.customHue = h;
      // Set type
      const cellType = type === "carnivore" ? "red" : "blue";
      
      // Save custom cell configuration
      const customCell = {
        name: `Custom ${this.customCells.length + 1}`,
        genes: JSON.parse(JSON.stringify(genes)), // deep copy
        type: cellType,
        color: color,
        hue: h
      };
      this.customCells.push(customCell);
      
      // Update button text from "Create" to "Custom" after first save
      const createBtn = document.getElementById('createCellBtn');
      if (createBtn && this.customCells.length === 1) {
        createBtn.textContent = 'Custom';
      }
      
      // Spawn the cell
      this.selectedCellType = cellType;
      let x, y;
      for (let attempts = 0; attempts < 100; attempts++) {
        x = Math.random() * this.canvas.width;
        y = Math.random() * this.canvas.height;
        const cr = genes.radius;
        const overlappingCell = this.cells.some(c => {
          const dx = c.x - x, dy = c.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < c.genes.radius + cr;
        });
        const overlappingBlock = this.blocks.some(b => {
          const bx = b.x, by = b.y, bw = 24, bh = 24;
          return x + cr > bx && x - cr < bx + bw && y + cr > by && y - cr < by + bh;
        });
        if (!overlappingCell && !overlappingBlock) {
          break;
        }
      }
      if (x !== undefined) {
        this.addCell(x, y, genes);
      }
      modal.hidden = true; modal.style.display = 'none';
      modal.style.display = 'none';
    };
    // Handle cancel
    document.getElementById("cancelCreate").onclick = () => {
      modal.hidden = true;
      modal.style.display = 'none';
    };
  }

  showCustomCellList() {
    // Create or get the custom cell list modal
    let listModal = document.getElementById("customCellListModal");
    if (!listModal) {
      listModal = document.createElement('div');
      listModal.id = 'customCellListModal';
      listModal.className = 'modal-overlay';
      listModal.innerHTML = `
        <div class="modal custom-list-modal">
          <h2>Custom Cells</h2>
          <div id="customCellList" class="custom-cell-list"></div>
          <div class="modal-buttons">
            <button id="createNewCustomBtn" class="btn-primary">Create New</button>
            <button id="cancelCustomListBtn" class="btn-secondary">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(listModal);
      
      // Wire up buttons
      document.getElementById('createNewCustomBtn').onclick = () => {
        listModal.hidden = true;
        listModal.style.display = 'none';
        this.showCustomCellModal();
      };
      document.getElementById('cancelCustomListBtn').onclick = () => {
        listModal.hidden = true;
        listModal.style.display = 'none';
      };
    }
    
    // Populate the list
    const listContainer = document.getElementById('customCellList');
    listContainer.innerHTML = '';
    
    if (this.customCells.length === 0) {
      listContainer.innerHTML = '<p style="text-align: center; color: #9fb0c3; padding: 20px;">No custom cells saved yet.</p>';
    } else {
      this.customCells.forEach((customCell, index) => {
        const item = document.createElement('div');
        item.className = 'custom-cell-item';
        item.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          margin: 8px 0;
          background: #1c2530;
          border: 1px solid #2a3441;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
        item.innerHTML = `
          <div style="width: 24px; height: 24px; border-radius: 50%; background: hsl(${customCell.hue}, 80%, 60%); border: 2px solid #58a6ff;"></div>
          <div style="flex: 1;">
            <div style="font-weight: bold; color: #c8d4e0;">${customCell.name}</div>
            <div style="font-size: 12px; color: #9fb0c3;">${customCell.type === 'red' ? 'Carnivore' : 'Herbivore'} • R:${customCell.genes.radius} S:${customCell.genes.maxSpeed.toFixed(1)}</div>
          </div>
          <button class="btn-small" style="background: #3a1010; border-color: #5a1515; color: #f2c9c9;" data-index="${index}">Delete</button>
        `;
        
        // Activate spawn mode with this custom cell on click
        item.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return; // Don't activate on delete click
          this.activateCustomCellSpawn(customCell);
          listModal.hidden = true;
          listModal.style.display = 'none';
        });
        
        // Delete button
        const deleteBtn = item.querySelector('button');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.customCells.splice(index, 1);
          // Update button text if no custom cells left
          if (this.customCells.length === 0) {
            const createBtn = document.getElementById('createCellBtn');
            if (createBtn) createBtn.textContent = 'Create';
          }
          this.showCustomCellList(); // Refresh list
        });
        
        listContainer.appendChild(item);
      });
    }
    
    listModal.hidden = false;
    listModal.style.display = 'flex';
  }

  activateCustomCellSpawn(customCell) {
    // Store the selected custom cell for spawning
    this.selectedCustomCell = customCell;
    
    // Activate spawn cell mode
    this.selectedCellType = customCell.type;
    this.spawnCellMode = true;
    this.spawnFoodMode = false;
    
    // Update UI
    const spawnCellBtn = document.getElementById('spawnCellBtn');
    const spawnFoodBtn = document.getElementById('spawnFoodBtn');
    const killBtn = document.getElementById('killBtn');
    const blockBtn = document.getElementById('blockBtn');
    
    if (spawnCellBtn) {
      spawnCellBtn.classList.add('active', `type-${customCell.type}`);
      spawnCellBtn.setAttribute('aria-expanded', 'false');
    }
    if (spawnFoodBtn) spawnFoodBtn.classList.remove('active');
    if (killBtn) killBtn.classList.remove('active');
    if (blockBtn) blockBtn.classList.remove('active');
    
    const cellPanel = document.getElementById('cellPanel');
    if (cellPanel) cellPanel.hidden = true;
    
    this.canvas.classList.remove('kill-cursor');
    this.mode = 'spawn';
  }
}