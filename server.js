// dice-tower/server.js
require('dotenv').config(); // Load .env variables AT THE VERY TOP
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const GameState = require('./game/gameState');
const { ESTABLISHMENTS, LANDMARKS } = require('./game/cards');

// Choose one HTTP request library
const fetch = require('node-fetch'); // Using node-fetch@2 for CommonJS
// const axios = require('axios'); // Or using axios

const app = express();
const server = http.createServer(app);

// Environment variables for Discord OAuth
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; // The one registered in Dev Portal

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
    console.error("FATAL ERROR: Discord OAuth environment variables not set!");
    // process.exit(1); // Optionally exit if critical config is missing
}


// CORS Configuration
const allowedOrigins = [
    "https://discord.com",
    "https://discordapp.com", // Older, but sometimes still relevant
    "http://localhost:3000", // Your backend serving frontend locally
    "http://localhost:1234", // Common port for Parcel dev server if you use it for frontend
    // Add your ngrok URL for local development if you use it for frontend
    // e.g., "https://your-ngrok-id.ngrok.io"
];
if (process.env.NODE_ENV === 'production' && process.env.DEPLOYED_FRONTEND_URL) {
    allowedOrigins.push(process.env.DEPLOYED_FRONTEND_URL);
}


const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(express.json()); // Middleware to parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public')));


// --- OAuth2 Token Exchange Endpoint ---
app.post('/api/token', async (req, res) => {
    console.log('Received request on /api/token');
    try {
        const { code } = req.body;
        if (!code) {
            console.log('Missing authorization code in /api/token request');
            return res.status(400).json({ error: 'Missing authorization code' });
        }

        console.log(`Exchanging code: ${code.substring(0, 10)}... for an access token`);

        const params = new URLSearchParams();
        params.append('client_id', DISCORD_CLIENT_ID);
        params.append('client_secret', DISCORD_CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', DISCORD_REDIRECT_URI); // Must match EXACTLY what's in Dev Portal

        // Using node-fetch
        const discordResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        /* // Alternative using axios
        const discordResponse = await axios.post('https://discord.com/api/oauth2/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        const tokenData = discordResponse.data; // axios wraps response in .data
        */

        const tokenData = await discordResponse.json(); // For node-fetch

        if (tokenData.error || !tokenData.access_token) {
            console.error('Discord token exchange error:', tokenData.error, tokenData.error_description);
            return res.status(discordResponse.status || 400).json({
                error: 'Failed to exchange token with Discord',
                details: tokenData.error_description || tokenData.error
            });
        }

        console.log('Successfully exchanged code for access token.');
        res.json({ access_token: tokenData.access_token });

    } catch (error) {
        console.error('Error in /api/token endpoint:', error);
        res.status(500).json({ error: 'Internal server error during token exchange' });
    }
});


// Serve index.html for the root if not handled by static middleware for SPA-like behavior
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const activeGames = {};

function getFullGameState(gameInstance) {
    // ... (getFullGameState function from previous step) ...
    if (!gameInstance) return null;
    return { ...gameInstance, gameData: { ESTABLISHMENTS, LANDMARKS } };
}


io.on('connection', (socket) => {
    // ... (io.on('connection') logic from previous step, no changes needed here for /api/token) ...
    // Ensure `authenticateAndJoin` correctly uses the user data passed from client.js
    // which now originates from the Discord SDK after successful /api/token flow.
    console.log('User connected via socket:', socket.id);

    socket.on('authenticateAndJoin', async ({ gameId, user }) => { // gameId is channel_id from SDK
        console.log(`Auth attempt for game ${gameId} by user ${user.username} (${user.id})`);

        if (!gameId || !user || !user.id || !user.username) {
            socket.emit('gameError', { message: 'Missing game or user information for authentication.' });
            return;
        }
        
        socket.data.userId = user.id; 
        socket.data.gameId = gameId;   

        let game = activeGames[gameId];
        if (!game) {
            console.log(`Creating new game for instance/channel: ${gameId}`);
            game = new GameState(gameId);
            activeGames[gameId] = game;
        }

        const joinResult = game.addPlayer({
            id: user.id,
            username: user.username,
            avatar: user.avatar 
        });

        if (joinResult.success) {
            socket.join(gameId); 
            console.log(`${user.username} (${user.id}) successfully joined/rejoined game ${gameId}. Players: ${game.players.length}`);
            
            socket.emit('gameJoined', {
                gameId: gameId,
                playerId: user.id, 
                gameState: getFullGameState(game)
            });
            io.to(gameId).emit('gameStateUpdate', getFullGameState(game));

            if (joinResult.gameStarted) {
                 console.log(`Game ${gameId} was already started or started now.`);
            }

        } else {
            socket.emit('gameError', { message: joinResult.message || "Failed to join game." });
            console.log(`Failed to join game ${gameId} for ${user.username}: ${joinResult.message}`);
        }
    });


    socket.on('playerAction', ({ actionType, payload }) => {
        // ... (playerAction logic from previous step) ...
        const gameId = socket.data.gameId;
        const userId = socket.data.userId; // Discord User ID
        const game = activeGames[gameId];

        if (!game) {
            socket.emit('actionError', { message: "Game instance not found." });
            return;
        }
        if (!game.players.find(p => p.id === userId)) {
            socket.emit('actionError', { message: "You are not recognized in this game." });
            return;
        }
        if (game.turnPhase !== 'waiting_for_players' && game.turnPhase !== 'game_over' &&
            actionType !== 'getPlayerState' && game.getCurrentPlayer()?.id !== userId) {
            if (['rollDice', 'buyEstablishment', 'buildLandmark', 'passTurn', 'rerollDice'].includes(actionType)) {
                socket.emit('actionError', { message: "Not your turn!" });
                return;
            }
        }
        if (game.turnPhase === 'game_over' && actionType !== 'getPlayerState') {
            socket.emit('actionError', { message: "Game is over." });
            return;
        }

        let result;
        switch (actionType) {
            case 'rollDice': result = game.rollDice(userId, payload.numDice); break;
            case 'rerollDice': result = game.rerollDice(userId); break;
            case 'buyEstablishment': result = game.buyEstablishment(userId, payload.cardId, payload.marketRowKey); break;
            case 'buildLandmark': result = game.buildLandmark(userId, payload.landmarkId); break;
            case 'passTurn': result = game.passTurn(userId); break;
            case 'startGame': 
                if (game.players.length > 0 && (game.players[0]?.id === userId || game.getCurrentPlayer()?.id === userId)) { 
                     if(game.startGame()) {
                        result = "Game started by player.";
                     } else {
                        result = "Could not start game (check player count).";
                     }
                } else {
                    result = "Only an active player can start the game once minimum players are met.";
                }
                break;
            case 'getPlayerState': 
                io.to(gameId).emit('gameStateUpdate', getFullGameState(game)); 
                return;
            default:
                socket.emit('actionError', { message: 'Unknown action.' });
                return;
        }

        if (typeof result === 'string' && !result.startsWith("Rolled") && !result.startsWith("Rerolling...") && !result.startsWith("Game started")) {
            socket.emit('actionError', { message: result });
        } else {
            io.to(gameId).emit('gameStateUpdate', getFullGameState(game));
            if (game.winner) {
                io.to(gameId).emit('gameOver', { winnerName: game.winner.name });
            }
        }
    });

    socket.on('disconnect', () => {
        // ... (disconnect logic from previous step) ...
        const gameId = socket.data.gameId;
        const userId = socket.data.userId;
        console.log(`User ${userId} disconnected from game ${gameId}`);

        if (gameId && activeGames[gameId] && userId) {
            const game = activeGames[gameId];
            const playerWasInGame = game.players.some(p => p.id === userId);
            
            game.removePlayer(userId); 

            if (playerWasInGame) {
                 io.to(gameId).emit('gameStateUpdate', getFullGameState(game)); 
            }

            if (game.players.length === 0 && game.turnPhase !== 'waiting_for_players') { // Don't delete if it just went back to waiting
                console.log(`Game instance ${gameId} is now empty after being active. Deleting.`);
                delete activeGames[gameId];
            } else if (game.players.length === 0 && game.turnPhase === 'waiting_for_players') {
                console.log(`Game instance ${gameId} became empty while waiting for players. Deleting.`);
                delete activeGames[gameId];
            }
        }
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Dice Tower Discord Activity server listening on *:${PORT}`);
    console.log(`Ensure your Discord App's Activity URL uses HTTPS and points here.`);
    console.log(`CLIENT_ID used for SDK: ${DISCORD_CLIENT_ID ? DISCORD_CLIENT_ID.substring(0,5)+'...' : 'NOT SET'}`);
    console.log(`REDIRECT_URI for OAuth: ${DISCORD_REDIRECT_URI || 'NOT SET'}`);
});