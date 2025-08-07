// public/games/silent-karaoke/client.js
const socket = io(); // Connects to the server hosting this page

// --- DOM Elements ---
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
const roomCodeHeaderDisplay = document.getElementById('room-code-display');
const waitingMessage = document.getElementById('waiting-message');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const startGameBtn = document.getElementById('start-game-btn');
const lobbyErrorMsg = document.getElementById('lobby-error-message');
const gameContentArea = document.getElementById('game-content-area');
const karaokeGameArea = document.getElementById('karaoke-game-area');
const gameOverMessageDiv = document.getElementById('game-over-message');
const winnerAnnouncementP = document.getElementById('winner-announcement');
const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeHelpModalButton = document.getElementById('close-help-modal');

// --- Client State ---
let MY_SOCKET_ID = null;
let CURRENT_ROOM_CODE = null;
let IS_HOST = false;
let CURRENT_GAME_STATE = null;

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
    roomCodeHeaderDisplay.textContent = roomData.code;
    lobbyPlayerList.innerHTML = '';
    roomData.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('lobby-player');
        playerDiv.style.backgroundColor = player.color || '#e11d48';
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
        startGameBtn.style.display = IS_HOST ? 'block' : 'none';
        startGameBtn.disabled = true;
    }
}

// --- Socket Event Handlers ---
socket.on('connect', () => {
    MY_SOCKET_ID = socket.id;
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
    IS_HOST = roomData.hostId === MY_SOCKET_ID;
    updateLobbyView(roomData);
    lobbyErrorMsg.style.display = 'none';
});

socket.on('playerJoined', ({ roomData }) => {
    if (CURRENT_ROOM_CODE === roomData.code) updateLobbyView(roomData);
});

socket.on('playerLeft', ({ roomData, disconnectedPlayerId }) => {
    if (CURRENT_ROOM_CODE === roomData.code) updateLobbyView(roomData);
});

socket.on('hostChanged', ({ newHostId, roomData }) => {
    if (CURRENT_ROOM_CODE === roomData.code) {
        IS_HOST = newHostId === MY_SOCKET_ID;
        updateLobbyView(roomData);
    }
});

socket.on('lobbyError', ({ message }) => showLobbyError(message));

socket.on('gameStarted', ({ gameState }) => {
    CURRENT_GAME_STATE = gameState;
    lobbySection.style.display = 'none';
    gameContentArea.style.display = 'block';
    gameOverMessageDiv.style.display = 'none';
    helpButton.style.display = 'block';
    renderSilentKaraokeGame(gameState);
});

socket.on('gameStateUpdate', (gameState) => {
    CURRENT_GAME_STATE = gameState;
    renderSilentKaraokeGame(gameState);
});

socket.on('gameOver', (data) => {
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

helpButton.onclick = function() { helpModal.style.display = "block"; }
closeHelpModalButton.onclick = function() { helpModal.style.display = "none"; }
window.onclick = function(event) { if (event.target == helpModal) { helpModal.style.display = "none"; } }

// --- Game Rendering (placeholder) ---
function renderSilentKaraokeGame(gameState) {
    karaokeGameArea.innerHTML = `<h3>Silent Karaoke Game Area</h3><p>Game logic coming soon. Players: ${gameState.players.map(p => p.name).join(', ')}</p>`;
}
