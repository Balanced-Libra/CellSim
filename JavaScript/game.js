// GameManager class - handles onboarding, tutorials, and scenarios
class GameManager {
  constructor(petriDish) {
    this.dish = petriDish;
    this.tutorialStep = 0;
    this.completedTutorial = localStorage.getItem('tutorialCompleted') === 'true';
    this.currentHighlight = null;
    this.currentTooltip = null;
    this.init();
  }

  init() {
    // Check if first time visitor
    if (!this.completedTutorial && this.tutorialStep === 0) {
      this.showWelcome();
    }
  }

  showWelcome() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal welcome-modal">
        <h1>🌱 Welcome to Cell Evolution</h1>
        <p>Watch artificial life evolve before your eyes!</p>
        <p>You'll guide organisms through natural selection, watching them adapt their genes over generations.</p>
        <div class="modal-buttons">
          <button class="btn-primary" onclick="gameManager.startTutorial()">Start Tutorial</button>
          <button class="btn-secondary" onclick="gameManager.startFreePlay()">Skip to Play</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  showMainMenu() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal menu-modal">
        <h1>🌱 Cell Evolution</h1>
        <div class="scenario-grid">
          <div class="scenario-card" onclick="gameManager.loadScenario('ecosystem')">
            <h3>🌍 Full Ecosystem</h3>
            <p>Prey, predators, and evolving populations</p>
          </div>
          <div class="scenario-card" onclick="gameManager.loadScenario('peaceful')">
            <h3>☮️ Peaceful Evolution</h3>
            <p>Watch pure genetic drift with no predators</p>
          </div>
          <div class="scenario-card" onclick="gameManager.loadScenario('predator')">
            <h3>🦁 Predator Pressure</h3>
            <p>Survival of the fastest</p>
          </div>
          <div class="scenario-card" onclick="gameManager.loadScenario('empty')">
            <h3>✋ Manual Start</h3>
            <p>Start from scratch</p>
          </div>
        </div>
        <button class="btn-small" onclick="gameManager.closeMenu()">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  startTutorial() {
    this.closeModals();
    this.tutorialStep = 1;
    setTimeout(() => this.showTutorialStep(1), 300);
  }

  showTutorialStep(step) {
    const steps = {
      1: {
        title: "Welcome to Your Petri Dish",
        message: "This is your evolution chamber. Here you'll watch artificial life evolve through natural selection.",
        action: "Let's start by learning how to feed your cells",
        highlight: '#box'
      },
      2: {
        title: "Spawn Fungus",
        message: "Fungus spores land on the petri dish and grow. Cells eat the fungus to survive and reproduce. Click 'Spawn Fungus' button, then click on the canvas to place fungus spores.",
        action: "Click 'Spawn Fungus' and add some fungus spores to the canvas",
        highlight: '#spawnFoodBtn'
      },
      3: {
        title: "Auto Fungus Spawning",
        message: "The clock button (🕒) enables automatic fungus spore spawning. Click it to choose a rate (Slow/Medium/Fast). This keeps spores landing on your petri dish without manual clicking. Spores won't land inside blocks.",
        action: "Try enabling auto fungus to keep spores landing on your dish",
        highlight: '#autoFoodBtn'
      },
      4: {
        title: "Fungus Growth Rate",
        message: "The 'Grow' slider (0-5) controls how fast existing fungus spreads and grows. 0 = no growth, 5 = very fast growth. Higher values mean fungus spreads faster across the dish. When cells die, the fungus consumes them and grows more.",
        action: "Adjust the growth slider to see how it affects fungus spreading",
        highlight: '#growRate'
      },
      5: {
        title: "Spawn Cells",
        message: "Click 'Spawn Cell' to see all cell types. Blue cells are fast prey. Purple cells are larger but slower—they compete for fungus. Red cells are predators that hunt other cells (they can't eat fungus). Click 'Create' to design custom cells with unique colors, traits, and mutation rates. Saved custom cells appear in the 'Custom' button.",
        action: "Try spawning different cell types and experiment with custom cells",
        highlight: '#spawnCellBtn'
      },
      6: {
        title: "Watch Evolution Happen",
        message: "As cells eat, they gain energy. When they have enough, they reproduce with random mutations. Watch the right panel to see genetic traits evolve over generations.",
        action: "Observe how traits change as cells evolve",
        highlight: '#rightStats'
      },
      7: {
        title: "Other Tools",
        message: "The 'Block' button places walls that cells navigate around. The 'X' button (kill tool) removes cells and blocks. The 'Menu' button shows scenarios, and '?' shows help. You can freeze the petri dish, wipe everything, or use fullscreen.",
        action: "Try out the other tools and buttons",
        highlight: '#blockBtn'
      },
      8: {
        title: "You're Ready!",
        message: "You now know all the basics! Experiment with different combinations, create custom species, build mazes, and watch evolution unfold. Try the terminal for batch commands.",
        action: "Start experimenting and have fun!",
        highlight: null
      }
    };

    const tutorial = steps[step];
    if (!tutorial) {
      this.completeTutorial();
      return;
    }

    // Create highlight overlay
    if (tutorial.highlight) {
      const target = document.querySelector(tutorial.highlight);
      if (target) {
        const rect = target.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        highlight.style.cssText = `
          position: fixed;
          left: ${rect.left - 5}px;
          top: ${rect.top - 5}px;
          width: ${rect.width + 10}px;
          height: ${rect.height + 10}px;
          border: 3px solid #58a6ff;
          border-radius: 8px;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.7);
          z-index: 9998;
          pointer-events: none;
          animation: pulse 1.5s infinite;
        `;
        document.body.appendChild(highlight);
        this.currentHighlight = highlight;
      }
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'tutorial-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #0f1318;
      border: 2px solid #58a6ff;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      z-index: 9999;
      color: #c8d4e0;
    `;
    tooltip.innerHTML = `
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 8px;">Step ${step}/8</div>
      <h2 style="margin: 0 0 12px; color: #58a6ff;">${tutorial.title}</h2>
      <p style="margin: 0 0 16px;">${tutorial.message}</p>
      <p style="font-size: 13px; color: #9fb0c3; margin: 0 0 16px;">${tutorial.action}</p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${step > 1 ? '<button class="btn-small" onclick="gameManager.showTutorialStep(' + (step - 1) + ')">← Back</button>' : ''}
        <button class="btn-primary" onclick="gameManager.advanceTutorial(${step})">Next →</button>
        <button class="btn-small" onclick="gameManager.skipTutorial()" style="margin-left: auto;">Skip</button>
      </div>
    `;
    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;
  }

  advanceTutorial(currentStep) {
    if (this.currentTooltip) this.currentTooltip.remove();
    if (this.currentHighlight) this.currentHighlight.remove();
    
    // Wait a moment then show next step
    setTimeout(() => {
      this.showTutorialStep(currentStep + 1);
    }, 300);
  }

  skipTutorial() {
    this.completeTutorial();
  }

  completeTutorial() {
    this.closeModals();
    localStorage.setItem('tutorialCompleted', 'true');
    this.completedTutorial = true;
    
    // Offer to start with a scenario
    const welcomeBack = confirm("Would you like to try a pre-made scenario?");
    if (welcomeBack) {
      this.showMainMenu();
    }
  }

  loadScenario(name) {
    this.dish.wipeAll();
    
    const W = this.dish.canvas.width;
    const H = this.dish.canvas.height;
    
    setTimeout(() => {
      if (name === 'ecosystem') {
        // Balanced starting ecosystem
        this.dish.spawnRandomCells('blue', 20);
        this.dish.spawnRandomCells('purple', 10);
        this.dish.spawnRandomCells('red', 2);
        this.dish.spawnRandomFood(50);
        this.dish.autoFood.enabled = true;
        this.dish.startAutoFood();
      } else if (name === 'peaceful') {
        // No predators
        this.dish.spawnRandomCells('blue', 30);
        this.dish.spawnRandomFood(40);
      } else if (name === 'predator') {
        // High predator pressure
        this.dish.spawnRandomCells('blue', 30);
        this.dish.spawnRandomCells('red', 5);
        this.dish.spawnRandomFood(30);
      }
      
      this.closeMenu();
    }, 100);
  }

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    if (this.currentTooltip) this.currentTooltip.remove();
    if (this.currentHighlight) this.currentHighlight.remove();
  }

  closeMenu() {
    this.closeModals();
  }

  startFreePlay() {
    this.closeModals();
    localStorage.setItem('tutorialCompleted', 'true');
  }
}

// Initialize after PetriDish is created
window.gameManager = null;

