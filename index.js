const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  shell,
  nativeTheme,
} = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store();
let tray, mainWindow;
const iconPath = path.join(__dirname, "icon.icns");
const appName = "Google Messages";

function exec(code) {
  return mainWindow.webContents.executeJavaScript(code).catch(console.error);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = store.get(
    "windowWidth",
    Math.min(1200, Math.round(width * 0.8)),
  );
  const winHeight = store.get(
    "windowHeight",
    Math.min(900, Math.round(height * 0.8)),
  );

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: store.get("windowX"),
    y: store.get("windowY"),
    frame: true,
    maximizable: true,
    minimizable: true,
    resizable: true,
    center: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
    },
    icon: iconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1c1c" : "#ffffff",
  });

  mainWindow.loadURL("https://messages.google.com/web/conversations");

  mainWindow.webContents.on("did-finish-load", optimizePage);

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("resize", () => {
    const [width, height] = mainWindow.getSize();
    store.set("windowWidth", width);
    store.set("windowHeight", height);
  });

  mainWindow.on("move", () => {
    const [x, y] = mainWindow.getPosition();
    store.set("windowX", x);
    store.set("windowY", y);
  });

  setupNotifications();
}

function setupNotifications() {
  exec(`
    const originalNotification = Notification;
    Notification = function(title, options) {
      const notification = new originalNotification(title, options);
      notification.addEventListener('click', () => {
        window.postMessage({ type: 'NOTIFICATION_CLICK' }, '*');
      });
      return notification;
    };
    Notification.requestPermission = originalNotification.requestPermission;
    Notification.permission = originalNotification.permission;
  `);

  mainWindow.webContents.on("ipc-message", (event, channel) => {
    if (channel === "NOTIFICATION_CLICK") {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function optimizePage() {
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  exec(`
    const style = document.createElement('style');
    style.textContent = \`
      body { 
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      /* Add custom styles for better native feel */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, ${isDarkMode ? "0.5" : "0.3"});
        border-radius: 4px;
      }
      ::-webkit-scrollbar-track {
        background-color: transparent;
      }
    \`;
    document.head.appendChild(style);

    // Implement custom behaviors or optimizations here
    console.log('Page optimized for ${appName} Desktop');
  `);
}

function toggleWindow() {
  if (mainWindow.isVisible()) mainWindow.hide();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray() {
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show/Hide Window", click: toggleWindow },
    { type: "separator" },
    { label: "Check for Updates", click: checkForUpdates },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip(appName);
  tray.setContextMenu(contextMenu);
  tray.on("click", toggleWindow);
}

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Check for Updates", click: checkForUpdates },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: () =>
            shell.openExternal("https://messages.google.com/web/conversations"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+M", toggleWindow);
}

function checkForUpdates() {
  // Implement update checking logic here
  console.log("Checking for updates...");
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  createMenu();
  setupShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });

  // Set up dock menu
  if (process.platform === "darwin") {
    app.dock.setMenu(
      Menu.buildFromTemplate([
        { label: "Show/Hide Window", click: toggleWindow },
      ]),
    );
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

nativeTheme.on("updated", () => {
  mainWindow.setBackgroundColor(
    nativeTheme.shouldUseDarkColors ? "#1c1c1c" : "#ffffff",
  );
  optimizePage();
});

ipcMain.handle("get-local-storage", (event, key) => {
  return store.get(key);
});

ipcMain.on("set-local-storage", (event, key, value) => {
  store.set(key, value);
});
