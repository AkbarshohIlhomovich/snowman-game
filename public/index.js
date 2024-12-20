const mapImage = new Image();
mapImage.src = "/snowy-sheet.png";

const santaImage = new Image();
santaImage.src = "/santa.png";

const speakerImage = new Image();
speakerImage.src = "/speaker.png";

const walkSnow = new Audio("walk-snow.mp3");

const canvasEl = document.getElementById("canvas");
canvasEl.width = window.innerWidth;
canvasEl.height = window.innerHeight;
const canvas = canvasEl.getContext("2d");

// Enhanced rendering settings
canvas.imageSmoothingEnabled = true;
canvas.imageSmoothingQuality = 'high';

const socket = io();
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

const localTracks = {
  audioTrack: null,
};

let isPlaying = true;
const remoteUsers = {};
window.remoteUsers = remoteUsers;

const muteButton = document.getElementById("mute");
const uid = Math.floor(Math.random() * 1000000);

// Performance optimization: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

muteButton.addEventListener("click", () => {
  if (isPlaying) {
    localTracks.audioTrack.setEnabled(false);
    muteButton.innerText = "unmute";
    socket.emit("mute", true);
  } else {
    localTracks.audioTrack.setEnabled(true);
    muteButton.innerText = "mute";
    socket.emit("mute", false);
  }
  isPlaying = !isPlaying;
});

const options = {
  appid: "eee1672fa7ef4b83bc7810da003a07bb",
  channel: "game",
  uid,
  token: null,
};

async function subscribe(user, mediaType) {
  await client.subscribe(user, mediaType);
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user) {
  const id = user.uid;
  delete remoteUsers[id];
}

async function join() {
  socket.emit("voiceId", uid);

  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  await client.join(options.appid, options.channel, options.token || null, uid);
  localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();

  await client.publish(Object.values(localTracks));
}

join();

let groundMap = [[]];
let decalMap = [[]];
let players = [];
let snowballs = [];

const TILE_SIZE = 32;
const SNOWBALL_RADIUS = 5;

// Enhanced background rendering
function createBackgroundGradient() {
  const gradient = canvas.createLinearGradient(0, 0, 0, canvasEl.height);
  gradient.addColorStop(0, '#87CEEB');     // Sky blue
  gradient.addColorStop(1, '#E0F6FF');     // Light blue
  return gradient;
}

socket.on("connect", () => {
  console.log("connected");
});

socket.on("map", (loadedMap) => {
  groundMap = loadedMap.ground;
  decalMap = loadedMap.decal;
});

socket.on("players", (serverPlayers) => {
  players = serverPlayers;
});

socket.on("snowballs", (serverSnowballs) => {
  snowballs = serverSnowballs;
});

const inputs = {
  up: false,
  down: false,
  left: false,
  right: false,
};

// Optimized input handling with debounce
const debouncedInputEmit = debounce((inputs) => {
  socket.emit("inputs", inputs);
}, 16); // About 60 fps

window.addEventListener("keydown", (e) => {
  let inputChanged = false;
  if (e.key === "w" && !inputs.up) {
    inputs.up = true;
    inputChanged = true;
  } else if (e.key === "s" && !inputs.down) {
    inputs.down = true;
    inputChanged = true;
  } else if (e.key === "d" && !inputs.right) {
    inputs.right = true;
    inputChanged = true;
  } else if (e.key === "a" && !inputs.left) {
    inputs.left = true;
    inputChanged = true;
  }

  if (inputChanged) {
    if (["a", "s", "w", "d"].includes(e.key) && walkSnow.paused) {
      walkSnow.play();
    }
    debouncedInputEmit(inputs);
  }
});

window.addEventListener("keyup", (e) => {
  let inputChanged = false;
  if (e.key === "w" && inputs.up) {
    inputs.up = false;
    inputChanged = true;
  } else if (e.key === "s" && inputs.down) {
    inputs.down = false;
    inputChanged = true;
  } else if (e.key === "d" && inputs.right) {
    inputs.right = false;
    inputChanged = true;
  } else if (e.key === "a" && inputs.left) {
    inputs.left = false;
    inputChanged = true;
  }

  if (inputChanged) {
    if (["a", "s", "w", "d"].includes(e.key)) {
      walkSnow.pause();
      const randomX = Math.random() * canvasEl.width;
      const randomY = Math.random() * canvasEl.height;
      walkSnow.currentTime = (randomX + randomY) / 2;
    }
    debouncedInputEmit(inputs);
  }
});

window.addEventListener("click", (e) => {
  const angle = Math.atan2(
    e.clientY - canvasEl.height / 2,
    e.clientX - canvasEl.width / 2
  );
  socket.emit("snowball", angle);
});

// Improved snowflake rendering
function createSnowEffect() {
  const snowflakes = [];
  const width = canvasEl.width;
  const height = canvasEl.height;
  
  for (let i = 0; i < 100; i++) { // Reduced number of snowflakes for performance
    snowflakes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5,
      speed: Math.random() * 0.5 + 0.1,
      drift: Math.random() * 0.5 - 0.25
    });
  }
  return snowflakes;
}

let snowflakes = createSnowEffect();

function updateSnowflakes() {
  return snowflakes.map(flake => {
    flake.y += flake.speed;
    flake.x += flake.drift;

    // Wrap around more efficiently
    if (flake.y > canvasEl.height) {
      flake.y = 0;
      flake.x = Math.random() * canvasEl.width;
    }

    return flake;
  });
}

function renderSnowflakes(snowflakes) {
  canvas.fillStyle = 'rgba(255, 255, 255, 0.7)';
  snowflakes.forEach(flake => {
    canvas.beginPath();
    canvas.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    canvas.fill();
  });
}

// Optimize ground and decal rendering
function renderGroundTiles(cameraX, cameraY) {
  for (let row = 0; row < groundMap.length; row++) {
    for (let col = 0; col < groundMap[0].length; col++) {
      let { id } = groundMap[row][col];
      const imageRow = Math.floor(id / 8);
      const imageCol = id % 8;
      
      canvas.drawImage(
        mapImage,
        imageCol * TILE_SIZE,
        imageRow * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        col * TILE_SIZE - cameraX,
        row * TILE_SIZE - cameraY,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }
}

function renderDecalTiles(cameraX, cameraY) {
  for (let row = 0; row < decalMap.length; row++) {
    for (let col = 0; col < decalMap[0].length; col++) {
      let { id } = decalMap[row][col] ?? { id: undefined };
      if (id !== undefined) {
        const imageRow = Math.floor(id / 8);
        const imageCol = id % 8;

        canvas.drawImage(
          mapImage,
          imageCol * TILE_SIZE,
          imageRow * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          col * TILE_SIZE - cameraX,
          row * TILE_SIZE - cameraY,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }
  }
}

// Optimize player rendering and audio
function renderPlayers(myPlayer, cameraX, cameraY) {
  for (const player of players) {
    // Player shadow
    canvas.save();
    canvas.shadowColor = 'rgba(0, 0, 0, 0.3)';  // Soft black shadow
    canvas.shadowBlur = 10;  // Blur radius
    canvas.shadowOffsetX = 3;  // Horizontal offset
    canvas.shadowOffsetY = 3;  // Vertical offset

    // Differentiate bot and player shadows slightly
    if (player.isBot) {
      canvas.shadowColor = 'rgba(0, 0, 255, 0.2)';  // Blue tint for bot shadow
    } else {
      canvas.shadowColor = 'rgba(165, 25, 25, 0.3)';  // Standard shadow
    }

    // Draw player slightly offset to create shadow effect
    canvas.drawImage(
      santaImage, 
      player.x - cameraX + 3,  // Slight horizontal shadow offset 
      player.y - cameraY + 3   // Slight vertical shadow offset
    );
    
    canvas.restore();

    // Draw actual player
    // canvas.drawImage(santaImage, player.x - cameraX, player.y - cameraY);

    // Mute indicator
    if (!player.isMuted) {
      canvas.drawImage(
        speakerImage,
        player.x - cameraX + 5,
        player.y - cameraY - 28
      );
    }

    // Optimize audio volume calculation
    if (player !== myPlayer && remoteUsers[player.voiceId]?.audioTrack) {
      const distance = Math.hypot(player.x - myPlayer.x, player.y - myPlayer.y);
      const ratio = 1.0 - Math.min(distance / 700, 1);
      remoteUsers[player.voiceId].audioTrack.setVolume(Math.floor(ratio * 100));
    }
  }
}


// Optimize snowball rendering
function renderSnowballs(cameraX, cameraY) {
  canvas.fillStyle = "#FFFFFF";
  for (const snowball of snowballs) {
    canvas.beginPath();
    canvas.arc(
      snowball.x - cameraX,
      snowball.y - cameraY,
      SNOWBALL_RADIUS,
      0,
      2 * Math.PI
    );
    canvas.fill();
  }
}

// Advanced animation loop with frame rate control
let lastTime = 0;
const FPS = 60;
const FRAME_MIN_TIME = (1000/60) * (60 / FPS) - (1000/60) * 0.5;

function loop(currentTime) {
  // Frame rate control
  if (currentTime - lastTime < FRAME_MIN_TIME) {
    window.requestAnimationFrame(loop);
    return;
  }
  lastTime = currentTime;

  // Optimize canvas clearing
  canvas.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // Create background gradient
  canvas.fillStyle = createBackgroundGradient();
  canvas.fillRect(0, 0, canvasEl.width, canvasEl.height);

  const myPlayer = players.find((player) => player.id === socket.id);
  let cameraX = 0;
  let cameraY = 0;
  if (myPlayer) {
    cameraX = myPlayer.x - canvasEl.width / 2;
    cameraY = myPlayer.y - canvasEl.height / 2;
  }

  // Optimize snowflake rendering
  const updatedSnowflakes = updateSnowflakes();
  renderSnowflakes(updatedSnowflakes);

  // Batch rendering for ground tiles
  canvas.save();
  renderGroundTiles(cameraX, cameraY);
  canvas.restore();

  // Batch rendering for decals
  canvas.save();
  renderDecalTiles(cameraX, cameraY);
  canvas.restore();

  // Optimize player rendering
  renderPlayers(myPlayer, cameraX, cameraY);

  // Optimize snowball rendering
  renderSnowballs(cameraX, cameraY);

  window.requestAnimationFrame(loop);
}

// Start the game loop
window.requestAnimationFrame(loop);