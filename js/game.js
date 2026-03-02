// Configuration and Constants
const CONFIG = {
    type: Phaser.AUTO,
    width: 1200,
    height: 700,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let game = new Phaser.Game(CONFIG);

// Game Variables
let players = [];
let currentTurnIndex = 0;
let turnTimer = 15;
let turnTimerEvent;
let terrain;
let terrainData;
let isShooting = false;
let slingStart = null;
let projectile = null;
let gameStarted = false;
let wind = 0;
let currentWeapon = 'bazooka';

// Preload assets
function preload() {
    // We'll generate a terrain procedural later
}

// Create Game World
function create() {
    const scene = this;

    // 1. Initial Menu Setup
    document.getElementById('btn-start').onclick = startGame.bind(this);

    // UI selection buttons
    document.querySelectorAll('.btn-selection').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.btn-selection').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.numPlayers = parseInt(btn.dataset.players);
        };
    });

    // Default player count if not clicked
    window.numPlayers = 2;
    document.querySelector('.btn-selection[data-players="2"]').classList.add('active');

    // 2. Terrain Generation (Canvas Texture)
    createTerrain(scene);

    // Input Events
    scene.input.on('pointerdown', handlePointerDown, scene);
    scene.input.on('pointermove', handlePointerMove, scene);
    scene.input.on('pointerup', handlePointerUp, scene);
    scene.input.on('pointerupoutside', handlePointerUp, scene); // Garantir disparo se soltar fora do canvas

    // Keyboard Events
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.enterKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    scene.tabKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    // Global Events
    scene.events.on('projectileDone', nextTurn.bind(this));
}

function startGame() {
    const teamSize = parseInt(document.getElementById('team-size').value);
    const numPlayers = window.numPlayers;

    document.getElementById('start-menu').classList.add('hidden');
    document.getElementById('ui-layer').classList.remove('hidden');

    const colors = [0x6c63ff, 0xf5b041, 0x2ecc71, 0xe74c3c];
    const teamNames = ['Equipe Azul', 'Equipe Laranja', 'Equipe Verde', 'Equipe Vermelha'];

    // Spawn players randomly on solid ground
    for (let p = 0; p < numPlayers; p++) {
        for (let m = 0; m < teamSize; m++) {
            let spawnPos = findSpawnPosition();
            let newPlayer = new Player(this, spawnPos.x, spawnPos.y, `P${p + 1}.${m + 1}`, colors[p], p);
            players.push(newPlayer);
        }
    }

    // Sort players for turn sequence
    // Player 1 (A), Player 2 (A), ... Player 1 (B)
    // We achieve this by sorting teams and then members
    // Here we'll just keep them as spawned since we'll iterate with a logic in nextTurn

    gameStarted = true;
    startTurnTimer.call(this);
    updateUI();

    // Zoom inicial no primeiro jogador
    this.time.delayedCall(500, () => {
        focusCamera(players[currentTurnIndex], 1.8);
    });
}

function createTerrain(scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;

    // 1. Create a CanvasTexture for the terrain
    terrainData = scene.textures.createCanvas('terrain', width, height);
    const ctx = terrainData.getContext();

    // 2. Generate procedural landscape (Hillish)
    ctx.fillStyle = '#2d5a27'; // Dark green grass
    ctx.beginPath();
    ctx.moveTo(0, height);

    let lastY = height * 0.6;
    for (let x = 0; x < width; x += 10) {
        let y = lastY + (Math.random() - 0.5) * 40;
        y = Phaser.Math.Clamp(y, height * 0.3, height * 0.85);
        ctx.lineTo(x, y);
        lastY = y;
    }

    ctx.lineTo(width, height);
    ctx.fill();

    // 3. Add background sky/dirt layers
    // We'll just use a solid color for sky in game config but terrain is what matters for collisions

    // 4. Update the texture to make it visible
    terrainData.refresh();

    // 5. Wrap functionality into a Terrain object
    terrain = {
        texture: terrainData,
        checkCollision: function (x, y, radius) {
            if (x < 0 || x >= width || y < 0 || y >= height) return false;

            // Optimization: check a few sample points around the radius
            const samples = [
                { x: 0, y: 0 }, { x: radius, y: 0 }, { x: -radius, y: 0 },
                { x: 0, y: radius }, { x: radius * 0.7, y: radius * 0.7 }, { x: -radius * 0.7, y: radius * 0.7 }
            ];

            for (let s of samples) {
                let px = Math.floor(x + s.x);
                let py = Math.floor(y + s.y);
                if (px < 0 || px >= width || py < 0 || py >= height) continue;

                const pixel = ctx.getImageData(px, py, 1, 1).data;
                if (pixel[3] > 0) return true; // Alpha > 0 means solid
            }
            return false;
        },
        destroyCircle: function (x, y, radius) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            terrainData.refresh();
        }
    };

    // Add terrain and water to display list
    scene.add.image(0, 0, 'terrain').setOrigin(0, 0);

    // Add Water layer at bottom
    let water = scene.add.rectangle(width / 2, height - 10, width, 40, 0x0077be, 0.6);
    scene.tweens.add({
        targets: water,
        y: height - 15,
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
}

function findSpawnPosition() {
    let x, y;
    let found = false;
    let attempts = 0;
    const minDistance = 80; // Distância mínima horizontal entre personagens

    while (!found && attempts < 200) {
        x = Phaser.Math.Between(100, 1100);
        y = 0;

        // Find ground from top
        for (let checkY = 0; checkY < 700; checkY += 5) {
            if (terrain.checkCollision(x, checkY, 5)) {
                // Verificar proximidade com outros jogadores já spawnados
                let tooClose = false;
                for (let p of players) {
                    if (Math.abs(x - p.x) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    y = checkY - 20;
                    found = true;
                }
                break; // Achou terreno, para de descer o Y
            }
        }
        attempts++;
    }

    // Fallback se não achar lugar ideal (espalhando se preciso)
    if (!found) {
        x = Phaser.Math.Between(200, 1000);
        y = 300;
        let attemptFallback = 0;
        while (attemptFallback < 20) {
            let tooClose = false;
            for (let p of players) {
                if (Math.abs(x - p.x) < minDistance) tooClose = true;
            }
            if (!tooClose) break;
            x = Phaser.Math.Between(200, 1000);
            attemptFallback++;
        }
    }
    return { x, y };
}

function focusCamera(player, zoom = 1.6) {
    if (!player) return;
    const scene = player.scene;

    // Faz o pan e zoom in no jogador
    scene.cameras.main.pan(player.x, player.y, 500, 'Power2');
    scene.cameras.main.zoomTo(zoom, 500);

    // Zoom out de volta para a tela cheia após visualizar o jogador
    scene.time.delayedCall(1500, () => {
        scene.cameras.main.zoomTo(1.0, 500);
        scene.cameras.main.pan(600, 350, 500, 'Power2'); // 600, 350 é o centro da tela (1200x700)
    });
}

function update(time, delta) {
    if (!gameStarted) return;

    const currentPlayer = players[currentTurnIndex];
    if (!currentPlayer) return;

    // Manage movement
    if (this.cursors.left.isDown) {
        currentPlayer.move(-1);
    } else if (this.cursors.right.isDown) {
        currentPlayer.move(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        currentPlayer.jump();
    }

    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) {
        switchWeapon();
    }

    // Apply physics to all players (gravity, falling)
    players.forEach(p => {
        if (p.isAlive) p.applyPhysics(terrain);
    });

    // Update projectile if exists
    if (projectile) {
        projectile.update(terrain, players, wind);
    }
}

function switchWeapon() {
    currentWeapon = currentWeapon === 'bazooka' ? 'grenade' : 'bazooka';
    document.getElementById('weapon-name').textContent = currentWeapon.toUpperCase();
}

function handlePointerDown(pointer) {
    if (!gameStarted || projectile) return;

    const currentPlayer = players[currentTurnIndex];
    slingStart = { x: pointer.x, y: pointer.y };
    isShooting = true;
}

function handlePointerMove(pointer) {
    if (!isShooting || !gameStarted) return;

    const currentPlayer = players[currentTurnIndex];
    const dx = pointer.x - slingStart.x;
    const dy = pointer.y - slingStart.y;

    const distance = Phaser.Math.Distance.Between(slingStart.x, slingStart.y, pointer.x, pointer.y);
    const power = Math.min(distance, 150) / 10;
    const angle = Phaser.Math.Angle.Between(slingStart.x, slingStart.y, pointer.x, pointer.y);

    currentPlayer.showSling(slingStart.x, slingStart.y, pointer.x, pointer.y, power * 10, angle);
}

function handlePointerUp(pointer) {
    if (!isShooting || !gameStarted) return;

    const currentPlayer = players[currentTurnIndex];
    const dx = slingStart.x - pointer.x;
    const dy = slingStart.y - pointer.y;

    const distance = Phaser.Math.Distance.Between(slingStart.x, slingStart.y, pointer.x, pointer.y);
    const power = Math.min(distance, 150) / 10;
    const angle = Phaser.Math.Angle.Between(pointer.x, pointer.y, slingStart.x, slingStart.y);

    // Fire Projectile
    const vx = Math.cos(angle) * power;
    const vy = Math.sin(angle) * power;

    if (power > 0.5) { // Evitar disparos acidentais com clique rápido
        if (currentWeapon === 'bazooka') {
            projectile = new Projectile(this, currentPlayer.x, currentPlayer.y - 15, vx, vy, 4, {
                explosionRadius: 50,
                damage: 100,
                type: 'bazooka'
            });
        } else {
            projectile = new Grenade(this, currentPlayer.x, currentPlayer.y - 15, vx, vy, 5, {
                explosionRadius: 60,
                damage: 80,
                timer: 3000
            });
        }

        // Retirar zoom e recentralizar para acompanhar o campo de batalha inteiro
        this.cameras.main.zoomTo(1.0, 800);
        this.cameras.main.pan(600, 350, 800, 'Power2');
    }

    currentPlayer.hideSling();
    isShooting = false;
    slingStart = null;

    // Stop the turn timer when shot
    if (projectile && turnTimerEvent) turnTimerEvent.remove();
}

function nextTurn() {
    projectile = null;

    // Cycle turn logic: Current player is done, move to next
    // The sequence requested: J1(A) -> J2(A) ... -> J1(B)
    // Actually, simple increment is fine if players were added in that order
    let nextIndex = (currentTurnIndex + 1) % players.length;

    // Find next alive player
    let attempts = 0;
    while (!players[nextIndex].isAlive && attempts < players.length) {
        nextIndex = (nextIndex + 1) % players.length;
        attempts++;
    }

    if (attempts >= players.length) {
        alert("Fim de Jogo! Uma equipe venceu.");
        location.reload();
        return;
    }

    currentTurnIndex = nextIndex;
    startTurnTimer.call(this);
    updateUI();

    // Zoom no novo jogador
    focusCamera(players[currentTurnIndex], 1.8);
}

function startTurnTimer() {
    if (turnTimerEvent) turnTimerEvent.remove();

    turnTimer = 15;
    document.getElementById('turn-timer').textContent = turnTimer;

    turnTimerEvent = this.time.addEvent({
        delay: 1000,
        callback: () => {
            turnTimer--;
            document.getElementById('turn-timer').textContent = turnTimer;
            if (turnTimer <= 0) {
                nextTurn.call(this);
            }
        },
        callbackScope: this,
        loop: true
    });
}

function updateUI() {
    const cp = players[currentTurnIndex];
    document.getElementById('current-player-name').textContent = cp.name;
    document.getElementById('current-player-name').style.color = '#' + cp.color.toString(16).padStart(6, '0');
    document.getElementById('current-player-score').textContent = `Time ${cp.teamIndex + 1}`;

    // Update Wind
    wind = (Math.random() - 0.5) * 0.4; // Updated every turn
    const windDisplay = Math.abs(Math.round(wind * 100));
    document.getElementById('wind-value').textContent = windDisplay;
    document.getElementById('wind-arrow').style.transform = `rotate(${wind >= 0 ? 0 : 180}deg)`;
}
