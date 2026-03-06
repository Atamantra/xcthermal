import { parseIGC, displayUploadedTrack } from './calculator.js';

console.log("Flight Manager Module Loaded v2"); // DEBUG: Confirm module load

export function setupFlightManager(map) {
    const uploadInput = document.getElementById('profileFlightUploadInput');
    const uploadBtn = document.getElementById('profileUploadBtn');
    const listBody = document.getElementById('flightListBody');
    console.log("setupFlightManager initializing...", { uploadInput, uploadBtn, listBody });

    if (!uploadInput || !uploadBtn || !listBody) {
        console.error("Flight Manager UI elements MISSING:", {
            input: !!uploadInput,
            btn: !!uploadBtn,
            list: !!listBody
        });
        return;
    }

    // Load flights on init (when profile is opened? or just once)
    // There isn't a specific event for "profile opened" easily accessible without hooking into bootstrap/custom logic.
    // For now, load once or when the tab is clicked if we had tabs. 
    // Let's just load them now and maybe refresh when upload happens.
    loadFlights(listBody);

    // Upload Handler
    uploadBtn.addEventListener('click', () => {
        uploadInput.click();
    });

    uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            uploadBtn.textContent = "Uploading...";
            uploadBtn.disabled = true;

            const response = await fetch('/api/upload_flight', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Refresh list
                await loadFlights(listBody);
                // Use custom styled alert instead of native alert
                if (window.showCustomAlert) {
                    window.showCustomAlert("Flight uploaded successfully!", "success"); // "success" type for potential green styling
                } else {
                    alert("Flight uploaded successfully!");
                }
            } else {
                const errorMsg = result.error || "Unknown error";
                if (window.showCustomAlert) {
                    window.showCustomAlert("Upload failed: " + errorMsg);
                } else {
                    alert("Upload failed: " + errorMsg);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Error uploading flight.");
        } finally {
            uploadBtn.textContent = "+ Upload Flight";
            uploadBtn.disabled = false;
            uploadInput.value = ''; // Reset
        }
    });

    // Delegate Click Handler for List Actions - ATTACH TO BODY OR A STABLE PARENT IF FLIGHTLIST IS DYNAMIC
    // Since flightListBody is stable, this should work. But let's add logs.
    console.log("Adding click listener to flightListBody", listBody);

    // Remove existing listener if any (though difficult to do with anonymous function, 
    // but assuming setupFlightManager called once per page load)
    
    // Use a named function or ensure we don't attach multiple times
    if (listBody.dataset.listenerAttached === 'true') {
         console.log("Listener already attached to flightListBody, skipping.");
         return;
    }

    listBody.addEventListener('click', async (e) => {
        const target = e.target;
        console.log("Click detected in flight list:", target);

        // Handle Open Button
        const openBtn = target.closest('.btn-open-flight');
        if (openBtn) {
            const flightId = openBtn.dataset.id;
            if (flightId) {
                await openFlight(flightId, map, openBtn);
            }
        }

        // Handle Delete Button
        const deleteBtn = target.closest('.btn-delete-flight');
        if (deleteBtn) {
            e.preventDefault(); // Important to prevent default button/form behavior
            e.stopPropagation(); // Stop bubbling
            console.log("Delete button clicked (event listener active)", deleteBtn);
            const flightId = deleteBtn.dataset.id;
            if (flightId) {
                showDeleteConfirmation(flightId, listBody);
            } else {
                console.error("No flight ID found on delete button");
            }
        }
    });
    
    listBody.dataset.listenerAttached = 'true';
}

// Expose prompt globally for inline onclick
window.deleteFlightPrompt = function(flightId) {
    if (window.event) { window.event.stopPropagation(); }
    console.log("Global deleteFlightPrompt called for", flightId);
    
    // Find listBody - assuming it is #flightListBody
    const listBody = document.getElementById('flightListBody');
    if (!listBody) {
        console.error("Flight list body not found, cannot delete.");
        alert("Internal Error: Flight list not found.");
        return;
    }
    
    // --- MANUAL CONFIRM DIALOG ---
    const confirmed = confirm("Are you sure you want to delete this flight log?");
    if (confirmed) {
        deleteFlight(flightId, listBody);
    }
};

// REMOVE: function showDeleteConfirmation(...) as it is now bypassed.
// We keep deleteFlight intact as it handles the API call.

function showDeleteConfirmation(flightId, listBody) {
    console.log("showDeleteConfirmation called for flight:", flightId);
    const modal = document.getElementById('deleteFlightModal');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');

    if (!modal || !confirmBtn || !cancelBtn) {
        console.error("Delete Modal elements not found!", { modal, confirmBtn, cancelBtn });
        return;
    }

    modal.classList.add('active');
    console.log("Modal active class added to", modal);

    // Use direct onclick assignment to avoid event listener accumulation
    // and eliminate the need for cloneNode which can be tricky
    
    confirmBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Confirm delete clicked for flight", flightId);
        // alert("Starting delete for flight " + flightId); // DEBUG
        
        modal.classList.remove('active');
        
        // Disable button briefly to prevent double clicks if logic was different
        confirmBtn.disabled = true;
        try {
            await deleteFlight(flightId, listBody);
        } catch (err) {
            alert("Delete error: " + err);
        } finally {
            confirmBtn.disabled = false;
        }
    };

    cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Cancel delete clicked");
        modal.classList.remove('active');
    };

    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    };
}


async function loadFlights(container) {
    try {
        const response = await fetch('/api/flights');
        const flights = await response.json();

        container.innerHTML = '';

        if (flights.length === 0) {
            container.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #777;">No flights uploaded yet.</td></tr>';
            return;
        }

        flights.forEach(f => {
            // Format Data
            const dist = parseFloat(f.distance_km || 0).toFixed(1);
            const durMin = parseInt(f.duration_min || 0);
            const hours = Math.floor(durMin / 60);
            const minutes = durMin % 66;
            const durationStr = `${hours}h ${minutes}m`;

            const tr = document.createElement('tr');
            // Remove inline border
            // tr.innerHTML...
            // Start/End time formatting
            const startTime = f.start_time || '??:??:??';
            const endTime = f.end_time || '??:??:??';

            tr.innerHTML = `
                <td class="flight-date">${f.date || '-'}</td>
                <td class="flight-location">
                    <div class="flight-point">
                        <span class="flight-icon takeoff" title="Takeoff">🛫</span>
                        <span class="time-label">${startTime}</span>
                        <span class="location-name" title="${f.site_name || 'Unknown'}">${f.site_name || 'Unknown'}</span>
                    </div>
                    <div class="flight-point">
                        <span class="flight-icon landing" title="Landing">🛬</span>
                        <span class="time-label">${endTime}</span>
                        <span class="location-name" title="${f.landing_site_name || 'Unknown'}">${f.landing_site_name || 'Unknown'}</span>
                    </div>
                </td>
                <td class="flight-data-mono">${durationStr}</td>
                <td class="flight-data-mono flight-dist-glow">${dist}</td>
                <td class="flight-data-mono">${f.height_gain}</td>
                <td class="flight-actions">
                    <button class="btn-icon-action btn-open-flight" data-id="${f.public_id}" title="View on Map">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="btn-icon-action btn-delete-flight" data-id="${f.public_id}" title="Delete Flight" onclick="if(event) event.stopPropagation(); window.deleteFlightPrompt('${f.public_id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" pointer-events="none">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load flights", err);
        container.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: red;">Error loading flights: ' + err.message + '</td></tr>';
    }
}

async function openFlight(id, map, btn) {
    try {
        // Show loading state without destroying SVG icon
        if (btn) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'wait';
            btn.disabled = true;
        }

        const response = await fetch(`/api/flight/${id}/track`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        // Parse the IGC using calculator's parser
        // data.content is the IGC string
        const parsed = parseIGC(data.content);

        if (parsed.coords.length === 0) {
            alert("Could not parse track points from this flight.");
            return;
        }

        displayUploadedTrack(map, parsed);

        // Zoom to track
        const bounds = new mapboxgl.LngLatBounds();
        parsed.coords.forEach(c => bounds.extend(c));
        
        // Ensure bounds are valid
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 50, duration: 1500 });
        } else {
             console.warn("Track bounds empty, cannot zoom.");
        }

        // Close profile modal
        const profileModal = document.getElementById('profileModalOverlay');
        if (profileModal) {
            profileModal.classList.remove('active');
        }

        console.log("Flight displayed on map");

        // Auto-Enable 3D Mode & UI
        let transitionTime = 0;
        if (window._terrain3DEnabled !== true) {
            const view3dBtn = document.getElementById('view3dBtn');
            if (view3dBtn) {
                 view3dBtn.click(); // Programmatic click to trigger logic in main.js
                 transitionTime = 2000; // Allow time for 3D transition
            }
        }
        
        // Wait for 3D transition if needed, then fit bounds again to be sure
        setTimeout(() => {
             if (!bounds.isEmpty()) {
                console.log("Fitting bounds to track:", bounds.toArray());
                map.fitBounds(bounds, { padding: 100, duration: 1000 });
            }
        }, transitionTime + 500);

    } catch (err) {
        console.error("openFlight error:", err);
        alert("Error opening flight: " + (err.message || err));
    } finally {
        // Reset button state
        if (btn) {
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.disabled = false;
        }
    }
}

async function deleteFlight(id, container) {
    console.log("Sending delete request for flight:", id);
    // alert("Debug: Sending delete request for flight " + id);
    try {
        const response = await fetch(`/api/flight/${id}`, { method: 'DELETE' });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errText}`);
        }

        const result = await response.json();
        if (result.success) {
            console.log("Flight deleted successfully, reloading list...");
            loadFlights(container);
        } else {
            console.error("Delete failed with result:", result);
            alert("Delete failed: " + (result.error || "Unknown error"));
        }
    } catch (err) {
        console.error("Exception in deleteFlight:", err);
        alert("Error deleting flight: " + err.message);
    }
}
