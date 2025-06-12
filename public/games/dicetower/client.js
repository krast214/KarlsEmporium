// public/games/dicetower/client.js
const socket = io(); // Connects to the server hosting this page

// --- DOM Elements ---
// Lobby Elements
const lobbySection = document.getElementById('lobby-section');
const createJoinForms = document.getElementById('create-join-forms');
const playerNameHostInput = document.getElementById('player-name-host');
const playerCountSelect = document.getElementById('player-count-select');
const createRoomBtn = document.getElementById('create-room-btn');
const playerNameJoinInput = document.getElementById('player-name-join');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const lobbyWaitingArea = document.getElementById('lobby-waiting-area');
const lobbyRoomCodeDisplay = document.getElementById('lobby-room-code');
const roomCodeHeaderDisplay = document.getElementById('room-code-display'); // In main header
const waitingMessage = document.getElementById('waiting-message');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const startGameBtn = document.getElementById('start-game-btn');
const lobbyErrorMsg = document.getElementById('lobby-error-message');

// Game Elements (mostly same as before)
const gameContentArea = document.getElementById('game-content-area');
const playersAreaFlexContainer = document.getElementById('players-area-flex-container');
const marketRow16CardArea = document.querySelector('#market-row-1-6 .card-display-area');
const marketRow712CardArea = document.querySelector('#market-row-7-12 .card-display-area');
const marketRowAllCardArea = document.querySelector('#market-row-all .card-display-area');
const currentTurnIndicator = document.getElementById('current-turn-indicator');
const diceResultDisplay = document.getElementById('dice-result');
const roll1DiceBtn = document.getElementById('roll-1-dice-btn');
const roll2DiceBtn = document.getElementById('roll-2-dice-btn');
const rerollBtn = document.getElementById('reroll-btn');
const passTurnBtn = document.getElementById('pass-turn-btn');
const gameLogUl = document.getElementById('game-log');
const gameOverMessageDiv = document.getElementById('game-over-message');
const winnerAnnouncementP = document.getElementById('winner-announcement');

// Help Modal
const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeHelpModalButton = document.getElementById('close-help-modal');

// --- Client State ---
let MY_SOCKET_ID = null;
let CURRENT_ROOM_CODE = null;
let IS_HOST = false;
let CURRENT_GAME_STATE = null; // For Dice Tower game data


// --- Lobby UI Functions ---
function showLobbyError(message) {
    lobbyErrorMsg.textContent = message;
    lobbyErrorMsg.style.display = 'block';
    setTimeout(() => { lobbyErrorMsg.style.display = 'none'; }, 4000);
}

function updateLobbyView(roomData) {
    createJoinForms.style.display = 'none';
    lobbyWaitingArea.style.display = 'block';
    lobbyRoomCodeDisplay.textContent = roomData.code;
    roomCodeHeaderDisplay.textContent = roomData.code; // Update header too

    lobbyPlayerList.innerHTML = '';
    roomData.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('lobby-player');
        playerDiv.style.backgroundColor = player.color || '#ccc'; // Use assigned color
        playerDiv.textContent = player.name + (player.id === MY_SOCKET_ID ? ' (You)' : '') + (player.id === roomData.hostId ? ' ⭐ Host' : '');
        lobbyPlayerList.appendChild(playerDiv);
    });

    waitingMessage.textContent = roomData.players.length >= 2
        ? `Waiting for host (${roomData.players.find(p => p.id === roomData.hostId)?.name || 'Host'}) to start... (${roomData.players.length}/${roomData.maxPlayers})`
        : `Waiting for more players... (${roomData.players.length}/${roomData.maxPlayers})`;

    if (IS_HOST && roomData.players.length >=2 && roomData.players.length <= roomData.maxPlayers) {
        startGameBtn.style.display = 'block';
        startGameBtn.disabled = false;
    } else {
        startGameBtn.style.display = IS_HOST ? 'block' : 'none'; // Show if host, but might be disabled
        startGameBtn.disabled = true;
    }
}

// --- Game UI Functions (largely from previous version) ---
function updateDiceTowerGameDisplay(gameState) {
    console.log('[DEBUG] updateDiceTowerGameDisplay: gameState', gameState);
    if (!MY_SOCKET_ID || !gameState || !gameState.gameData) return;
    CURRENT_GAME_STATE = gameState; // Store game state

    lobbySection.style.display = 'none';
    gameContentArea.style.display = 'flex';
    gameOverMessageDiv.style.display = 'none';
    helpButton.style.display = 'block';

    const myPlayerInGame = gameState.players.find(p => p.id === MY_SOCKET_ID);
    renderPlayers(gameState.players, gameState.currentPlayerId, gameState.gameData.LANDMARKS, myPlayerInGame);
    renderMarket(gameState.market, myPlayerInGame?.coins, gameState.cardSupply, gameState.gameData.ESTABLISHMENTS);
    updateTurnIndicatorAndDice(gameState);
    updateActionButtons(gameState);
    renderGameLog(gameState.gameLog);
}

function renderPlayers(players, currentPlayerGameId, landmarkDefs, myPlayerInGame) {
    playersAreaFlexContainer.innerHTML = '';
    const orderedPlayers = CURRENT_GAME_STATE.playerOrder
        ? CURRENT_GAME_STATE.playerOrder.map(id => players.find(p => p.id === id)).filter(Boolean)
        : players;

    orderedPlayers.forEach((player) => {
        if (!player) return;
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player-info');
        if (player.id === currentPlayerGameId) playerDiv.classList.add('current-turn');
        if (player.id === MY_SOCKET_ID) playerDiv.classList.add('is-self');
        // Apply color to player info card border or background
        playerDiv.style.borderLeft = `5px solid ${player.color || '#ccc'}`;


        let establishmentsHtml = '<h4>Establishments</h4><ul>';
        if (player.establishments.length === 0) establishmentsHtml += '<li>None yet</li>';
        player.establishments.forEach(est => {
            const detail = CURRENT_GAME_STATE.gameData.ESTABLISHMENTS[est.id] || { name: est.id, icon: '❓' };
            establishmentsHtml += `<li><span class="card-icon">${detail.icon}</span> ${detail.name} (x${est.count})</li>`;
        });
        establishmentsHtml += '</ul>';

        let landmarksHtml = '<h4>Landmarks</h4><ul id="landmarks-player-' + player.id + '">';
        player.landmarks.forEach(lm => {
            const detail = landmarkDefs[lm.id] || { name: lm.id, description: "Unknown effect." };
            const costText = lm.built ? '' : `Cost: ${detail.cost}`;
            const statusText = lm.built ? ' (Built)' : ' (Not Built)';
            landmarksHtml += `
                <li class="landmark-item ${lm.built ? 'built' : ''}">
                    <span class="landmark-name">${detail.name}</span>
                    <span class="landmark-cost">${costText}</span>
                    <span class="landmark-status">${statusText}</span>
                    <span class="landmark-description">${detail.description}</span>
                    ${!lm.built && player.id === MY_SOCKET_ID && CURRENT_GAME_STATE.currentPlayerId === MY_SOCKET_ID && CURRENT_GAME_STATE.turnPhase === 'build' && myPlayerInGame?.coins >= detail.cost
                        ? `<button class="game-button build-landmark-btn" data-landmark-id="${lm.id}">Build</button>` : ''}
                </li>`;
        });
        landmarksHtml += '</ul>';

        // For avatar, if not passed from server, use color block
        const avatarColorBlock = `<div class="player-avatar" style="background-color: ${player.color || '#ccc'};"></div>`;

        // Animate coin change for current player
        let coinsHtml = `<p><strong>Coins: <span class="coin-count">${player.coins}</span></strong></p>`;
        playerDiv.innerHTML = `
            <div class="player-header">
                ${avatarColorBlock}
                <div class="player-name-coins">
                    <h3>${player.name} ${player.id === MY_SOCKET_ID ? '(You)' : ''}</h3>
                    ${coinsHtml}
                </div>
            </div>
            ${establishmentsHtml}
            ${landmarksHtml}
        `;
        playersAreaFlexContainer.appendChild(playerDiv);
    });

    // Animate coin change for self
    if (myPlayerInGame) {
        const myPlayerDiv = Array.from(document.querySelectorAll('.player-info.is-self'))[0];
        if (myPlayerDiv) {
            const coinSpan = myPlayerDiv.querySelector('.coin-count');
            if (coinSpan) {
                coinSpan.classList.remove('coin-animate');
                void coinSpan.offsetWidth;
                coinSpan.classList.add('coin-animate');
            }
        }
    }

    document.querySelectorAll('.build-landmark-btn').forEach(button => {
        button.onclick = (e) => {
            const landmarkId = e.target.dataset.landmarkId;
            socket.emit('diceTowerAction', { actionType: 'buildLandmark', payload: { landmarkId } });
        };
    });
}

function renderMarket(marketData, playerCoins, globalCardSupply, establishmentDefs) {
    // ... (renderMarket function from previous "Help Modal" client.js, no major changes needed)
    const renderRow = (rowCardAreaEl, cardIdsInRow, marketRowKey) => {
        rowCardAreaEl.innerHTML = '';
        if (!cardIdsInRow || cardIdsInRow.length === 0) {
            rowCardAreaEl.innerHTML = '<p>No cards available.</p>'; return;
        }
        cardIdsInRow.forEach(cardId => {
            const cardDef = establishmentDefs[cardId];
            if (!cardDef) return;
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('card', `card-type-${cardDef.type}`);
            const canAfford = playerCoins >= cardDef.cost;
            const inStock = globalCardSupply[cardId] > 0;
            const isMyTurnAndBuildPhase = CURRENT_GAME_STATE.currentPlayerId === MY_SOCKET_ID && CURRENT_GAME_STATE.turnPhase === 'build';
            if (!canAfford || !inStock || !isMyTurnAndBuildPhase) cardDiv.classList.add('disabled');
            else {
                cardDiv.onclick = () => {
                    cardDiv.classList.add('flash');
                    setTimeout(() => cardDiv.classList.remove('flash'), 700);
                    socket.emit('diceTowerAction', { actionType: 'buyEstablishment', payload: { cardId: cardDef.id, marketRowKey: marketRowKey } });
                };
            }
            cardDiv.innerHTML = `<div class="card-header"><span class="card-icon">${cardDef.icon||'?'}<\/span><span class="card-name">${cardDef.name}<\/span><\/div><div class="card-cost">Cost: ${cardDef.cost}<\/div><div class="card-activation">Roll: ${cardDef.activation.join(', ')}<\/div><div class="card-desc">${cardDef.description}<\/div><div class="card-supply">Supply: ${globalCardSupply[cardId]}<\/div>`;
            rowCardAreaEl.appendChild(cardDiv);
        });
    };
    renderRow(marketRow16CardArea, marketData['1-6'], '1-6');
    renderRow(marketRow712CardArea, marketData['7-12'], '7-12');
    renderRow(marketRowAllCardArea, marketData['all'], 'all');
}

function updateTurnIndicatorAndDice(gameState) {
    // ... (updateTurnIndicatorAndDice from previous client.js)
    if (gameState.turnPhase === 'waiting_for_players' || !gameState.currentPlayerId) {
        currentTurnIndicator.innerHTML = "Waiting for game to start...";
        diceResultDisplay.textContent = 'N/A'; 
        diceResultDisplay.classList.remove('animate');
        return;
    }
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    if (!currentPlayer) { currentTurnIndicator.innerHTML = "Error: Player not found."; return; }
    currentTurnIndicator.innerHTML = `Turn: <strong style="color:${currentPlayer.color || '#333'}">${currentPlayer.name} ${currentPlayer.id === MY_SOCKET_ID ? '(You)' : ''}</strong> <br> Phase: <strong>${gameState.turnPhase.replace('_', ' ').toUpperCase()}</strong>`;
    if (gameState.diceRoll) {
        diceResultDisplay.textContent = `${gameState.diceRoll.join(' + ')} = ${gameState.diceSum}`;
        diceResultDisplay.classList.remove('animate');
        void diceResultDisplay.offsetWidth; // Force reflow for animation
        diceResultDisplay.classList.add('animate');
    } else {
        diceResultDisplay.textContent = 'N/A';
        diceResultDisplay.classList.remove('animate');
    }
}

function updateActionButtons(gameState) {
    // ... (updateActionButtons from previous client.js, using MY_SOCKET_ID)
    if (!MY_SOCKET_ID || gameState.turnPhase === 'waiting_for_players' || !gameState.currentPlayerId) {
        [roll1DiceBtn, roll2DiceBtn, rerollBtn, passTurnBtn].forEach(btn => btn.disabled = true);
        rerollBtn.style.display = 'none'; return;
    }
    const me = gameState.players.find(p => p.id === MY_SOCKET_ID);
    if (!me) return;
    const isMyTurn = gameState.currentPlayerId === MY_SOCKET_ID;
    roll1DiceBtn.disabled = !(isMyTurn && gameState.turnPhase === 'roll');
    roll2DiceBtn.disabled = !(isMyTurn && gameState.turnPhase === 'roll' && me.canRollTwoDice);
    passTurnBtn.disabled = !(isMyTurn && gameState.turnPhase === 'build');
    if (isMyTurn && (gameState.turnPhase === 'build' || gameState.turnPhase === 'roll') && me.canRerollOnce && !me.hasUsedRerollThisTurn && gameState.diceRoll) {
        rerollBtn.style.display = 'inline-block'; rerollBtn.disabled = false;
    } else {
        rerollBtn.style.display = 'none'; rerollBtn.disabled = true;
    }
}

function renderGameLog(logs) {
    // ... (renderGameLog from previous client.js)
    gameLogUl.innerHTML = '';
    logs.slice().reverse().forEach(log => { const li = document.createElement('li'); li.textContent = log; gameLogUl.appendChild(li); });
    gameLogUl.scrollTop = 0;
}

function showDiceRoll(diceArray) {
  const diceDisplay = document.getElementById('dice-display');
  const diceResult = document.getElementById('dice-result');
  if (!diceDisplay) return;
  const diceEmojis = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
  if (diceArray.length === 1) {
    const val = diceArray[0];
    diceDisplay.textContent = diceEmojis[val] || val;
    if (diceResult) diceResult.textContent = '';
  } else if (diceArray.length === 2) {
    diceDisplay.textContent = diceArray.map(val => diceEmojis[val] || val).join(' ');
    if (diceResult) diceResult.textContent = `Sum: ${diceArray[0] + diceArray[1]}`;
  } else {
    diceDisplay.textContent = '🎲';
    if (diceResult) diceResult.textContent = '';
  }
  // Trigger shake animation
  diceDisplay.classList.remove('shake');
  void diceDisplay.offsetWidth;
  diceDisplay.classList.add('shake');
  setTimeout(() => diceDisplay.classList.remove('shake'), 600);
}

// Patch into your game state update/render logic:
function updateGameUI(gameState) {
  // ...existing code...
  if (gameState.diceRoll && gameState.diceRoll.length > 0) {
    showDiceRoll(gameState.diceRoll);
  } else {
    const diceDisplay = document.getElementById('dice-display');
    const diceResult = document.getElementById('dice-result');
    if (diceDisplay) diceDisplay.textContent = '🎲';
    if (diceResult) diceResult.textContent = '';
  }
  // ...existing code...
}

function renderLandmarks(player, isSelf) {
  const container = document.createElement('ul');
  container.className = 'landmarks-list';
  player.landmarks.forEach(landmark => {
    const data = LANDMARKS[landmark.id];
    const li = document.createElement('li');
    li.className = 'landmark-item' + (landmark.built ? ' built' : '');
    li.innerHTML = `
      <span class="landmark-name">${data.name}</span>
      <span class="landmark-cost">Cost: ${data.cost}</span>
      <span class="landmark-status">${landmark.built ? 'Built' : 'Not built'}</span>
      <span class="landmark-description">${data.description || ''}</span>
    `;
    if (isSelf && !landmark.built && player.coins >= data.cost) {
      const btn = document.createElement('button');
      btn.textContent = 'Build';
      btn.onclick = () => buildLandmark(landmark.id);
      li.appendChild(btn);
    }
    container.appendChild(li);
  });
  return container;
}

// --- Socket Event Handlers ---
socket.on('connect', () => {
    MY_SOCKET_ID = socket.id;
    console.log('Connected to server with ID:', MY_SOCKET_ID);
    // Lobby is default view
    lobbySection.style.display = 'block';
    createJoinForms.style.display = 'flex';
    lobbyWaitingArea.style.display = 'none';
    gameContentArea.style.display = 'none';
});

socket.on('roomCreated', ({ roomCode, roomData }) => {
    CURRENT_ROOM_CODE = roomCode;
    IS_HOST = true;
    updateLobbyView(roomData);
    lobbyErrorMsg.style.display = 'none';
});

socket.on('joinedRoom', ({ roomCode, roomData }) => {
    CURRENT_ROOM_CODE = roomCode;
    IS_HOST = roomData.hostId === MY_SOCKET_ID; // Check if I became host (e.g. if host left)
    updateLobbyView(roomData);
    lobbyErrorMsg.style.display = 'none';
});

socket.on('playerJoined', ({ roomData }) => { // Other player joined
    if (CURRENT_ROOM_CODE === roomData.code) {
        updateLobbyView(roomData);
    }
});

socket.on('playerLeft', ({ roomData, disconnectedPlayerId }) => {
    if (CURRENT_ROOM_CODE === roomData.code) {
        console.log('Player left, updating lobby view:', disconnectedPlayerId);
        updateLobbyView(roomData);
    }
});
socket.on('hostChanged', ({ newHostId, roomData }) => {
    if (CURRENT_ROOM_CODE === roomData.code) {
        IS_HOST = newHostId === MY_SOCKET_ID;
        alert(`Host changed! New host is ${roomData.players.find(p=>p.id === newHostId)?.name || 'Unknown'}.`);
        updateLobbyView(roomData); // Re-render to update host status and start button
    }
});


socket.on('lobbyError', ({ message }) => {
    showLobbyError(message);
});

socket.on('gameStarted', ({ gameType, gameState }) => {
    if (gameType === 'dicetower') {
        console.log("Dice Tower game starting!", gameState);
        updateDiceTowerGameDisplay(gameState);
    }
    // Handle other game types in future
});

socket.on('gameStateUpdate', (gameState) => { // For Dice Tower game updates
    // Always update UI for Dice Tower, ignore 'rooms' object
    updateDiceTowerGameDisplay(gameState);
});

socket.on('gameOver', (data) => { // For Dice Tower game over
    gameContentArea.style.display = 'none';
    lobbySection.style.display = 'none';
    winnerAnnouncementP.textContent = data.winnerName ? `${data.winnerName} is the winner!` : (data.message || "Game Over!");
    gameOverMessageDiv.style.display = 'block';
    helpButton.style.display = 'none';
});

// --- Event Listeners for UI ---
createRoomBtn.onclick = () => {
    const playerName = playerNameHostInput.value;
    const maxPlayers = playerCountSelect.value;
    if (!playerName.trim()) { showLobbyError("Please enter your name to host."); return; }
    socket.emit('createRoom', { playerName, maxPlayers });
};

joinRoomBtn.onclick = () => {
    const playerName = playerNameJoinInput.value;
    const roomCode = roomCodeInput.value.toUpperCase();
    if (!playerName.trim()) { showLobbyError("Please enter your name to join."); return; }
    if (!roomCode.trim()) { showLobbyError("Please enter a room code."); return; }
    socket.emit('joinRoom', { roomCode, playerName });
};

startGameBtn.onclick = () => {
    if (IS_HOST && CURRENT_ROOM_CODE) {
        socket.emit('startGame', { roomCode: CURRENT_ROOM_CODE });
    }
};

// Dice Tower Action Buttons
roll1DiceBtn.onclick = () => {
    console.log('[DEBUG] roll1DiceBtn clicked. MY_SOCKET_ID:', MY_SOCKET_ID, 'currentPlayerId:', CURRENT_GAME_STATE?.currentPlayerId, 'turnPhase:', CURRENT_GAME_STATE?.turnPhase);
    roll1DiceBtn.disabled = true; // Immediately disable to prevent spamming
    roll2DiceBtn.disabled = true;
    socket.emit('diceTowerAction', { actionType: 'rollDice', payload: { numDice: 1 } });
};
roll2DiceBtn.onclick = () => {
    console.log('[DEBUG] roll2DiceBtn clicked. MY_SOCKET_ID:', MY_SOCKET_ID, 'currentPlayerId:', CURRENT_GAME_STATE?.currentPlayerId, 'turnPhase:', CURRENT_GAME_STATE?.turnPhase);
    roll1DiceBtn.disabled = true;
    roll2DiceBtn.disabled = true;
    socket.emit('diceTowerAction', { actionType: 'rollDice', payload: { numDice: 2 } });
};
rerollBtn.onclick = () => {
    console.log('[DEBUG] rerollBtn clicked. MY_SOCKET_ID:', MY_SOCKET_ID, 'currentPlayerId:', CURRENT_GAME_STATE?.currentPlayerId, 'turnPhase:', CURRENT_GAME_STATE?.turnPhase);
    socket.emit('diceTowerAction', { actionType: 'rerollDice', payload: {} });
};
passTurnBtn.onclick = () => {
    console.log('[DEBUG] passTurnBtn clicked. MY_SOCKET_ID:', MY_SOCKET_ID, 'currentPlayerId:', CURRENT_GAME_STATE?.currentPlayerId, 'turnPhase:', CURRENT_GAME_STATE?.turnPhase);
    socket.emit('diceTowerAction', { actionType: 'passTurn', payload: {} });
};

// Help Modal
helpButton.onclick = function() { helpModal.style.display = "block"; }
closeHelpModalButton.onclick = function() { helpModal.style.display = "none"; }
window.onclick = function(event) { if (event.target == helpModal) { helpModal.style.display = "none"; } }

// --- Add Dice Tower fantasy SVG icon to header ---
function injectDiceTowerIcon() {
    if (!gameHeader) return;
    if (document.getElementById('dicetower-icon')) return; // Already present
    const icon = document.createElement('span');
    icon.id = 'dicetower-icon';
    icon.innerHTML = `
      <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="towerBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#a5b4fc"/>
            <stop offset="100%" stop-color="#6366f1"/>
          </linearGradient>
        </defs>
        <rect x="16" y="18" width="22" height="28" rx="4" fill="url(#towerBody)" stroke="#312e81" stroke-width="2"/>
        <rect x="20" y="10" width="14" height="10" rx="2" fill="#6366f1" stroke="#312e81" stroke-width="2"/>
        <rect x="24" y="6" width="6" height="6" rx="1.5" fill="#312e81"/>
        <rect x="22.5" y="28" width="3" height="8" rx="1" fill="#312e81"/>
        <rect x="28.5" y="28" width="3" height="8" rx="1" fill="#312e81"/>
        <ellipse cx="27" cy="48" rx="8" ry="3" fill="#6366f1" opacity="0.18"/>
      </svg>
    `;
    gameHeader.insertBefore(icon, gameHeader.firstChild);
}

// Call on load
injectDiceTowerIcon();
window.addEventListener('DOMContentLoaded', () => {
  // Ensure Dice Tower icon SVG is injected (for static HTML fallback)
  const iconSpan = document.getElementById('dicetower-icon');
  if (iconSpan && iconSpan.childElementCount === 0) {
    iconSpan.innerHTML = `
      <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="towerBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#a5b4fc"/>
            <stop offset="100%" stop-color="#6366f1"/>
          </linearGradient>
        </defs>
        <rect x="16" y="18" width="22" height="28" rx="4" fill="url(#towerBody)" stroke="#312e81" stroke-width="2"/>
        <rect x="20" y="10" width="14" height="10" rx="2" fill="#6366f1" stroke="#312e81" stroke-width="2"/>
        <rect x="24" y="6" width="6" height="6" rx="1.5" fill="#312e81"/>
        <rect x="22.5" y="28" width="3" height="8" rx="1" fill="#312e81"/>
        <rect x="28.5" y="28" width="3" height="8" rx="1" fill="#312e81"/>
        <ellipse cx="27" cy="48" rx="8" ry="3" fill="#6366f1" opacity="0.18"/>
      </svg>
    `;
  }
});