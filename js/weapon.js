class Projectile extends Phaser.GameObjects.Arc {
    constructor(scene, x, y, velocityX, velocityY, radius, config) {
        super(scene, x, y, radius, 0, 360, false, 0xffffff, 1);
        this.scene = scene;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.config = config;
        this.isAlive = true;

        // Physics
        this.gravity = 0.4;
        this.friction = 0.99;
        this.bouncing = 0.5;

        scene.add.existing(this);
        this.setDepth(90);

        // Trail effect
        this.trail = scene.add.graphics();
        this.trail.setDepth(89);
        this.trailPoints = [];

        // Camera follows projectile
        scene.cameras.main.startFollow(this, false, 0.08, 0.08);
        scene.cameras.main.zoomTo(1.4, 600);
    }

    update(terrain, players, wind = 0) {
        if (!this.isAlive) return;

        // Apply Wind
        this.velocityX += wind * 0.1;

        // Gravity
        this.velocityY += this.gravity;

        // Horizontal friction
        this.velocityX *= this.friction;

        // Apply movement
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Trail drawing
        this.trailPoints.push({ x: this.x, y: this.y });
        if (this.trailPoints.length > 20) this.trailPoints.shift();

        this.trail.clear();
        for (let i = 0; i < this.trailPoints.length; i++) {
            const t = i / this.trailPoints.length;
            this.trail.fillStyle(0xffaa44, t * 0.5);
            this.trail.fillCircle(this.trailPoints[i].x, this.trailPoints[i].y, 2 + t * 2);
        }

        // Collision detection with terrain
        if (terrain.checkCollision(this.x, this.y, 4)) {
            this.explode(terrain, players);
            return; // stop update — object is destroyed inside explode()
        }

        // Out of bounds (only reachable if still alive)
        if (this.y > this.scene.scale.height || this.x < 0 || this.x > this.scene.scale.width) {
            const sceneRef = this.scene;
            this.cleanup();
            sceneRef.events.emit('projectileDone');
        }
    }

    explode(terrain, players) {
        if (!this.isAlive) return;
        this.isAlive = false;

        const explosionRadius = this.config.explosionRadius || 40;
        const damage = this.config.damage || 50;

        // Stop camera follow, keep looking at the explosion
        this.scene.cameras.main.stopFollow();
        this.scene.cameras.main.pan(this.x, this.y, 300, 'Power2');
        this.scene.cameras.main.zoomTo(1.6, 300);

        // 1. Destroy terrain
        terrain.destroyCircle(this.x, this.y, explosionRadius);

        // 2. Multi-layered explosion effect
        const expX = this.x;
        const expY = this.y;

        // Outer shockwave ring
        const shockwave = this.scene.add.circle(expX, expY, 5, 0xffffff, 0.6);
        shockwave.setDepth(95);
        shockwave.setStrokeStyle(3, 0xffff88);
        this.scene.tweens.add({
            targets: shockwave,
            radius: explosionRadius * 1.5,
            alpha: 0,
            duration: 500,
            onComplete: () => shockwave.destroy()
        });

        // Main fireball
        const fireball = this.scene.add.circle(expX, expY, explosionRadius * 0.5, 0xff6600, 0.9);
        fireball.setDepth(96);
        this.scene.tweens.add({
            targets: fireball,
            scaleX: 2.5,
            scaleY: 2.5,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => fireball.destroy()
        });

        // Inner bright flash
        const flash = this.scene.add.circle(expX, expY, explosionRadius * 0.3, 0xffffcc, 1);
        flash.setDepth(97);
        this.scene.tweens.add({
            targets: flash,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 400,
            onComplete: () => flash.destroy()
        });

        // Particle-like debris dots
        for (let i = 0; i < 12; i++) {
            const debrisAngle = Math.random() * Math.PI * 2;
            const debrisDist = Math.random() * explosionRadius * 0.6;
            const dx = expX + Math.cos(debrisAngle) * debrisDist;
            const dy = expY + Math.sin(debrisAngle) * debrisDist;
            const colors = [0xff4400, 0xffaa00, 0xffee00, 0x884400];
            const debris = this.scene.add.circle(dx, dy, 2 + Math.random() * 3, colors[i % colors.length], 1);
            debris.setDepth(98);
            this.scene.tweens.add({
                targets: debris,
                x: dx + Math.cos(debrisAngle) * (explosionRadius + Math.random() * 30),
                y: dy + Math.sin(debrisAngle) * (explosionRadius + Math.random() * 30) - 20,
                alpha: 0,
                duration: 600 + Math.random() * 400,
                onComplete: () => debris.destroy()
            });
        }

        // 3. Apply damage and knockback to players
        players.forEach(player => {
            if (!player.isAlive) return;

            const dist = Phaser.Math.Distance.Between(expX, expY, player.x, player.y);
            if (dist < explosionRadius + player.radius) {
                const damageRatio = 1 - (dist / (explosionRadius + player.radius));
                const finalDamage = Math.floor(damage * damageRatio);
                player.updateHP(finalDamage);

                // Knockback
                const kbAngle = Phaser.Math.Angle.Between(expX, expY, player.x, player.y);
                const force = (explosionRadius / Math.max(dist, 1)) * 10;
                player.velocity.x += Math.cos(kbAngle) * force;
                player.velocity.y += Math.sin(kbAngle) * force;
            }
        });

        // 4. Clean up projectile sprite + trail
        const sceneRef = this.scene;
        this.trail.clear();
        this.trail.destroy();
        this.destroy();

        // 5. Wait 2 seconds showing the impact, then emit done
        sceneRef.time.delayedCall(2000, () => {
            sceneRef.events.emit('projectileDone');
        });
    }

    cleanup() {
        this.isAlive = false;
        const sceneRef = this.scene;
        sceneRef.cameras.main.stopFollow();
        if (this.trail) {
            this.trail.clear();
            this.trail.destroy();
        }
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
        this.timerText = scene.add.text(x, y - 20, "3", {
            fontSize: '14px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(91);
    }

    update(terrain, players, wind) {
        if (!this.isAlive) return;

        const elapsed = this.scene.time.now - this.createTime;
        const remaining = Math.ceil((this.timer - elapsed) / 1000);

        this.timerText.setPosition(this.x, this.y - 15);
        this.timerText.setText(remaining > 0 ? remaining : "!");

        if (elapsed >= this.timer) {
            this.explode(terrain, players);
            return; // stop update — object is destroyed inside explode()
        }

        // Apply Wind (Grenades are heavier, less affected)
        this.velocityX += wind * 0.05;

        // Physics
        this.velocityY += this.gravity;
        this.velocityX *= this.friction;

        let nextX = this.x + this.velocityX;
        let nextY = this.y + this.velocityY;

        // Trail drawing
        this.trailPoints.push({ x: this.x, y: this.y });
        if (this.trailPoints.length > 15) this.trailPoints.shift();

        this.trail.clear();
        for (let i = 0; i < this.trailPoints.length; i++) {
            const t = i / this.trailPoints.length;
            this.trail.fillStyle(0x88ff44, t * 0.4);
            this.trail.fillCircle(this.trailPoints[i].x, this.trailPoints[i].y, 2 + t);
        }

        // Collision with Bounce
        if (terrain.checkCollision(nextX, nextY, 5)) {
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
            const sceneRef = this.scene;
            this.timerText.destroy();
            this.cleanup();
            sceneRef.events.emit('projectileDone');
        }
    }

    explode(terrain, players) {
        if (this.timerText && this.timerText.active) {
            this.timerText.destroy();
        }
        super.explode(terrain, players);
    }

    cleanup() {
        if (this.timerText && this.timerText.active) {
            this.timerText.destroy();
        }
        super.cleanup();
    }
}
