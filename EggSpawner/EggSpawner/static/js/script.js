// Move settingsModal initialization to the top with other initializations
const settingsModal = document.getElementById('settingsModal');
const settingsMenuBtn = document.getElementById('settingsMenuBtn');
const cursorOptions = document.querySelectorAll('.cursor-option');
const eggSpawnCount = document.getElementById('eggSpawnCount');
const rainbowChance = document.getElementById('rainbowChance');
const rainbowChanceValue = document.getElementById('rainbowChanceValue');

// Add URL parameter handling at the beginning of the file, before other code
const urlParams = new URLSearchParams(window.location.search);
const joinCode = urlParams.get('join');

// Add at the beginning of the file after other initializations
const gameMessages = [
    "Try clicking multiple eggs at once!",
    "Did you know? You can customize your cursor in settings!",
    "Challenge: Can you spawn 50 eggs without crashing?",
    "Pro tip: Rainbow eggs are rare but worth finding!",
    "Want chaos? Try spawning eggs rapidly!",
    "Hidden feature: What happens at 54 eggs?",
    "Experiment with different cursor movements!",
    "Egg physics are more fun with friends!",
    "Try dragging eggs around the screen!",
    "Can you find all cursor styles?"
];

let usedMessages = new Set();
let messageInterval;

// Initialize socket and global variables
let socket = io();
let currentServer = null;
let otherPlayers = new Map();
let playerName = '';
let mouseX = 0;
let mouseY = 0;
let mouseVelX = 0;
let mouseVelY = 0;
let lastEmitTime = 0;
let eggs = [];
let isExploding = false;
const EMIT_INTERVAL = 50;

// Initialize UI elements
const serverModal = document.getElementById('serverModal');
const serverListBtn = document.getElementById('serverListBtn');
const closeModal = document.getElementById('closeModal');
const createServerBtn = document.getElementById('createServerBtn');
const joinServerBtn = document.getElementById('joinServerBtn');
const serverNameInput = document.getElementById('serverNameInput');
const serverCodeInput = document.getElementById('serverCodeInput');
const serverList = document.getElementById('serverList');
const playerNameInput = document.getElementById('playerNameInput');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const chatContainer = document.getElementById('chatContainer');
const leaveServerBtn = document.getElementById('leaveServerBtn');
const toggleVoiceChatBtn = document.getElementById('toggleVoiceChat');
const bsod = document.getElementById('bsod');
const bsodContent = bsod.querySelector('.content');
const progressSpan = document.getElementById('progress');
const blackScreen = document.getElementById('blackScreen');
const eggContainer = document.getElementById('eggContainer');
const spawnButton = document.getElementById('spawnEgg');
const microwave = document.getElementById('microwave');

// Initially show server list button
serverListBtn.style.display = 'block';

// Create touch indicator
const touchIndicator = document.createElement('div');
touchIndicator.className = 'touch-indicator';
document.body.appendChild(touchIndicator);

// Wait for DOM to be loaded
document.addEventListener('DOMContentLoaded', function() {
    // Update main menu event listeners section
    document.getElementById('createServerMenuBtn').addEventListener('click', () => {
        const playerName = document.getElementById('mainMenuPlayerName').value.trim();
        if (!playerName) {
            alert('Please enter your name first!');
            return;
        }
        document.getElementById('playerNameInput').value = playerName;
        document.getElementById('mainMenu').style.display = 'none';
        serverModal.style.display = 'block';
        // Load server list when showing modal
        loadServerList();
    });

    document.getElementById('joinServerMenuBtn').addEventListener('click', () => {
        const playerName = document.getElementById('mainMenuPlayerName').value.trim();
        if (!playerName) {
            alert('Please enter your name first!');
            return;
        }
        document.getElementById('playerNameInput').value = playerName;
        document.getElementById('mainMenu').style.display = 'none';
        serverModal.style.display = 'block';
        // Load server list when showing modal
        loadServerList();
    });

    // Settings button functionality
    document.getElementById('mainMenu').querySelector('#settingsMenuBtn').addEventListener('click', () => {
        settingsModal.style.display = 'block';
    });

    // Close settings modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Handle cursor style selection
    cursorOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            cursorOptions.forEach(opt => opt.classList.remove('selected'));
            // Add selected class to clicked option
            option.classList.add('selected');

            // Update cursor style
            const cursorType = option.dataset.cursor;
            document.body.style.cursor = `url('/static/images/cursor-${cursorType}.svg'), auto`;
        });
    });

    // Update server list button functionality
    serverListBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        serverModal.style.display = 'block';
        loadServerList(); // Load server list when button is clicked
    });

    closeModal.addEventListener('click', (e) => {
        e.stopPropagation();
        serverModal.style.display = 'none';
        // Don't show main menu if already in a server
        if (!currentServer) {
            document.getElementById('mainMenu').style.display = 'block';
        }
    });

    // Update modal click outside behavior
    window.addEventListener('click', (e) => {
        if (e.target === serverModal) {
            serverModal.style.display = 'none';
            // Don't show main menu if already in a server
            if (!currentServer) {
                document.getElementById('mainMenu').style.display = 'block';
            }
        }
    });

    // Load server list function
    function loadServerList() {
        serverList.innerHTML = '<div class="loading-message">Loading servers...</div>';

        fetch('/api/servers')
            .then(response => response.json())
            .then(servers => {
                serverList.innerHTML = '';
                if (servers.length === 0) {
                    serverList.innerHTML = '<div class="server-message">No servers available</div>';
                    return;
                }

                // Sort servers - full servers go to the bottom
                servers.sort((a, b) => {
                    const aIsFull = a.player_count >= a.max_players;
                    const bIsFull = b.player_count >= b.max_players;
                    if (aIsFull && !bIsFull) return 1;
                    if (!aIsFull && bIsFull) return -1;
                    return 0;
                });

                servers.forEach(server => {
                    const serverItem = document.createElement('div');
                    serverItem.className = 'server-item fade-in';
                    if (server.player_count >= server.max_players) {
                        serverItem.classList.add('server-full');
                    }
                    serverItem.innerHTML = `
                        <span>${server.name} (${server.code}) - ${server.player_count}/${server.max_players} players</span>
                        <button ${server.player_count >= server.max_players ? 'disabled' : ''}>
                            ${server.player_count >= server.max_players ? 'Full' : 'Join'}
                        </button>
                    `;
                    const joinButton = serverItem.querySelector('button');
                    if (!server.player_count >= server.max_players) {
                        joinButton.addEventListener('click', () => joinServer(server.code));
                    }
                    serverList.appendChild(serverItem);

                    // Trigger fade-in animation
                    setTimeout(() => {
                        serverItem.classList.add('visible');
                    }, 50);
                });
            })
            .catch(error => {
                console.error('Error loading servers:', error);
                serverList.innerHTML = '<div class="error">Failed to load servers. Please try again.</div>';
            });
    }

    // Create server
    createServerBtn.addEventListener('click', async () => {
        const serverName = serverNameInput.value.trim();
        const name = playerNameInput.value.trim() || playerName;
        const noLimits = document.getElementById('noLimitsMode').checked;
        let maxPlayers;

        if (noLimits) {
            maxPlayers = 999999; // Effectively unlimited
        } else {
            maxPlayers = parseInt(document.getElementById('maxPlayersInput').value) || 4;
            if (maxPlayers > 10) {
                alert('Maximum 10 players allowed when No Limits mode is disabled');
                return;
            }
        }

        if (!name) {
            alert('Please enter your name first!');
            return;
        }
        if (name.length < 3) {
            alert('Name must be at least 3 characters long!');
            return;
        }
        if (!serverName) {
            alert('Please enter a server name!');
            return;
        }

        try {
            const response = await fetch('/api/servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: serverName,
                    max_players: maxPlayers,
                    no_limits: noLimits
                }),
            });
            const server = await response.json();
            if (server.error) {
                throw new Error(server.error);
            }

            currentServer = server;

            // Join the server as owner
            socket.emit('join_server', {
                server_id: server.id,
                player_name: name,
                is_owner: true
            });

            serverNameInput.value = '';
            document.getElementById('mainMenu').style.display = 'none';
            serverModal.style.display = 'none';
            updateServerInfo(server);
            loadEggs();
        } catch (error) {
            console.error('Error creating server:', error);
            alert('Error creating server. Please try again.');
        }
    });

    // Join server function
    async function joinServer(code) {
        try {
            if (!code) {
                alert('Please enter a server code!');
                return;
            }

            let name = playerNameInput.value.trim() || playerName;
            if (!name) {
                // Get default player name from connected_users
                const defaultName = await getNextPlayerName();
                name = defaultName;
                playerNameInput.value = name;
            }

            playerName = name;

            // Show loading screen
            const loadingScreen = document.getElementById('loadingScreen');
            const loadingLogs = document.getElementById('loadingLogs');
            loadingScreen.classList.add('visible');

            // Add loading logs
            function addLog(message) {
                const log = document.createElement('p');
                log.textContent = message;
                loadingLogs.appendChild(log);
                loadingLogs.scrollTop = loadingLogs.scrollHeight;
            }

            addLog('Connecting to server...');

            const response = await fetch(`/api/servers/${code}`);
            if (!response.ok) {
                throw new Error('Server not found or unavailable');
            }

            addLog('Server found, validating connection...');

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }

            currentServer = data;

            addLog('Joining server room...');

            // Join the server
            socket.emit('join_server', {
                server_id: data.id,
                player_name: playerName
            });

            addLog('Loading server data...');

            // Close menus but keep server list button visible
            serverCodeInput.value = '';
            document.getElementById('mainMenu').style.display = 'none';
            serverModal.style.display = 'none';

            // Update UI
            updateServerInfo(data);
            loadEggs();

            addLog('Successfully joined server!');

            // Hide loading screen after a brief delay
            setTimeout(() => {
                loadingScreen.classList.remove('visible');
                loadingLogs.innerHTML = '';  // Clear logs for next time
            }, 1000);

        } catch (error) {
            console.error('Error joining server:', error);
            alert(error.message || 'Failed to join server. Please try again.');
            const loadingScreen = document.getElementById('loadingScreen');
            loadingScreen.classList.remove('visible');
            document.getElementById('loadingLogs').innerHTML = '';
        }
    }

    // Join server button handler
    joinServerBtn.addEventListener('click', async () => {
        const code = serverCodeInput.value.trim().toUpperCase();
        await joinServer(code);
    });

    // Leave server button handler
    leaveServerBtn.addEventListener('click', () => {
        if (currentServer) {
            if (messageInterval) {
                clearInterval(messageInterval);
                messageInterval = null;
            }
            if (inVoiceChat) {
                socket.emit('leave_voice_chat', {
                    server_id: currentServer.id
                });
                inVoiceChat = false;
                toggleVoiceChatBtn.textContent = 'Join Voice Chat';
                toggleVoiceChatBtn.classList.remove('active');
            }
            socket.emit('user_leaving');
            currentServer = null;
            updateServerInfo(null);
            eggContainer.innerHTML = '';
            eggs = [];
        }
    });

    // Voice chat button handler
    toggleVoiceChatBtn.addEventListener('click', async function() {
        if (!currentServer) return;

        if (!inVoiceChat) {
            const micPermissionGranted = await requestMicrophonePermission();
            if (!micPermissionGranted) return;
        }

        inVoiceChat = !inVoiceChat;
        toggleVoiceChatBtn.textContent = inVoiceChat ? 'Leave Voice Chat' : 'Join Voice Chat';
        toggleVoiceChatBtn.classList.toggle('active', inVoiceChat);

        if (inVoiceChat) {
            socket.emit('join_voice_chat', {
                server_id: currentServer.id,
                username: playerName
            });
        } else {
            // Clean up audio when leaving
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};

            socket.emit('leave_voice_chat', {
                server_id: currentServer.id
            });
        }
    });

    // Microphone permission helper
    async function requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream = stream; // Assign the stream to the global variable
            return stream;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Please grant microphone permissions to use voice chat');
            return null;
        }
    }

    // Track and emit mouse position with rate limiting
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        const now = Date.now();

        // Update grabbed egg position
        eggs.forEach(egg => {
            if (egg.isGrabbed) {
                egg.x = mouseX - egg.grabOffsetX;
                egg.y = mouseY - egg.grabOffsetY;
                egg.vx = (mouseX - egg.lastX) || 0;
                egg.vy = (mouseY - egg.lastY) || 0;
                egg.lastX = egg.x;
                egg.lastY = egg.y;

                // Sync grabbed egg more frequently
                if (currentServer && now - egg.lastSync >= 30) {
                    socket.emit('sync_egg', {
                        server_id: currentServer.id,
                        egg_id: egg.element.id,
                        x: egg.x,
                        y: egg.y,
                        vx: egg.vx,
                        vy: egg.vy,
                        rotation: egg.rotation
                    });
                    egg.lastSync = now;
                }
            }
        });

        if (currentServer && now - lastEmitTime >= EMIT_INTERVAL) {
            socket.emit('mouse_move', {
                x: mouseX,
                y: mouseY,
                player_name: playerName
            });
            lastEmitTime = now;
        }
    });

    // Handle mobile touch events
    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchIndicator.style.left = touch.clientX + 'px';
        touchIndicator.style.top = touch.clientY + 'px';
        touchIndicator.classList.add('active');

        if (currentServer) {
            socket.emit('mouse_move', {
                x: touch.clientX,
                y: touch.clientY,
                player_name: playerName
            });
        }
    });

    document.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        touchIndicator.style.left = touch.clientX + 'px';
        touchIndicator.style.top = touch.clientY + 'px';

        const now = Date.now();
        if (currentServer && now - lastEmitTime >= EMIT_INTERVAL) {
            socket.emit('mouse_move', {
                x: touch.clientX,
                y: touch.clientY,
                player_name: playerName
            });
            lastEmitTime = now;
        }
    });

    document.addEventListener('touchend', () => {
        touchIndicator.classList.remove('active');
    });

    // Handle other players' cursors with interpolation
    socket.on('mouse_update', (data) => {
        if (data.user_id === socket.id) return; // Ignore own cursor

        let cursor = otherPlayers.get(data.user_id);
        if (!cursor) {
            cursor = {
                element: document.createElement('div'),
                x: data.x,
                y: data.y,
                targetX: data.x,
                targetY: data.y
            };
            cursor.element.className = 'player-cursor';

            // Add name tag
            const nameTag = document.createElement('div');
            nameTag.className = 'name-tag';
            cursor.element.appendChild(nameTag);

            document.body.appendChild(cursor.element);
            otherPlayers.set(data.user_id, cursor);
        }

        // Clear existing timeout
        if (cursor.timeout) {
            clearTimeout(cursor.timeout);
        }
        cursor.timeout = setTimeout(() => {
            cursor.element.remove();
            otherPlayers.delete(data.user_id);
        }, 5000); // Remove cursor after 5 seconds of no updates

        // Update target position for interpolation
        cursor.targetX = data.x;
        cursor.targetY = data.y;

        // Update name tag
        const nameTag = cursor.element.querySelector('.name-tag');
        nameTag.textContent = data.player_name || 'Guest';
    });

    // Smooth cursor interpolation
    function updateCursors() {
        otherPlayers.forEach((cursor) => {
            // Interpolate position
            cursor.x += (cursor.targetX - cursor.x) * 0.3;
            cursor.y += (cursor.targetY - cursor.y) * 0.3;

            cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
        });
        requestAnimationFrame(updateCursors);
    }

    // Start cursor updates
    requestAnimationFrame(updateCursors);


    // Handle default player name assignment
    socket.on('default_player_name', (data) => {
        if (!playerName) {  // Only set if user hasn't chosen a name
            playerName = data.name;
            // Update any player name input if it exists and is empty
            const playerNameInput = document.getElementById('playerNameInput');
            if (playerNameInput && !playerNameInput.value) {
                playerNameInput.value = playerName;
            }
        }
    });

    // Update cursor container styles
    const cursorContainer = document.createElement('div');
    cursorContainer.id = 'cursorContainer';
    cursorContainer.style.position = 'fixed';
    cursorContainer.style.top = '0';
    cursorContainer.style.left = '0';
    cursorContainer.style.pointerEvents = 'none';
    cursorContainer.style.zIndex = '9999';
    document.body.appendChild(cursorContainer);

    // Add custom cursor style to body
    document.body.style.cursor = `url('/static/images/cursor.png'), auto`;


    // Add server info elements
    const serverInfo = document.getElementById('serverInfo');
    const serverCodeDisplay = document.getElementById('serverCode');
    const playerCountDisplay = document.getElementById('playerCount');

    // Server list modal controls


    // Update server info display
    function updateServerInfo(server) {
        if (server) {
            serverInfo.style.display = 'block';
            serverCodeDisplay.textContent = `Server: ${server.code || 'Unknown'}`;
            if (server.no_limits) {
                playerCountDisplay.textContent = `Players: ${server.player_count}/${'\u221E'}`; // Infinity symbol
            } else {
                playerCountDisplay.textContent = `Players: ${server.player_count}/${server.max_players || 4}`;
            }
            chatContainer.style.display = 'block';

            // Keep server list button visible
            serverListBtn.style.display = 'block';

            // Update quick join link
            const quickJoinLink = document.getElementById('quickJoinLink');
            const joinUrl = `${window.location.origin}?join=${server.code}`;
            quickJoinLink.value = joinUrl;
        } else {
            serverInfo.style.display = 'none';
            chatContainer.style.display = 'none';
            // Keep server list button visible
            serverListBtn.style.display = 'block';
        }
    }

    // Handle server events
    socket.on('user_joined_server', (data) => {
        if (currentServer && currentServer.id === data.server_id) {
            // Clear existing interval if any
            if (messageInterval) clearInterval(messageInterval);
            // Start new interval
            messageInterval = setInterval(showRandomMessage, 180000); // 3 minutes
            currentServer.player_count = data.player_count;
            updateServerInfo(currentServer);

            // Send current cursor position to new user
            if (playerName) {
                socket.emit('mouse_move', {
                    x: mouseX,
                    y: mouseY,
                    player_name: playerName
                });
            }
        }
    });

    socket.on('server_updated', (data) => {
        if (currentServer && currentServer.id === data.id) {
            currentServer.player_count = data.player_count;
            updateServerInfo(currentServer);
        }
    });

    socket.on('server_full', (data) => {
        if (!window.lastErrorTime || Date.now() - window.lastErrorTime > 2000) {
            alert(data.message);
            window.lastErrorTime = Date.now();
        }
    });


    socket.on('user_disconnected', (data) => {
        // Remove the disconnected user's cursor
        if (otherPlayers.has(data.user_id)) {
            const cursor = otherPlayers.get(data.user_id);
            cursor.element.remove();
            otherPlayers.delete(data.user_id);
        }

        // Reset voice chat if we're the one disconnecting
        if (data.user_id === socket.id && inVoiceChat) {
            inVoiceChat = false;
            toggleVoiceChatBtn.textContent = 'Join Voice Chat';
            toggleVoiceChatBtn.classList.remove('active');
        }
    });

    // Add draggable functionality to server modal
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Position modal in center initially
    serverModal.style.position = 'fixed';
    serverModal.style.top = '50%';
    serverModal.style.left = '50%';
    serverModal.style.transform = 'translate(-50%, -50%)';

    // Add draggable functionality
    serverModal.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target === serverModal) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            serverModal.style.cursor = 'grabbing';
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            serverModal.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        serverModal.style.cursor = 'grab';
    }

    // Setup server list functionality


    // Update socket event handlers for server-related events
    socket.on('server_error', (data) => {
        // Only show one error message at a time
        if (!window.lastErrorTime || Date.now() - window.lastErrorTime > 2000) {
            alert(data.message || 'Server error occurred');
            window.lastErrorTime = Date.now();
        }
    });

    socket.on('server_full', (data) => {
        if (!window.lastErrorTime || Date.now() - window.lastErrorTime > 2000) {
            alert(data.message);
            window.lastErrorTime = Date.now();
        }
    });

    // Update socket event handlers
    socket.on('new_egg', (data) => {
        if (data.server_id === (currentServer?.id || null)) {
            const egg = createEggElement(data.x, data.y, data.color, data.is_rainbow, data.is_polish);
            // Add initial velocities from server
            egg.vx = data.vx;
            egg.vy = data.vy;
        }
    });

    // Add egg synchronization
    socket.on('egg_sync', (data) => {
        if (data.server_id === currentServer?.id) {
            const egg = eggs.find(e => e.element.id === data.eggId);
            if (egg) {
                // Sync position and velocity with interpolation
                egg.targetX = data.x;
                egg.targetY = data.y;
                egg.vx = data.vx;
                egg.vy = data.vy;
                egg.rotation = data.rotation;
            }
        }
    });


    // Create grass field
    const grassField = document.createElement('div');
    grassField.className = 'grass-field';
    document.body.appendChild(grassField);

    // Create click area for tsunami
    const clickArea = document.createElement('div');
    clickArea.className = 'click-area';
    document.body.appendChild(clickArea);

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
        const newMouseX = e.clientX;
        const newMouseY = e.clientY;
        mouseVelX = newMouseX - mouseX;
        mouseVelY = newMouseY - mouseY;
        mouseX = newMouseX;
        mouseY = newMouseY;
    });

    // Create egg with rainbow/psychic functionality restored
    function createEggElement(x, y, color, isRainbow = false, isPolish = false) {
        const egg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        egg.setAttribute("class", `egg${isRainbow ? ' rainbow' : ''}${isPolish ? ' polish' : ''}`);
        egg.setAttribute("viewBox", "0 0 100 120");
        egg.style.transform = `translate(${x}px, ${y}px)`;
        egg.id = Math.random().toString(36).substring(2, 15);

        const eggPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        eggPath.setAttribute("d", "M50,10 C80,10 90,50 90,75 C90,100 70,110 50,110 C30,110 10,100 10,75 C10,50 20,10 50,10");
        eggPath.setAttribute("fill", isRainbow ? "#fff" : color);
        eggPath.setAttribute("stroke", "#999");
        eggPath.setAttribute("stroke-width", "2");
        egg.appendChild(eggPath);

        // Add psychic/rainbow effects
        if (isRainbow) {
            egg.style.animation = "rainbow 2s linear infinite";
        }

        eggContainer.appendChild(egg);
        const physicsEgg = new PhysicsEgg(egg, x, y);
        eggs.push(physicsEgg);
        return physicsEgg;
    }

    // Physics update loop
    function updatePhysics() {
        for (let i = 0; i < eggs.length; i++) {
            eggs[i].update();
            // Check collisions with other eggs
            for (let j = i + 1; j < eggs.length; j++) {
                eggs[i].checkCollision(eggs[j]);
            }
        }
        requestAnimationFrame(updatePhysics);
    }

    // Start physics
    requestAnimationFrame(updatePhysics);

    // Update egg spawn logic
    spawnButton.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event from bubbling
        // Spawn more eggs at once
        for (let i = 0; i < 25; i++) {
            const x = Math.random() * (window.innerWidth - 40);
            const y = Math.random() * (window.innerHeight - 200);
            const vx = (Math.random() - 0.5) * 20;
            const vy = (Math.random() - 0.5) * 20;

            // Restore rainbow egg chance
            const isRainbow = Math.random() < 0.1; // 10% chance
            const isPolish = Math.random() < 0.05;
            const color = isRainbow ? 'rainbow' : `hsl(${Math.random() * 360}, 70%, 90%)`;

            // Emit egg creation to server
            if (currentServer) {
                socket.emit('create_egg', {
                    server_id: currentServer.id,
                    x: x,
                    y: y,
                    vx: vx,
                    vy: vy,
                    color: color,
                    is_rainbow: isRainbow,
                    is_polish: isPolish
                });
            } else {
                const egg = createEggElement(x, y, color, isRainbow, isPolish);
                egg.vx = vx;
                egg.vy = vy;
            }
        }
        checkEggCount();
    });

    function checkEggCount() {
        const currentEggCount = eggs.length;
        console.log('Current egg count:', currentEggCount);
        if (currentEggCount >= 54 && !microwave.classList.contains('visible')) {
            console.log('Showing microwave');
            microwave.classList.add('visible');
            microwave.addEventListener('click', startExplosion, { once: true });
        }
    }

    // Fix black screen issue - ensure black screen is only shown during explosion
    async function startExplosion() {
        if (isExploding) return;
        isExploding = true;

        // Hide microwave and reset black screen
        microwave.classList.remove('visible');
        blackScreen.style.display = 'none';
        blackScreen.classList.remove('visible');

        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
        } catch (err) {
            console.log("Fullscreen request failed:", err);
        }

        // Play explosion sound
        const explosionSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: {
                attack: 0.001,
                decay: 0.3,
                sustain: 0.1,
                release: 0.3
            }
        }).toDestination();

        try {
            await Tone.start();
            explosionSynth.triggerAttackRelease('8n');
        } catch (err) {
            console.error("Audio playback failed:", err);
        }

        // Explode eggs
        const eggElements = document.getElementsByClassName('egg');
        Array.from(eggElements).forEach((egg, index) => {
            setTimeout(() => {
                egg.style.transform = `                    translate(${Math.random() * 2000 - 1000}px,
                    ${Math.random() * 2000 - 1000}px)
                    rotate(${Math.random() * 720}deg)
                    scale(${2 + Math.random() * 2})
                `;
            }, index * 50);
        });

        // Wait for explosion animation
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Show BSOD
        bsod.style.display = 'block';
        setTimeout(() => {
            bsod.classList.add('visible');
            adjustBSODScale();
        }, 100);

        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(progressInterval);
                progressSpan.textContent = Math.floor(progress);

                // After BSOD reaches 100%, show black screen in multiplayer mode
                if (currentServer) {
                    setTimeout(() => {
                        bsod.classList.remove('visible');
                        blackScreen.classList.add('visible');

                        // After 4 seconds, remove black screen and return to normal
                        setTimeout(() => {
                            blackScreen.classList.remove('visible');
                            setTimeout(() => {
                                blackScreen.style.display = 'none';
                                bsod.style.display = 'none';
                                isExploding = false;
                            }, 500);
                        }, 4000);
                    }, 1000);
                } else {
                    // In single player, just handle ESC to exit
                    const escHandler = (e) => {
                        if (e.key === 'Escape') {
                            isExploding = false;
                            bsod.classList.remove('visible');
                            setTimeout(() => {
                                bsod.style.display = 'none';
                            }, 500);
                            document.removeEventListener('keydown', escHandler);
                        }
                    };
                    document.addEventListener('keydown', escHandler);
                }
            }
            progressSpan.textContent = Math.floor(progress);
        }, 500);
    }

    // Update the loadEggs function
    function loadEggs() {
        const url = currentServer
            ? `/api/eggs?server_id=${currentServer.id}`
            : '/api/eggs';

        fetch(url)
            .then(response => response.json())
            .then(eggData => {
                // Clear existing eggs
                eggContainer.innerHTML = '';
                eggs = [];

                eggData.forEach(egg => {
                    createEggElement(egg.x, egg.y, egg.color, egg.is_rainbow, egg.is_polish);
                });
            });
    }


    // Function to adjust BSOD content scale
    function adjustBSODScale() {
        const contentHeight = bsodContent.scrollHeight;
        const windowHeight = window.innerHeight;
        const scale = Math.min(1, windowHeight / contentHeight);
        bsodContent.style.setProperty('--scale-factor', scale);
    }

    // Initialize Tone.js synth
    const synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: {
            attack: 0.02,
            decay: 0.3,
            sustain: 0.4,
            release: 0.4
        }
    }).toDestination();

    // Add after the existing synth initialization
    const polishSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
            type: "triangle"
        },
        envelope: {
            attack: 0.02,
            decay: 0.1,
            sustain: 0.3,
            release: 0.8
        }
    }).toDestination();

    // Add the Polish cow song melody
    function playPolishCowSong() {
        const now = Tone.now();
        const notes = ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4'];
        const duration = '8n';
        const timing = 0.25;

        notes.forEach((note, index) => {
            polishSynth.triggerAttackRelease(note, duration, now + (index * timing));
        });
    }

    // Function to trigger server crash when rainbow egg is clicked
    function triggerServerCrash() {
        if (currentServer) {
            socket.emit('rainbow_egg_clicked', { server_id: currentServer.id });
            // Trigger BSOD effect
            startExplosion();
        }
    }

    // Add socket listener for rainbow egg crash event
    socket.on('server_crashed', () => {
        startExplosion();
    });

    // Add listener for global server crash (triggered by /killing command)
    socket.on('global_server_crash', () => {
        // Always trigger explosion, regardless of current server
        startExplosion();
        // Clear current server connection
        if (currentServer) {
            socket.emit('user_leaving');
            currentServer = null;
            updateServerInfo(null);
            // Clear existing eggs
            eggContainer.innerHTML = '';
            eggs = [];
        }
    });

    // Chat functionality
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === '/' && !chatInput.matches(':focus')) {
            e.preventDefault();
            chatInput.focus();
        }
    });

    socket.on('chat_message', (data) => {
        if (!currentServer) return; // Only show messages if in a server

        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.textContent = `${data.sender_name}: ${data.content}`;
        chatMessages.appendChild(messageDiv);
        // Scroll to the bottom whenever a new message is added
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim() && currentServer) {
            e.preventDefault(); // Prevent default form submission
            const message = chatInput.value.trim();
            socket.emit('send_message', {
                content: message,
                sender_name: playerName,
                server_id: currentServer.id
            });
            chatInput.value = '';
        }
    });

    function playUwuSound() {
        Tone.start();
        synth.triggerAttackRelease("A5", "0.15");
        setTimeout(() => {
            synth.frequency.value = 880;
            synth.frequency.rampTo(987.77, 0.1);
            synth.triggerAttackRelease("B5", "0.2");
        }, 150);
        setTimeout(() => {
            synth.triggerAttackRelease("A5", "0.25");
        }, 350);
    }

    // Add copy button functionality
    document.getElementById('copyLinkBtn').addEventListener('click', async () => {
        const quickJoinLink = document.getElementById('quickJoinLink');
        try {
            await navigator.clipboard.writeText(quickJoinLink.value);
            const originalText = document.getElementById('copyLinkBtn').textContent;
            document.getElementById('copyLinkBtn').textContent = 'Copied!';
            setTimeout(() => {
                document.getElementById('copyLinkBtn').textContent = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    });

    // Check for join parameter in URL
    const joinCode2 = urlParams.get('join');
    if (joinCode2) {
        // Show server modal to get player name
        serverModal.style.display = 'block';
        playerNameInput.focus();

        // Auto-join when name is entered
        playerNameInput.addEventListener('keypress', async function(e) {
            if (e.key === 'Enter' && this.value.trim()) {
                playerName = this.value.trim();
                await joinServer(joinCode2);
            }
        });
    }

    // Update voice chat handling
    socket.on('voice_chat_users', (data) => {
        const voiceChatUsers = document.getElementById('voiceChatUsers');
        const voiceChatHeader = document.getElementById('voiceChatHeader');
        voiceChatUsers.innerHTML = '';

        if (data.users && data.users.length > 0) {
            voiceChatUsers.classList.add('active');
            voiceChatHeader.classList.add('active');
            data.users.forEach(user => {
                const userDiv = document.createElement('div');
                userDiv.className = 'voice-chat-user';
                // Show only the username without the "np:" prefix
                userDiv.textContent = user.username;
                voiceChatUsers.appendChild(userDiv);
            });
        } else {
            voiceChatUsers.classList.remove('active');
            voiceChatHeader.classList.remove('active');
        }
    });

    // Add WebRTC configuration after socket initialization
    let localStream2 = null;
    let peerConnections2 = {};
    const configuration = {
        'iceServers': [
            {'urls': 'stun:stun.l.google.com:19302'},
        ]
    };

    // Add microphone permission and WebRTC setup
    async function setupVoiceChat() {
        try {
            localStream2 = await navigator.mediaDevices.getUserMedia({ audio: true });
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Please allow microphone access to use voice chat');
            return false;
        }
    }


    // Add WebRTC signaling handlers
    socket.on('voice_user_joined', async (data) => {
        if (data.userId === socket.id) return;

        try {
            const pc = new RTCPeerConnection(configuration);
            peerConnections2[data.userId] = pc;

            // Add local stream
            if (localStream2) {
                localStream2.getTracks().forEach(track => pc.addTrack(track, localStream2));
            }

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('voice_ice_candidate', {
                        candidate: event.candidate,
                        to: data.userId
                    });
                }
            };

            // Handle incoming stream
            pc.ontrack = (event) => {
                const remoteAudio = new Audio();
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play();
            };

            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('voice_offer', {
                offer: offer,
                to: data.userId
            });
        } catch (err) {
            console.error('Error creating WebRTC connection:', err);
        }
    });

    socket.on('voice_offer', async (data) => {
        if (!localStream2) return;

        try {
            const pc = new RTCPeerConnection(configuration);
            peerConnections2[data.from] = pc;

            // Add local stream
            localStream2.getTracks().forEach(track => pc.addTrack(track, localStream2));

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('voice_ice_candidate', {
                        candidate: event.candidate,
                        to: data.from
                    });
                }
            };

            // Handle incoming stream
            pc.ontrack = (event) => {
                const remoteAudio = new Audio();
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play();
            };

            // Handle offer and create answer
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('voice_answer', {
                answer: answer,
                to: data.from
            });
        } catch (err) {
            console.error('Error handling voice offer:', err);
        }
    });

    socket.on('voice_answer', async (data) => {
        const pc = peerConnections2[data.from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (err) {
                console.error('Error setting remote description:', err);
            }
        }
    });

    socket.on('voice_ice_candidate', (data) => {
        const pc = peerConnections2[data.from];
        if (pc) {
            try {
                pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        }
    });

    socket.on('voice_user_left', (data) => {
        const pc = peerConnections2[data.userId];
        if (pc) {
            pc.close();
            delete peerConnections2[data.userId];
        }
    });

    // Update admin panel functionality
    function updateAdminPanel() {
        const adminPanel = document.getElementById('adminPanel');
        if (currentServer && socket.id === currentServer.owner_id) {
            adminPanel.style.display = 'block';
        } else {
            adminPanel.style.display = 'none';
        }
    }

    // Add event listeners for admin controls
    document.getElementById('cleanupBtn').addEventListener('click', () => {
        if (currentServer && socket.id === currentServer.owner_id) {
            socket.emit('admin_cleanup', { server_id: currentServer.id });
            eggContainer.innerHTML = '';
            eggs = [];
        }
    });

    document.getElementById('kickAllBtn').addEventListener('click', () => {
        if (currentServer && socket.id === currentServer.owner_id) {
            socket.emit('admin_kick_all', { server_id: currentServer.id });
        }
    });

    document.getElementById('adminSpawnBtn').addEventListener('click', () => {
        if (currentServer && socket.id === currentServer.owner_id) {
            const count = parseInt(document.getElementById('spawnCount').value) || 25;
            const maxCount = document.getElementById('noLimitsMode').checked ? 1000 : 100;

            const spawnCount = Math.min(count, maxCount);
            for (let i = 0; i < spawnCount; i++) {
                const x = Math.random() * (window.innerWidth - 40);
                const y = Math.random() * (window.innerHeight - 200);
                const vx = (Math.random() - 0.5) * 20;
                const vy = (Math.random() - 0.5) * 20;

                const isRainbow = Math.random() < 0.1;
                const isPolish = Math.random() < 0.2;
                const color = isRainbow ? 'rainbow' : `hsl(${Math.random() * 360}, 70%, 90%)`;

                socket.emit('create_egg', {
                    server_id: currentServer.id,
                    x: x,
                    y: y,
                    vx: vx,
                    vy: vy,
                    color: color,
                    is_rainbow: isRainbow,
                    is_polish: isPolish
                });
            }
        }
    });

    // Update socket events for admin actions
    socket.on('admin_cleanup', (data) => {
        if (currentServer && currentServer.id === data.server_id) {
            eggContainer.innerHTML = '';
            eggs = [];
        }
    });

    socket.on('admin_kick_all', (data) => {
        if (currentServer && currentServer.id === data.server_id && socket.id !== currentServer.owner_id) {
            socket.emit('user_leaving');
            currentServer = null;
            updateServerInfo(null);
            eggContainer.innerHTML = '';
            eggs = [];
            alert('You have been kicked by the server owner.');
        }
    });

    // Update server join to check for owner status
    socket.on('server_joined', (data) => {
        if (data.is_owner) {
            currentServer.owner_id = socket.id;
            updateAdminPanel();
        }
    });

    // Add egg sync handler
    socket.on('egg_update', (data) => {
        if (currentServer?.id === data.server_id) {
            const egg = eggs.find(e => e.element.id === data.eggId);
            if (egg) {
                egg.x = data.x;
                egg.y = data.y;
                egg.vx = data.vx;
                egg.vy = data.vy;
                egg.rotation = data.rotation;
                egg.element.style.transform = `translate(${egg.x}px, ${egg.y}px) rotate(${egg.rotation}deg)`;
            }
        }
    });

    // Add server cleanup check
    socket.on('server_outdated', () => {
        alert('This server is outdated. Please join a new server.');
        if (currentServer) {
            socket.emit('user_leaving');
            currentServer = null;
            updateServerInfo(null);
            // Clear existing eggs
            eggContainer.innerHTML = '';
            eggs = [];
        }
    });

    // Add server lag simulation for chaos
    setInterval(() => {
        if (currentServer && Math.random() < 0.1) { // 10% chance of lag spike
            setTimeout(() => {
                // Simulate network latency by delaying updates
                eggs.forEach(egg => {
                    egg.vx *= 1.5;
                    egg.vy *= 1.5;
                });
            }, Math.random() * 1000);
        }
    }, 5000);

    // Add server cleanup and lag simulation
    let serverPingInterval;
    let serverStartTime = Date.now();
    const MAX_SERVER_AGE = 1000 * 60 * 30; // 30 minutes

    function startServerPing() {
        if (serverPingInterval) clearInterval(serverPingInterval);

        serverPingInterval = setInterval(() => {
            if (currentServer) {
                // Check server age
                if (Date.now() - serverStartTime > MAX_SERVER_AGE) {
                    alert('Server session expired. Please join a new server.');
                    socket.emit('user_leaving');
                    currentServer = null;
                    updateServerInfo(null);
                    eggContainer.innerHTML = '';
                    eggs = [];
                    return;
                }

                // Simulate network conditions
                const ping = Math.random() * 200; // Random ping between 0-200ms
                setTimeout(() => {
                    socket.emit('ping', { server_id: currentServer.id });
                }, ping);
            }
        }, 5000);
    }

    socket.on('pong', (data) => {
        if (currentServer && data.server_id === currentServer.id) {
            // Simulate packet loss
            if (Math.random() < 0.05) { // 5% packet loss
                return;
            }

            // Update server info with artificial delay
            setTimeout(() => {
                updateServerInfo(currentServer);
            }, Math.random() * 100);
        }
    });

    // Add egg collision event handler
    socket.on('egg_collision_update', (data) => {
        if (data.server_id === currentServer?.id) {
            const egg1 = eggs.find(e => e.element.id === data.egg1_id);
            const egg2 = eggs.find(e => e.element.id === data.egg2_id);

            if (egg1 && egg2) {
                // Update egg1
                egg1.x = data.egg1_data.x;
                egg1.y = data.egg1_data.y;
                egg1.vx = data.egg1_data.vx;
                egg1.vy = data.egg1_data.vy;
                egg1.rotation = data.egg1_data.rotation;

                // Update egg2
                egg2.x = data.egg2_data.x;
                egg2.y = data.egg2_data.y;
                egg2.vx = data.egg2_data.vx;
                egg2.vy = data.egg2_data.vy;
                egg2.rotation = data.egg2_data.rotation;
            }
        }
    });

    // Update server joining to initialize ping and timing
    async function joinServer2(code) {
        const name = playerNameInput.value.trim() || playerName;

        if (!name) {
            alert('Please enter your name first!');
            return;
        }

        if (!code) {
            alert('Please enter a server code!');
            return;
        }

        // Disable join button to prevent spam
        const joinBtn = document.getElementById('joinServerBtn');
        if (joinBtn) {
            joinBtn.disabled = true;
            setTimeout(() => {
                joinBtn.disabled = false;
            }, 2000); // Re-enable after 2 seconds
        }

        playerName = name;

        try {
            const response = await fetch(`/api/servers/${code}`);
            const data = await response.json();

            if (data.error) {
                alert(data.error);
                return;
            }

            currentServer = data;
            serverStartTime = Date.now(); // Reset server age
            socket.emit('join_server', { server_id: data.id, player_name: playerName });
            serverCodeInput.value = '';
            serverModal.style.display = 'none';
            updateServerInfo(data);
            loadEggs();
            startServerPing(); // Start server monitoring
        } catch (error) {
            console.error('Error joining server:', error);
            alert('Failed to join server. Please try again.');
        }
    }

    // Update leaveServerBtn handler to clean up intervals
    leaveServerBtn.addEventListener('click', () => {
        if (currentServer) {
            socket.emit('user_leaving');
            currentServer = null;
            updateServerInfo(null);
            eggContainer.innerHTML = '';
            eggs = [];
            if (serverPingInterval) {
                clearInterval(serverPingInterval);
            }
            if (messageInterval) {
                clearInterval(messageInterval);
                messageInterval = null;
            }
        }
    });

    // Initialize eggs array at the top level
    let eggs2 = [];

    // Track mouse movement for egg grabbing
    document.addEventListener('mousedown', (e) => {
        if (currentServer) {
            // Find the closest egg to the mouse
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            let closestEgg = null;
            let closestDistance = 100; // Maximum grab distance

            eggs2.forEach(egg => {
                const dx = (egg.x + egg.width / 2) - mouseX;
                const dy = (egg.y + egg.height / 2) - mouseY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < closestDistance) {
                    closestEgg = egg;
                    closestDistance = distance;
                }
            });

            if (closestEgg) {
                closestEgg.isGrabbed = true;
                closestEgg.grabOffsetX = mouseX - closestEgg.x;
                closestEgg.grabOffsetY = mouseY - closestEgg.y;
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        const now = Date.now();

        // Update grabbed egg position
        eggs2.forEach(egg => {
            if (egg.isGrabbed) {
                egg.x = mouseX - egg.grabOffsetX;
                egg.y = mouseY - egg.grabOffsetY;
                egg.vx = (mouseX - egg.lastX) || 0;
                egg.vy = (mouseY - egg.lastY) || 0;
                egg.lastX = egg.x;
                egg.lastY = egg.y;

                // Sync grabbed egg more frequently
                if (currentServer && now - egg.lastSync >= 30) {
                    socket.emit('sync_egg', {
                        server_id: currentServer.id,
                        egg_id: egg.element.id,
                        x: egg.x,
                        y: egg.y,
                        vx: egg.vx,
                        vy: egg.vy,
                        rotation: egg.rotation
                    });
                    egg.lastSync = now;
                }
            }
        });

        if (currentServer && now - lastEmitTime >= EMIT_INTERVAL) {
            socket.emit('mouse_move', {
                x: mouseX,
                y: mouseY,
                player_name: playerName
            });
            lastEmitTime = now;
        }
    });

    document.addEventListener('mouseup', () => {
        eggs2.forEach(egg => {
            if (egg.isGrabbed) {
                egg.isGrabbed = false;
                // Give the egg a little throw velocity
                egg.vx *= 2;
                egg.vy *= 2;
            }
        });
    });

    // Update the PhysicsEgg class
    class PhysicsEgg {
        constructor(element, x, y) {
            this.element = element;
            this.x = x;
            this.y = y;
            this.targetX = x;
            this.targetY = y;
            this.vx = 0;
            this.vy = 0;
            this.width = 40;
            this.height = 50;
            this.mass = 1;
            this.rotation = 0;
            this.lastSync = 0;
            this.syncInterval = 50;
            this.isGrabbed = false;
            this.lastX = x;
            this.lastY = y;
        }

        update() {
            if (currentServer) {
                // Sync with server frequently unless grabbed
                const now = Date.now();
                if (!this.isGrabbed && now - this.lastSync > this.syncInterval) {
                    socket.emit('sync_egg', {
                        server_id: currentServer.id,
                        egg_id: this.element.id,
                        x: this.x,
                        y: this.y,
                        vx: this.vx,
                        vy: this.vy,
                        rotation: this.rotation
                    });
                    this.lastSync = now;
                }
            }

            // Only apply physics if not grabbed
            if (!this.isGrabbed) {
                // Apply physics
                this.vy += 0.5; // Gravity
                this.vx *= 0.99; // Air resistance
                this.vy *= 0.99;

                this.x += this.vx;
                this.y += this.vy;

                // Boundary checks
                const groundLevel = window.innerHeight - 200;
                if (this.y > groundLevel) {
                    this.y = groundLevel;
                    this.vy = -this.vy * 0.6;
                    this.vx *= 0.8;
                }

                if (this.x < 0) {
                    this.x = 0;
                    this.vx = Math.abs(this.vx) * 0.8;
                }
                if (this.x > window.innerWidth - this.width) {
                    this.x = window.innerWidth - this.width;
                    this.vx = -Math.abs(this.vx) * 0.8;
                }
            }

            // Update position
            this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
        }

        checkCollision(other) {
            const dx = (this.x + this.width / 2) - (other.x + other.width / 2);
            const dy = (this.y + this.height / 2) - (other.y + other.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.width) {
                // Calculate collision response
                const angle = Math.atan2(dy, dx);
                const speed1 = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const speed2 = Math.sqrt(other.vx * other.vx + other.vy * other.vy);

                // Exchange velocities
                const tempVx = this.vx;
                const tempVy = this.vy;
                this.vx = other.vx * 0.8;
                this.vy = other.vy * 0.8;
                other.vx = tempVx * 0.8;
                other.vy = tempVy * 0.8;

                // Add rotation
                this.rotation += speed2 * 0.1;
                other.rotation += speed1 * 0.1;

                // Separate eggs
                const overlap = (this.width - distance) / 2;
                this.x += Math.cos(angle) * overlap;
                this.y += Math.sin(angle) * overlap;
                other.x -= Math.cos(angle) * overlap;
                other.y -= Math.sin(angle) * overlap;

                // Emit collision event in multiplayer
                if (currentServer) {
                    socket.emit('egg_collision', {
                        server_id: currentServer.id,
                        egg1_id: this.element.id,
                        egg2_id: other.element.id,
                        egg1_data: {
                            x: this.x,
                            y: this.y,
                            vx: this.vx,
                            vy: this.vy,
                            rotation: this.rotation
                        },
                        egg2_data: {
                            x: other.x,
                            y: other.y,
                            vx: other.vx,
                            vy: other.vy,
                            rotation: other.rotation
                        }
                    });
                }
            }
        }
    }

    // Add at the beginning of the file after other initializations
    function showRandomMessage() {
        if (usedMessages.size >= gameMessages.length) {
            usedMessages.clear(); // Reset when all messages have been used
        }

        let availableMessages = gameMessages.filter(msg => !usedMessages.has(msg));
        if (availableMessages.length === 0) return;

        const randomMessage = availableMessages[Math.floor(Math.random() * availableMessages.length)];
        usedMessages.add(randomMessage);

        // Create and show message element
        const messageEl = document.createElement('div');
        messageEl.className = 'game-message';
        messageEl.textContent = randomMessage;
        document.body.appendChild(messageEl);

        // Remove after animation
        setTimeout(() => {
            messageEl.remove();
        }, 5000);
    }
    // Helper function to get next player name
    async function getNextPlayerName() {
        try {
            const response = await fetch('/api/next-player-number');
            const data = await response.json();
            return `Player${data.number}`;
        } catch (error) {
            console.error('Error getting next player number:', error);
            return `Player${Math.floor(Math.random() * 1000)}`;  // Fallback
        }
    }

});

// Update settings menu button to open modal


// Handle cursor style selection


// Handle egg spawn count changes


// Handle rainbow chance changes


// Close settings modal when clicking outside