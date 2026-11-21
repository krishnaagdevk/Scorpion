<div align="center">

# 🕵️‍♂️ OpenCluely 2.0
### The Ultimate Open-Source AI Interview Copilot & Live Meeting Assistant

[![GitHub stars](https://img.shields.io/github/stars/TechyCSR/OpenCluely?style=for-the-badge&logo=github&color=38bdf8)](https://github.com/TechyCSR/OpenCluely/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/TechyCSR/OpenCluely?style=for-the-badge&logo=github&color=a855f7)](https://github.com/TechyCSR/OpenCluely/network)
[![GitHub issues](https://img.shields.io/github/issues/TechyCSR/OpenCluely?style=for-the-badge&color=22c55e)](https://github.com/TechyCSR/OpenCluely/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

**Undetectable on Zoom, Google Meet, Teams & WebRTC Screen Shares.**  
Powered by **Google Antigravity (Gemini 3.8 Flash Low)**, **AssemblyAI Streaming STT**, **Windows Native Speech**, and an intelligent **Dual-Window Teleprompter**.

[Features](#-key-superpowers) • [Why OpenCluely?](#-why-opencluely-comparison) • [Shortcuts](#-global-keyboard-shortcuts) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Contributing](#-contributing)

---

<img width="1137" alt="OpenCluely HUD & Teleprompter Interface" src="https://github.com/user-attachments/assets/b9250f36-5623-45da-ab8e-8265ee079e92" />
<img width="1137" alt="OpenCluely Q&A Teleprompter & Code Solver" src="https://github.com/user-attachments/assets/68c14d18-fcb3-4ee5-9f98-d137b744156e" />

</div>

---

## ⚡ Why OpenCluely? (Comparison)

| Feature | **OpenCluely 2.0** | Cluely | Parakeet AI | FinalRound AI |
| :--- | :---: | :---: | :---: | :---: |
| **Pricing** | **100% Free & Open-Source** | $20 / month | Paid Subscription | $99 / month |
| **Zero-Cost AI Engine** | **✅ Antigravity CLI (Free Unlimited Gemini 3.8 Flash)** | ❌ Paid API required | ❌ Proprietary backend | ❌ Cloud credits |
| **Screen Share Anti-Capture** | **✅ Hardware Invisibility (`WDA_EXCLUDEFROMCAPTURE`)** | Partial | Partial | ⚠️ Watermarked |
| **Live Coding "Ghost Mode"** | **✅ `Alt+Shift+P` (Click & Type through HUD into VS Code)** | ❌ Window blocks IDE | ❌ Manual repositioning | ❌ Manual window management |
| **DWM Resize Border Suppression** | **✅ Zero DWM Margin Rectangles (`resizable: false`)** | ❌ DWM frames visible | ❌ Native border lines | ❌ OS border movement |
| **Strict Cursor Invisibility** | **✅ Universal Default Arrow Only (No pointer/resize arrows)** | ❌ Cursor reveals actions | ❌ Hand pointer visible | ❌ Double-arrow visible |
| **Dual-Window Teleprompter** | **✅ Separate Clean Companion Window with 1-Click Recall** | ❌ Cluttered main window | ⚠️ Single overlay | ⚠️ Web dashboard |
| **Offline STT Speech Fallback** | **✅ Windows Native Speech & Vosk (No API key needed)** | ❌ Cloud only | ❌ Cloud only | ❌ Cloud only |
| **Mobile Remote Companion** | **✅ Built-in Web Server (`:7823`) for discreet phone control** | ❌ Desktop only | ❌ Desktop only | ⚠️ Companion app |

---

## 🚀 Key Superpowers

### 👻 1. Live Coding "Ghost Mode" (`Alt+Shift+P`)
* **The Problem:** In technical interviews, interviewers ask you to open VS Code, Notepad, or a terminal. Floating overlay windows normally swallow your clicks and prevent you from typing or selecting code. Resizing or moving windows on screen share looks suspicious.
* **The Solution:** Press `Alt+Shift+P` to activate **Ghost Mode**. Both OpenCluely windows immediately pass all mouse clicks and keyboard typing straight through to VS Code underneath! You can read AI code solutions floating translucently on your screen while typing in your editor as if using an augmented reality HUD.

### 🪟 2. Dual-Window Teleprompter Companion (`Alt+Shift+Q`)
* Keeps your primary meeting controls minimal while routing all interview questions and answers to a dedicated **Q&A Companion Window**.
* **Visual Teleprompter Parsing:** Automatically extracts the target question, highlights a concise **"Say This"** speech box, tags Time & Space complexity ($O(N)$, $O(1)$), and formats runnable code blocks with 1-click clipboard copy.
* **Instant Redo/Recall Buffer:** Remove questions with one click without annoying confirmation dialogs, and restore them anytime with the instant undo/redo buffer (`↺ Recall`).

### ⚡ 3. Antigravity CLI Integration (Zero-Key Gemini 3.8 Flash Low)
* Seamlessly connects to your locally authenticated **Google Antigravity CLI** (`agy.exe`).
* Provides **blazing-fast, streaming answers** using `gemini-3.8-flash-low` with **zero paid Gemini API keys required**.
* Also supports OpenAI Codex, Claude Code, and fallback to direct Google Generative AI API keys.

### 🛡️ 4. 100% Screen Share Invisibility & Borderless Stealth
* **OS-Level Capture Exclusion:** Hardware-level protection hides both windows from Zoom, Google Meet, Microsoft Teams, Slack, Discord, and WebRTC screen sharing.
* **No DWM Resize Margins:** Windows OS borders are strictly disabled (`resizable: false`). Window dragging and resizing are handled 100% programmatically via IPC, preventing Windows Desktop Window Manager from drawing resize frames, margins, or Aero Snap rectangles on screen share.
* **Universal Strict Arrow Cursor:** Every button, handle, and drag area enforces `cursor: default !important;`. The mouse cursor never changes to a pointing hand or double-sided resize arrow, ensuring viewers see only a natural arrow cursor.

### 📱 5. Mobile Companion (`:7823`)
* Runs a local HTTP + WebSocket server exposing a clean mobile interface.
* Control the assistant entirely from your smartphone: trigger stealth screenshots, ask AI, or check solutions without moving your mouse on the desktop!

### 🩺 6. Pre-Flight System Readiness Diagnostics
* 1-click automated diagnostic check verifying:
  1. Antigravity CLI status & model connectivity
  2. Windows Display Protection (`WDA_EXCLUDEFROMCAPTURE`)
  3. Audio loopback & microphone permissions
  4. Speech-to-text fallback engines
  5. Workspace & cache integrity

---

## ⌨️ Global Keyboard Shortcuts

All shortcuts are globally registered and customizable in `src/config.js`:

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt+Shift+P`** | **Toggle Ghost Mode** | **Pass mouse clicks & typing directly to VS Code / Notepad through HUD** |
| **`Alt+Shift+D`** | **Dock to Top** | **Snap HUD into a slim 34px ribbon above your code editor** |
| **`Alt+Shift+Q`** | **Toggle Q&A Window** | **Show/hide the secondary teleprompter companion window** |
| **`Alt+Shift+A`** | **Ask AI** | **Generate full-depth answer from transcript, context, & screenshots** |
| **`Alt+Shift+E`** | **Screen AI** | **Analyze enabled screen captures (code questions, LeetCode, diagrams)** |
| **`Alt+Shift+G`** | **Suggest** | **Generate immediate 2–4 sentence speakable answer for the current topic** |
| **`Alt+Shift+N`** | **Meeting Notes** | **Generate structured meeting summary, decisions, and action items** |
| **`Alt+Shift+H`** | **Toggle Stealth** | **Switch opacity between visible mode and deep stealth mode** |
| **`Alt+Shift+X`** | **Emergency Hide** | **Instantly drop window opacity to 1% in an emergency** |
| **`Alt+Shift+1`..`4`** | **Size Presets** | **Instantly resize HUD without using the mouse** |
| **`Alt+Shift+Left/Right/Up/Down`** | **Reposition HUD** | **Move overlay to different screen quadrants** |

---

## 🛠️ Quick Start

### Prerequisites
- **OS:** Windows 10/11 (64-bit)
- **Node.js:** `20.x` (Recommended: `20.20.1`)
- **npm:** `10+`

### Installation

```powershell
# 1. Clone repository
git clone https://github.com/TechyCSR/OpenCluely.git
cd OpenCluely

# 2. Install dependencies
npm ci

# 3. Copy environment configuration
Copy-Item .env.example .env
```

### Run in Development

```powershell
# Standard launch
npm start

# Development mode with full logging
npm run dev

# Background start mode
npm run start:hidden
```

### Build Standalone Executable (Recommended for Daily Use)

For everyday interviews, build the stealth portable `.exe`:

```powershell
npm run build:win
```

This packages the entire application into a single standalone executable at:
```text
dist/GoogleChrome.exe
```
*(The binary is intentionally disguised as Google Chrome to prevent process inspection or task manager curiosity).*

---

## 📂 Project Architecture

```text
src/
├── bootstrap/             Environment loading, validation, and persistence
├── config.js              Central source of truth (models, languages, shortcuts)
├── main-process/          Electron lifecycle, IPC registration, stealth window management
│   ├── features/
│   │   ├── assistant/     Main HUD IPC handlers & state bridge
│   │   ├── mobile-server/ Remote mobile companion server (port 7823)
│   │   ├── qa-history/    Secondary Q&A companion window controller & persistence
│   │   ├── screenshot/    Hardware anti-capture screenshot manager
│   │   └── window/        Stealth window controller & pass-through event router
├── services/
│   ├── ai/                Antigravity service, Gemini streaming, prompt engineering
│   ├── assembly-ai/       Streaming STT service with Windows Speech fallback
│   ├── ocr/               Image parsing and supplemental context extractor
│   ├── state/             Encrypted session state persistence
│   └── system/            Pre-flight system readiness diagnostic suite
└── windows/
    ├── assistant/         Main compact HUD interface (HTML/CSS/JS + Preload)
    └── qa-history/        Dedicated Q&A Teleprompter Companion window (HTML/CSS/JS)
```

---

## 🤝 Contributing

We welcome contributions from developers worldwide! Whether you want to add new AI providers, improve cross-platform audio support, or refine the teleprompter UI, check out our [Contributing Guide](CONTRIBUTING.md).

1. Fork [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely)
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Ensure tests pass (`npm test`)
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feat/amazing-feature`)
6. Open a Pull Request

---

## 👤 Author & Maintainer

**TechyCSR (Tushar)**
- **GitHub:** [@TechyCSR](https://github.com/TechyCSR)
- **Repository:** [https://github.com/TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely)

*If this project helped you crack your technical interview or ace your live meeting, please give it a ⭐ star on GitHub!*

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TechyCSR/OpenCluely&type=Date)](https://star-history.com/#TechyCSR/OpenCluely&Date)

---

## ⚖️ License & Disclaimer

Distributed under the **MIT License**. See `LICENSE` for details.

> **Disclaimer:** OpenCluely is designed as an assistive productivity tool for meetings, mock interviews, and technical preparation. Please ensure you comply with all local laws, platform terms of service, and company policies regarding audio recording and AI assistance.
