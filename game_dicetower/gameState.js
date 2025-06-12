// karls-gaming-emporium/game_dicetower/gameState.js
const { ESTABLISHMENTS, LANDMARKS, getInitialLandmarks } = require('./cards');

function getRandomLandmarks(num) {
    const allLandmarkIds = Object.keys(LANDMARKS);
    const shuffled = [...allLandmarkIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, num);
}

class Player {
    constructor(id, name, color = '#cccccc', avatarUrl = null, landmarkIds = []) {
        this.id = id; // This will be the socket.id from the lobby
        this.name = name;
        this.color = color; // Store player color
        this.avatarUrl = avatarUrl; // Optional avatar
        this.coins = 3;
        this.establishments = []; // [{id: 'wheat_field', count: 1}, ...]
        // Only assign the 3 random landmarks for this player
        this.landmarks = landmarkIds.map(lid => ({ id: lid, built: false }));

        // Abilities from landmarks
        this.canRollTwoDice = false;
        this.hasShoppingMall = false;
        this.canTakeExtraTurnOnDoubles = false;
        this.canRerollOnce = false;
        this.hasUsedRerollThisTurn = false;
        this.hasHarbor = false;
        this.hasCityHall = false; // For City Hall landmark

        // Initial establishments
        this.establishments.push({ id: 'wheat_field', count: 1 });
        this.establishments.push({ id: 'bakery', count: 1 });
    }

    addEstablishment(cardData) {
        const existing = this.establishments.find(e => e.id === cardData.id);
        if (existing) {
            existing.count++;
        } else {
            this.establishments.push({ id: cardData.id, count: 1 });
        }
        this.coins -= cardData.cost;
    }

    buildLandmark(landmarkId) {
        const landmark = this.landmarks.find(l => l.id === landmarkId);
        const landmarkData = LANDMARKS[landmarkId];
        if (landmark && !landmark.built && this.coins >= landmarkData.cost) {
            this.coins -= landmarkData.cost;
            landmark.built = true;
            if (landmarkData.onBuild) {
                landmarkData.onBuild(this);
            }
            return true;
        }
        return false;
    }

    getBuiltLandmarksCount() {
        return this.landmarks.filter(l => l.built && LANDMARKS[l.id].cost > 0).length;
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

class DiceTowerGameState {
    constructor(gameId, maxPlayers = 4) { // gameId is roomCode, add maxPlayers
        this.gameId = gameId; // Typically the room code
        this.maxPlayersInThisGameInstance = maxPlayers;
        this.players = []; // Stores Player objects for this game instance
        this.playerOrder = []; // Stores IDs in turn order
        this.currentPlayerId = null;
        this.diceRoll = null;
        this.diceSum = 0;
        this.turnPhase = 'waiting_for_players'; // Game doesn't start itself, server's lobby logic does
        this.gameLog = [`Dice Tower game instance for room ${gameId} created.`];
        this.winner = null;
        this.extraTurnTakenThisRoll = false;

        this.cardSupply = {};
        this.decks = { '1-6': [], '7-12': [], 'all': [] };
        this.market = { '1-6': [], '7-12': [], 'all': [] };

        this._landmarkAssignments = {};
        this._initializeSupplyDecksAndMarket();
    }

    _initializeSupplyDecksAndMarket() {
        for (const cardId in ESTABLISHMENTS) {
            const card = ESTABLISHMENTS[cardId];
            this.cardSupply[cardId] = card.initialSupply;
            for (let i = 0; i < card.initialSupply; i++) {
                if (this.decks[card.deck]) {
                    this.decks[card.deck].push(cardId);
                }
            }
        }
        shuffleArray(this.decks['1-6']);
        shuffleArray(this.decks['7-12']);
        shuffleArray(this.decks['all']);
        this._fillMarketRow('1-6', 5);
        this._fillMarketRow('7-12', 5);
        this._fillMarketRow('all', 5);
    }

    _fillMarketRow(rowKey, targetCount) {
        const marketRow = this.market[rowKey];
        const sourceDeck = this.decks[rowKey];
        while (marketRow.length < targetCount && sourceDeck.length > 0) {
            let foundCard = false;
            for (let i = 0; i < sourceDeck.length; i++) {
                const potentialCardId = sourceDeck[i];
                if (!marketRow.includes(potentialCardId)) {
                    marketRow.push(potentialCardId);
                    sourceDeck.splice(i, 1);
                    foundCard = true;
                    break;
                }
            }
            if (!foundCard) break;
        }
    }

    _attemptRefillMarketSlot(rowKey, removedCardId) {
        const marketRowArray = this.market[rowKey];
        const indexToRemove = marketRowArray.indexOf(removedCardId);
        if (indexToRemove > -1) {
            marketRowArray.splice(indexToRemove, 1);
        }
        this._fillMarketRow(rowKey, 5);
    }

    addPlayer(playerData) { // playerData: { id (socketId), name, color, avatarUrl (optional) }
        // Max player check is handled by server lobby now
        // if (this.players.length >= this.maxPlayersInThisGameInstance) {
        //     return { success: false, message: "Game instance is full." };
        // }
        if (this.players.find(p => p.id === playerData.id)) {
             return { success: true, message: "Player already in game instance.", player: this.players.find(p => p.id === playerData.id) };
        }

        // Assign 3 unique random landmarks to this player if not already assigned
        if (!this._landmarkAssignments[playerData.id]) {
            // Ensure no overlap with other players
            const assigned = new Set(Object.values(this._landmarkAssignments).flat());
            const available = Object.keys(LANDMARKS).filter(lid => !assigned.has(lid));
            let landmarkIds;
            if (available.length >= 3) {
                // Enough left for unique sets
                landmarkIds = getRandomLandmarks(3).filter(lid => !assigned.has(lid)).slice(0, 3);
            } else {
                // Not enough left, allow overlap (shouldn't happen in 4p base game)
                landmarkIds = getRandomLandmarks(3);
            }
            this._landmarkAssignments[playerData.id] = landmarkIds;
        }
        const landmarkIds = this._landmarkAssignments[playerData.id];
        const newPlayer = new Player(playerData.id, playerData.name, playerData.color, playerData.avatarUrl, landmarkIds);
        this.players.push(newPlayer);
        this.gameLog.push(`${newPlayer.name} (color: ${newPlayer.color}) added to Dice Tower game.`);
        return { success: true, player: newPlayer };
    }

    removePlayer(playerId) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex > -1) {
            const removedPlayer = this.players.splice(playerIndex, 1)[0];
            this.gameLog.push(`${removedPlayer.name} removed from Dice Tower game.`);

            // Remove from playerOrder as well
            const orderIndex = this.playerOrder.indexOf(playerId);
            if (orderIndex > -1) {
                this.playerOrder.splice(orderIndex, 1);
            }

            if (this.turnPhase !== 'game_over' && this.players.length > 0) {
                if (playerId === this.currentPlayerId) {
                    // If current player left, advance to next in new order
                    if (this.playerOrder.length > 0) {
                        const nextPlayerIndexInOrder = orderIndex % this.playerOrder.length; // Get next valid index
                        this.currentPlayerId = this.playerOrder[nextPlayerIndexInOrder];
                        this.turnPhase = 'roll';
                        this.diceRoll = null; this.diceSum = 0; this.extraTurnTakenThisRoll = false;
                        this.getCurrentPlayer().hasUsedRerollThisTurn = false;
                        this.gameLog.push(`Current player left. It's now ${this.getCurrentPlayer().name}'s turn.`);
                    } else { // No players left in order
                        this.turnPhase = 'game_over';
                        this.winner = null;
                        this.gameLog.push("All players left. Game over.");
                    }
                }
            } else if (this.players.length === 0) {
                 this.turnPhase = 'game_over';
                 this.winner = null;
                 this.gameLog.push("No players remaining. Game over.");
            }
            return true;
        }
        return false;
    }

    startGame() { // Called by server after lobby setup
        if (this.players.length < 2 || this.turnPhase !== 'waiting_for_players') {
            this.gameLog.push("Dice Tower Game: Cannot start - invalid state or player count.");
            console.log(`[DEBUG] startGame failed: players=${this.players.length}, turnPhase=${this.turnPhase}`);
            return false;
        }
        this.playerOrder = this.players.map(p => p.id);
        // shuffleArray(this.playerOrder); // Removed to make host always start
        this.currentPlayerId = this.playerOrder[0];
        this.turnPhase = 'roll';
        this.gameLog.push("Dice Tower game officially started! Player order: " + this.playerOrder.map(id => this.players.find(p=>p.id===id).name).join(', '));
        this.gameLog.push(`It's ${this.getCurrentPlayer().name}'s turn to roll.`);
        console.log(`[DEBUG] startGame: playerOrder=${JSON.stringify(this.playerOrder)}, currentPlayerId=${this.currentPlayerId}, turnPhase=${this.turnPhase}`);
        return true;
    }

    getCurrentPlayer() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) console.log(`[DEBUG] getCurrentPlayer: No player found for currentPlayerId=${this.currentPlayerId}`);
        return player;
    }

    rollDice(requestingPlayerId, numDice = 1) {
        const player = this.getCurrentPlayer();
        console.log(`[DEBUG] rollDice: requestingPlayerId=${requestingPlayerId}, currentPlayerId=${this.currentPlayerId}, turnPhase=${this.turnPhase}`);
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'roll') return "Not your turn or not roll phase.";
        if (numDice === 2 && !player.canRollTwoDice) return "You cannot roll two dice yet (build Train Station).";

        player.hasUsedRerollThisTurn = false;
        this.extraTurnTakenThisRoll = false;
        this.diceRoll = [];
        this.diceSum = 0;
        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * 6) + 1;
            this.diceRoll.push(roll);
            this.diceSum += roll;
        }
        this.gameLog.push(`${player.name} rolled ${this.diceRoll.join(' + ')} = ${this.diceSum}.`);
        this._processIncome(this.diceSum, player);
        this.turnPhase = 'build';
        console.log(`[DEBUG] rollDice: player=${player.name}, diceRoll=${JSON.stringify(this.diceRoll)}, diceSum=${this.diceSum}, nextPhase=${this.turnPhase}`);
        return `Rolled ${this.diceSum}.`;
    }

    rerollDice(requestingPlayerId) {
        const player = this.getCurrentPlayer();
        console.log(`[DEBUG] rerollDice: requestingPlayerId=${requestingPlayerId}, currentPlayerId=${this.currentPlayerId}, turnPhase=${this.turnPhase}`);
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'build' || !player.canRerollOnce || player.hasUsedRerollThisTurn) {
            return "Cannot reroll now.";
        }
        player.hasUsedRerollThisTurn = true;
        this.turnPhase = 'roll';
        this.gameLog.push(`${player.name} chose to reroll their dice.`);
        this.diceRoll = null; this.diceSum = 0;
        console.log(`[DEBUG] rerollDice: player=${player.name}, nextPhase=${this.turnPhase}`);
        return "Rerolling... please roll again.";
    }

    _processIncome(rollSum, activePlayer) {
        let incomeMessages = [];
        const rollerId = activePlayer.id;

        // City Hall effect (start of build phase, but income happens before build)
        // This should ideally be checked *before* build phase is entered,
        // or if player.coins === 0 at start of income resolution *after* red cards.
        // For now, let's check it here if they have city hall and coins are 0.
        if (activePlayer.hasCityHall && activePlayer.coins === 0 && this.turnPhase !== 'roll' /* about to enter build */) {
             // Check if it's ACTUALLY their turn and they are the active player, to avoid giving on opponent's roll if City Hall were blue
            if(activePlayer.id === rollerId){
                activePlayer.coins += 1;
                incomeMessages.push(`${activePlayer.name} gained 1 coin from City Hall (0 coins at start of turn/build).`);
            }
        }


        if (activePlayer.hasHarbor && rollSum >= 10) {
            activePlayer.coins += 2;
            incomeMessages.push(`${activePlayer.name} gained 2 extra coins from Harbor (roll ${rollSum} >= 10).`);
        }

        // RED cards
        this.players.forEach(owner => {
            if (owner.id === rollerId) return;
            owner.establishments.forEach(est => {
                const cardData = ESTABLISHMENTS[est.id];
                if (cardData.type === 'red' && cardData.activation.includes(rollSum)) {
                    for (let i = 0; i < est.count; i++) {
                        const msg = cardData.effect(owner, this, rollerId, activePlayer);
                        if (msg) incomeMessages.push(msg);
                    }
                }
            });
        });
        // BLUE cards
        this.players.forEach(player => {
            player.establishments.forEach(est => {
                const cardData = ESTABLISHMENTS[est.id];
                if (cardData.type === 'blue' && cardData.activation.includes(rollSum)) {
                    for (let i = 0; i < est.count; i++) {
                        const msg = cardData.effect(player, this, rollerId, activePlayer);
                        if (msg) incomeMessages.push(msg);
                    }
                }
            });
        });
        // GREEN cards
        activePlayer.establishments.forEach(est => {
            const cardData = ESTABLISHMENTS[est.id];
            if (cardData.type === 'green' && cardData.activation.includes(rollSum)) {
                 for (let i = 0; i < est.count; i++) {
                    const msg = cardData.effect(activePlayer, this, rollerId, activePlayer);
                    if (msg) incomeMessages.push(msg);
                }
            }
        });
        // PURPLE cards
        activePlayer.establishments.forEach(est => {
            const cardData = ESTABLISHMENTS[est.id];
            if (cardData.type === 'purple' && cardData.activation.includes(rollSum)) {
                 for (let i = 0; i < est.count; i++) {
                    const msg = cardData.effect(activePlayer, this, rollerId, activePlayer);
                    if (msg) incomeMessages.push(msg);
                }
            }
        });
        if (incomeMessages.length > 0) this.gameLog.push(...incomeMessages);
        else this.gameLog.push("No specific card income generated from this roll.");
    }

    buyEstablishment(requestingPlayerId, cardId, marketRowKey) {
        const player = this.getCurrentPlayer();
        console.log(`[DEBUG] buyEstablishment: requestingPlayerId=${requestingPlayerId}, currentPlayerId=${this.currentPlayerId}, turnPhase=${this.turnPhase}`);
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'build') return "Not your turn or not build phase.";
        const cardData = ESTABLISHMENTS[cardId];
        if (!cardData) return "Card not found.";
        if (!this.market[marketRowKey] || !this.market[marketRowKey].includes(cardId)) {
            return `${cardData.name} is not currently in that market slot.`;
        }
        if (this.cardSupply[cardId] <= 0) return `${cardData.name} is out of stock globally.`;
        if (player.coins < cardData.cost) return `Not enough coins for ${cardData.name}.`;

        player.addEstablishment(cardData);
        this.cardSupply[cardId]--;
        this.gameLog.push(`${player.name} bought ${cardData.name}.`);
        this._attemptRefillMarketSlot(marketRowKey, cardId);
        this._nextTurnOrEnd();
        return true;
    }

    buildLandmark(requestingPlayerId, landmarkId) {
        const player = this.getCurrentPlayer();
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'build') return "Not your turn or not build phase.";
        const landmarkData = LANDMARKS[landmarkId];
        if (!landmarkData) return "Landmark not found.";
        const playerLandmark = player.landmarks.find(l => l.id === landmarkId);
        if (playerLandmark && playerLandmark.built) return `${landmarkData.name} already built.`;
        if (player.coins < landmarkData.cost) return `Not enough coins for ${landmarkData.name}.`;

        if (player.buildLandmark(landmarkId)) {
            this.gameLog.push(`${player.name} built ${landmarkData.name}.`);
            if (player.getBuiltLandmarksCount() >= 3) { // Win: 3 purchased landmarks
                this.winner = player;
                this.turnPhase = 'game_over';
                this.gameLog.push(`${player.name} has built 3 major landmarks and wins the game!`);
            } else {
                this._nextTurnOrEnd();
            }
            return true;
        }
        return "Failed to build landmark.";
    }

    passTurn(requestingPlayerId) {
        const player = this.getCurrentPlayer();
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'build') return "Not your turn or not build phase.";
        this.gameLog.push(`${player.name} passed their build phase.`);
        this._nextTurnOrEnd();
        return true;
    }

    _nextTurnOrEnd() {
        if (this.winner) return;
        const player = this.getCurrentPlayer();
        const isDoubles = this.diceRoll && this.diceRoll.length === 2 && this.diceRoll[0] === this.diceRoll[1];

        if (player.canTakeExtraTurnOnDoubles && isDoubles && !this.extraTurnTakenThisRoll) {
            this.gameLog.push(`${player.name} rolled doubles and gets an extra turn!`);
            this.turnPhase = 'roll';
            player.hasUsedRerollThisTurn = false;
            this.extraTurnTakenThisRoll = true;
        } else {
            const currentTurnPlayerIndexInOrder = this.playerOrder.indexOf(this.currentPlayerId);
            const nextPlayerIndexInOrder = (currentTurnPlayerIndexInOrder + 1) % this.playerOrder.length;
            this.currentPlayerId = this.playerOrder[nextPlayerIndexInOrder];

            this.turnPhase = 'roll';
            this.diceRoll = null; this.diceSum = 0; this.extraTurnTakenThisRoll = false;
            if (this.getCurrentPlayer()) { // Ensure player exists after potential removal
                this.getCurrentPlayer().hasUsedRerollThisTurn = false;
                this.gameLog.push(`It's ${this.getCurrentPlayer().name}'s turn.`);
            } else if (this.players.length > 0 && this.playerOrder.length > 0) {
                // This case implies playerOrder might be out of sync or currentPlayerId was invalid
                // Attempt to recover or end game
                this.currentPlayerId = this.playerOrder[0]; // Fallback to first in order
                if (this.getCurrentPlayer()) {
                    this.getCurrentPlayer().hasUsedRerollThisTurn = false;
                    this.gameLog.push(`Fallback: It's ${this.getCurrentPlayer().name}'s turn.`);
                } else {
                    this.turnPhase = 'game_over'; this.winner = null;
                    this.gameLog.push("Error advancing turn: No valid next player. Game over.");
                }
            } else { // No players left or order is empty
                 this.turnPhase = 'game_over'; this.winner = null;
                 this.gameLog.push("No players to continue. Game over.");
            }
        }
    }
}

module.exports = DiceTowerGameState; // Export class