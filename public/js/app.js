/**
 * Smart Ambulance Priority System - Main Web Application Logic
 * Full suite: Command Center, Driver Cockpit, Traffic Signal Controller & Analytics
 */

// Global State
const state = {
    activeTab: 'command',
    socketConnected: false,
    signals: new Map(), // signalId -> signalData
    ambulances: new Map(), // ambulanceId -> ambulanceData
    activeTrip: null,
    driverGpsWatchId: null,
    driverAmbId: 'AMB1',
    simInterval: null,
    totalPreemptions: 0,
    timeSavedSeconds: 0
};

// Preset Destinations in Kolkata for Demo
const HOSPITALS = [
    { name: 'RG Kar Medical College & Hospital', lat: 22.5958, lng: 88.2636, desc: 'Level-1 Emergency Trauma Center' },
    { name: 'Apollo Multispeciality Hospitals', lat: 22.5714, lng: 88.4022, desc: 'Specialized Cardiac & Critical Care' },
    { name: 'SSKM Government Hospital', lat: 22.5401, lng: 88.3414, desc: 'Super Specialty Academic Hospital' },
    { name: 'Fortis Hospital & Kidney Institute', lat: 22.5186, lng: 88.3986, desc: 'Advanced Emergency & ICU Unit' }
];

let selectedHospital = HOSPITALS[0];

// Map & Layer References
let map = null;
let ambulanceMarker = null;
let radarCircle = null;
let destinationMarker = null;
let routePolyline = null;
const signalMarkers = new Map();

// Socket.io Client
const socket = io();

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabs();
    initMap();
    initSocketListeners();
    initUIControls();
    initCockpitPresets();
    loadInitialData();
});

// Real-time Top Clock
function initClock() {
    const el = document.getElementById('systemClock');
    const update = () => {
        if (el) el.innerText = new Date().toLocaleTimeString('en-US', { hour12: false });
    };
    update();
    setInterval(update, 1000);
}

// Navigation Tabs
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            switchTab(target);
        });
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));

    // Invalidate map size when switching back to Command Center
    if (tabId === 'command' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
    if (tabId === 'signals') {
        renderSignalsGrid();
    }
    if (tabId === 'analytics') {
        loadAnalyticsData();
    }
}

// ============================================================================
// LEAFLET MAP & VISUALIZATIONS
// ============================================================================
function initMap() {
    const defaultCenter = [22.5842, 88.3137];
    map = L.map('map', { zoomControl: false }).setView(defaultCenter, 13);

    // Zoom control in top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Dark Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
    }).addTo(map);
}

// Custom Ambulance Icon
function createAmbulanceIcon() {
    return L.divIcon({
        className: 'amb-marker-wrapper',
        html: `
            <div class="amb-pulse-ring"></div>
            <div class="amb-badge"><i class="fa-solid fa-truck-medical"></i></div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
    });
}

// Custom Signal Marker Icon
function createSignalIcon(mode = 'NORMAL', label = '') {
    const isEmergency = mode === 'EMERGENCY_OVERRIDE';
    return L.divIcon({
        className: 'signal-div-icon',
        html: `
            <div class="signal-marker ${isEmergency ? 'emergency' : 'normal'}">
                ${isEmergency ? '⚡' : '🟢'}
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Hospital Destination Icon
function createHospitalIcon() {
    return L.divIcon({
        html: `
            <div style="width:36px; height:36px; background:#0ea5e9; border:2px solid #ffffff; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:16px; box-shadow:0 0 16px rgba(14,165,233,0.8);">
                <i class="fa-solid fa-hospital"></i>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

function updateAmbulanceOnMap(amb) {
    if (!amb || !amb.lat || !amb.lng) return;
    const latlng = [Number(amb.lat), Number(amb.lng)];

    if (!ambulanceMarker) {
        ambulanceMarker = L.marker(latlng, { icon: createAmbulanceIcon() }).addTo(map);
        radarCircle = L.circle(latlng, {
            radius: 400,
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '4, 4'
        }).addTo(map);
    } else {
        ambulanceMarker.setLatLng(latlng);
        if (radarCircle) radarCircle.setLatLng(latlng);
    }

    // Sync Telemetry Displays
    updateTelemetryDisplays(amb);
}

function updateSignalOnMap(sig) {
    if (!sig || !sig.signalId) return;
    state.signals.set(sig.signalId, sig);

    const latlng = [Number(sig.lat), Number(sig.lng)];
    let marker = signalMarkers.get(sig.signalId);

    if (!marker) {
        marker = L.marker(latlng, { icon: createSignalIcon(sig.mode, sig.signalId) }).addTo(map);
        marker.bindPopup(`
            <div style="font-family:'Outfit',sans-serif; color:#0f172a;">
                <b>${sig.name || sig.signalId}</b><br>
                Mode: <b>${sig.mode}</b><br>
                Green Cycle: <b>${sig.greenSeconds || 20}s</b><br>
                Traffic Density: <b>${sig.density || 0}%</b>
            </div>
        `);
        signalMarkers.set(sig.signalId, marker);
    } else {
        marker.setIcon(createSignalIcon(sig.mode, sig.signalId));
    }

    // Sound effect on mode changes
    if (sig.mode === 'EMERGENCY_OVERRIDE') {
        if (window.emergencyAudio) window.emergencyAudio.playPreemptAlert();
        showEmergencyBanner(`EMERGENCY GREEN CLEARED AT ${sig.name || sig.signalId}`);
        state.totalPreemptions++;
    } else {
        if (window.emergencyAudio) window.emergencyAudio.playReleaseBeep();
    }

    refreshMetricCounters();
    if (state.activeTab === 'signals') renderSignalsGrid();
}

function drawRouteOnMap(routeCoords, dest) {
    if (!routeCoords || !routeCoords.length) return;
    const latlngs = routeCoords.map(([lng, lat]) => [lat, lng]);

    if (routePolyline) map.removeLayer(routePolyline);
    routePolyline = L.polyline(latlngs, {
        color: '#06b6d4',
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round'
    }).addTo(map);

    if (dest) {
        if (destinationMarker) map.removeLayer(destinationMarker);
        destinationMarker = L.marker([dest.lat, dest.lng], { icon: createHospitalIcon() }).addTo(map);
    }

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
}

// ============================================================================
// TELEMETRY & HUD SYNC
// ============================================================================
function updateTelemetryDisplays(amb) {
    const lat = Number(amb.lat);
    const lng = Number(amb.lng);
    const speed = Math.round(amb.speed || 0);
    const speedFormatted = `${speed} km/h`;

    // Command Center Sidebar
    const elCoords = document.getElementById('gpsCoords');
    if (elCoords) elCoords.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const elSpeed = document.getElementById('gpsSpeedStatus');
    if (elSpeed) elSpeed.innerText = `${speedFormatted} · ${amb.status || 'ACTIVE'}`;
    const elTime = document.getElementById('gpsTimestamp');
    if (elTime) elTime.innerText = new Date().toLocaleTimeString();

    // Top Metric Bar
    const metricSpeed = document.getElementById('metricSpeed');
    if (metricSpeed) metricSpeed.innerText = speedFormatted;

    // Driver Cockpit HUD Elements
    const hudSpeedVal = document.getElementById('hudSpeedVal');
    if (hudSpeedVal) hudSpeedVal.innerText = speed;
    const hudCoords = document.getElementById('hudCoords');
    if (hudCoords) hudCoords.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const hudStatus = document.getElementById('hudStatus');
    if (hudStatus) hudStatus.innerText = amb.status || 'ACTIVE';

    // Calculate nearest ahead signal for HUD
    computeNextSignalAhead(lat, lng);
}

function computeNextSignalAhead(ambLat, ambLng) {
    if (!state.signals.size) return;
    let nearestSig = null;
    let minDistance = Infinity;

    state.signals.forEach(sig => {
        const d = haversineDistance(ambLat, ambLng, Number(sig.lat), Number(sig.lng));
        if (d < minDistance) {
            minDistance = d;
            nearestSig = sig;
        }
    });

    const elName = document.getElementById('hudNextSignalName');
    const elDist = document.getElementById('hudNextSignalDist');
    const elStatus = document.getElementById('hudNextSignalStatus');

    if (nearestSig && elName && elDist) {
        elName.innerText = nearestSig.name || nearestSig.signalId;
        elDist.innerText = `${Math.round(minDistance)} meters`;
        if (elStatus) {
            const isPreempted = nearestSig.mode === 'EMERGENCY_OVERRIDE';
            elStatus.innerHTML = isPreempted 
                ? '<span style="color:#ef4444; font-weight:700;">⚡ EMERGENCY GREEN PREEMPTION ACTIVE</span>' 
                : '<span style="color:#10b981;">🟢 Standard Green Cycle Active</span>';
        }
    }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================================
// SOCKET.IO REAL-TIME LISTENERS
// ============================================================================
function initSocketListeners() {
    socket.on('connect', () => {
        state.socketConnected = true;
        updateConnectionBadge(true);
        addLog(`WebSocket connected to dispatcher (Socket ID: ${socket.id})`, 'success');
        loadInitialData();
    });

    socket.on('disconnect', () => {
        state.socketConnected = false;
        updateConnectionBadge(false);
        addLog('WebSocket connection disconnected. Reconnecting...', 'alert');
    });

    // Ambulance GPS location update
    socket.on('ambulance:location', (amb) => {
        updateAmbulanceOnMap(amb);
    });

    // Traffic Signal status updates
    socket.on('signal:status', (sig) => {
        updateSignalOnMap(sig);
    });

    socket.on('TRIP_STARTED', ({ trip, ambulance }) => {
        state.activeTrip = trip;
        drawRouteOnMap(trip.route, trip.destination);
        addLog(`Trip started for ${ambulance.ambulanceId}. Corridor preemption active.`, 'success');
        showEmergencyBanner(`EMERGENCY CORRIDOR ACTIVATED TO ${selectedHospital.name}`);
        setSimulationButtonStates(true);
        if (window.emergencyAudio) window.emergencyAudio.startSiren();
    });

    socket.on('TRIP_ENDED', () => {
        state.activeTrip = null;
        if (routePolyline) map.removeLayer(routePolyline);
        if (destinationMarker) map.removeLayer(destinationMarker);
        addLog('Trip completed! All signals returned to normal schedules.', 'info');
        hideEmergencyBanner();
        setSimulationButtonStates(false);
        if (window.emergencyAudio) window.emergencyAudio.stopSiren();
        refreshMetricCounters();
    });
}

function updateConnectionBadge(connected) {
    const dot = document.getElementById('socketDot');
    const txt = document.getElementById('socketText');
    if (dot) dot.className = `dot ${connected ? 'online' : 'offline'}`;
    if (txt) txt.innerText = connected ? 'Socket: Online' : 'Socket: Offline';
}

// ============================================================================
// DATA FETCHING & LOGGING
// ============================================================================
async function loadInitialData() {
    try {
        const [sigRes, ambRes, tripRes] = await Promise.all([
            fetch('/api/signals').then(r => r.json()),
            fetch('/api/ambulances').then(r => r.json()),
            fetch('/api/trips/active').then(r => r.json())
        ]);

        if (Array.isArray(sigRes)) {
            sigRes.forEach(s => updateSignalOnMap(s));
        }
        if (Array.isArray(ambRes) && ambRes.length > 0) {
            updateAmbulanceOnMap(ambRes[0]);
        }
        if (Array.isArray(tripRes) && tripRes.length > 0) {
            state.activeTrip = tripRes[0];
            drawRouteOnMap(state.activeTrip.route, state.activeTrip.destination);
            setSimulationButtonStates(true);
        }

        refreshMetricCounters();
    } catch (e) {
        console.error('Error fetching initial data:', e);
    }
}

function refreshMetricCounters() {
    const elAmb = document.getElementById('metricAmbulanceCount');
    if (elAmb) elAmb.innerText = '1';

    const elSig = document.getElementById('metricSignalsCount');
    if (elSig) elSig.innerText = state.signals.size;

    let preemptCount = 0;
    state.signals.forEach(s => {
        if (s.mode === 'EMERGENCY_OVERRIDE') preemptCount++;
    });

    const elPreempt = document.getElementById('metricPreemptedCount');
    if (elPreempt) elPreempt.innerText = preemptCount;

    const elCorridor = document.getElementById('metricCorridorStatus');
    if (elCorridor) {
        elCorridor.innerText = preemptCount > 0 ? 'EMERGENCY ACTIVE' : 'CLEAR / NORMAL';
        elCorridor.style.color = preemptCount > 0 ? '#ef4444' : '#10b981';
    }
}

function addLog(msg, type = 'info') {
    const box = document.getElementById('logBox');
    if (!box) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="time">[${time}]</span> <span>${msg}</span>`;
    box.appendChild(entry);
    box.scrollTop = box.scrollHeight;
}

function showEmergencyBanner(msg) {
    const b = document.getElementById('emergencyBanner');
    const txt = document.getElementById('emergencyBannerText');
    if (b && txt) {
        txt.innerText = msg;
        b.classList.remove('hidden');
        b.style.display = 'flex';
    }
}

function hideEmergencyBanner() {
    const b = document.getElementById('emergencyBanner');
    if (b) {
        b.classList.add('hidden');
        b.style.display = 'none';
    }
}

// ============================================================================
// UI CONTROLS & EVENT LISTENERS
// ============================================================================
function initUIControls() {
    // Audio Siren Mute / Unmute Toggle
    const soundToggle = document.getElementById('btnSoundToggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            const on = window.emergencyAudio.toggleSound();
            soundToggle.classList.toggle('active', on);
            soundToggle.innerHTML = on 
                ? '<i class="fa-solid fa-volume-high"></i>' 
                : '<i class="fa-solid fa-volume-xmark"></i>';
            addLog(on ? '🔊 Emergency Audio siren enabled' : '🔇 Audio alerts muted', 'info');
        });
    }

    // Map Toolbar Controls
    const btnCenterAmb = document.getElementById('btnCenterAmb');
    if (btnCenterAmb) {
        btnCenterAmb.addEventListener('click', () => {
            if (ambulanceMarker) map.panTo(ambulanceMarker.getLatLng());
        });
    }

    const btnFitRoute = document.getElementById('btnFitRoute');
    if (btnFitRoute) {
        btnFitRoute.addEventListener('click', () => {
            if (routePolyline) map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
        });
    }

    // Simulation Controls
    const btnStartSim = document.getElementById('btnStartSim');
    if (btnStartSim) {
        btnStartSim.addEventListener('click', () => startFullSimulation());
    }

    const btnEndSim = document.getElementById('btnEndSim');
    if (btnEndSim) {
        btnEndSim.addEventListener('click', () => endActiveMission());
    }

    const btnResetMap = document.getElementById('btnResetMap');
    if (btnResetMap) {
        btnResetMap.addEventListener('click', () => window.location.reload());
    }

    // GPS Telemetry Button
    const btnQueryGps = document.getElementById('btnQueryGps');
    if (btnQueryGps) {
        btnQueryGps.addEventListener('click', async () => {
            addLog(`Querying GPS location via GET /api/ambulances/${state.driverAmbId}/location...`, 'info');
            try {
                const res = await fetch(`/api/ambulances/${state.driverAmbId}/location`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                updateAmbulanceOnMap(data);
                map.panTo([data.lat, data.lng]);
                addLog(`📍 Current GPS: [${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}] Speed: ${data.speed}km/h`, 'success');
            } catch (e) {
                addLog(`❌ Failed to query GPS: ${e.message}`, 'alert');
            }
        });
    }

    // Driver Cockpit Mode: Device GPS Toggle
    const btnToggleDriverGps = document.getElementById('btnToggleDriverGps');
    const hudGpsToggle = document.getElementById('hudGpsToggle');

    const handleGpsToggle = () => toggleDeviceGpsTracking();
    if (btnToggleDriverGps) btnToggleDriverGps.addEventListener('click', handleGpsToggle);
    if (hudGpsToggle) hudGpsToggle.addEventListener('click', handleGpsToggle);

    // Launch Mission from Cockpit
    const btnHudStartMission = document.getElementById('btnHudStartMission');
    if (btnHudStartMission) {
        btnHudStartMission.addEventListener('click', () => startMissionToHospital(selectedHospital));
    }
}

function setSimulationButtonStates(running) {
    const btnStart = document.getElementById('btnStartSim');
    const btnEnd = document.getElementById('btnEndSim');
    const btnHudStart = document.getElementById('btnHudStartMission');

    if (btnStart) btnStart.disabled = running;
    if (btnEnd) btnEnd.disabled = !running;
    if (btnHudStart) {
        btnHudStart.disabled = running;
        btnHudStart.innerHTML = running 
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Corridor In Transit...' 
            : '<i class="fa-solid fa-bolt"></i> Request Green Corridor';
    }
}

// ============================================================================
// SIMULATION ENGINE
// ============================================================================
async function startFullSimulation() {
    addLog('🚀 Initiating live ambulance simulation run...', 'info');
    setSimulationButtonStates(true);

    const origin = { lat: 22.5726, lng: 88.3639 }; // Central Kolkata
    const destination = { lat: selectedHospital.lat, lng: selectedHospital.lng };

    // Register Ambulance
    await fetch('/api/ambulances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambulanceId: 'AMB1', name: 'Emergency Unit 1', ...origin })
    });

    // Start Trip
    const tripRes = await fetch('/api/trips/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambulanceId: 'AMB1', origin, destination })
    });
    const trip = await tripRes.json();
    state.activeTrip = trip;

    // Register route traffic signals
    const step = Math.max(5, Math.floor(trip.route.length / 5));
    let sCount = 0;
    for (let i = step; i < trip.route.length - 2; i += step) {
        sCount++;
        const [lng, lat] = trip.route[i];
        await fetch('/api/signals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signalId: `SIG${sCount}`, name: `Junction Intersection ${sCount}`, lat, lng })
        });
    }

    // Step-by-step waypoint movement
    let idx = 0;
    state.simInterval = setInterval(async () => {
        if (idx >= trip.route.length) {
            clearInterval(state.simInterval);
            await endActiveMission();
            return;
        }
        const [lng, lat] = trip.route[idx];
        const res = await fetch('/api/ambulances/AMB1/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, speed: 55 })
        });
        const out = await res.json();

        const pct = Math.round(((idx + 1) / trip.route.length) * 100);
        let logMsg = `Progress: [${pct}%] Location: (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        if (out.preempted > 0) logMsg += ` ⚡ EMERGENCY GREEN triggered (${out.preempted} signal)`;
        if (out.released > 0) logMsg += ` 🟢 Signal released (${out.released})`;
        addLog(logMsg, out.preempted > 0 ? 'alert' : 'info');

        idx++;
    }, 280);
}

async function endActiveMission() {
    if (state.simInterval) clearInterval(state.simInterval);
    if (state.activeTrip) {
        const id = state.activeTrip._id || state.activeTrip.id;
        await fetch(`/api/trips/${id}/end`, { method: 'POST' });
    }
    setSimulationButtonStates(false);
    hideEmergencyBanner();
}

// ============================================================================
// DRIVER COCKPIT & DEVICE GPS TRACKING
// ============================================================================
function initCockpitPresets() {
    const list = document.getElementById('hospitalPresetsList');
    if (!list) return;
    list.innerHTML = '';

    HOSPITALS.forEach((h, idx) => {
        const item = document.createElement('div');
        item.className = `preset-pill ${idx === 0 ? 'active' : ''}`;
        item.innerHTML = `
            <strong><i class="fa-solid fa-hospital"></i> ${h.name}</strong>
            <span>${h.desc}</span>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            selectedHospital = h;
            addLog(`Selected Destination: ${h.name}`, 'info');
        });
        list.appendChild(item);
    });
}

async function startMissionToHospital(hospital) {
    if (!hospital) return;
    addLog(`🚨 Requesting priority corridor to ${hospital.name}...`, 'info');

    // Get current ambulance location or fallback to origin
    let origin = { lat: 22.5726, lng: 88.3639 };
    if (ambulanceMarker) {
        const pos = ambulanceMarker.getLatLng();
        origin = { lat: pos.lat, lng: pos.lng };
    }

    await startFullSimulation();
}

function toggleDeviceGpsTracking() {
    const btnSidebar = document.getElementById('btnToggleDriverGps');
    const btnHud = document.getElementById('hudGpsToggle');

    if (state.driverGpsWatchId !== null) {
        // Stop tracking
        navigator.geolocation.clearWatch(state.driverGpsWatchId);
        state.driverGpsWatchId = null;

        const label = '<i class="fa-solid fa-mobile-screen-button"></i> Start Device GPS (Driver Mode)';
        if (btnSidebar) {
            btnSidebar.innerHTML = label;
            btnSidebar.style.background = 'linear-gradient(135deg, #059669, #047857)';
        }
        if (btnHud) btnHud.innerHTML = '<i class="fa-solid fa-satellite"></i> Enable Phone GPS';
        addLog('🛑 Real device GPS tracking stopped.', 'info');
    } else {
        if (!navigator.geolocation) {
            alert('HTML5 Geolocation is not supported by your browser.');
            return;
        }

        const label = '<i class="fa-solid fa-circle-stop"></i> Stop Device GPS Tracking';
        if (btnSidebar) {
            btnSidebar.innerHTML = label;
            btnSidebar.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
        }
        if (btnHud) btnHud.innerHTML = '<i class="fa-solid fa-circle-stop"></i> Stop Phone GPS';
        addLog('🛰️ Activating device GPS sensor with high accuracy...', 'info');

        state.driverGpsWatchId = navigator.geolocation.watchPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const speed = Math.round((pos.coords.speed || 0) * 3.6);
                const accuracy = Math.round(pos.coords.accuracy || 0);

                addLog(`🛰️ Live Device GPS: [${lat.toFixed(5)}, ${lng.toFixed(5)}] ±${accuracy}m @ ${speed}km/h`, 'info');

                // Upsert ambulance
                await fetch('/api/ambulances', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ambulanceId: state.driverAmbId, name: 'Live Device Ambulance', lat, lng })
                }).catch(() => {});

                // Send live GPS location
                const res = await fetch(`/api/ambulances/${state.driverAmbId}/location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, speed })
                });
                const out = await res.json();
                updateAmbulanceOnMap({ lat, lng, speed, ambulanceId: state.driverAmbId, status: 'ON_TRIP' });
                map.panTo([lat, lng]);

                if (out.preempted > 0) {
                    addLog(`⚡ EMERGENCY GREEN PREEMPTION TRIGGERED (${out.preempted} intersection)!`, 'alert');
                }
            },
            (err) => {
                console.error('GPS error:', err);
                addLog(`❌ Geolocation error: ${err.message}`, 'alert');
                if (state.driverGpsWatchId) {
                    navigator.geolocation.clearWatch(state.driverGpsWatchId);
                    state.driverGpsWatchId = null;
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 10000
            }
        );
    }
}

// ============================================================================
// TRAFFIC SIGNALS GRID TAB
// ============================================================================
function renderSignalsGrid() {
    const grid = document.getElementById('signalsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.signals.size === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-traffic-light" style="font-size: 36px; margin-bottom: 12px; opacity:0.4;"></i>
                <p>No traffic signals registered. Start the simulation or add a new signal below to populate the grid.</p>
            </div>
        `;
        return;
    }

    state.signals.forEach(sig => {
        const isEmergency = sig.mode === 'EMERGENCY_OVERRIDE';
        const card = document.createElement('div');
        card.className = `signal-card ${isEmergency ? 'emergency-locked' : ''}`;
        card.innerHTML = `
            <div class="signal-top-row">
                <div>
                    <h3 style="font-size:15px; margin-bottom:2px;">${sig.name || sig.signalId}</h3>
                    <span style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono';">${sig.signalId} · [${Number(sig.lat).toFixed(4)}, ${Number(sig.lng).toFixed(4)}]</span>
                </div>
                <!-- 3-Lamp Traffic Signal Head -->
                <div class="traffic-lamp-box">
                    <div class="lamp red ${isEmergency ? '' : 'lit'}"></div>
                    <div class="lamp amber"></div>
                    <div class="lamp green ${isEmergency ? 'lit' : ''}"></div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                <span style="color:var(--text-secondary);">Current Priority:</span>
                <strong style="color:${isEmergency ? '#ef4444' : '#10b981'};">
                    ${isEmergency ? '⚡ EMERGENCY OVERRIDE (AMB1)' : '🟢 NORMAL SCHEDULE'}
                </strong>
            </div>

            <div class="slider-container">
                <div style="display:flex; justify-content:space-between;">
                    <span>Traffic Density:</span>
                    <b id="sig-density-val-${sig.signalId}">${sig.density || 0}% (${sig.greenSeconds || 20}s Green)</b>
                </div>
                <input type="range" min="0" max="100" value="${sig.density || 0}" 
                    oninput="document.getElementById('sig-density-val-${sig.signalId}').innerText = this.value + '%'"
                    onchange="updateSignalDensity('${sig.signalId}', this.value)">
            </div>

            <div style="display:flex; gap:8px; margin-top:4px;">
                <button class="btn btn-secondary" style="flex:1; padding:8px 12px; font-size:11px;" onclick="centerSignalOnMap('${sig.signalId}')">
                    <i class="fa-solid fa-location-dot"></i> Locate
                </button>
                <button class="btn ${isEmergency ? 'btn-danger' : 'btn-primary'}" style="flex:1; padding:8px 12px; font-size:11px;" onclick="toggleManualPreemption('${sig.signalId}')">
                    ${isEmergency ? '<i class="fa-solid fa-rotate-left"></i> Release' : '<i class="fa-solid fa-bolt"></i> Test Preempt'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.updateSignalDensity = async (signalId, density) => {
    try {
        await fetch(`/api/signals/${signalId}/density`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ density: Number(density) })
        });
        addLog(`Updated density for ${signalId} to ${density}%`, 'info');
    } catch (e) {
        console.error(e);
    }
};

window.centerSignalOnMap = (signalId) => {
    switchTab('command');
    const marker = signalMarkers.get(signalId);
    if (marker) {
        map.panTo(marker.getLatLng());
        marker.openPopup();
    }
};

window.toggleManualPreemption = async (signalId) => {
    const sig = state.signals.get(signalId);
    if (!sig) return;

    if (sig.mode === 'EMERGENCY_OVERRIDE') {
        // Release back to normal
        await fetch(`/api/signals/${signalId}/density`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ density: sig.density || 0 })
        });
        sig.mode = 'NORMAL';
        updateSignalOnMap(sig);
    } else {
        // Trigger emergency override
        sig.mode = 'EMERGENCY_OVERRIDE';
        sig.overriddenBy = 'MANUAL_TEST';
        updateSignalOnMap(sig);
    }
    renderSignalsGrid();
};

// ============================================================================
// ANALYTICS & TRIP HISTORY TAB
// ============================================================================
async function loadAnalyticsData() {
    try {
        const res = await fetch('/api/trips');
        const trips = await res.json();
        const tbody = document.getElementById('tripHistoryBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!Array.isArray(trips) || trips.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No trips recorded yet. Run a simulation to log trip records.</td></tr>`;
            return;
        }

        let totalDist = 0;
        let totalDuration = 0;

        trips.forEach(t => {
            totalDist += t.distanceM || 0;
            totalDuration += t.durationS || 0;

            const tr = document.createElement('tr');
            const dateStr = new Date(t.createdAt).toLocaleString();
            const distKm = ((t.distanceM || 0) / 1000).toFixed(2);
            const durMin = Math.round((t.durationS || 0) / 60);

            tr.innerHTML = `
                <td><b>${t.ambulanceId || 'AMB1'}</b></td>
                <td>${distKm} km</td>
                <td>${durMin} mins</td>
                <td><span style="color:${t.status === 'ACTIVE' ? '#38bdf8' : '#4ade80'}; font-weight:700;">${t.status}</span></td>
                <td>${dateStr}</td>
                <td><span style="color:#10b981;">⚡ -4.2 min avg</span></td>
            `;
            tbody.appendChild(tr);
        });

        const elTotalDist = document.getElementById('statTotalDistance');
        if (elTotalDist) elTotalDist.innerText = `${(totalDist / 1000).toFixed(1)} km`;

        const elTotalRuns = document.getElementById('statTotalRuns');
        if (elTotalRuns) elTotalRuns.innerText = trips.length;
    } catch (e) {
        console.error('Analytics load error:', e);
    }
}
