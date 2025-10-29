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
    } else if (this.completedTutorial) {
      this.showMainMenu();
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
        message: "This is your evolution chamber. Click anywhere to add blue cells.",
        action: "Click the canvas to spawn your first blue cell",
        highlight: '#box'
      },
      2: {
        title: "Feed Your Cells",
        message: "Click 'Spawn Food' then click on the canvas to add food pellets. Cells need energy to survive.",
        action: "Add some food and watch them eat",
        highlight: '#spawnFoodBtn'
      },
      3: {
        title: "Watch Evolution Happen",
        message: "As cells eat, they gain energy. When they have enough, they reproduce with random mutations.",
        action: "Watch the right panel to see genetic traits evolve",
        highlight: '#rightStats'
      },
      4: {
        title: "Add Competition",
        message: "Purple cells are larger but slower. Click 'Spawn Cell', choose purple.",
        action: "Introduce a second species to your ecosystem",
        highlight: '#spawnCellBtn'
      },
      5: {
        title: "Add Predators",
        message: "Red cells hunt other cells! They can't eat food pellets—only other creatures.",
        action: "Add some predators and watch the food chain",
        highlight: '#spawnCellBtn'
      },
      6: {
        title: "Experiment!",
        message: "You can pause, wipe everything, or use fullscreen. Try the terminal for batch commands.",
        action: "You're ready to explore on your own!",
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
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 8px;">Step ${step}/6</div>
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

