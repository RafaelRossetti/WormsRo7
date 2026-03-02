class Player extends Phaser.GameObjects.Container {
    constructor(scene, x, y, name, color, teamIndex) {
        super(scene, x, y);
        this.scene = scene;
        this.name = name;
        this.color = color;
        this.teamIndex = teamIndex;
        this.hp = 100;
        this.isAlive = true;
        this.score = 0;

        // Visual representation (the "Worm")
        this.bodySprite = scene.add.circle(0, 0, 10, color);
        this.add(this.bodySprite);

        // Name text
        this.nameText = scene.add.text(0, -25, name, {
            fontSize: '12px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);
        this.add(this.nameText);

        // HP bar background
        this.hpBg = scene.add.rectangle(0, -15, 30, 4, 0x000000);
        this.add(this.hpBg);

        // HP bar fill
        this.hpFill = scene.add.rectangle(0, -15, 30, 4, 0x2ecc71);
        this.add(this.hpFill);

        // Add to scene
        scene.add.existing(this);

        // Physics properties
        this.velocity = { x: 0, y: 0 };
        this.isFalling = true;
        this.radius = 10;
        this.grounded = false;

        // Sling preview
        this.slingLine = scene.add.graphics();
        this.add(this.slingLine);
        this.slingLine.setVisible(false);
    }

    updateHP(damage) {
        this.hp = Math.max(0, this.hp - damage);
        const ratio = this.hp / 100;
        this.hpFill.width = 30 * ratio;

        if (this.hp <= 0 && this.isAlive) {
            this.die();
        }
    }

    die() {
        this.isAlive = false;
        this.setVisible(false);
        // Dispatch death event or handle in game loop
        this.scene.events.emit('playerDied', this);
    }

    applyPhysics(terrain) {
        if (!this.isAlive) return;

        // Simple gravity
        this.velocity.y += 0.5;

        // Apply horizontal movement (friction)
        this.velocity.x *= 0.9;

        // Try moving
        let nextX = this.x + this.velocity.x;
        let nextY = this.y + this.velocity.y;

        // Collision detection with terrain (pixel based)
        let hasCollision = terrain.checkCollision(nextX, nextY, this.radius);

        if (hasCollision) {
            // Check if we can step up (simple ramp walking)
            let canStepUp = false;
            for (let i = 1; i <= 5; i++) {
                if (!terrain.checkCollision(nextX, nextY - i, this.radius)) {
                    nextY -= i;
                    canStepUp = true;
                    break;
                }
            }

            if (canStepUp) {
                this.x = nextX;
                this.y = nextY;
                this.velocity.y = 0;
                this.grounded = true;
            } else {
                // Real collision
                this.velocity.y = 0;
                this.velocity.x = 0;
                this.grounded = true;

                // Keep the player on top of ground if they are sinking
                while (terrain.checkCollision(this.x, this.y, this.radius)) {
                    this.y -= 1;
                    if (this.y < 0) break;
                }
            }
        } else {
            this.x = nextX;
            this.y = nextY;
            this.grounded = false;
        }

        // Check for out of bounds
        if (this.y > this.scene.scale.height + 100) {
            this.updateHP(100); // Instant death
        }
    }

    jump(dir = 0) {
        if (this.grounded) {
            this.velocity.y = -8;
            if (dir !== 0) {
                this.velocity.x = dir * 6; // Adiciona impulso horizontal
            }
            this.grounded = false;
        }
    }

    move(dir) {
        if (this.grounded) {
            this.velocity.x = dir * 2;
        }
    }

    showSling(startX, startY, endX, endY, power, angle) {
        this.slingLine.clear();
        this.slingLine.setVisible(true);

        const lineLength = power * 2;
        const opacity = Math.max(0, 1 - (power / 100));

        this.slingLine.lineStyle(2, 0xffffff, opacity);

        // Draw dotted line
        const dx = endX - startX;
        const dy = endY - startY;

        for (let i = 0; i < 10; i++) {
            const t = i / 10;
            const px = -dx * t;
            const py = -dy * t;
            this.slingLine.fillStyle(0xffffff, opacity * (1 - t));
            this.slingLine.fillCircle(px, py, 2);
        }
    }

    hideSling() {
        this.slingLine.setVisible(false);
    }
}
