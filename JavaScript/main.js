// Main entry point - initializes the simulation
document.addEventListener('DOMContentLoaded', () => {
  // Create and start the petri dish simulation
  const simulation = new PetriDish('world', 'hud');
  
  // Make accessible globally for button callbacks
  window.simulation = simulation;
  
  // Initialize help system
  window.helpSystem = new HelpSystem();
  
  // Initialize game manager (handles onboarding/tutorials)
  window.gameManager = new GameManager(simulation);
  
  // Wire up help button
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => window.helpSystem.showHelp());
  }
});