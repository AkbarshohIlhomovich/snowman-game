const fs = require('fs');
const path = require('path');

// Constants
const BOT_DATA_DIR = path.join(__dirname, 'bot_data');
const BOT_LEARNING_FILE = path.join(BOT_DATA_DIR, 'bot_learning.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(BOT_DATA_DIR)) {
  fs.mkdirSync(BOT_DATA_DIR);
}

class BotAI {
  constructor() {
    this.learningData = {};
    this.loadLearningData();
    
    // Auto-save data periodically
    setInterval(() => this.saveLearningData(), 30000);
  }

  loadLearningData() {
    try {
      if (fs.existsSync(BOT_LEARNING_FILE)) {
        const data = fs.readFileSync(BOT_LEARNING_FILE, 'utf8');
        this.learningData = JSON.parse(data);
        console.log('Loaded bot learning data');
      }
    } catch (error) {
      console.error('Error loading bot learning data:', error);
      this.learningData = {};
    }
  }

  saveLearningData() {
    try {
      fs.writeFileSync(BOT_LEARNING_FILE, JSON.stringify(this.learningData, null, 2));
    } catch (error) {
      console.error('Error saving bot learning data:', error);
    }
  }

  initializeBot(botId) {
    if (!this.learningData[botId]) {
      this.learningData[botId] = {
        experience: 0,
        level: 1,
        skills: {
          movement: 0.1,
          awareness: 0,
          combat: 0,
          survival: 0
        },
        state: {
          lastMoveTime: 0,
          lastAttackTime: 0,
          wanderAngle: Math.random() * Math.PI * 2,
          movePattern: 'random'
        },
        stats: {
          kills: 0,
          deaths: 0,
          hits: 0,
          shots: 0,
          playTime: 0
        }
      };
      console.log(`Initialized new bot: ${botId}`);
    }
    return this.learningData[botId];
  }

  updateExperience(botId, amount) {
    const bot = this.learningData[botId];
    if (bot) {
      bot.experience += amount;
      const oldLevel = bot.level;
      bot.level = Math.floor(bot.experience / 300) + 1; // Fast leveling

      // Update skills based on level
      bot.skills.movement = Math.min(1, bot.level * 0.2);
      bot.skills.awareness = Math.min(1, (bot.level - 1) * 0.25);
      bot.skills.combat = Math.min(1, (bot.level - 2) * 0.3);
      bot.skills.survival = Math.min(1, (bot.level - 3) * 0.35);

      if (bot.level !== oldLevel) {
        console.log(`Bot ${botId} reached level ${bot.level}!`);
        console.log(`Skills: `, bot.skills);
      }
    }
  }

  calculateBotAction(bot, target, delta) {
    const botData = this.learningData[bot.id];
    if (!botData) return null;

    // Update playtime and give passive experience
    botData.stats.playTime += delta;
    if (botData.stats.playTime % 1000 < delta) {
      this.updateExperience(bot.id, 1);
    }

    const action = {
      moveX: 0,
      moveY: 0,
      shouldShoot: false,
      targetAngle: 0
    };

    const now = Date.now();

    // Movement behavior
    if (!target) {
      // Wandering behavior - changes direction periodically
      if (now - botData.state.lastMoveTime > 2000) {
        botData.state.wanderAngle = Math.random() * Math.PI * 2;
        botData.state.lastMoveTime = now;
      }

      // Apply wandering movement with skill factor
      const moveSpeed = 10 * (0.5 + botData.skills.movement * 0.5);
      action.moveX = Math.cos(botData.state.wanderAngle) * moveSpeed;
      action.moveY = Math.sin(botData.state.wanderAngle) * moveSpeed;
    } else {
      // Calculate distance to target
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Combat behavior
      if (distance < 350 && botData.skills.combat > 0) {
        const attackCooldown = Math.max(1000 - botData.skills.combat * 500, 300);
        if (now - botData.state.lastAttackTime > attackCooldown) {
          action.shouldShoot = Math.random() < botData.skills.combat;
          if (action.shouldShoot) {
            const accuracy = 0.1 + botData.skills.combat * 0.9;
            action.targetAngle = angle + (Math.random() - 0.5) * (1 - accuracy);
            botData.state.lastAttackTime = now;
            botData.stats.shots++;
          }
        }
      }

      // Movement behavior based on distance
      if (distance < 200 && botData.skills.survival > 0.3) {
        // Evade if too close
        const evasionSpeed = 10 * (0.7 + botData.skills.survival * 0.3);
        action.moveX = Math.cos(angle + Math.PI) * evasionSpeed;
        action.moveY = Math.sin(angle + Math.PI) * evasionSpeed;
      } else if (distance < 400 && botData.skills.combat > 0.2) {
        // Maintain combat distance
        const strafeAngle = angle + Math.PI / 2;
        action.moveX = Math.cos(strafeAngle) * 10;
        action.moveY = Math.sin(strafeAngle) * 10;
      } else if (botData.skills.awareness > 0.1) {
// Pursue target (continued)
const pursuitSpeed = 10 * (0.6 + botData.skills.awareness * 0.4);
action.moveX = Math.cos(angle) * pursuitSpeed;
action.moveY = Math.sin(angle) * pursuitSpeed;
}

// Add randomization to movement based on skill levels
if (botData.skills.movement > 0.3) {
action.moveX += (Math.random() - 0.5) * botData.skills.movement * 5;
action.moveY += (Math.random() - 0.5) * botData.skills.movement * 5;
}
}

return action;
}

recordHit(botId) {
const bot = this.learningData[botId];
if (bot) {
bot.stats.hits++;
const accuracy = bot.stats.hits / bot.stats.shots;
this.updateExperience(botId, 50); // Experience for successful hits

// Bonus experience for high accuracy
if (accuracy > 0.5) {
this.updateExperience(botId, 20);
}
}
}

recordKill(botId, position) {
const bot = this.learningData[botId];
if (bot) {
bot.stats.kills++;
this.updateExperience(botId, 100); // Significant experience for kills

// Additional experience for kill streaks
if (bot.stats.kills % 5 === 0) {
this.updateExperience(botId, 50);
console.log(`Bot ${botId} achieved ${bot.stats.kills} kills!`);
}
}
}

recordDeath(botId, position) {
const bot = this.learningData[botId];
if (bot) {
bot.stats.deaths++;
this.updateExperience(botId, 10); // Small experience even from deaths

// Adjust behavior based on deaths
if (bot.stats.deaths % 5 === 0) {
bot.skills.survival = Math.min(1, bot.skills.survival + 0.1);
console.log(`Bot ${botId} improved survival skills after multiple deaths`);
}
}
}

// Get bot stats for monitoring
getBotStats(botId) {
const bot = this.learningData[botId];
if (!bot) return null;

return {
level: bot.level,
experience: bot.experience,
skills: bot.skills,
stats: bot.stats,
kdr: bot.stats.kills / Math.max(1, bot.stats.deaths)
};
}

// Get all bots' performance stats
getAllBotsStats() {
const stats = {};
for (const botId in this.learningData) {
stats[botId] = this.getBotStats(botId);
}
return stats;
}
}

module.exports = BotAI;