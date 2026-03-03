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

        // Sling preview — scene-level Graphics so coordinates are in world space
        this.slingLine = scene.add.graphics();
        this.slingLine.setDepth(100);
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
            this.updateHP(100);
        }
    }

    jump(dir = 0) {
        if (this.grounded) {
            this.velocity.y = -8;
            if (dir !== 0) {
                this.velocity.x = dir * 6;
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

        // The launch direction is OPPOSITE to the drag direction
        const launchAngle = angle + Math.PI;
        const speed = power / 10; // normalised launch speed matching handlePointerUp

        // Simulate trajectory using same physics as Projectile
        const gravity = 0.4;
        let simVX = Math.cos(launchAngle) * speed;
        let simVY = Math.sin(launchAngle) * speed;
        let simX = this.x;
        let simY = this.y - 15; // launch point matches handlePointerUp offset

        const totalDots = 30;

        for (let i = 0; i < totalDots; i++) {
            // Advance simulation by one frame
            simVY += gravity;
            simX += simVX;
            simY += simVY;

            // Gradient: start colour (bright cyan) -> end colour (orange-red)
            const t = i / totalDots;
            const r = Math.floor(0 + (255 - 0) * t);
            const g = Math.floor(230 + (100 - 230) * t);
            const b = Math.floor(255 + (50 - 255) * t);
            const dotColor = (r << 16) | (g << 8) | b;
            const dotAlpha = 1.0 - t * 0.7;

            // Dotted line: small filled circles
            this.slingLine.fillStyle(dotColor, dotAlpha);
            this.slingLine.fillCircle(simX, simY, 3 - t * 1.5);
        }
    }

    hideSling() {
        this.slingLine.clear();
        this.slingLine.setVisible(false);
    }
}
