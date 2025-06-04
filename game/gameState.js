// dice-tower/game/gameState.js
const { ESTABLISHMENTS, LANDMARKS, getInitialLandmarks } = require('./cards'); // Ensure this path is correct

const MAX_PLAYERS = 4; // New constant

class Player {
    constructor(id, name, avatarUrl = null) { // Added avatarUrl
        this.id = id; // Discord User ID
        this.name = name; // Discord Username
        this.avatarUrl = avatarUrl; // Discord Avatar URL
        this.coins = 3;
        this.establishments = [];
        this.landmarks = getInitialLandmarks();

        this.canRollTwoDice = false;
        this.hasShoppingMall = false;
        this.canTakeExtraTurnOnDoubles = false;
        this.canRerollOnce = false;
        this.hasUsedRerollThisTurn = false;
        this.hasHarbor = false;

        // Initial establishments (can be varied based on player order or game rules)
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

class GameState {
    constructor(gameId) { // gameId will now be the Discord channel_id
        this.gameId = gameId;
        this.players = [];
        this.playerOrder = []; // Stores IDs in turn order
        this.currentPlayerId = null; // Will be set to the ID of the current player
        this.diceRoll = null;
        this.diceSum = 0;
        this.turnPhase = 'waiting_for_players';
        this.gameLog = [`Game instance ${gameId} created. Waiting for players...`];
        this.winner = null;
        this.extraTurnTakenThisRoll = false;
        this.minPlayersToStart = 2; // Can be adjusted

        this.cardSupply = {};
        this.decks = { '1-6': [], '7-12': [], 'all': [] };
        this.market = { '1-6': [], '7-12': [], 'all': [] };

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

    addPlayer(playerData) { // playerData: { id, username, avatar } from Discord SDK
        if (this.players.length >= MAX_PLAYERS) {
            return { success: false, message: "Game is full." };
        }
        if (this.players.find(p => p.id === playerData.id)) {
            return { success: true, message: "Player already in game.", player: this.players.find(p => p.id === playerData.id) }; // Rejoining
        }
        if (this.turnPhase !== 'waiting_for_players') {
            return { success: false, message: "Game has already started."};
        }

        const newPlayer = new Player(playerData.id, playerData.username, playerData.avatar);
        this.players.push(newPlayer);
        this.gameLog.push(`${newPlayer.name} has joined the game.`);

        // Attempt to start game if enough players
        if (this.players.length >= this.minPlayersToStart && this.turnPhase === 'waiting_for_players') {
            // This logic might be better triggered by a "start game" command from a player
            // For now, auto-start when minPlayers is met.
            this.startGame();
        }
        return { success: true, player: newPlayer, gameStarted: this.turnPhase !== 'waiting_for_players' };
    }

    removePlayer(playerId) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex > -1) {
            const removedPlayer = this.players.splice(playerIndex, 1)[0];
            this.gameLog.push(`${removedPlayer.name} has left the game.`);

            // If game was in progress, handle turn advancement or game ending
            if (this.turnPhase !== 'waiting_for_players' && this.turnPhase !== 'game_over') {
                if (this.players.length < this.minPlayersToStart) {
                    this.gameLog.push("Not enough players to continue. Game paused/ended.");
                    this.turnPhase = 'game_over'; // Or a new 'paused' state
                    this.winner = null; // No winner
                } else if (removedPlayer.id === this.currentPlayerId) {
                    // If the current player left, advance turn carefully
                    this.playerOrder = this.players.map(p => p.id); // Rebuild player order
                    const currentTurnPlayerIndexInOrder = this.playerOrder.indexOf(this.currentPlayerId);
                     // This needs more robust logic to pick next player if current one leaves
                    this.currentPlayerId = this.playerOrder[currentTurnPlayerIndexInOrder % this.playerOrder.length]; // Simple next
                    this.gameLog.push(`It's now ${this.getCurrentPlayer()?.name}'s turn.`);
                }
            }
            // If waiting and now below min, stay waiting
            return true;
        }
        return false;
    }


    startGame() {
        if (this.players.length < this.minPlayersToStart || this.turnPhase !== 'waiting_for_players') {
            this.gameLog.push("Cannot start game: not enough players or game already started.");
            return false;
        }
        this.playerOrder = this.players.map(p => p.id);
        shuffleArray(this.playerOrder); // Randomize turn order
        this.currentPlayerId = this.playerOrder[0];
        this.turnPhase = 'roll';
        this.gameLog.push("Game started! Player order: " + this.playerOrder.map(id => this.players.find(p=>p.id===id).name).join(', '));
        this.gameLog.push(`It's ${this.getCurrentPlayer().name}'s turn to roll.`);
        return true;
    }

    getCurrentPlayer() {
        return this.players.find(p => p.id === this.currentPlayerId);
    }

    rollDice(requestingPlayerId, numDice = 1) {
        const player = this.getCurrentPlayer();
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
        return `Rolled ${this.diceSum}.`;
    }

    rerollDice(requestingPlayerId) {
        const player = this.getCurrentPlayer();
        if (!player || player.id !== requestingPlayerId || this.turnPhase !== 'build' || !player.canRerollOnce || player.hasUsedRerollThisTurn) {
            return "Cannot reroll now.";
        }
        player.hasUsedRerollThisTurn = true;
        this.turnPhase = 'roll';
        this.gameLog.push(`${player.name} chose to reroll their dice.`);
        this.diceRoll = null;
        this.diceSum = 0;
        return "Rerolling... please roll again.";
    }

    _processIncome(rollSum, activePlayer) {
        let incomeMessages = [];
        const rollerId = activePlayer.id;

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
            if (player.getBuiltLandmarksCount() >= 3) { // Win condition: 3 major landmarks
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
            this.diceRoll = null;
            this.diceSum = 0;
            this.extraTurnTakenThisRoll = false;
            this.getCurrentPlayer().hasUsedRerollThisTurn = false;
            this.gameLog.push(`It's ${this.getCurrentPlayer().name}'s turn.`);
        }
    }
}

module.exports = GameState;