'use strict';

// --- Helpers ---

function split_seconds(seconds) {
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    return {
        'minutes': minutes % 60,
        'hours': hours % 24,
        'days': days
    };
}

function run_with_active_tab(callback) {
    chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
        if (tabs && tabs[0]) {
            callback(tabs[0].id);
        }
    });
}

// --- Event Handlers ---

function preset_button_click_handler(ev) {
    run_with_active_tab(function(tab_id) {
        var seconds = parseInt(ev.target.dataset.seconds, 10);
        chrome.runtime.sendMessage({
            command: 'setReload',
            tabId: tab_id,
            seconds: seconds
        }, () => {
             window.close();
        });
    });
}

function stop_this_tab_button_click_handler(ev) {
    run_with_active_tab(function(tab_id) {
        chrome.runtime.sendMessage({
            command: 'clearReload',
            tabId: tab_id
        }, () => {
            window.close();
        });
    });
}

function stop_all_tabs_button_click_handler(ev) {
    chrome.storage.local.get(null, function(items) {
        const promises = [];
        for (const key in items) {
            if (key.startsWith('reload_')) {
                const data = items[key];
                const p = new Promise(resolve => {
                    chrome.runtime.sendMessage({
                        command: 'clearReload',
                        tabId: data.tabId
                    }, resolve);
                });
                promises.push(p);
            }
        }
        Promise.all(promises).then(() => window.close());
    });
}

function custom_form_submit_handler(ev) {
    ev.preventDefault();
    run_with_active_tab(function(tab_id) {
        var days    = ev.target.days.valueAsNumber || 0;
        var hours   = ev.target.hours.valueAsNumber || 0;
        var minutes = ev.target.minutes.valueAsNumber || 0;
        
        // Seconds are always 0 now
        var total = ((days * 24 + hours) * 60 + minutes) * 60;

        if (total > 0 && total < 60) {
            // Safety check: force at least 60 seconds if they tried to enter 0d 0h 0.5m (if browser allowed it)
            total = 60; 
        }

        chrome.runtime.sendMessage({
            command: 'setReload',
            tabId: tab_id,
            seconds: total
        }, () => {
             window.close();
        });
    });
    ev.stopPropagation();
    return false;
}

// Simplified Spinbox Logic (Removed Seconds rollover)
function custom_form_input_handler(ev) {
    var form = ev.currentTarget;

    // We only handle rollover for Minutes -> Hours -> Days now
    if (form.minutes.valueAsNumber == -1) {
        if (form.hours.valueAsNumber > 0 || form.days.valueAsNumber > 0) {
            form.hours.valueAsNumber--;
            form.minutes.valueAsNumber = 59;
        } else {
            form.minutes.valueAsNumber = 0;
        }
    } else if (form.minutes.valueAsNumber == 60) {
        form.hours.valueAsNumber++;
        form.minutes.valueAsNumber = 0;
    }

    if (form.hours.valueAsNumber == -1) {
        if (form.days.valueAsNumber > 0) {
            form.days.valueAsNumber--;
            form.hours.valueAsNumber = 23;
        } else {
            form.hours.valueAsNumber = 0;
        }
    } else if (form.hours.valueAsNumber == 24) {
        form.days.valueAsNumber++;
        form.hours.valueAsNumber = 0;
    }

    if (form.days.valueAsNumber == -1) {
        form.days.valueAsNumber = 0;
    }
}

// --- Initialization ---

function init() {
    run_with_active_tab(function(tab_id) {
        chrome.storage.local.get(null, function(items) {
            
            let total_reloads = 0;
            let current_tab_seconds = 0;
            
            for (const key in items) {
                if (key.startsWith('reload_')) {
                    total_reloads++;
                    if (items[key].tabId === tab_id) {
                        current_tab_seconds = items[key].seconds;
                    }
                }
            }

            var total_reloads_string = total_reloads + ' tabs';
            if (total_reloads == 0) {
                total_reloads_string = 'No tabs';
            } else if (total_reloads == 1) {
                total_reloads_string = '1 tab';
            }
            
            const statusEl = document.getElementById('number_of_reloading_tabs');
            if (statusEl) statusEl.value = total_reloads_string;

            if (total_reloads > 1 || (total_reloads == 1 && current_tab_seconds == 0)) {
                const el = document.getElementById('section_other');
                if(el) el.style.display = 'block';
            }

            if (current_tab_seconds > 0) {
                 const el = document.getElementById('section_this_tab');
                 if(el) el.style.display = 'block';
            }

            var preset_buttons = document.querySelectorAll('input.preset_button');
            for (var i = 0; i < preset_buttons.length; i++) {
                var button = preset_buttons[i];
                if (parseInt(button.dataset.seconds) === current_tab_seconds) {
                    button.classList.add('active');
                    button.disabled = true;
                }
                button.addEventListener('click', preset_button_click_handler);
            }

            var custom = document.getElementById('custom_form');
            if (custom) {
                custom.addEventListener('submit', custom_form_submit_handler);
                custom.addEventListener('input', custom_form_input_handler);
                
                var interval = split_seconds(current_tab_seconds);
                custom.days.value = interval.days;
                custom.hours.value = interval.hours;
                custom.minutes.value = interval.minutes;
                // No seconds value to set anymore
            }

            var stopThis = document.getElementById('stop_this_tab_button');
            if(stopThis) stopThis.addEventListener('click', stop_this_tab_button_click_handler);
            
            var stopAll = document.getElementById('stop_all_tabs_button');
            if(stopAll) stopAll.addEventListener('click', stop_all_tabs_button_click_handler);
        });
    });
}

init();