'use strict';

// --- Helper Functions ---

async function saveReloadState(tabId, seconds) {
  const key = `reload_${tabId}`;
  if (seconds > 0) {
    await chrome.storage.local.set({ [key]: { tabId, seconds } });
  } else {
    await chrome.storage.local.remove(key);
  }
}

async function getReloadState(tabId) {
  const key = `reload_${tabId}`;
  const result = await chrome.storage.local.get(key);
  return result[key];
}

function secondsToBadgeText(seconds) {
  if (seconds === 0) return '';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return hours + 'h';
  if (minutes > 0) return minutes + 'm';
  return seconds + 's';
}

// Safely update badge. If the tab is gone, ignore the error.
function updateBadge(tabId, text, color = '#204a87') {
  // We use the callback form to catch 'runtime.lastError' which avoids the "Uncaught" error in console
  chrome.action.setBadgeText({ text: text || '', tabId: tabId }, () => {
    const err = chrome.runtime.lastError; // Accessing this clears the error
    if (err) {
        // Optional: console.log("Badge update ignored for closed tab");
    }
  });
  
  chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId }, () => {
    const err = chrome.runtime.lastError; 
  });
}

// --- Core Logic ---

async function setReload(tabId, seconds) {
  await clearReload(tabId, false); // Pass false to say "don't skip badge update"

  if (seconds > 0) {
    let periodInMinutes = seconds / 60;
    if (periodInMinutes < 1) {
        // V3 Alarms minimum is 1 minute.
        periodInMinutes = 1; 
    }

    chrome.alarms.create(tabId.toString(), { periodInMinutes: periodInMinutes });
    await saveReloadState(tabId, seconds);
    updateBadge(tabId, secondsToBadgeText(seconds));
  }
}

// Added skipBadgeUpdate parameter for when we know the tab is closed
async function clearReload(tabId, skipBadgeUpdate = false) {
  await chrome.alarms.clear(tabId.toString());
  await saveReloadState(tabId, 0); 
  
  if (!skipBadgeUpdate) {
      updateBadge(tabId, '');
  }
}

// --- Event Listeners ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const tabId = parseInt(alarm.name);
  if (!isNaN(tabId)) {
    try {
      // Check if tab exists
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        chrome.tabs.reload(tabId);
      }
    } catch (error) {
      // Tab doesn't exist anymore. Clean up.
      // We pass 'true' to skip updating the badge, because the tab is gone.
      clearReload(tabId, true);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.command === 'setReload') {
      await setReload(request.tabId, request.seconds);
      sendResponse({ status: 'active' });
    } 
    else if (request.command === 'clearReload') {
      await clearReload(request.tabId);
      sendResponse({ status: 'cleared' });
    }
    else if (request.command === 'getReload') {
      const state = await getReloadState(request.tabId);
      sendResponse({ seconds: state ? state.seconds : 0 });
    }
  })();
  return true;
});

// When tab is removed, clean up but DO NOT try to update badge
chrome.tabs.onRemoved.addListener((tabId) => {
  clearReload(tabId, true);
});

// On Startup, clear ALL storage. 
// Tab IDs do not survive browser restarts. 
// If we keep old IDs, the extension tries to badge tabs that don't exist anymore.
chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.clear();
  await chrome.alarms.clearAll();
});