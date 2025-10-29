// HelpSystem class - provides in-game help and documentation
class HelpSystem {
  showHelp() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal help-modal">
        <h1>📚 How to Play</h1>
        
        <h3>🎮 Controls</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Spawn Food:</strong> Click button, then click canvas</li>
          <li><strong>Spawn Cells:</strong> Choose type, then click canvas</li>
          <li><strong>Kill Tool:</strong> Eraser icon to remove cells</li>
          <li><strong>Auto Food:</strong> Clock icon for automatic spawning</li>
          <li><strong>Growth Rate:</strong> Slider controls food budding rate</li>
        </ul>
        
        <h3>🧬 How Evolution Works</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li>Cells eat food → gain energy</li>
          <li>Energy above threshold → reproduction</li>
          <li>Offspring inherit parent genes + random mutations</li>
          <li>Better genes survive and spread</li>
        </ul>
        
        <h3>🌍 Species</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Blue:</strong> Fast prey cells</li>
          <li><strong>Purple:</strong> Larger, tankier prey</li>
          <li><strong>Red:</strong> Predators that hunt other cells</li>
        </ul>
        
        <h3>💻 Terminal Commands</h3>
        <pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; font-size: 12px; margin: 0 0 20px;">
spawn blue 50       # Spawn 50 blue cells
spawn food 100      # Spawn 100 food pellets
grow rate 3         # Set food growth rate (0-5)
wipe               # Clear everything
auto food 2        # Enable auto food (1-3)</pre>
        
        <button class="btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Got It!</button>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

// Initialize help system
window.helpSystem = null;

