// karls-gaming-emporium/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// Dice Tower Game Specific Logic
const DiceTowerGameState = require('./game_dicetower/gameState.js'); // Correct path
const { ESTABLISHMENTS: DT_ESTABLISHMENTS, LANDMARKS: DT_LANDMARKS } = require('./game_dicetower/cards.js'); // Correct path


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { // Basic CORS for development, adjust for production
        origin: "*", // Allow all for now, restrict in production
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve the main emporium page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the Dice Tower game page
app.get('/games/dicetower/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'dicetower', 'index.html'));
});
// Serve Dice Tower client.js if requested directly (though typically included by its HTML)
app.get('/games/dicetower/client.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'dicetower', 'client.js'));
});
app.get('/games/dicetower/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'dicetower', 'style.css'));
});


const rooms = {}; // Stores active rooms: { roomCode: roomData }
const PLAYER_COLORS = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F4D03F', '#7D3C98', '#1ABC9C', '#E74C3C'];

function generateRoomCode() {
    let code = '';
    const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    for (let i = 0; i < 5; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // Ensure code is unique (though collision is rare for short-lived rooms)
    while(rooms[code]) {
        code = '';
        for (let i = 0; i < 5; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    }
    return code;
}

function getFullDiceTowerGameState(gameInstance) {
    if (!gameInstance) return null;
    // Make sure all necessary game state parts are included for the client
    // The ...gameInstance spread should capture all its properties.
    return { ...gameInstance, gameData: { ESTABLISHMENTS: DT_ESTABLISHMENTS, LANDMARKS: DT_LANDMARKS } };
}


io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoomCodeForSocket = null; // Room this specific socket is associated with

    socket.on('createRoom', ({ playerName, maxPlayers }) => {
        if (!playerName || playerName.trim() === "") {
            return socket.emit('lobbyError', { message: "Please enter your name." });
        }
        playerName = playerName.trim().substring(0, 20); // Max length
        maxPlayers = parseInt(maxPlayers, 10);
        if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) { // Max 4 players for Dice Tower
            return socket.emit('lobbyError', { message: "Invalid number of players (2-4)." });
        }

        const roomCode = generateRoomCode();
        currentRoomCodeForSocket = roomCode;

        rooms[roomCode] = {
            code: roomCode,
            hostId: socket.id,
            players: [{ id: socket.id, name: playerName, color: PLAYER_COLORS[0] }],
            maxPlayers: maxPlayers,
            gameType: 'dicetower',
            gameStarted: false,
            diceTowerGame: null
        };

        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, roomData: rooms[roomCode] });
        console.log(`Room ${roomCode} created by ${playerName} (Host: ${socket.id}) for ${maxPlayers} players.`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        roomCode = roomCode.toUpperCase().trim();
        if (!playerName || playerName.trim() === "") {
            return socket.emit('lobbyError', { message: "Please enter your name." });
        }
        playerName = playerName.trim().substring(0, 20);
        if (!roomCode) {
            return socket.emit('lobbyError', { message: "Please enter a room code." });
        }

        const room = rooms[roomCode];
        if (!room) return socket.emit('lobbyError', { message: "Room not found." });
        if (room.gameStarted) return socket.emit('lobbyError', { message: "Game has already started." });
        if (room.players.length >= room.maxPlayers) return socket.emit('lobbyError', { message: "Room is full." });
        if (room.players.find(p => p.id === socket.id)) return socket.emit('lobbyError', { message: "You are already in this room." });

        currentRoomCodeForSocket = roomCode;
        const playerColor = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
        room.players.push({ id: socket.id, name: playerName, color: playerColor });

        socket.join(roomCode);
        socket.emit('joinedRoom', { roomCode, roomData: room });
        io.to(roomCode).emit('playerJoined', { roomData: room }); // Use 'playerJoined' for existing players
        console.log(`${playerName} (${socket.id}) joined Room ${roomCode}. Players: ${room.players.length}/${room.maxPlayers}`);
    });

    socket.on('startGame', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.hostId !== socket.id) return socket.emit('lobbyError', { message: "Only host can start." });
        if (room.players.length < 2) return socket.emit('lobbyError', { message: "Need at least 2 players." });
        if (room.gameStarted) return;

        room.gameStarted = true;
        if (room.gameType === 'dicetower') {
            room.diceTowerGame = new DiceTowerGameState(roomCode, room.maxPlayers);
            room.players.forEach((lobbyPlayer) => {
                room.diceTowerGame.addPlayer({
                    id: lobbyPlayer.id,
                    name: lobbyPlayer.name,
                    color: lobbyPlayer.color
                });
            });
            if (!room.diceTowerGame.startGame()) { // If gameState.startGame fails for some reason
                room.gameStarted = false; // Revert
                return socket.emit('lobbyError', { message: "Failed to initialize game state."});
            }
        }

        io.to(roomCode).emit('gameStarted', {
            gameType: room.gameType,
            gameState: room.gameType === 'dicetower' ? getFullDiceTowerGameState(room.diceTowerGame) : null
        });
        console.log(`Game ${room.gameType} started in Room ${roomCode}.`);
    });

    socket.on('diceTowerAction', ({ actionType, payload }) => {
        const roomCode = currentRoomCodeForSocket; // Use the room associated with this socket
        if (!roomCode || !rooms[roomCode] || !rooms[roomCode].diceTowerGame || !rooms[roomCode].gameStarted) {
            return socket.emit('actionError', { message: "Game not active or not in a Dice Tower game." });
        }
        const room = rooms[roomCode];
        const game = room.diceTowerGame;
        const requestingPlayerId = socket.id;

        // Centralized turn check
        const currentPlayerInGame = game.getCurrentPlayer();
        if (!currentPlayerInGame) {
            return socket.emit('actionError', { message: "Game error: current player not set."});
        }
        if (actionType !== 'getPlayerState' && currentPlayerInGame.id !== requestingPlayerId) {
            if (['rollDice', 'buyEstablishment', 'buildLandmark', 'passTurn', 'rerollDice'].includes(actionType)) {
                return socket.emit('actionError', { message: "Not your turn!" });
            }
        }
        if (game.turnPhase === 'game_over' && actionType !== 'getPlayerState') {
             return socket.emit('actionError', { message: "Game is over."});
        }


        let result;
        switch (actionType) {
            case 'rollDice': result = game.rollDice(requestingPlayerId, payload.numDice); break;
            case 'rerollDice': result = game.rerollDice(requestingPlayerId); break;
            case 'buyEstablishment': result = game.buyEstablishment(requestingPlayerId, payload.cardId, payload.marketRowKey); break;
            case 'buildLandmark': result = game.buildLandmark(requestingPlayerId, payload.landmarkId); break;
            case 'passTurn': result = game.passTurn(requestingPlayerId); break;
            case 'getPlayerState':
                socket.emit('gameStateUpdate', getFullDiceTowerGameState(game));
                return;
            default:
                return socket.emit('actionError', { message: 'Unknown Dice Tower action.' });
        }

        // Check result type for error messages
        if (typeof result === 'string' && !result.startsWith("Rolled") && !result.startsWith("Rerolling...")) {
            socket.emit('actionError', { message: result });
        } else {
            io.to(roomCode).emit('gameStateUpdate', getFullDiceTowerGameState(game));
            if (game.winner) {
                io.to(roomCode).emit('gameOver', { winnerName: game.winner.name });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomCode = currentRoomCodeForSocket; // Find which room this socket was in

        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players.splice(playerIndex, 1)[0];
                console.log(`${disconnectedPlayer.name} left room ${roomCode}`);

                if (room.gameStarted && room.diceTowerGame) {
                    const gameStillViable = room.diceTowerGame.removePlayer(disconnectedPlayer.id);
                    io.to(roomCode).emit('gameStateUpdate', getFullDiceTowerGameState(room.diceTowerGame));

                    if (room.diceTowerGame.players.length < 2 && room.diceTowerGame.turnPhase !== 'game_over') {
                        room.diceTowerGame.turnPhase = 'game_over';
                        room.diceTowerGame.winner = null;
                        io.to(roomCode).emit('gameOver', { message: "Game ended: player disconnected."});
                        console.log(`Game in room ${roomCode} ended due to disconnect, not enough players.`);
                        // Optionally delete room after a delay or if all leave
                        // if (room.players.length === 0) delete rooms[roomCode];
                    }
                } else if (!room.gameStarted) { // Player left lobby
                    io.to(roomCode).emit('playerLeftLobby', { roomData: room, disconnectedPlayerId: socket.id });
                }

                // Handle host leaving
                if (room.hostId === socket.id && room.players.length > 0) {
                    room.hostId = room.players[0].id; // New host is the next player in list
                    io.to(roomCode).emit('hostChanged', { newHostId: room.hostId, roomData: room });
                    console.log(`New host for room ${roomCode}: ${room.players[0].name}`);
                }

                if (room.players.length === 0) {
                    console.log(`Room ${roomCode} is empty. Deleting.`);
                    delete rooms[roomCode];
                }
            }
        }
    });
});

const PORT = 80;
server.listen(PORT, () => {
    console.log(`Karl's Gaming Emporium server listening on *:${PORT}`);
});