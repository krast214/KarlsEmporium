// public/client.js
// NOTE: This script is now loaded AFTER Discord SDK initializes in index.html
// It expects window.discordAuth and window.discordInstanceId / window.discordChannelId to be set.

const socket = io( 'http://localhost:3000' || `${window.location.protocol}//${window.location.host}`); // Connect to your backend server URL

// --- DOM Elements ---
const discordStatusEl = document.getElementById('discord-status');
const statusMessageEl = document.getElementById('status-message');
const initialLoadingEl = document.getElementById('initial-loading'); // Hide this once game starts
const startGameSectionEl = document.getElementById('start-game-section');
const manualStartGameBtn = document.getElementById('manual-start-game-btn');
const currentPlayerCountEl = document.getElementById('current-player-count');

const gameContentAreaEl = document.getElementById('game-content-area');
const playersAreaFlexContainerEl = document.getElementById('players-area-flex-container');

const marketRow16CardArea = document.querySelector('#market-row-1-6 .card-display-area');
const marketRow712CardArea = document.querySelector('#market-row-7-12 .card-display-area');
const marketRowAllCardArea = document.querySelector('#market-row-all .card-display-area');

const currentTurnIndicatorEl = document.getElementById('current-turn-indicator');
const diceResultEl = document.getElementById('dice-result');
const roll1DiceBtn = document.getElementById('roll-1-dice-btn');
const roll2DiceBtn = document.getElementById('roll-2-dice-btn');
const rerollBtn = document.getElementById('reroll-btn');
const passTurnBtn = document.getElementById('pass-turn-btn');
const gameLogEl = document.getElementById('game-log');
const gameOverMessageEl = document.getElementById('game-over-message');
const winnerAnnouncementEl = document.getElementById('winner-announcement');

const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeHelpModalButton = document.getElementById('close-help-modal');

// --- Global State ---
let MY_DISCORD_USER_INFO = null; // From window.discordAuth.user
let CURRENT_GAME_ID = null; // From window.discordChannelId (was discordInstanceId)
let CURRENT_GAME_STATE = null;

// --- Initialize Game with Discord ---
function initializeGameWithDiscord() {
    if (!window.discordAuth || !window.discordAuth.user || !window.discordChannelId) {
        discordStatusEl.textContent = "Error: Discord authentication data not found. Cannot join game.";
        discordStatusEl.style.color = "red";
        initialLoadingEl.style.display = 'block';
        initialLoadingEl.innerHTML = "<p style='color:red;'>Failed to get necessary Discord info.</p>";
        return;
    }

    MY_DISCORD_USER_INFO = window.discordAuth.user;
    CURRENT_GAME_ID = window.discordChannelId; // Use channel_id as the game instance identifier

    discordStatusEl.textContent = `Authenticated as: ${MY_DISCORD_USER_INFO.username}`;
    statusMessageEl.textContent = 'Attempting to join game server...';
    initialLoadingEl.style.display = 'none'; // Hide initial loader

    // Emit event to server to authenticate and join the game instance
    socket.emit('authenticateAndJoin', {
        gameId: CURRENT_GAME_ID,
        user: {
            id: MY_DISCORD_USER_INFO.id,
            username: MY_DISCORD_USER_INFO.global_name || MY_DISCORD_USER_INFO.username, // Use global_name if available
            avatar: MY_DISCORD_USER_INFO.avatar
                ? `https://cdn.discordapp.com/avatars/${MY_DISCORD_USER_INFO.id}/${MY_DISCORD_USER_INFO.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(MY_DISCORD_USER_INFO.discriminator || '0') % 5}.png` // Default avatar
        }
    });
}

// --- Socket Event Handlers ---
socket.on('connect', () => {
    console.log('Socket connected to game server.');
    // Wait for Discord SDK to provide auth data before trying to join
    if (window.discordAuth && window.discordAuth.user && window.discordChannelId) {
        initializeGameWithDiscord();
    } else {
        // This case should ideally be handled by the index.html loader waiting for SDK
        console.warn("Socket connected, but Discord auth data not yet available from SDK.");
        statusMessageEl.textContent = "Waiting for Discord authentication...";
    }
});

socket.on('disconnect', () => {
    statusMessageEl.textContent = "Disconnected from game server. Attempting to reconnect...";
    statusMessageEl.style.color = "orange";
    // UI should reflect that connection is lost, maybe disable actions
    gameContentAreaEl.style.display = 'none';
    startGameSectionEl.style.display = 'none';
    initialLoadingEl.style.display = 'block';
    initialLoadingEl.innerHTML = "<p>Connection to server lost. Please wait or try relaunching the activity.</p>";

});

socket.on('gameJoined', (data) => {
    // MY_DISCORD_USER_INFO.id is used as playerId now
    statusMessageEl.textContent = `Successfully joined game instance: ${data.gameId}.`;
    statusMessageEl.style.color = "green"; // Reset color
    updateGameDisplay(data.gameState);
});

socket.on('gameStateUpdate', (gameState) => {
    CURRENT_GAME_STATE = gameState;
    updateGameDisplay(gameState);
});

socket.on('actionError', (data) => {
    alert(`Action Error: ${data.message}`);
    if (CURRENT_GAME_STATE) updateActionButtons(CURRENT_GAME_STATE);
});

socket.on('gameOver', (data) => {
    gameContentAreaEl.style.display = 'none';
    startGameSectionEl.style.display = 'none';
    statusMessageEl.style.display = 'none';
    winnerAnnouncementEl.textContent = `${data.winnerName} is the winner!`;
    gameOverMessageEl.style.display = 'block';
    helpButton.style.display = 'none';
});

socket.on('gameError', (data) => {
    statusMessageEl.textContent = `Game Error: ${data.message}`;
    statusMessageEl.style.color = "red";
    gameContentAreaEl.style.display = 'none';
    startGameSectionEl.style.display = 'none';
    initialLoadingEl.style.display = 'block';
    initialLoadingEl.innerHTML = `<p style='color:red;'>A game error occurred: ${data.message}</p>`;
});

// --- UI Update Functions ---
function updateGameDisplay(gameState) {
    if (!MY_DISCORD_USER_INFO || !gameState || !gameState.gameData) {
        console.warn("Waiting for full game state including gameData...");
        return;
    }
    CURRENT_GAME_STATE = gameState;

    // Determine UI state: waiting for players, game in progress, or game over
    if (gameState.turnPhase === 'waiting_for_players') {
        initialLoadingEl.style.display = 'none';
        gameContentAreaEl.style.display = 'none';
        gameOverMessageEl.style.display = 'none';
        startGameSectionEl.style.display = 'block';
        helpButton.style.display = 'block';

        currentPlayerCountEl.textContent = `${gameState.players.length}`;
        manualStartGameBtn.disabled = gameState.players.length < gameState.minPlayersToStart;
        // Enable start button for the first player who joined if min players met
        if (gameState.players.length > 0 && MY_DISCORD_USER_INFO.id === gameState.players[0].id) {
             manualStartGameBtn.disabled = gameState.players.length < gameState.minPlayersToStart;
        } else {
            manualStartGameBtn.disabled = true; // Only first player can start initially
        }
        renderPlayers(gameState.players, -1, gameState.gameData.LANDMARKS, MY_DISCORD_USER_INFO); // Render players even in waiting screen

    } else if (gameState.turnPhase === 'game_over') {
        // gameOver socket event handles this primarily
    } else { // Game in progress (roll, build phases)
        initialLoadingEl.style.display = 'none';
        startGameSectionEl.style.display = 'none';
        gameContentAreaEl.style.display = 'flex';
        gameOverMessageEl.style.display = 'none';
        helpButton.style.display = 'block';

        const myPlayerInstance = gameState.players.find(p => p.id === MY_DISCORD_USER_INFO.id);
        statusMessageEl.textContent = `Game in progress. You are: ${myPlayerInstance?.name || 'Player'}`;
        statusMessageEl.style.color = 'inherit'; // Reset color

        const currentPlayerIndex = gameState.playerOrder.indexOf(gameState.currentPlayerId);
        renderPlayers(gameState.players, currentPlayerIndex, gameState.gameData.LANDMARKS, myPlayerInstance);
        renderMarket(gameState.market, myPlayerInstance?.coins, gameState.cardSupply, gameState.gameData.ESTABLISHMENTS);
        updateTurnIndicatorAndDice(gameState);
        updateActionButtons(gameState);
        renderGameLog(gameState.gameLog);
    }
}

function renderPlayers(players, currentPlayerOrderIndex, landmarkDefs, myPlayerInstance) {
    playersAreaFlexContainerEl.innerHTML = '';
    const orderedPlayers = CURRENT_GAME_STATE.playerOrder
        ? CURRENT_GAME_STATE.playerOrder.map(id => players.find(p => p.id === id)).filter(Boolean)
        : players; // Fallback if order not set (e.g. waiting screen)

    orderedPlayers.forEach((player) => {
        if (!player) return; // Should not happen if playerOrder is correct
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player-info');
        if (player.id === CURRENT_GAME_STATE?.currentPlayerId) playerDiv.classList.add('current-turn');
        if (player.id === MY_DISCORD_USER_INFO.id) playerDiv.classList.add('is-self');

        const avatarUrl = player.avatarUrl || `https://cdn.discordapp.com/embed/avatars/${parseInt(player.id.slice(-1)) % 5}.png`; // Fallback if no avatar

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
                    ${!lm.built && player.id === MY_DISCORD_USER_INFO.id && CURRENT_GAME_STATE.currentPlayerId === MY_DISCORD_USER_INFO.id && CURRENT_GAME_STATE.turnPhase === 'build' && myPlayerInstance?.coins >= detail.cost
                        ? `<button class="game-button build-landmark-btn" data-landmark-id="${lm.id}">Build</button>` : ''}
                </li>`;
        });
        landmarksHtml += '</ul>';

        playerDiv.innerHTML = `
            <div class="player-header">
                <img src="${avatarUrl}" alt="${player.name} avatar" class="player-avatar">
                <div class="player-name-coins">
                    <h3>${player.name} ${player.id === MY_DISCORD_USER_INFO.id ? '(You)' : ''}</h3>
                    <p><strong>Coins: ${player.coins}</strong></p>
                </div>
            </div>
            ${establishmentsHtml}
            ${landmarksHtml}
        `;
        playersAreaFlexContainerEl.appendChild(playerDiv);
    });

    document.querySelectorAll('.build-landmark-btn').forEach(button => {
        button.onclick = (e) => {
            const landmarkId = e.target.dataset.landmarkId;
            socket.emit('playerAction', { actionType: 'buildLandmark', payload: { landmarkId } });
        };
    });
}

function renderMarket(marketData, playerCoins, globalCardSupply, establishmentDefs) {
    const renderRow = (rowCardAreaEl, cardIdsInRow, marketRowKey) => {
        rowCardAreaEl.innerHTML = '';
        if (!cardIdsInRow || cardIdsInRow.length === 0) {
            rowCardAreaEl.innerHTML = '<p>No cards available in this row currently.</p>';
            return;
        }
        cardIdsInRow.forEach(cardId => {
            const cardDef = establishmentDefs[cardId];
            if (!cardDef) { console.error("Card def not found for: ", cardId); return; }
            const cardDiv = document.createElement('div');
            cardDiv.classList.add('card', `card-type-${cardDef.type}`);
            const canAfford = playerCoins >= cardDef.cost;
            const inStock = globalCardSupply[cardId] > 0;
            const isMyTurnAndBuildPhase = CURRENT_GAME_STATE.currentPlayerId === MY_DISCORD_USER_INFO.id && CURRENT_GAME_STATE.turnPhase === 'build';

            if (!canAfford || !inStock || !isMyTurnAndBuildPhase) {
                cardDiv.classList.add('disabled');
            } else {
                cardDiv.onclick = () => {
                    socket.emit('playerAction', {
                        actionType: 'buyEstablishment',
                        payload: { cardId: cardDef.id, marketRowKey: marketRowKey }
                    });
                };
            }
            cardDiv.innerHTML = `
                <div class="card-header">
                    <span class="card-icon">${cardDef.icon || '?'}</span>
                    <span class="card-name">${cardDef.name}</span>
                </div>
                <div class="card-cost">Cost: ${cardDef.cost}</div>
                <div class="card-activation">Roll: ${cardDef.activation.join(', ')}</div>
                <div class="card-desc">${cardDef.description}</div>
                <div class="card-supply">Supply: ${globalCardSupply[cardId]}</div>
            `;
            rowCardAreaEl.appendChild(cardDiv);
        });
    };
    renderRow(marketRow16CardArea, marketData['1-6'], '1-6');
    renderRow(marketRow712CardArea, marketData['7-12'], '7-12');
    renderRow(marketRowAllCardArea, marketData['all'], 'all');
}

function updateTurnIndicatorAndDice(gameState) {
    if (gameState.turnPhase === 'waiting_for_players' || !gameState.currentPlayerId) {
        currentTurnIndicatorEl.innerHTML = "Waiting for game to start...";
        diceResultEl.textContent = 'N/A';
        return;
    }
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    if (!currentPlayer) {
        currentTurnIndicatorEl.innerHTML = "Error: Current player not found.";
        return;
    }
    currentTurnIndicatorEl.innerHTML = `Turn: <strong>${currentPlayer.name} ${currentPlayer.id === MY_DISCORD_USER_INFO.id ? '(You)' : ''}</strong> <br> Phase: <strong>${gameState.turnPhase.replace('_', ' ').toUpperCase()}</strong>`;
    diceResultEl.textContent = gameState.diceRoll ? `${gameState.diceRoll.join(' + ')} = ${gameState.diceSum}` : 'N/A';
}

function updateActionButtons(gameState) {
    if (!MY_DISCORD_USER_INFO || gameState.turnPhase === 'waiting_for_players' || !gameState.currentPlayerId) {
        [roll1DiceBtn, roll2DiceBtn, rerollBtn, passTurnBtn].forEach(btn => btn.disabled = true);
        rerollBtn.style.display = 'none';
        return;
    }
    const me = gameState.players.find(p => p.id === MY_DISCORD_USER_INFO.id);
    if (!me) return;
    const isMyTurn = gameState.currentPlayerId === MY_DISCORD_USER_INFO.id;

    roll1DiceBtn.disabled = !(isMyTurn && gameState.turnPhase === 'roll');
    roll2DiceBtn.disabled = !(isMyTurn && gameState.turnPhase === 'roll' && me.canRollTwoDice);
    passTurnBtn.disabled = !(isMyTurn && gameState.turnPhase === 'build');

    if (isMyTurn && (gameState.turnPhase === 'build' || gameState.turnPhase === 'roll') && me.canRerollOnce && !me.hasUsedRerollThisTurn && gameState.diceRoll) {
        rerollBtn.style.display = 'inline-block';
        rerollBtn.disabled = false;
    } else {
        rerollBtn.style.display = 'none';
        rerollBtn.disabled = true;
    }
}

function renderGameLog(logs) {
    gameLogEl.innerHTML = '';
    logs.slice().reverse().forEach(log => {
        const li = document.createElement('li');
        li.textContent = log;
        gameLogEl.appendChild(li);
    });
    gameLogEl.scrollTop = 0;
}

// --- Action Button Event Listeners ---
roll1DiceBtn.onclick = () => socket.emit('playerAction', { actionType: 'rollDice', payload: { numDice: 1 } });
roll2DiceBtn.onclick = () => socket.emit('playerAction', { actionType: 'rollDice', payload: { numDice: 2 } });
rerollBtn.onclick = () => socket.emit('playerAction', { actionType: 'rerollDice', payload: {} });
passTurnBtn.onclick = () => socket.emit('playerAction', { actionType: 'passTurn', payload: {} });
manualStartGameBtn.onclick = () => socket.emit('playerAction', { actionType: 'startGame', payload: {} });

// --- Help Modal Logic ---
helpButton.onclick = function() { helpModal.style.display = "block"; }
closeHelpModalButton.onclick = function() { helpModal.style.display = "none"; }
window.onclick = function(event) { if (event.target == helpModal) { helpModal.style.display = "none"; } }

// This is the new entry point, called by index.html after SDK setup
// No need to self-invoke, index.html's script block will load and run this.
// Make sure initializeGameWithDiscord() is called when appropriate (it is in socket.on('connect'))
console.log("client.js loaded and ready to be initialized by Discord SDK flow.");

// If the SDK is already initialized by the time this script loads (e.g., script loaded late)
// and socket is already connected, try to initialize.
if (socket.connected && window.discordAuth && window.discordAuth.user && window.discordChannelId) {
    console.log("SDK data present and socket connected on client.js load, attempting init.");
    initializeGameWithDiscord();
}