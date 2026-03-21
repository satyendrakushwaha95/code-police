// Post-build script to fix electron module resolution
const fs = require('fs');
const path = require('path');

const mainFile = path.join(__dirname, '../dist-electron/main.js');

function fixElectronBundle() {
  if (fs.existsSync(mainFile)) {
    let content = fs.readFileSync(mainFile, 'utf-8');

    // Check if already fixed (look for the Module._load workaround)
    if (content.includes('Use null parent to force Electron\'s internal loader')) {
      console.log('✓ Electron module already fixed');
      return;
    }

    // Pattern to match the IIFE workaround that Vite generates
    const iifeWorkaroundPattern = /\/\/ WORKAROUND:[\s\S]*?const \{ app, BrowserWindow, ipcMain, dialog \} = \(\(\) => \{[\s\S]*?\}\)\(\);/;

    // Pattern to match the Module._load workaround from previous runs
    const moduleLoadPattern = /var Module = require\("module"\);[\s\S]*?var electron = _electron_raw;/;

    // Pattern to match simple require patterns
    const electronRequirePattern = /(let|const|var) electron = require\("electron"\);/;

    if (moduleLoadPattern.test(content)) {
      // Replace the old Module._load workaround with the process._linkedBinding approach
      content = content.replace(
        moduleLoadPattern,
        `// WORKAROUND: Temporarily hide node_modules/electron to force Electron's internal loader
var fs = require('fs');
var path = require('path');
var electronPkgPath = path.join(__dirname, '..', 'node_modules', 'electron');
var electronPkgTempPath = path.join(__dirname, '..', 'node_modules', '_electron_temp');
var electronMoved = false;
try {
\tif (fs.existsSync(electronPkgPath)) {
\t\tfs.renameSync(electronPkgPath, electronPkgTempPath);
\t\telectronMoved = true;
\t}
} catch (e) {}
var electron = require('electron');
if (electronMoved) {
\ttry {
\t\tfs.renameSync(electronPkgTempPath, electronPkgPath);
\t} catch (e) {}
}`
      );
    } else if (iifeWorkaroundPattern.test(content)) {
      // Replace the IIFE workaround with the process._linkedBinding approach
      content = content.replace(
        iifeWorkaroundPattern,
        `// WORKAROUND: Temporarily hide node_modules/electron to force Electron's internal loader
var fs = require('fs');
var path = require('path');
var electronPkgPath = path.join(__dirname, '..', 'node_modules', 'electron');
var electronPkgTempPath = path.join(__dirname, '..', 'node_modules', '_electron_temp');
var electronMoved = false;
try {
\tif (fs.existsSync(electronPkgPath)) {
\t\tfs.renameSync(electronPkgPath, electronPkgTempPath);
\t\telectronMoved = true;
\t}
} catch (e) {}
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
if (electronMoved) {
\ttry {
\t\tfs.renameSync(electronPkgTempPath, electronPkgPath);
\t} catch (e) {}
}`
      );
    } else if (electronRequirePattern.test(content)) {
      // Add a simple cache-clearing workaround for simple require patterns
      content = content.replace(
        electronRequirePattern,
        `// WORKAROUND: Temporarily hide node_modules/electron to force Electron's internal loader
var fs = require('fs');
var path = require('path');
var electronPkgPath = path.join(__dirname, '..', 'node_modules', 'electron');
var electronPkgTempPath = path.join(__dirname, '..', 'node_modules', '_electron_temp');
var electronMoved = false;
try {
\tif (fs.existsSync(electronPkgPath)) {
\t\tfs.renameSync(electronPkgPath, electronPkgTempPath);
\t\telectronMoved = true;
\t}
} catch (e) {}
var electron = require('electron');
if (electronMoved) {
\ttry {
\t\tfs.renameSync(electronPkgTempPath, electronPkgPath);
\t} catch (e) {}
}
const { app, BrowserWindow, ipcMain, dialog } = electron;`
      );

      fs.writeFileSync(mainFile, content);
      console.log('✓ Fixed electron module resolution in main.js');
    } else {
      console.log('⚠ Could not find electron require statement');
    }
  } else {
    console.log('⚠ main.js not found');
  }
}

// Run the fix
fixElectronBundle();

// Watch for changes if in watch mode
if (process.argv.includes('--watch')) {
  console.log('👀 Watching for changes to main.js...');

  // Wait for the directory to exist
  const watchDir = path.dirname(mainFile);
  const checkInterval = setInterval(() => {
    if (fs.existsSync(watchDir)) {
      clearInterval(checkInterval);
      fs.watch(watchDir, (eventType, filename) => {
        if (filename === 'main.js') {
          setTimeout(fixElectronBundle, 100); // Small delay to ensure file is written
        }
      });
    }
  }, 500);
}

