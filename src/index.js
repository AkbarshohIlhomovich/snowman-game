const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);

const PORT = process.env.PORT || 9000;

const loadMap = require("./mapLoader");

const SPEED = 10;
const TICK_RATE = 32;
const SNOWBALL_SPEED = 11;
const PLAYER_SIZE = 32;
const TILE_SIZE = 32;

const BOT_VISION_RADIUS = 500;
const BOT_ATTACK_RADIUS = 350;
const BOT_EVASION_RADIUS = 200;
const MAP_SIZE = 3200;

let players = [];
let snowballs = [];
const inputsMap = {};
const lastHitMap = {}; // Track who last hit a bot
let ground2D, decal2D;

// Bot knowledge storage and file path
const botLearningDataPath = path.join(__dirname, "bot_learning_data.json");
let botLearningData = {};

// Load learning data from the file (if it exists)
function loadBotLearningData() {
  if (fs.existsSync(botLearningDataPath)) {
    const data = fs.readFileSync(botLearningDataPath, "utf8");
    botLearningData = JSON.parse(data);
  }
}

// Save learning data to the file
function saveBotLearningData() {
  fs.writeFileSync(botLearningDataPath, JSON.stringify(botLearningData, null, 2), "utf8");
}

function isColliding(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.w &&
    rect1.x + rect1.w > rect2.x &&
    rect1.y < rect2.y + rect2.h &&
    rect1.h + rect1.y > rect2.y
  );
}

function isCollidingWithMap(player) {
  for (let row = 0; row < decal2D.length; row++) {
    for (let col = 0; col < decal2D[0].length; col++) {
      const tile = decal2D[row][col];
      if (
        tile &&
        isColliding(
          { x: player.x, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE },
          { x: col * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE }
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function getRandomPosition() {
  return Math.random() * (MAP_SIZE - PLAYER_SIZE);
}

function calculateDistance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function calculatePreciseAngle(shooter, target) {
  // Check if target is valid
  if (!target) {
    return 0; // Return a default angle (or any other default value)
  }

  const baseAngle = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  return baseAngle;
}


function findNearestTarget(bot) {
  return players.find(p => 
    p.id !== bot.id && 
    p.isBot === false && 
    calculateDistance(bot, p) < BOT_VISION_RADIUS
  );
}

function findNearestBot(bot) {
  return players.find(p => 
    p.id !== bot.id && 
    p.isBot === true && 
    calculateDistance(bot, p) < BOT_VISION_RADIUS
  );
}

function updateBotBehavior(bot, delta) {
  const nearestPlayer = findNearestTarget(bot);
  const nearestBot = findNearestBot(bot);
  const target = nearestPlayer || nearestBot;
  const targetDistance = target ? calculateDistance(bot, target) : null;

  // Retrieve bot's learning data (initially empty)
  let botData = botLearningData[bot.id] || {
    moveDirection: { x: 0, y: 0 },
    lastAction: null,
    aggression: 0,
    evasion: 0,
    attackCooldown: 0,
    movementCooldown: 0,  // Cooldown for random movement direction change
  };

  // If no target is found, continue moving randomly
  if (!target) {
    if (botData.movementCooldown <= 0) {
      // Choose a random direction to move in
      botData.moveDirection.x = Math.random() * 2 - 1;  // Random x direction
      botData.moveDirection.y = Math.random() * 2 - 1;  // Random y direction
      botData.movementCooldown = Math.random() * 1000 + 500;  // Cooldown before changing direction again (500ms to 1.5s)
    }

    // Move the bot in the chosen random direction
    bot.x += botData.moveDirection.x * SPEED;
    bot.y += botData.moveDirection.y * SPEED;
    botData.lastAction = "moving";

    // Reduce the cooldown timer for movement change
    botData.movementCooldown -= delta;
  } else {
    // If a target (player or bot) is within range, pursue the target
    if (targetDistance < BOT_ATTACK_RADIUS && botData.attackCooldown <= 0) {
      // If the bot is in range to attack, fire a snowball at the target's body center
      botData.aggression += 0.1;
      const bodyCenterX = target.x + PLAYER_SIZE / 2;
      const bodyCenterY = target.y + PLAYER_SIZE / 2;
      const attackAngle = calculatePreciseAngle(bot, { x: bodyCenterX, y: bodyCenterY });

      if (botData.aggression > 0.7) {
        // Fire a snowball aimed at the body center of the target
        snowballs.push({
          angle: attackAngle,
          x: bot.x,
          y: bot.y,
          timeLeft: 1000,
          playerId: bot.id,
        });
        botData.lastAction = "attacking";
        botData.attackCooldown = 100;  // Cooldown before next attack
      } else {
        botData.lastAction = "approaching";
      }
    } else if (targetDistance < BOT_EVASION_RADIUS) {
      // Evade if the target is too close
      botData.evasion += 0.05;
      const evasionAngle = Math.atan2(bot.y - target.y, bot.x - target.x);
      bot.x += Math.cos(evasionAngle) * SPEED * 1.5;
      bot.y += Math.sin(evasionAngle) * SPEED * 1.5;
      botData.lastAction = "evading";
    } else {
      // Move towards the target (player or bot)
      const moveAngle = Math.atan2(target.y - bot.y, target.x - bot.x);
      bot.x += Math.cos(moveAngle) * SPEED;
      bot.y += Math.sin(moveAngle) * SPEED;
      botData.lastAction = "moving";
    }
  }

  // Boundary and map collision checks
  bot.x = Math.max(0, Math.min(bot.x, MAP_SIZE - PLAYER_SIZE));
  bot.y = Math.max(0, Math.min(bot.y, MAP_SIZE - PLAYER_SIZE));

  if (isCollidingWithMap(bot)) {
    bot.x -= Math.random() * 2 - 1;  // Random adjustment to avoid stuck bots
    bot.y -= Math.random() * 2 - 1;
  }

  // Handle attack cooldown
  if (botData.attackCooldown > 0) {
    botData.attackCooldown -= delta;
  }

  // Save updated learning data
  botLearningData[bot.id] = botData;
}



function tick(delta) {
  for (const player of players) {
    if (player.isBot) {
      updateBotBehavior(player, delta);
    } else {
      const inputs = inputsMap[player.id];
      const previousX = player.x;
      const previousY = player.y;

      // Player movement
      if (inputs.up) player.y = Math.max(0, player.y - SPEED);
      if (inputs.down) player.y = Math.min(MAP_SIZE - PLAYER_SIZE, player.y + SPEED);
      if (inputs.left) player.x = Math.max(0, player.x - SPEED);
      if (inputs.right) player.x = Math.min(MAP_SIZE - PLAYER_SIZE, player.x + SPEED);

      // Prevent player from colliding with the map
      if (isCollidingWithMap(player)) {
        player.x = previousX;
        player.y = previousY;
      }
    }
  }

  // Snowball logic
  for (const snowball of snowballs) {
    snowball.x += Math.cos(snowball.angle) * SNOWBALL_SPEED;
    snowball.y += Math.sin(snowball.angle) * SNOWBALL_SPEED;
    snowball.timeLeft -= delta;

    for (const player of players) {
      if (player.id === snowball.playerId) continue;
      const distance = calculateDistance(
        { x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2 },
        { x: snowball.x, y: snowball.y }
      );
      if (distance <= PLAYER_SIZE / 2) {
        // Track who hit the player
        const shooter = players.find(p => p.id === snowball.playerId);
        lastHitMap[player.id] = shooter;

        // Respawn player at random position
        player.x = getRandomPosition();
        player.y = getRandomPosition();
        snowball.timeLeft = -1;
        break;
      }
    }
  }

  snowballs = snowballs.filter((snowball) => snowball.timeLeft > 0);

  io.emit(
    "players",
    players.map(({ id, x, y, isBot }) => ({ id, x, y, isBot }))
  );
  io.emit("snowballs", snowballs);
}

async function main() {
  ({ ground2D, decal2D } = await loadMap());
  loadBotLearningData();

  // Add initial bots without predefined behaviors
  for (let i = 0; i < 10; i++) {
    players.push({
      id: `bot_${i}`,
      x: getRandomPosition(),
      y: getRandomPosition(),
      isBot: true,
    });
  }

  io.on("connect", (socket) => {
    console.log("User connected:", socket.id);

    inputsMap[socket.id] = { up: false, down: false, left: false, right: false };

    players.push({
      id: socket.id,
      x: getRandomPosition(),
      y: getRandomPosition(),
      isBot: false,
    });

    socket.emit("map", { ground: ground2D, decal: decal2D });

    socket.on("inputs", (inputs) => {
      inputsMap[socket.id] = inputs;
    });

    socket.on("snowball", (angle) => {
      const player = players.find((p) => p.id === socket.id);
      snowballs.push({
        angle,
        x: player.x,
        y: player.y,
        timeLeft: 1000,
        playerId: socket.id,
      });
    });

    socket.on("disconnect", () => {
      players = players.filter((player) => player.id !== socket.id);
    });
  });

  app.use(express.static("public"));

  httpServer.listen(PORT);

  let lastUpdate = Date.now();
  setInterval(() => {
    const now = Date.now();
    const delta = now - lastUpdate;
    tick(delta);
    lastUpdate = now;

    // Save bot learning data to disk
    saveBotLearningData();
  }, 1000 / TICK_RATE);
}

main();
