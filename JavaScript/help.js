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
          <li><strong>Spawn Fungus:</strong> Click button, then click canvas to place fungus spores</li>
          <li><strong>Spawn Cells:</strong> Choose type (Blue/Purple/Red/Custom), then click canvas</li>
          <li><strong>Kill Tool:</strong> Eraser icon (X) to remove cells and blocks</li>
          <li><strong>Block Tool:</strong> Place walls and obstacles. Hold and drag to place multiple blocks</li>
          <li><strong>Auto Fungus:</strong> Clock icon (🕒) for automatic fungus spore spawning at selected rate</li>
          <li><strong>Growth Rate:</strong> Slider controls how fast fungus naturally spreads and grows</li>
          <li><strong>Freeze:</strong> Freeze/unfreeze the petri dish to pause the experiment</li>
        </ul>
        
        <h3>🍄 Fungus System</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Spores Landing:</strong> Fungus spores land on the petri dish and grow into fungus patches</li>
          <li><strong>Manual Spawning:</strong> Click "Spawn Fungus" button, then click on canvas to place fungus spores</li>
          <li><strong>Auto Spawning:</strong> Click clock button (🕒) and choose Slow (3s), Medium (2s), or Fast (1s) rate for automatic spore landing</li>
          <li><strong>Growth Meter:</strong> The "Grow" slider (0-5) controls how fast existing fungus spreads and grows. 0 = no growth, 5 = very fast growth. The number next to the slider shows the current rate</li>
          <li><strong>Natural Growth:</strong> Existing fungus spreads over time based on the growth rate setting</li>
          <li><strong>Cell Consumption:</strong> Cells eat fungus immediately but digest it over time (digestion delay trait)</li>
          <li><strong>Dead Cell Consumption:</strong> When cells die, the fungus consumes their remains and grows more fungus</li>
          <li><strong>Block Interaction:</strong> Fungus spores won't land or grow inside blocks. Placing a block on fungus deletes it</li>
        </ul>
        
        <h3>🧱 Building Walls</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Place Blocks:</strong> Click "Block" button, then click on canvas to place walls</li>
          <li><strong>Drag to Place:</strong> Hold mouse button and drag to place multiple blocks in a line</li>
          <li><strong>Cell Navigation:</strong> Cells detect walls and navigate around them to reach food</li>
          <li><strong>Remove Blocks:</strong> Use the kill tool (X button) to remove blocks</li>
          <li><strong>Fungus Interaction:</strong> Blocks prevent fungus spores from landing or growing inside them</li>
        </ul>
        
        <h3>🧬 How Evolution Works</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li>Cells eat fungus → gain energy</li>
          <li>Energy above threshold → reproduction</li>
          <li>Offspring inherit parent genes + random mutations</li>
          <li>Better genes survive and spread</li>
          <li>Dead cells are consumed by fungus, which grows more</li>
        </ul>
        
        <h3>🌍 Species</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Blue:</strong> Fast prey cells</li>
          <li><strong>Purple:</strong> Larger, tankier prey</li>
          <li><strong>Red:</strong> Predators that hunt other cells (they can't eat fungus)</li>
          <li><strong>Custom:</strong> Create your own cell species with custom traits, colors, and mutation rates</li>
        </ul>
        
        <h3>🧪 Custom Cells</h3>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Creating:</strong> Click "Spawn Cell" → "Create" button to open the custom cell editor</li>
          <li><strong>Design:</strong> Set color, type (herbivore/carnivore), mutation rate, and all genetic traits (radius, speed, acceleration, etc.)</li>
          <li><strong>Saving:</strong> After creating, your custom cell is saved and appears in the "Custom" button (replaces "Create" after first save)</li>
          <li><strong>Spawning:</strong> Click "Spawn Cell" → "Custom" to see your saved cells. Select one to spawn it</li>
          <li><strong>Evolution:</strong> Custom cells evolve just like regular species, with mutations based on the mutation rate you set</li>
          <li><strong>Dashboard:</strong> Custom cells appear in the stats panel with their own color and trait meters</li>
          <li><strong>Mutation Rate:</strong> Controls how much traits (including color) mutate in offspring. 0 = no mutation, 1 = high mutation. This trait is inheritable</li>
        </ul>
        
        <h3>💻 Terminal Commands</h3>
        <pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 4px; font-size: 12px; margin: 0 0 20px;">
spawn blue 50       # Spawn 50 blue cells
spawn food 100      # Spawn 100 fungus spores
grow rate 3         # Set fungus growth rate (0-5)
wipe               # Clear everything
auto food 2        # Enable auto fungus (1-3)</pre>
        
        <button class="btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Got It!</button>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

// Initialize help system
window.helpSystem = null;

