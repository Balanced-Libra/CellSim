# 🌱 Cell Evolution

An interactive artificial life simulation where organisms evolve through genetic mutations and natural selection in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-complete-green.svg)

[**Try It Live**](#-quick-start) | [Report Bug](https://github.com/yourusername/cell-evolution/issues)

---

## 🎮 Overview

Cell Evolution is a browser-based simulation where you can watch artificial organisms evolve over time. Cells have genetic traits that mutate when they reproduce, leading to fascinating evolutionary dynamics. Introduce competition, predators, and watch natural selection in action.

### Key Features

- 🧬 **Genetic Evolution System** - Organisms inherit and mutate 9 different genetic traits
- 🦠 **Three Species** - Blue prey, Purple tank cells, and Red predators
- 🌍 **Emergent Behavior** - Evolution emerges naturally from simulated physics
- 📊 **Real-time Analytics** - Track population and genetic trait changes over time
- 🎯 **Pre-configured Scenarios** - Jump into curated ecosystem simulations
- 📚 **Interactive Tutorial** - Learn the mechanics step-by-step
- 💻 **Terminal Interface** - Batch commands for advanced control
- 🔄 **Food System** - Budding food pellets with adjustable growth rates
- 🎨 **Beautiful UI** - Dark themed interface with live sparkline graphs

---

## 🚀 Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cell-evolution.git
cd cell-evolution
```

2. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge)

3. Start with the tutorial or jump into a pre-made scenario!

**No build tools required** - Pure vanilla JavaScript that runs directly in the browser.

---

## 🧬 How Evolution Works

Each organism has a genome containing 9 traits that control its behavior:

| Trait | Description | Range |
|-------|-------------|-------|
| **Radius** | Cell size | 4-9 pixels |
| **Max Speed** | Maximum velocity | 1.1-2.6 |
| **Acceleration** | Movement responsiveness | 0.045-0.14 |
| **Friction** | Speed decay rate | 0.93-0.99 |
| **Digestion Delay** | Time to process food | 150-1200ms |
| **Repro Threshold** | Energy needed to reproduce | 50-130 |
| **Repro Cost** | Energy lost when reproducing | 20-70 |
| **Child Start Energy** | Initial energy for offspring | 15-60 |
| **Baseline Burn** | Metabolic energy consumption | 0.8-2.0/sec |

### The Evolution Loop

1. **Food Consumption** → Cells find and eat food pellets
2. **Energy Gain** → Digestion provides energy after a delay
3. **Reproduction** → High energy triggers cell division
4. **Mutation** → Offspring genes randomly mutate using Gaussian noise
5. **Selection** → Better adapted cells survive and spread

---

## 🎯 Game Modes

### Tutorial Mode
- Step-by-step introduction to mechanics
- Guided exploration with highlighted UI elements
- Learn controls and strategies

### Scenario Mode
- **Full Ecosystem** - Balanced population of all species
- **Peaceful Evolution** - Watch genetic drift without predators
- **Predator Pressure** - High-stakes survival challenge
- **Manual Start** - Create your own experiments

### Terminal Commands

Access the mini terminal for advanced control:

```bash
spawn blue 50       # Spawn 50 blue cells
spawn purple 30     # Spawn 30 purple cells
spawn red 5         # Spawn 5 predators
spawn food 100      # Add 100 food pellets
grow rate 3         # Set food growth rate (0-5)
auto food 2         # Enable auto-spawn (1-3)
wipe               # Clear everything
wipe food          # Remove all food
wipe blue          # Remove specific species
help               # Show all commands
```

---

## 🛠️ Technical Implementation

### Core Mechanics

#### Physics Simulation
- **Spatial Partitioning** - Grid-based collision detection for O(n) performance with 100+ entities
- **Elastic Collisions** - Realistic cell-to-cell interactions with energy loss
- **Soft Repulsion** - Prevents jitter near contact using spring forces
- **Boundary Collisions** - Cells bounce off walls with velocity reflection

#### Genetic Algorithm
- **Gaussian Mutation** - Gene changes follow normal distribution
- **Trait Clamping** - Mutations constrained to realistic biological ranges
- **No Hardcoded Behavior** - Phenotype emerges purely from genotype
- **Color Expression** - Visual hue derived from genetic signature

#### Evolution System
- **Digestion Queue** - Realistic food processing with delays
- **Energy Management** - Metabolic costs scale with speed and size
- **Reproduction Cooldown** - Prevents explosion of single cell type
- **Corpse System** - Dead cells decompose and release nutrients

### Performance Optimizations

- **Spatial Grid** - Reduces collision checks from O(n²) to O(n)
- **RequestAnimationFrame** - Smooth 60fps rendering
- **Debounced Drawing** - Prevents excessive cell spawning during drag
- **Memory Management** - Entities cleaned up immediately on death

### Architecture

```
📁 Project Structure
├── 📄 index.html           # Main HTML structure
├── 📁 CSS/
│   └── styles.css          # Complete UI styling (730+ lines)
├── 📁 JavaScript/
│   ├── main.js            # Entry point & initialization
│   ├── game.js            # Tutorial & scenario system
│   ├── help.js            # Help documentation
│   ├── 📁 petriDish/
│   │   └── petriDish.js   # Core simulation engine (1500+ lines)
│   ├── 📁 blueCell/
│   │   └── blueCell.js    # Prey species implementation
│   ├── 📁 purpleCell/
│   │   └── purpleCell.js  # Tank species implementation
│   └── 📁 redCell/
│       └── redCell.js     # Predator species implementation
└── 📄 README.md            # This file
```

---

## 🎨 User Interface

### Left Panel - Population
- Live population counters for each species
- Percentage-based meter visualization
- Sparkline graphs showing population trends over time (180 data points)

### Right Panel - Genetics
- Average trait values for each species
- Normalized bar charts for easy comparison
- Real-time evolution tracking across 9 different traits

### Controls
- **Spawn Food/Cells** - Click to add entities
- **Kill Tool** - Eraser mode to remove cells
- **Auto Food** - Automatic food spawning at configurable rates
- **Growth Slider** - Control passive food budding
- **Pause/Play** - Freeze simulation
- **Fullscreen** - Immersive mode
- **Wipe** - Clear all entities
- **Help** - Detailed documentation

---

## 🔬 Scientific Inspiration

While simplified for gameplay, the simulation implements key biological concepts:

- ✅ **Natural Selection** - Environment pressures shape gene frequencies
- ✅ **Mutation Rate** - Controlled genetic variation (~4-12% per gene)
- ✅ **Trade-offs** - Speed vs. size vs. energy efficiency
- ✅ **Predator-Prey Dynamics** - Classic ecological interactions
- ✅ **Genetic Drift** - Random changes in small populations
- ✅ **Phenotype-Genotype Relationship** - Genes directly affect behavior

---

## 🌐 Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

**Note**: Requires modern JavaScript (ES6+) and Canvas API support.

---

## 📝 Features Roadmap

Potential enhancements for future versions:

- [ ] Save/Load ecosystem states
- [ ] Genetic lineage visualization (family trees)
- [ ] Export evolution data as CSV/JSON
- [ ] Multiplayer competitive modes
- [ ] Additional species types
- [ ] Environmental challenges (toxins, zones)
- [ ] Networked cellular automata
- [ ] WebGL acceleration for 1000+ cell populations

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- Performance optimization for larger populations
- Additional species behaviors
- UI/UX enhancements
- Documentation improvements
- Bug fixes and edge cases

---

## 📄 License

MIT License - feel free to use this project for learning or inspiration!

```text
Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👨‍💻 Author

Built as a passion project exploring artificial life, genetic algorithms, and real-time simulation.

**Connect**: [GitHub](https://github.com/yourusername) | [Portfolio](https://yourwebsite.com)

---

## ⚠️ Disclaimer

This is an educational simulation, not accurate biological modeling. For scientific research, consult peer-reviewed sources.

**Enjoy watching life evolve! 🌱➡️🧬**

