/* ========================================
   Globle Valentine - Main Script
   ======================================== */

// ========================================
// Target Countries (spells VALENTINE)
// ========================================
const TARGET_SEQUENCE = [
    { name: 'Qatar', letter: 'V', lat: 25.3548, lng: 51.1839, img: 'https://placehold.co/100x100?text=Qatar' },
    { name: 'Luxembourg', letter: 'A', lat: 49.8153, lng: 6.1296, img: 'https://placehold.co/100x100?text=Luxembourg' },
    { name: 'Bahrain', letter: 'L', lat: 26.0667, lng: 50.5577, img: 'https://placehold.co/100x100?text=Bahrain' },
    { name: 'United States of America', letter: 'E', lat: 37.0902, lng: -95.7129, img: 'https://placehold.co/100x100?text=USA' },
    { name: 'United Arab Emirates', letter: 'N', lat: 23.4241, lng: 53.8478, img: 'https://placehold.co/100x100?text=UAE' },
    { name: 'Canada', letter: 'T', lat: 56.1304, lng: -106.3468, img: 'https://placehold.co/100x100?text=Canada' },
    { name: 'Estonia', letter: 'I', lat: 58.5953, lng: 25.0136, img: 'https://placehold.co/100x100?text=Estonia' },
    { name: 'Kuwait', letter: 'N', lat: 29.3117, lng: 47.4818, img: 'https://placehold.co/100x100?text=Kuwait' },
    { name: 'Belize', letter: 'E', lat: 17.1899, lng: -88.4976, img: 'https://placehold.co/100x100?text=Belize' }
];

// Valentine messages for each country (optional)
const VALENTINE_MESSAGES = {
    'Qatar': "",
    'Luxembourg': "",
    'Bahrain': "",
    'United States of America': "",
    'United Arab Emirates': "",
    'Canada': "",
    'Estonia': "",
    'Kuwait': "",
    'Belize': ""
};

// ========================================
// State
// ========================================
let globe;
let countriesGeoJSON = [];
let allCountryNames = [];
let currentTargetIndex = 0;
let guessedCountries = new Map(); // name -> distance
let permanentlySolvedCountries = new Set(); // names of countries already found
let solvedMarkers = []; // { lat, lng, img } for photo stickers
let guessHistory = [];
let closestDistance = Infinity;
let totalGuessCount = 0; // Total guesses across all rounds

// ========================================
// Country Coordinates (for distance calc)
// ========================================
let countryCoords = {};

// ========================================
// Initialize
// ========================================
async function init() {
    // Disable input while loading
    const input = document.getElementById('guessInput');
    const button = document.getElementById('guessButton');
    input.disabled = true;
    button.disabled = true;
    input.placeholder = 'Loading...';
    
    await initGlobe();
    initEventListeners();
    updateProgressHint();
    
    // Enable input after globe loads
    input.disabled = false;
    button.disabled = false;
    input.placeholder = 'Guess a country...';
}

// ========================================
// Globe Setup
// ========================================
async function initGlobe() {
    const container = document.getElementById('globeContainer');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Fetch country data (using 50m to include small countries like Bahrain, Qatar, etc.)
    const res = await fetch('https://unpkg.com/world-atlas@2/countries-50m.json');
    const worldData = await res.json();

    // Convert TopoJSON to GeoJSON
    const countries = topojson.feature(worldData, worldData.objects.countries);
    countriesGeoJSON = countries.features;

    // Build country name list and coordinates
    countriesGeoJSON.forEach(f => {
        const name = getCountryName(f.properties);
        if (name && name !== 'Unknown') {
            allCountryNames.push(name);
            // Calculate centroid for distance
            const coords = getCentroid(f);
            if (coords) {
                countryCoords[name] = coords;
            }
        }
    });
    allCountryNames.sort();

    // Create globe
    globe = Globe()
        .backgroundColor('rgba(0,0,0,0)')
        .globeImageUrl('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%233A7BC8"/></svg>')
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor('#DB3E7A')
        .atmosphereAltitude(0.15)
        .polygonsData(countriesGeoJSON)
        .polygonAltitude(0.01)
        .polygonCapColor(feat => getCountryColor(feat))
        .polygonSideColor(() => 'rgba(0,0,0,0.2)')
        .polygonStrokeColor(() => '#000000')
        .polygonLabel(() => '') // No labels on hover
        .htmlElementsData(solvedMarkers)
        .htmlElement(d => {
            const el = document.createElement('div');
            el.className = 'sticker-marker';
            el.innerHTML = `<img src="${d.img}" alt="Sticker" style="width: 50px; height: 50px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); object-fit: cover;">`;
            return el;
        })
        .onPolygonHover(polygon => {
            container.style.cursor = polygon ? 'pointer' : 'grab';
        })
        .polygonsTransitionDuration(300)
        (container);

    // Set initial view (higher altitude = smaller globe)
    globe.pointOfView({ lat: 20, lng: 0, altitude: 2.8 });

    // Auto-rotate
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
    
    // Hide loading indicator once globe is ready
    setTimeout(() => {
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
        }
    }, 500);
}

// ========================================
// Get Country Name
// ========================================
function getCountryName(properties) {
    return properties.name || properties.NAME || properties.ADMIN || 'Unknown';
}

// ========================================
// Get Centroid of Country
// ========================================
function getCentroid(feature) {
    try {
        const coords = [];
        const geometry = feature.geometry;

        function extractCoords(c) {
            if (typeof c[0] === 'number') {
                coords.push(c);
            } else {
                c.forEach(extractCoords);
            }
        }

        if (geometry && geometry.coordinates) {
            extractCoords(geometry.coordinates);
        }

        if (coords.length === 0) return null;

        const sumLat = coords.reduce((a, c) => a + c[1], 0);
        const sumLng = coords.reduce((a, c) => a + c[0], 0);

        return {
            lat: sumLat / coords.length,
            lng: sumLng / coords.length
        };
    } catch (e) {
        return null;
    }
}

// ========================================
// Distance Calculation (Haversine)
// ========================================
function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ========================================
// Get Direction Arrow
// ========================================
function getDirectionArrow(fromLat, fromLng, toLat, toLng) {
    const dLat = toLat - fromLat;
    const dLng = toLng - fromLng;
    const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;

    // Convert angle to arrow
    if (angle >= -22.5 && angle < 22.5) return '⬆️';
    if (angle >= 22.5 && angle < 67.5) return '↗️';
    if (angle >= 67.5 && angle < 112.5) return '➡️';
    if (angle >= 112.5 && angle < 157.5) return '↘️';
    if (angle >= 157.5 || angle < -157.5) return '⬇️';
    if (angle >= -157.5 && angle < -112.5) return '↙️';
    if (angle >= -112.5 && angle < -67.5) return '⬅️';
    if (angle >= -67.5 && angle < -22.5) return '↖️';
    return '🎯';
}

// ========================================
// Color Based on Distance (Pink Gradient)
// ========================================
function getDistanceColor(distance) {
    // Max distance on Earth ~20,000 km
    const maxDistance = 12000;
    const ratio = Math.min(distance / maxDistance, 1);

    // Pink gradient: Deep pink (close) -> Light pink (far)
    // Close (0): #C71585 (medium violet red - very deep pink)
    // Mid (0.5): #FF69B4 (hot pink)
    // Far (1): #FFE4EC (very light pink)

    let r, g, b;

    if (ratio < 0.5) {
        // Close to medium: Deep pink to hot pink
        const t = ratio / 0.5;
        r = Math.round(199 + t * 56);   // 199 -> 255
        g = Math.round(21 + t * 84);     // 21 -> 105
        b = Math.round(133 + t * 47);    // 133 -> 180
    } else {
        // Medium to far: Hot pink to light pink
        const t = (ratio - 0.5) / 0.5;
        r = 255;
        g = Math.round(105 + t * 123);   // 105 -> 228
        b = Math.round(180 + t * 56);    // 180 -> 236
    }

    return `rgb(${r}, ${g}, ${b})`;
}

// ========================================
// Get Country Color
// ========================================
function getCountryColor(feature) {
    const name = getCountryName(feature.properties);

    // Check if this country is permanently solved (from previous rounds)
    if (permanentlySolvedCountries.has(name)) {
        return '#FF1493'; // Correct! Deep pink
    }

    // Check if this country has been guessed in current round
    if (guessedCountries.has(name)) {
        const distance = guessedCountries.get(name);
        if (distance === 0) {
            return '#FF1493'; // Correct! Deep pink
        }
        return getDistanceColor(distance);
    }

    // Default land color - original pastel green
    return '#98D176';
}

// ========================================
// Make a Guess
// ========================================
function makeGuess(countryName) {
    // Normalize input
    const normalized = countryName.trim();
    
    // CHEAT CODE for testing - type "testexplosion" to skip to explosion
    if (normalized.toLowerCase() === 'testexplosion') {
        document.getElementById('guessInput').value = '';
        currentTargetIndex = TARGET_SEQUENCE.length;
        showVictory();
        return;
    }

    // Find matching country
    const match = allCountryNames.find(n =>
        n.toLowerCase() === normalized.toLowerCase()
    );

    if (!match) {
        showError('Country not found!');
        return;
    }

    if (guessedCountries.has(match)) {
        showError('Already guessed!');
        return;
    }

    // Get current target
    const target = TARGET_SEQUENCE[currentTargetIndex];
    const targetCoords = { lat: target.lat, lng: target.lng };
    const guessCoords = countryCoords[match];

    if (!guessCoords) {
        showError('Could not find country location');
        return;
    }

    // Calculate distance
    const distance = getDistance(
        guessCoords.lat, guessCoords.lng,
        targetCoords.lat, targetCoords.lng
    );

    // Record guess
    guessedCountries.set(match, distance);

    // Increment total guess counter
    totalGuessCount++;
    updateGuessCounter();

    // Update closest distance (always update if it's closer)
    if (distance < closestDistance) {
        closestDistance = distance;
    }
    // Always update display after each guess
    updateClosestDisplay();

    // Get direction arrow
    const arrow = getDirectionArrow(
        guessCoords.lat, guessCoords.lng,
        targetCoords.lat, targetCoords.lng
    );

    // Add to history
    addGuessToHistory(match, distance, arrow, distance === 0);

    // Update globe colors
    globe.polygonCapColor(feat => getCountryColor(feat));

    // Auto-focus on guessed country
    globe.pointOfView({ lat: guessCoords.lat, lng: guessCoords.lng, altitude: 2.8 }, 1000);

    // Clear input
    document.getElementById('guessInput').value = '';
    hideAutocomplete();

    // Check if correct!
    if (match === target.name) {
        // CORRECT GUESS! Make sure distance shows as 0
        closestDistance = 0;
        updateClosestDisplay();
        
        setTimeout(() => {
            animateLetter(target);
            // Re-focus input for next guess
            setTimeout(() => {
                document.getElementById('guessInput').focus();
            }, 100);
        }, 500);
    }
}

// ========================================
// Update Closest Display
// ========================================
function updateClosestDisplay() {
    const el = document.getElementById('closestGuess');
    if (closestDistance === Infinity) {
        el.textContent = '';
    } else {
        el.textContent = `Closest: ${Math.round(closestDistance).toLocaleString()} km`;
    }
}

// ========================================
// Update Guess Counter
// ========================================
function updateGuessCounter() {
    const el = document.getElementById('guessCounter');
    el.textContent = `Guesses: ${totalGuessCount}`;
}

// ========================================
// Country to Flag Emoji
// ========================================
const COUNTRY_FLAGS = {
    'Afghanistan': '🇦🇫', 'Albania': '🇦🇱', 'Algeria': '🇩🇿', 'Andorra': '🇦🇩', 'Angola': '🇦🇴',
    'Argentina': '🇦🇷', 'Armenia': '🇦🇲', 'Australia': '🇦🇺', 'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿',
    'Bahamas': '🇧🇸', 'Bangladesh': '🇧🇩', 'Belarus': '🇧🇾', 'Belgium': '🇧🇪', 'Belize': '🇧🇿',
    'Benin': '🇧🇯', 'Bhutan': '🇧🇹', 'Bolivia': '🇧🇴', 'Bosnia and Herzegovina': '🇧🇦', 'Botswana': '🇧🇼',
    'Brazil': '🇧🇷', 'Brunei': '🇧🇳', 'Bulgaria': '🇧🇬', 'Burkina Faso': '🇧🇫', 'Burundi': '🇧🇮',
    'Cambodia': '🇰🇭', 'Cameroon': '🇨🇲', 'Canada': '🇨🇦', 'Central African Republic': '🇨🇫',
    'Chad': '🇹🇩', 'Chile': '🇨🇱', 'China': '🇨🇳', 'Colombia': '🇨🇴', 'Congo': '🇨🇬',
    'Costa Rica': '🇨🇷', 'Croatia': '🇭🇷', 'Cuba': '🇨🇺', 'Cyprus': '🇨🇾', 'Czechia': '🇨🇿',
    'Denmark': '🇩🇰', 'Djibouti': '🇩🇯', 'Dominican Republic': '🇩🇴', 'Ecuador': '🇪🇨',
    'Egypt': '🇪🇬', 'El Salvador': '🇸🇻', 'Eritrea': '🇪🇷', 'Estonia': '🇪🇪', 'Ethiopia': '🇪🇹',
    'Fiji': '🇫🇯', 'Finland': '🇫🇮', 'France': '🇫🇷', 'Gabon': '🇬🇦', 'Gambia': '🇬🇲',
    'Georgia': '🇬🇪', 'Germany': '🇩🇪', 'Ghana': '🇬🇭', 'Greece': '🇬🇷', 'Guatemala': '🇬🇹',
    'Guinea': '🇬🇳', 'Guyana': '🇬🇾', 'Haiti': '🇭🇹', 'Honduras': '🇭🇳', 'Hungary': '🇭🇺',
    'Iceland': '🇮🇸', 'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iran': '🇮🇷', 'Iraq': '🇮🇶',
    'Ireland': '🇮🇪', 'Israel': '🇮🇱', 'Italy': '🇮🇹', 'Jamaica': '🇯🇲', 'Japan': '🇯🇵',
    'Jordan': '🇯🇴', 'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪', 'Kuwait': '🇰🇼', 'Kyrgyzstan': '🇰🇬',
    'Laos': '🇱🇦', 'Latvia': '🇱🇻', 'Lebanon': '🇱🇧', 'Lesotho': '🇱🇸', 'Liberia': '🇱🇷',
    'Libya': '🇱🇾', 'Lithuania': '🇱🇹', 'Luxembourg': '🇱🇺', 'Madagascar': '🇲🇬', 'Malawi': '🇲🇼',
    'Malaysia': '🇲🇾', 'Mali': '🇲🇱', 'Mauritania': '🇲🇷', 'Mexico': '🇲🇽', 'Moldova': '🇲🇩',
    'Mongolia': '🇲🇳', 'Montenegro': '🇲🇪', 'Morocco': '🇲🇦', 'Mozambique': '🇲🇿', 'Myanmar': '🇲🇲',
    'Namibia': '🇳🇦', 'Nepal': '🇳🇵', 'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿', 'Nicaragua': '🇳🇮',
    'Niger': '🇳🇪', 'Nigeria': '🇳🇬', 'North Korea': '🇰🇵', 'Norway': '🇳🇴', 'Oman': '🇴🇲',
    'Pakistan': '🇵🇰', 'Panama': '🇵🇦', 'Papua New Guinea': '🇵🇬', 'Paraguay': '🇵🇾', 'Peru': '🇵🇪',
    'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹', 'Qatar': '🇶🇦', 'Romania': '🇷🇴',
    'Russia': '🇷🇺', 'Rwanda': '🇷🇼', 'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳', 'Serbia': '🇷🇸',
    'Sierra Leone': '🇸🇱', 'Singapore': '🇸🇬', 'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'Somalia': '🇸🇴',
    'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'South Sudan': '🇸🇸', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰',
    'Sudan': '🇸🇩', 'Suriname': '🇸🇷', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Syria': '🇸🇾',
    'Taiwan': '🇹🇼', 'Tajikistan': '🇹🇯', 'Tanzania': '🇹🇿', 'Thailand': '🇹🇭', 'Togo': '🇹🇬',
    'Trinidad and Tobago': '🇹🇹', 'Tunisia': '🇹🇳', 'Turkey': '🇹🇷', 'Turkmenistan': '🇹🇲',
    'Uganda': '🇺🇬', 'Ukraine': '🇺🇦', 'United Arab Emirates': '🇦🇪', 'United Kingdom': '🇬🇧',
    'United States of America': '🇺🇸', 'Uruguay': '🇺🇾', 'Uzbekistan': '🇺🇿', 'Venezuela': '🇻🇪',
    'Vietnam': '🇻🇳', 'Yemen': '🇾🇪', 'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼'
};

function getFlag(countryName) {
    return COUNTRY_FLAGS[countryName] || '🏳️';
}

// ========================================
// Add Guess to History
// ========================================
function addGuessToHistory(name, distance, arrow, isCorrect) {
    const history = document.getElementById('guessHistory');

    const item = document.createElement('span');
    item.className = 'history-item' + (isCorrect ? ' correct' : '');
    item.style.color = getDistanceColor(distance);
    item.innerHTML = `${getFlag(name)} ${name}`;

    history.appendChild(item);
}

// ========================================
// Show Valentine Card
// ========================================
// ========================================
// Animate Letter (Pop & Fly)
// ========================================
function animateLetter(target) {
    // 1. Create flying letter element
    const flyer = document.createElement('div');
    flyer.textContent = target.letter;
    flyer.className = 'flying-letter';
    document.body.appendChild(flyer);

    // 2. Initial state: Center screen, large, invisible
    Object.assign(flyer.style, {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%) scale(0)',
        fontSize: '120px',
        fontWeight: 'bold',
        color: 'var(--accent-deep)',
        fontFamily: 'var(--font-pixel)',
        textShadow: '0 4px 20px rgba(255, 105, 180, 0.5)',
        zIndex: '2000',
        opacity: '0',
        transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    // 3. Animate IN (Pop up in center)
    requestAnimationFrame(() => {
        flyer.style.opacity = '1';
        flyer.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // 4. Wait, then animate to slot
    setTimeout(() => {
        const slots = document.querySelectorAll('.letter-slot');
        const targetSlot = slots[currentTargetIndex];
        const rect = targetSlot.getBoundingClientRect();

        // Calculate target position relative to viewport
        // Center of the slot
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        // Move to target
        flyer.style.transition = 'all 0.8s ease-in-out';
        flyer.style.left = `${targetX}px`;
        flyer.style.top = `${targetY}px`;
        flyer.style.transform = 'translate(-50%, -50%) scale(0.25)'; // Scale down to fit slot size approx
        flyer.style.opacity = '0.5';

        // 5. On arrival: reveal slot, remove flyer, continue
        setTimeout(() => {
            flyer.remove();

            // Reveal slot
            targetSlot.textContent = target.letter;
            targetSlot.classList.add('revealed');

            // Pulse animation on the slot
            targetSlot.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.5)' },
                { transform: 'scale(1)' }
            ], { duration: 300 });

            // Add to permanent list
            permanentlySolvedCountries.add(target.name);

            // Add photo sticker
            solvedMarkers.push({
                lat: target.lat,
                lng: target.lng,
                img: target.img,
                id: target.name
            });
            globe.htmlElementsData(solvedMarkers); // Update globe markers

            // Move to next stage
            continueToNextStage();

        }, 800); // Match transition duration

    }, 1500); // How long it stays in center
}

// ========================================
// Continue To Next Stage
// ========================================
function continueToNextStage() {
    // move to next
    currentTargetIndex++;

    // Clear guessed countries for fresh start on new target
    guessedCountries.clear();
    closestDistance = Infinity;
    document.getElementById('closestGuess').textContent = '';
    document.getElementById('guessHistory').innerHTML = '';
    globe.polygonCapColor(feat => getCountryColor(feat));

    // Check if complete
    if (currentTargetIndex >= TARGET_SEQUENCE.length) {
        setTimeout(showVictory, 500);
    } else {
        updateProgressHint();
        if (globe) globe.controls().autoRotate = true;
        
        // Ensure input is ready for next guess
        const input = document.getElementById('guessInput');
        input.value = '';
        input.disabled = false;
        input.focus();
    }
}

// ========================================
// Update Progress Hint
// ========================================
function updateProgressHint() {
    const hint = document.getElementById('progressHint');
    if (currentTargetIndex < TARGET_SEQUENCE.length) {
        hint.textContent = `Find country ${currentTargetIndex + 1} of ${TARGET_SEQUENCE.length}...`;
    } else {
        hint.textContent = 'Complete!';
    }

    // Clear guess history for new round
    document.getElementById('guessHistory').innerHTML = '';
}

// ========================================
// Show Victory
// ========================================
const COLORS = ['#FF1493', '#FF69B4', '#FFB6C1', '#C71585', '#DB3E7A'];

function showVictory() {
    // 1. Swirl Letters Up (no dimming)
    setTimeout(swirlLetters, 500);

    // 2. Show Big Question
    setTimeout(() => {
        const question = document.getElementById('finaleQuestion');
        question.classList.add('visible');
    }, 2500);

    // 3. Setup Yes Button Action
    document.getElementById('yesButton').addEventListener('click', startHeartExplosion);
}

function swirlLetters() {
    const slots = document.querySelectorAll('.letter-slot');
    const container = document.getElementById('swirlContainer');

    // Store original positions first
    slots.forEach((slot, index) => {
        const rect = slot.getBoundingClientRect();

        // Create clone for animation
        const clone = document.createElement('div');
        clone.textContent = slot.textContent;
        clone.className = 'flying-letter';
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.fontSize = '36px';
        clone.style.fontFamily = 'var(--font-pixel)';
        clone.style.color = 'var(--accent-pink)';
        clone.style.fontWeight = 'bold';
        clone.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.3)';
        clone.style.zIndex = '9001';
        clone.style.transition = 'all 2s ease-in-out';

        container.appendChild(clone);

        // Hide original
        slot.style.opacity = '0';

        // Animate to swirl
        requestAnimationFrame(() => {
            // Random offset for organic swirl feel
            const angle = (index / slots.length) * Math.PI * 2;
            const radius = 100 + Math.random() * 50;
            const targetX = window.innerWidth / 2 + Math.cos(angle) * radius;
            const targetY = window.innerHeight / 2 + Math.sin(angle) * radius - 100;

            clone.style.left = (targetX - rect.width / 2) + 'px';
            clone.style.top = (targetY - rect.height / 2) + 'px';
            clone.style.transform = `rotate(${angle}rad) scale(1.5)`;
            clone.style.opacity = '0.8';
        });
    });
}

function startHeartExplosion() {
    // Hide question
    document.getElementById('finaleQuestion').style.display = 'none';

    // Keep globe visible, create explosion effect
    createFaceExplosion();
}

const FACE_IMG = 'assets/Subject 2.png';

function createFaceExplosion() {
    const globeContainer = document.getElementById('globeContainer');
    const rect = globeContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Create flash effect at explosion point
    const flash = document.createElement('div');
    flash.className = 'explosion-flash';
    flash.style.left = centerX + 'px';
    flash.style.top = centerY + 'px';
    document.body.appendChild(flash);
    
    requestAnimationFrame(() => {
        flash.style.transform = 'translate(-50%, -50%) scale(15)';
        flash.style.opacity = '0';
    });
    
    setTimeout(() => flash.remove(), 600);

    // Create 6 huge dancing heads around the globe
    createDancingHeads(centerX, centerY);

    // Spawn 100 faces from globe center
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            spawnBouncingFace(true, centerX, centerY);
        }, i * 15);
    }
}

function createDancingHeads(centerX, centerY) {
    const headSize = 405; // 25% smaller again (540 * 0.75)
    
    // Position heads manually to ensure they're all visible
    // Adjusted to move top heads down and keep all on screen
    const positions = [
        // Top 2 - moved down more to be visible
        { x: centerX - 350, y: centerY - 280, type: 'shake' },
        { x: centerX + 350, y: centerY - 280, type: 'shake' },
        // Middle 2 - spinning
        { x: centerX - 450, y: centerY, type: 'spin' },
        { x: centerX + 450, y: centerY, type: 'spin' },
        // Bottom 2 - shaking
        { x: centerX - 350, y: centerY + 280, type: 'shake' },
        { x: centerX + 350, y: centerY + 280, type: 'shake' }
    ];
    
    positions.forEach((pos, i) => {
        const head = document.createElement('div');
        head.className = `dancing-head dancing-head-${pos.type}`;
        head.style.backgroundImage = `url('${FACE_IMG}')`;
        head.style.left = pos.x + 'px';
        head.style.top = pos.y + 'px';
        head.style.width = headSize + 'px';
        head.style.height = headSize + 'px';
        head.style.animationDelay = (i * 0.15) + 's';
        
        document.body.appendChild(head);
    });
}

function spawnBouncingFace(explosive = false, startX = null, startY = null) {
    const el = document.createElement('div');
        el.className = 'spinning-face';
        el.style.backgroundImage = `url('${FACE_IMG}')`;
    
    document.body.appendChild(el);

    // Physics State
    let x = startX !== null ? startX : window.innerWidth / 2;
    let y = startY !== null ? startY : window.innerHeight / 2;

    // Increased Velocity for "VIOLENT" explosion
    let vx = (Math.random() - 0.5) * (explosive ? 100 : 20);
    let vy = (Math.random() - 0.5) * (explosive ? 100 : 20) - (explosive ? 30 : 0); // Extra upward boost
    const gravity = 0.5;
    const bounce = -0.75; // Higher bounce coefficient to keep bouncing
    const floor = window.innerHeight - 80; // More space from bottom
    
    if (!explosive) {
        x = Math.random() * window.innerWidth;
        y = -50;
        vx = (Math.random() - 0.5) * 10;
        vy = Math.random() * 10;
    }

    el.style.left = x + 'px';
    el.style.top = y + 'px';

    // All faces same size (biggest size)
    const headSize = 72;
    el.style.width = headSize + 'px';
    el.style.height = headSize + 'px';

    // Random spin speed
    const spinDuration = 0.5 + Math.random() * 1.5;
    el.style.animationDuration = spinDuration + 's';

    // Physics Loop for this face
    function update() {
        vy += gravity;
        x += vx;
        y += vy;

        // Floor collision
        if (y > floor) {
            y = floor;
            vy *= bounce;
            
            // Add minimum bounce velocity to keep bouncing
            if (Math.abs(vy) < 3) {
                vy = -5; // Give it a boost
            }
            
            // Less friction to keep moving
            vx *= 0.96;
        }

        // Wall collision with bounce
        if (x < 0) {
            x = 0;
            vx *= -0.85;
        } else if (x > window.innerWidth) {
            x = window.innerWidth;
            vx *= -0.85;
        }
        
        // Ceiling collision (bounce off top too)
        if (y < 0) {
            y = 0;
            vy *= -0.85;
        }

        el.style.left = x + 'px';
        el.style.top = y + 'px';

        requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function spawnBouncingHeart(explosive = false) {
    const isFace = Math.random() > 0.6; // 40% chance for a face

    if (isFace) {
        spawnBouncingFace(explosive);
        return;
    }
    
    const el = document.createElement('div');
        el.className = 'heart-particle';
        el.textContent = '❤️';
        el.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];

    document.body.appendChild(el);

    // Physics State
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    // Increased Velocity for "VIOLENT" explosion
    let vx = (Math.random() - 0.5) * (explosive ? 60 : 20);
    let vy = (Math.random() - 0.5) * (explosive ? 60 : 20);
    const gravity = 0.5;
    const bounce = -0.7;
    const floor = window.innerHeight - 50;
    
    if (!explosive) {
        x = Math.random() * window.innerWidth;
        y = -50;
        vx = (Math.random() - 0.5) * 10;
        vy = Math.random() * 10;
    }

    el.style.left = x + 'px';
    el.style.top = y + 'px';

    // Scale hearts
    const scale = 0.5 + Math.random() * 1.5;
    el.style.transform = `scale(${scale})`;

    // Physics Loop for this heart
    function update() {
        vy += gravity;
        x += vx;
        y += vy;

        // Floor collision
        if (y > floor) {
            y = floor;
            vy *= bounce;
            // Friction
            vx *= 0.95;
        }

        // Wall collision
        if (x < 0 || x > window.innerWidth) {
            vx *= -1;
        }

        el.style.left = x + 'px';
        el.style.top = y + 'px';

        // Remove if still
        if (Math.abs(vy) < 0.1 && Math.abs(vx) < 0.1 && y >= floor) {
            if (Math.random() > 0.9) el.remove();
            return;
        }

        requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ========================================
// Show Error
// ========================================
function showError(msg) {
    const input = document.getElementById('guessInput');
    input.classList.add('error');
    input.placeholder = msg;
    setTimeout(() => {
        input.classList.remove('error');
        input.placeholder = 'Guess a country...';
    }, 1500);
}

// ========================================
// Autocomplete
// ========================================
function showAutocomplete(query) {
    const list = document.getElementById('autocompleteList');
    list.innerHTML = '';

    if (query.length < 2) {
        list.classList.remove('visible');
        return;
    }

    const matches = allCountryNames.filter(n =>
        n.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);

    if (matches.length === 0) {
        list.classList.remove('visible');
        return;
    }

    matches.forEach(name => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = name;
        item.addEventListener('click', () => {
            document.getElementById('guessInput').value = name;
            hideAutocomplete();
            makeGuess(name);
        });
        list.appendChild(item);
    });

    list.classList.add('visible');
}

function hideAutocomplete() {
    document.getElementById('autocompleteList').classList.remove('visible');
}

// ========================================
// Event Listeners
// ========================================
function initEventListeners() {
    const input = document.getElementById('guessInput');
    const btn = document.getElementById('guessButton');

    // Input events
    input.addEventListener('input', (e) => {
        showAutocomplete(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            makeGuess(input.value);
        }
        if (e.key === 'Escape') {
            hideAutocomplete();
        }
    });

    // Button click
    btn.addEventListener('click', () => {
        makeGuess(input.value);
    });



    // Click outside autocomplete
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.guess-section')) {
            hideAutocomplete();
        }
    });
}

// ========================================
// Start
// ========================================
window.addEventListener('DOMContentLoaded', init);