const path = require('path');
const { BrowserWindow } = require('electron');

function createQaHistoryWindow({
  app,
  screen,
  hideFromScreenCapture = true,
  initialOpacity = 1,
  initialClickThrough = false,
  onClosed
}) {
  console.log('Creating stealth Q&A History companion window...');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(680, width - 40);
  const windowHeight = Math.min(640, height - 60);

  // Position on the right side of the screen by default
  const x = Math.max(20, width - windowWidth - 20);
  const y = 50;

  const qaWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 420,
    minHeight: 320,
    maxWidth: width,
    maxHeight: height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    focusable: true,
    show: false,
    opacity: Number.isFinite(initialOpacity) ? initialOpacity : 1,
    type: 'toolbar',
    acceptFirstMouse: false,
    disableAutoHideCursor: true,
    enableLargerThanScreen: false,
    hasShadow: false,
    thickFrame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      offscreen: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: false,
      enableRemoteModule: false,
      sandbox: false
    }
  });

  const htmlPath = path.join(__dirname, 'renderer.html');
  qaWindow.loadFile(htmlPath);

  // Apply OS stealth properties identical to the main window
  if (process.platform === 'darwin') {
    qaWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    qaWindow.setAlwaysOnTop(true, 'pop-up-menu', 1);
    if (app && app.dock) {
      app.dock.hide();
    }
    qaWindow.setHiddenInMissionControl(true);
  } else if (process.platform === 'win32') {
    console.log('Applying Windows stealth & anti-capture settings to Q&A window');
    qaWindow.setSkipTaskbar(true);
    qaWindow.setAlwaysOnTop(true, 'pop-up-menu');
    qaWindow.setAppDetails({
      appId: 'SystemProcess',
      appIconPath: '',
      relaunchCommand: '',
      relaunchDisplayName: ''
    });
  }

  // WDA_EXCLUDEFROMCAPTURE: 100% invisible to all screen recorders, Zoom, Google Meet, Teams, Discord, OBS
  qaWindow.setContentProtection(true);

  // Display stealthily without stealing focus from interviewer's meeting
  qaWindow.once('ready-to-show', () => {
    qaWindow.showInactive();
    if (initialClickThrough) {
      try {
        qaWindow.setIgnoreMouseEvents(true, { forward: true });
        if (qaWindow.webContents && !qaWindow.webContents.isDestroyed()) {
          qaWindow.webContents.send('set-click-through-mode', true);
        }
      } catch (err) {}
    }
    console.log('Q&A History companion window displayed stealthily (showInactive)');
  });

  qaWindow.on('closed', () => {
    if (typeof onClosed === 'function') {
      onClosed();
    }
  });

  return qaWindow;
}

module.exports = {
  createQaHistoryWindow
};
