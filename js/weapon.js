class Projectile extends Phaser.GameObjects.Arc {
    constructor(scene, x, y, velocityX, velocityY, radius, config) {
        super(scene, x, y, radius, 0xffffff, 1);
        this.scene = scene;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.config = config; // Explosion radius, damage, etc.
        this.isAlive = true;

        // Physics
        this.gravity = 0.4;
        this.friction = 0.99;
        this.bouncing = 0.5;

        scene.add.existing(this);
    }

    update(terrain, players, wind = 0) {
        if (!this.isAlive) return;

        // Apply Wind force (only to certain weapon types if desired, here for all)
        this.velocityX += wind * 0.1;

        // Gravity
        this.velocityY += this.gravity;

        // Horizontal friction
        this.velocityX *= this.friction;

        // Apply movement
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Collision detection with terrain
        if (terrain.checkCollision(this.x, this.y, 4)) {
            this.explode(terrain, players);
        }

        // Out of bounds (e.g., water/abyss)
        if (this.y > this.scene.scale.height || this.x < 0 || this.x > this.scene.scale.width) {
            this.destroy();
            this.isAlive = false;
            this.scene.events.emit('projectileDone');
        }
    }

    explode(terrain, players) {
        if (!this.isAlive) return;
        this.isAlive = false;

        const explosionRadius = this.config.explosionRadius || 40;
        const damage = this.config.damage || 50;

        // 1. Destroy terrain
        terrain.destroyCircle(this.x, this.y, explosionRadius);

        // 2. Play explosion effect
        this.scene.add.circle(this.x, this.y, explosionRadius, 0xffaa00, 0.8)
            .setAlpha(1)
            .setStrokeStyle(2, 0xffff00);

        this.scene.tweens.add({
            targets: this.scene.children.list.filter(c => c.type === 'Circle' && c.x === this.x && c.y === this.y),
            scale: 1.5,
            alpha: 0,
            duration: 300,
            onComplete: (tween, targets) => {
                targets.forEach(t => t.destroy());
            }
        });

        // 3. Apply damage and knockback to players
        players.forEach(player => {
            if (!player.isAlive) return;

            const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
            if (dist < explosionRadius + player.radius) {
                // Ratio of damage based on proximity to center
                const damageRatio = 1 - (dist / (explosionRadius + player.radius));
                const finalDamage = Math.floor(damage * damageRatio);
                player.updateHP(finalDamage);

                // Knockback
                const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
                const force = (explosionRadius / dist) * 10;
                player.velocity.x += Math.cos(angle) * force;
                player.velocity.y += Math.sin(angle) * force;
            }
        });

        // 4. Finalize
        this.scene.events.emit('projectileDone');
        this.destroy();
    }
}

class Grenade extends Projectile {
    constructor(scene, x, y, vx, vy, radius, config) {
        super(scene, x, y, vx, vy, radius, config);
        this.timer = config.timer || 3000;
        this.createTime = scene.time.now;

        // Custom physics for grenade
        this.bouncing = 0.6;
        this.friction = 0.98;

        // Timer text
        this.timerText = scene.add.text(x, y - 20, "3", { fontSize: '14px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
    }

    update(terrain, players, wind) {
        if (!this.isAlive) return;

        const elapsed = this.scene.time.now - this.createTime;
        const remaining = Math.ceil((this.timer - elapsed) / 1000);

        this.timerText.setPosition(this.x, this.y - 15);
        this.timerText.setText(remaining > 0 ? remaining : "!");

        if (elapsed >= this.timer) {
            this.timerText.destroy();
            this.explode(terrain, players);
            return;
        }

        // Apply Wind (Grenades are heavier, less affected)
        this.velocityX += wind * 0.05;

        // Physics
        this.velocityY += this.gravity;
        this.velocityX *= this.friction;

        let nextX = this.x + this.velocityX;
        let nextY = this.y + this.velocityY;

        // Collision with Bounce
        if (terrain.checkCollision(nextX, nextY, 5)) {
            // Check if horizontal or vertical collision
            if (terrain.checkCollision(this.x, nextY, 5)) {
                this.velocityY *= -this.bouncing;
                nextY = this.y;
            }
            if (terrain.checkCollision(nextX, this.y, 5)) {
                this.velocityX *= -this.bouncing;
                nextX = this.x;
            }
        }

        this.x = nextX;
        this.y = nextY;

        // Out of bounds
        if (this.y > this.scene.scale.height || this.x < 0 || this.x > this.scene.scale.width) {
            this.timerText.destroy();
            this.destroy();
            this.isAlive = false;
            this.scene.events.emit('projectileDone');
        }
    }
}
