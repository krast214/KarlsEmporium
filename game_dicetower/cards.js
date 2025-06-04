// karls-gaming-emporium/game_dicetower/cards.js

const ESTABLISHMENTS = {
    // --- BLUE CARDS (Income on anyone's turn) ---
    'wheat_field': {
        id: 'wheat_field', name: 'Wheat Field', cost: 1, type: 'blue', activation: [1],
        icon: '🌾', deck: '1-6', initialSupply: 6,
        description: "Get 1 coin from the bank.",
        effect: (player, game, rollerId, activePlayer) => {
            player.coins += 1;
            return `${player.name} gained 1 coin from Wheat Field.`;
        }
    },
    'ranch': {
        id: 'ranch', name: 'Ranch', cost: 1, type: 'blue', activation: [2],
        icon: '🐄', deck: '1-6', initialSupply: 6,
        description: "Get 1 coin from the bank.",
        effect: (player, game, rollerId, activePlayer) => {
            player.coins += 1;
            return `${player.name} gained 1 coin from Ranch.`;
        }
    },
    'forest': {
        id: 'forest', name: 'Forest', cost: 3, type: 'blue', activation: [5],
        icon: '🌳', deck: '1-6', initialSupply: 6,
        description: "Get 1 coin from the bank.",
        effect: (player, game, rollerId, activePlayer) => {
            player.coins += 1;
            return `${player.name} gained 1 coin from Forest.`;
        }
    },
    'mine': {
        id: 'mine', name: 'Mine', cost: 6, type: 'blue', activation: [9],
        icon: '⛏️', deck: '7-12', initialSupply: 6,
        description: "Get 5 coins from the bank.",
        effect: (player, game, rollerId, activePlayer) => {
            player.coins += 5;
            return `${player.name} gained 5 coins from Mine.`;
        }
    },
    'apple_orchard': {
        id: 'apple_orchard', name: 'Apple Orchard', cost: 3, type: 'blue', activation: [10],
        icon: '🍎', deck: '7-12', initialSupply: 6,
        description: "Get 3 coins from the bank.",
        effect: (player, game, rollerId, activePlayer) => {
            player.coins += 3;
            return `${player.name} gained 3 coins from Apple Orchard.`;
        }
    },

    // --- GREEN CARDS (Income on your turn only) ---
    'bakery': {
        id: 'bakery', name: 'Bakery', cost: 1, type: 'green', activation: [2, 3],
        icon: '🥖', deck: '1-6', initialSupply: 6,
        description: "Get 1 coin. (+1 if Shopping Mall built).",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                const income = player.hasShoppingMall ? 2 : 1;
                player.coins += income;
                return `${player.name} gained ${income} coin(s) from Bakery.`;
            }
            return null;
        }
    },
    'convenience_store': {
        id: 'convenience_store', name: 'Convenience Store', cost: 2, type: 'green', activation: [4],
        icon: '🏪', deck: '1-6', initialSupply: 6,
        description: "Get 3 coins.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                player.coins += 3; // Shopping Mall typically doesn't affect fixed income like this
                return `${player.name} gained 3 coins from Convenience Store.`;
            }
            return null;
        }
    },
    'cheese_factory': {
        id: 'cheese_factory', name: 'Cheese Factory', cost: 5, type: 'green', activation: [7],
        icon: '🧀', deck: '7-12', initialSupply: 6,
        description: "Get 3 coins for each 'Ranch' (🐄) you own.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                const ranchCount = player.establishments.filter(e => e.id === 'ranch').reduce((sum, est) => sum + est.count, 0);
                if (ranchCount > 0) {
                    const income = ranchCount * 3;
                    player.coins += income;
                    return `${player.name} gained ${income} coins from Cheese Factory (${ranchCount} Ranches).`;
                }
            }
            return null;
        }
    },
    'furniture_factory': {
        id: 'furniture_factory', name: 'Furniture Factory', cost: 3, type: 'green', activation: [8],
        icon: '🛋️', deck: '7-12', initialSupply: 6,
        description: "Get 3 coins for each 'Forest' (🌳) you own.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                const forestCount = player.establishments.filter(e => e.id === 'forest').reduce((sum, est) => sum + est.count, 0);
                if (forestCount > 0) {
                    const income = forestCount * 3;
                    player.coins += income;
                    return `${player.name} gained ${income} coins from Furniture Factory (${forestCount} Forests).`;
                }
            }
            return null;
        }
    },
    'fruit_and_vegetable_market': {
        id: 'fruit_and_vegetable_market', name: 'Fruit and Vegetable Market', cost: 2, type: 'green', activation: [11, 12],
        icon: '🥕', deck: 'all', initialSupply: 6,
        description: "Get 2 coins for each 'Wheat Field' (🌾) and 'Apple Orchard' (🍎) you own.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                const wheatCount = player.establishments.filter(e => e.id === 'wheat_field').reduce((sum, est) => sum + est.count, 0);
                const orchardCount = player.establishments.filter(e => e.id === 'apple_orchard').reduce((sum, est) => sum + est.count, 0);
                const totalFarms = wheatCount + orchardCount;
                if (totalFarms > 0) {
                    const income = totalFarms * 2;
                    player.coins += income;
                    return `${player.name} gained ${income} coins from Fruit/Veg Market (${totalFarms} farms).`;
                }
            }
            return null;
        }
    },

    // --- RED CARDS (Take coins from roller on their turn) ---
    'cafe': {
        id: 'cafe', name: 'Cafe', cost: 2, type: 'red', activation: [3],
        icon: '☕', deck: '1-6', initialSupply: 6,
        description: "Take 1 coin from the player who rolled. (+1 if Shopping Mall built).",
        effect: (owner, game, rollerId, activePlayer) => { // activePlayer is the one who rolled
            if (owner.id !== rollerId && activePlayer && activePlayer.coins > 0) {
                const amount = Math.min((owner.hasShoppingMall ? 2 : 1), activePlayer.coins);
                activePlayer.coins -= amount;
                owner.coins += amount;
                return `${owner.name} took ${amount} coin(s) from ${activePlayer.name} via Cafe.`;
            }
            return null;
        }
    },
    'family_restaurant': {
        id: 'family_restaurant', name: 'Family Restaurant', cost: 3, type: 'red', activation: [9, 10],
        icon: '🍝', deck: '7-12', initialSupply: 6,
        description: "Take 2 coins from the player who rolled.",
        effect: (owner, game, rollerId, activePlayer) => {
             if (owner.id !== rollerId && activePlayer && activePlayer.coins > 0) {
                const amount = Math.min(2, activePlayer.coins); // Shopping Mall doesn't affect this one
                activePlayer.coins -= amount;
                owner.coins += amount;
                return `${owner.name} took ${amount} coin(s) from ${activePlayer.name} via Family Restaurant.`;
            }
            return null;
        }
    },

    // --- PURPLE CARDS (Major Establishments - Powerful effects on your turn only) ---
    'stadium': {
        id: 'stadium', name: 'Stadium', cost: 6, type: 'purple', activation: [6],
        icon: '🏟️', deck: '1-6', initialSupply: 4,
        description: "Get 2 coins from ALL other players.",
        effect: (player, game, rollerId, activePlayer) => { // activePlayer is the roller (player)
            if (player.id === rollerId) {
                let totalGained = 0;
                game.players.forEach(otherPlayer => {
                    if (otherPlayer.id !== player.id && otherPlayer.coins > 0) {
                        const amount = Math.min(2, otherPlayer.coins);
                        otherPlayer.coins -= amount;
                        player.coins += amount;
                        totalGained += amount;
                    }
                });
                if (totalGained > 0) return `${player.name} gained ${totalGained} total coins from other players via Stadium.`;
                else return `${player.name} activated Stadium, but other players had no coins or were not present.`;
            }
            return null;
        }
    },
    'tv_station': {
        id: 'tv_station', name: 'TV Station', cost: 7, type: 'purple', activation: [6],
        icon: '📺', deck: 'all', initialSupply: 4,
        description: "Take 5 coins from any ONE player of your choice (effect simplified).",
        effect: (player, game, rollerId, activePlayer) => {
             if (player.id === rollerId) {
                const otherPlayersWithCoins = game.players.filter(p => p.id !== player.id && p.coins > 0);
                if (otherPlayersWithCoins.length > 0) {
                    otherPlayersWithCoins.sort((a, b) => b.coins - a.coins); // Target richest for simplicity
                    const targetPlayer = otherPlayersWithCoins[0];
                    const amount = Math.min(5, targetPlayer.coins);
                    targetPlayer.coins -= amount;
                    player.coins += amount;
                    return `${player.name} took ${amount} coins from ${targetPlayer.name} via TV Station.`;
                }
                return `${player.name} activated TV Station, but no target player had coins.`;
            }
            return null;
        }
    },
    'business_center': {
        id: 'business_center', name: 'Business Center', cost: 8, type: 'purple', activation: [6],
        icon: '🏢', deck: 'all', initialSupply: 4,
        description: "Trade one non-purple establishment you own with one non-purple establishment an opponent owns (effect simplified).",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                return `${player.name} activated Business Center. (Full trade effect requires UI selections and is simplified here).`;
            }
            return null;
        }
    },
    'publishers': {
        id: 'publishers', name: 'Publishers', cost: 5, type: 'purple', activation: [7],
        icon: '📰', deck: '7-12', initialSupply: 4,
        description: "Get 1 coin from each player for every Cafe (☕) and Family Restaurant (🍝) they own.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                let totalGained = 0;
                game.players.forEach(otherPlayer => {
                    if (otherPlayer.id !== player.id) {
                        let coinsToTakeFromThisPlayer = 0;
                        otherPlayer.establishments.forEach(est => {
                            if (est.id === 'cafe' || est.id === 'family_restaurant') {
                                coinsToTakeFromThisPlayer += est.count; // 1 coin per matching establishment
                            }
                        });
                        const actualTaken = Math.min(coinsToTakeFromThisPlayer, otherPlayer.coins);
                        if (actualTaken > 0) {
                            otherPlayer.coins -= actualTaken;
                            player.coins += actualTaken;
                            totalGained += actualTaken;
                        }
                    }
                });
                 if (totalGained > 0) return `${player.name} gained ${totalGained} total coins via Publishers.`;
                 else return `${player.name} activated Publishers, but no relevant cards owned by others or they had no coins.`;
            }
            return null;
        }
    },
    'tax_office': {
        id: 'tax_office', name: 'Tax Office', cost: 4, type: 'purple', activation: [8,9],
        icon: '🏛️', deck: '7-12', initialSupply: 4,
        description: "Take half (rounded down) of the coins from each player who has 10 or more coins.",
        effect: (player, game, rollerId, activePlayer) => {
            if (player.id === rollerId) {
                let totalGained = 0;
                game.players.forEach(otherPlayer => {
                    if (otherPlayer.id !== player.id && otherPlayer.coins >= 10) {
                        const amountToTake = Math.floor(otherPlayer.coins / 2);
                        if (amountToTake > 0) {
                            otherPlayer.coins -= amountToTake;
                            player.coins += amountToTake;
                            totalGained += amountToTake;
                        }
                    }
                });
                if (totalGained > 0) return `${player.name} collected ${totalGained} coins via Tax Office.`;
                else return `${player.name} activated Tax Office, but no players met the criteria.`;
            }
            return null;
        }
    }
};

const LANDMARKS = {
    'town_hall': {
        id: 'town_hall', name: 'Town Hall', cost: 0, built: true,
        description: "Your starting point. All players begin with this built.",
        onBuild: null
    },
    'train_station': {
        id: 'train_station', name: 'Train Station', cost: 4, built: false,
        description: "You may choose to roll 1 or 2 dice on your turn.",
        onBuild: (player) => { player.canRollTwoDice = true; }
    },
    'shopping_mall': {
        id: 'shopping_mall', name: 'Shopping Mall', cost: 10, built: false,
        description: "Your ☕ (Cafe) and 🥖 (Bakery) establishments earn +1 coin each time they activate.",
        onBuild: (player) => { player.hasShoppingMall = true; }
    },
    'amusement_park': {
        id: 'amusement_park', name: 'Amusement Park', cost: 16, built: false,
        description: "If you roll doubles with two dice, take another turn immediately after this one (once per doubles roll).",
        onBuild: (player) => { player.canTakeExtraTurnOnDoubles = true; }
    },
    'radio_tower': {
        id: 'radio_tower', name: 'Radio Tower', cost: 22, built: false,
        description: "Once during your turn, you may choose to re-roll ALL your dice.",
        onBuild: (player) => { player.canRerollOnce = true; }
    },
    'harbor': {
        id: 'harbor', name: 'Harbor', cost: 2, built: false,
        description: "If the sum of your dice is 10 or more on your turn, you may add 2 to your roll for the purpose of activating your Green and Blue establishments. (Effect simplified: +2 coins on 10+ roll on your turn)",
        onBuild: (player) => { player.hasHarbor = true; },
    },
    'airport': {
        id: 'airport', name: 'Airport', cost: 30, built: false,
        description: "When you build the Airport, you immediately gain 10 coins. (No ongoing effect).",
        onBuild: (player) => { player.coins += 10; }
    },
    'city_hall': {
        id: 'city_hall', name: 'City Hall', cost: 7, built: false,
        description: "If you have no coins at the start of your build phase, gain 1 coin from the bank.",
        onBuild: (player) => { player.hasCityHall = true; } // Flag for game logic to check
    }
};

function getInitialLandmarks() {
    return Object.keys(LANDMARKS).map(id => ({
        id: id,
        built: LANDMARKS[id].cost === 0
    }));
}

module.exports = { ESTABLISHMENTS, LANDMARKS, getInitialLandmarks };