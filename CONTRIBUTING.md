# Contributing to OpenCluely

Thank you for your interest in contributing to **OpenCluely**! OpenCluely is an open-source, stealth desktop copilot for technical interviews and live meetings. We welcome all contributions—from bug fixes and documentation improvements to new AI providers and architectural enhancements.

---

## 🌟 How You Can Contribute

* **Add New AI Model Providers:** Expand support for local LLMs (Ollama, LM Studio), Groq, or specialized coding APIs.
* **Audio & STT Improvements:** Enhance cross-platform audio capture (macOS CoreAudio, Linux PipeWire) and offline transcription models.
* **UI/UX Polish:** Improve teleprompter aesthetics, customizable themes, and responsiveness.
* **Testing & Verification:** Expand unit test coverage (`test/*.test.js`) and cross-platform verification.
* **Documentation & Guides:** Improve setup instructions, interview etiquette best practices, and troubleshooting tips.

---

## 🛠️ Development Setup

### 1. Prerequisites
- **Node.js:** `20.x` (Recommended: `20.20.1`)
- **Package Manager:** `npm` (v10+)
- **OS:** Windows 10/11 (macOS and Linux support in progress)
- **Optional Tools:** [Antigravity CLI](https://antigravity.google) for zero-key Gemini 3.8 Flash Low streaming.

### 2. Fork and Clone
```bash
# Fork the repository on GitHub: https://github.com/TechyCSR/OpenCluely
git clone https://github.com/<your-username>/OpenCluely.git
cd OpenCluely
```

### 3. Install Dependencies
```powershell
npm ci
Copy-Item .env.example .env
```

### 4. Run Locally
```powershell
# Launch in development mode with logging
npm run dev

# Or launch standard
npm start
```

### 5. Run the Test Suite
```powershell
$env:NODE_ENV="test"; npm test
```
*All tests must pass before opening a Pull Request.*

---

## 📐 Architecture & Principles

When contributing to OpenCluely, please adhere to these core architectural principles:

1. **Hardware Anti-Capture (`WDA_EXCLUDEFROMCAPTURE`):**
   - All overlay windows must maintain `setContentProtection(true)` on Windows.
   - Windows must have `resizable: false` to prevent Windows DWM from drawing native resize borders, margins, or Aero Snap preview rectangles during screen share.
2. **Strict Universal Cursor Invisibility:**
   - The mouse cursor must NEVER switch to a hand (`cursor: pointer`), crosshair, or double-sided resize arrow (`cursor: ew-resize`, etc.).
   - All clickable elements and drag handles must strictly enforce `cursor: default !important;`.
3. **Single Source of Truth Configuration:**
   - Shortcuts, models, and languages must be defined in `src/config.js`.
4. **Process Boundary Separation:**
   - Keep a clean separation between the Electron main process (`src/main-process/`), preload bridges (`src/windows/*/preload/`), and renderer modules (`src/windows/*/renderer/`).
   - Renderers must communicate exclusively through typed IPC APIs.

---

## 🚀 Submitting a Pull Request

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Make Clean, Atomic Commits:**
   Follow Conventional Commits format:
   - `feat: add groq provider support`
   - `fix: prevent focus theft on mouse click`
   - `docs: update setup walkthrough`
3. **Verify Everything:**
   - Run `npm test`
   - Verify syntax: `Get-ChildItem -Path src, test -Filter *.js -Recurse | ForEach-Object { node -c $_.FullName }`
4. **Push and Open a PR:**
   - Open a Pull Request against `main` on [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely).
   - Fill out the PR template describing your changes, motivation, and verification steps.

---

## 💬 Community & Support

- **Repository:** [https://github.com/TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely)
- **Maintainer:** [@TechyCSR](https://github.com/TechyCSR)
- **Issues:** [Report Bugs or Request Features](https://github.com/TechyCSR/OpenCluely/issues)

Thank you for helping make OpenCluely the #1 open-source interview assistant!
