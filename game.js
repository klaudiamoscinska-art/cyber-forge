'use strict';

/* ==========================================================================
   Cyber Forge: Merge Tycoon
   Neon side-scroller idle combat + merge forge, plain Canvas2D + DOM.
   ========================================================================== */

const CONFIG = {
  save: {
    key: 'cyberForgeSave_v1',
    intervalMs: 5000,
  },
  forge: {
    baseCost: 15,
    costMultiplier: 1.18,
  },
  weapon: {
    maxLevel: 10,
    baseDamage: 8,
    damageMultiplier: 1.9,
    // color tiers by level: [minLevel, hex, glowRgba]
    tiers: [
      { min: 1, color: '#39ff14', glow: 'rgba(57,255,20,0.65)' },
      { min: 5, color: '#00f3ff', glow: 'rgba(0,243,255,0.7)' },
      { min: 8, color: '#ff007f', glow: 'rgba(255,0,127,0.75)' },
    ],
  },
  attackSpeed: {
    baseIntervalMs: 1000,
    minIntervalMs: 160,
    decayPerLevel: 0.92,
    baseCost: 25,
    costMultiplier: 1.35,
  },
  enemy: {
    baseHp: 18,
    hpGrowth: 1.12,
    baseGold: 4,
    goldGrowth: 1.08,
    bossEvery: 10,
    bossHpMult: 6,
    bossGoldMult: 6,
    speed: 90, // px/s
    spawnDelayMs: 550,
    attackRange: 78,
  },
  autoMerge: {
    durationMs: 30000,
    cooldownMs: 60000,
    tickMs: 650,
  },
  grid: {
    size: 16,
  },
};

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */

function formatNumber(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let value = n;
  let unitIndex = -1;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
  return value.toFixed(decimals) + units[unitIndex];
}

function weaponTierColor(level) {
  const tiers = CONFIG.weapon.tiers;
  let tier = tiers[0];
  for (const t of tiers) {
    if (level >= t.min) tier = t;
  }
  return tier;
}

function weaponDamage(level) {
  if (level <= 0) return 2;
  return CONFIG.weapon.baseDamage * Math.pow(CONFIG.weapon.damageMultiplier, level - 1);
}

const SWORD_SVG =
  '<svg class="sword-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<line x1="19" y1="5" x2="8" y2="16"></line>' +
  '<path d="M15 3 L21 3 L21 9"></path>' +
  '<line x1="3" y1="12" x2="9" y2="18"></line>' +
  '<line x1="6" y1="9" x2="10" y2="13"></line>' +
  '<line x1="3" y1="21" x2="7" y2="17"></line>' +
  '</svg>';

/* ---------------------------------------------------------------------- */
/* WeaponSlot                                                              */
/* ---------------------------------------------------------------------- */

class WeaponSlot {
  constructor(level) {
    this.level = level;
  }

  get damage() {
    return weaponDamage(this.level);
  }

  get colorInfo() {
    return weaponTierColor(this.level);
  }

  static fromJSON(json) {
    if (!json) return null;
    return new WeaponSlot(json.level);
  }
}

/* ---------------------------------------------------------------------- */
/* Particle                                                                */
/* ---------------------------------------------------------------------- */

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 160;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.color = color;
    this.life = 0;
    this.maxLife = 0.5 + Math.random() * 0.4;
    this.size = 2 + Math.random() * 3;
  }

  update(dt) {
    this.life += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.93;
    this.vy *= 0.93;
  }

  isDead() {
    return this.life >= this.maxLife;
  }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, t);
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * t + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ---------------------------------------------------------------------- */
/* Enemy                                                                   */
/* ---------------------------------------------------------------------- */

class Enemy {
  constructor(wave, spawnX, groundY, isBoss) {
    this.wave = wave;
    this.isBoss = isBoss;
    const hpBase = CONFIG.enemy.baseHp * Math.pow(CONFIG.enemy.hpGrowth, wave);
    const goldBase = CONFIG.enemy.baseGold * Math.pow(CONFIG.enemy.goldGrowth, wave);
    this.maxHp = isBoss ? hpBase * CONFIG.enemy.bossHpMult : hpBase;
    this.hp = this.maxHp;
    this.goldReward = isBoss ? goldBase * CONFIG.enemy.bossGoldMult : goldBase;
    this.x = spawnX;
    this.y = groundY;
    this.size = isBoss ? 42 : 22;
    this.speed = CONFIG.enemy.speed * (isBoss ? 0.6 : 1);
    this.color = isBoss ? '#ff007f' : (Math.random() < 0.5 ? '#ff007f' : '#00f3ff');
    this.hitFlash = 0;
    this.shapeSeed = Math.random();
    this.reachedTarget = false;
  }

  update(dt, targetX) {
    if (this.x - targetX > CONFIG.enemy.attackRange) {
      this.x -= this.speed * dt;
      this.reachedTarget = false;
    } else {
      this.reachedTarget = true;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt * 4;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 1;
  }

  isDead() {
    return this.hp <= 0;
  }

  draw(ctx) {
    ctx.save();
    const flashColor = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.translate(this.x, this.y);

    ctx.shadowBlur = this.isBoss ? 20 : 12;
    ctx.shadowColor = flashColor;
    ctx.strokeStyle = flashColor;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = this.isBoss ? 3 : 2;

    // Cyber-cube / virus shape: rotated square with inner cross
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(-this.size * 0.35, 0);
    ctx.lineTo(this.size * 0.35, 0);
    ctx.moveTo(0, -this.size * 0.35);
    ctx.lineTo(0, this.size * 0.35);
    ctx.stroke();

    // HP bar
    const barW = this.size * 1.4;
    const barY = -this.size - 14;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#222';
    ctx.strokeRect(-barW / 2, barY, barW, 5);
    ctx.fillStyle = this.isBoss ? '#ff007f' : '#39ff14';
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-barW / 2, barY, barW * Math.max(0, this.hp / this.maxHp), 5);

    if (this.isBoss) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff007f';
      ctx.fillStyle = '#ff007f';
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOSS', 0, barY - 6);
    }

    ctx.restore();
  }
}

/* ---------------------------------------------------------------------- */
/* Knight                                                                  */
/* ---------------------------------------------------------------------- */

class Knight {
  constructor(x, groundY) {
    this.x = x;
    this.y = groundY;
    this.runPhase = 0;
    this.attackTimer = 0;
    this.attackFlash = 0;
    this.weaponLevel = 0;
  }

  update(dt, attackIntervalMs, hasTarget) {
    this.runPhase += dt * (hasTarget ? 6 : 9);
    if (this.attackFlash > 0) this.attackFlash -= dt * 3;

    let didAttack = false;
    if (hasTarget) {
      this.attackTimer += dt * 1000;
      if (this.attackTimer >= attackIntervalMs) {
        this.attackTimer = 0;
        this.attackFlash = 1;
        didAttack = true;
      }
    } else {
      this.attackTimer = attackIntervalMs;
    }
    return didAttack;
  }

  draw(ctx) {
    const tier = weaponTierColor(this.weaponLevel);
    const bob = Math.sin(this.runPhase) * 4;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.shadowBlur = 14;
    ctx.shadowColor = '#00f3ff';
    ctx.strokeStyle = '#00f3ff';
    ctx.fillStyle = 'rgba(0,243,255,0.12)';
    ctx.lineWidth = 3;

    // Body: simple vector humanoid (triangle torso + head circle)
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(-14, 4);
    ctx.lineTo(14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -56, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // legs (running cycle)
    const legSwing = Math.sin(this.runPhase) * 12;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.lineTo(-6 + legSwing, 26);
    ctx.moveTo(6, 4);
    ctx.lineTo(6 - legSwing, 26);
    ctx.stroke();

    // weapon (sword) — color/glow scales with equipped level
    const swingOffset = this.attackFlash > 0 ? this.attackFlash * 28 : 0;
    ctx.save();
    ctx.translate(14, -20);
    ctx.rotate((-0.5 + swingOffset * 0.05));
    ctx.shadowBlur = 10 + this.weaponLevel * 2;
    ctx.shadowColor = tier.color;
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 3 + Math.min(this.weaponLevel, 6) * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(24 + swingOffset, -6);
    ctx.stroke();
    ctx.restore();

    // attack flash burst
    if (this.attackFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.attackFlash;
      ctx.shadowBlur = 20;
      ctx.shadowColor = tier.color;
      ctx.strokeStyle = tier.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(38, -26, 10 + (1 - this.attackFlash) * 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

/* ---------------------------------------------------------------------- */
/* Game                                                                    */
/* ---------------------------------------------------------------------- */

class Game {
  constructor() {
    this.canvas = document.getElementById('rpgCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.gridEl = document.getElementById('mergeGrid');
    this.els = {
      gold: document.getElementById('statGold'),
      dps: document.getElementById('statDps'),
      level: document.getElementById('statLevel'),
      wave: document.getElementById('statWave'),
      forgeBtn: document.getElementById('btnForge'),
      forgeCost: document.getElementById('forgeCost'),
      autoMergeBtn: document.getElementById('btnAutoMerge'),
      autoMergeStatus: document.getElementById('autoMergeStatus'),
      atkSpeedBtn: document.getElementById('btnAtkSpeed'),
      atkSpeedCost: document.getElementById('atkSpeedCost'),
    };

    this.state = this.loadState();

    this.particles = [];
    this.enemy = null;
    this.waveCounter = this.state.killCount;
    this.spawnTimer = 0;
    this.waitingToSpawn = true;

    this.selectedSlotIndex = null;
    this.dragSourceIndex = null;

    this.logicalWidth = 0;
    this.logicalHeight = 0;

    this.knight = new Knight(0, 0);

    this.lastTime = performance.now();
    this.saveAccum = 0;
    this.autoMergeTickAccum = 0;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindUI();
    this.renderGrid();
    this.updateStatsUI();
    this.updateButtonsUI();

    requestAnimationFrame((t) => this.loop(t));

    window.addEventListener('beforeunload', () => this.saveState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveState();
    });
  }

  /* ---------------- persistence ---------------- */

  defaultState() {
    return {
      version: 1,
      gold: 30,
      grid: new Array(CONFIG.grid.size).fill(null),
      forgePurchases: 0,
      attackSpeedLevel: 0,
      killCount: 0,
      autoMerge: { active: false, endsAt: 0, cooldownEndsAt: 0 },
    };
  }

  loadState() {
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      if (!raw) return this.defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.grid)) {
        return this.defaultState();
      }
      const grid = parsed.grid.map((slot) => WeaponSlot.fromJSON(slot));
      while (grid.length < CONFIG.grid.size) grid.push(null);
      return {
        version: 1,
        gold: typeof parsed.gold === 'number' ? parsed.gold : 30,
        grid: grid.slice(0, CONFIG.grid.size),
        forgePurchases: parsed.forgePurchases || 0,
        attackSpeedLevel: parsed.attackSpeedLevel || 0,
        killCount: parsed.killCount || 0,
        autoMerge: parsed.autoMerge || { active: false, endsAt: 0, cooldownEndsAt: 0 },
      };
    } catch (e) {
      return this.defaultState();
    }
  }

  saveState() {
    const serializable = {
      version: 1,
      gold: this.state.gold,
      grid: this.state.grid.map((s) => (s ? { level: s.level } : null)),
      forgePurchases: this.state.forgePurchases,
      attackSpeedLevel: this.state.attackSpeedLevel,
      killCount: this.state.killCount,
      autoMerge: this.state.autoMerge,
    };
    try {
      localStorage.setItem(CONFIG.save.key, JSON.stringify(serializable));
    } catch (e) {
      /* storage unavailable — silently ignore */
    }
  }

  /* ---------------- derived values ---------------- */

  get forgeCost() {
    return Math.ceil(CONFIG.forge.baseCost * Math.pow(CONFIG.forge.costMultiplier, this.state.forgePurchases));
  }

  get attackSpeedCost() {
    return Math.ceil(CONFIG.attackSpeed.baseCost * Math.pow(CONFIG.attackSpeed.costMultiplier, this.state.attackSpeedLevel));
  }

  get attackIntervalMs() {
    const decayed = CONFIG.attackSpeed.baseIntervalMs * Math.pow(CONFIG.attackSpeed.decayPerLevel, this.state.attackSpeedLevel);
    return Math.max(CONFIG.attackSpeed.minIntervalMs, decayed);
  }

  get equippedWeaponLevel() {
    let max = 0;
    for (const slot of this.state.grid) {
      if (slot && slot.level > max) max = slot.level;
    }
    return max;
  }

  get currentDamage() {
    return weaponDamage(this.equippedWeaponLevel);
  }

  get currentDps() {
    return this.currentDamage / (this.attackIntervalMs / 1000);
  }

  hasEmptySlot() {
    return this.state.grid.some((s) => s === null);
  }

  firstEmptySlotIndex() {
    return this.state.grid.findIndex((s) => s === null);
  }

  /* ---------------- UI binding ---------------- */

  bindUI() {
    this.els.forgeBtn.addEventListener('click', () => this.forgeWeapon());
    this.els.atkSpeedBtn.addEventListener('click', () => this.buyAttackSpeed());
    this.els.autoMergeBtn.addEventListener('click', () => this.activateAutoMerge());
  }

  forgeWeapon() {
    const cost = this.forgeCost;
    if (this.state.gold < cost || !this.hasEmptySlot()) return;
    this.state.gold -= cost;
    this.state.grid[this.firstEmptySlotIndex()] = new WeaponSlot(1);
    this.state.forgePurchases += 1;
    this.renderGrid();
    this.updateStatsUI();
    this.updateButtonsUI();
  }

  buyAttackSpeed() {
    const cost = this.attackSpeedCost;
    if (this.state.gold < cost) return;
    this.state.gold -= cost;
    this.state.attackSpeedLevel += 1;
    this.updateStatsUI();
    this.updateButtonsUI();
  }

  activateAutoMerge() {
    const now = Date.now();
    if (this.state.autoMerge.active || now < this.state.autoMerge.cooldownEndsAt) return;
    this.state.autoMerge.active = true;
    this.state.autoMerge.endsAt = now + CONFIG.autoMerge.durationMs;
    this.updateButtonsUI();
  }

  /* ---------------- merge grid ---------------- */

  renderGrid() {
    this.gridEl.innerHTML = '';
    this.state.grid.forEach((slot, index) => {
      const el = document.createElement('div');
      el.className = 'weapon-slot ' + (slot ? 'filled' : 'empty');
      el.dataset.index = String(index);

      if (slot) {
        const tier = slot.colorInfo;
        el.style.setProperty('--slot-color', tier.color);
        el.style.setProperty('--slot-glow', tier.glow);
        el.draggable = true;

        const icon = document.createElement('div');
        icon.className = 'weapon-icon';
        icon.innerHTML = SWORD_SVG + '<span class="lvl">Lv.' + slot.level + '</span>';
        el.appendChild(icon);
      }

      if (this.selectedSlotIndex === index) {
        el.classList.add('selected');
      }

      el.addEventListener('click', () => this.onSlotClick(index));
      el.addEventListener('dragstart', (e) => this.onDragStart(e, index));
      el.addEventListener('dragover', (e) => this.onDragOver(e, index));
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => this.onDrop(e, index));

      this.gridEl.appendChild(el);
    });
  }

  onSlotClick(index) {
    const slot = this.state.grid[index];
    if (this.selectedSlotIndex === null) {
      if (!slot) return;
      this.selectedSlotIndex = index;
      this.renderGrid();
      return;
    }

    if (this.selectedSlotIndex === index) {
      this.selectedSlotIndex = null;
      this.renderGrid();
      return;
    }

    const merged = this.tryMerge(this.selectedSlotIndex, index);
    this.selectedSlotIndex = slot ? index : null;
    if (!merged) {
      this.renderGrid();
    }
  }

  onDragStart(e, index) {
    this.dragSourceIndex = index;
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(e, index) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  onDrop(e, index) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const sourceIndex = this.dragSourceIndex !== null ? this.dragSourceIndex : Number(e.dataTransfer.getData('text/plain'));
    this.dragSourceIndex = null;
    if (Number.isNaN(sourceIndex) || sourceIndex === index) return;
    this.tryMerge(sourceIndex, index);
  }

  /**
   * Attempts to merge slot[a] into slot[b]. Returns true if a merge happened.
   */
  tryMerge(a, b) {
    const slotA = this.state.grid[a];
    const slotB = this.state.grid[b];
    if (!slotA || !slotB) return false;
    if (slotA.level !== slotB.level) return false;
    if (slotA.level >= CONFIG.weapon.maxLevel) return false;

    this.state.grid[b] = new WeaponSlot(slotB.level + 1);
    this.state.grid[a] = null;
    this.selectedSlotIndex = null;
    this.renderGrid();
    this.flashSlot(b);
    this.updateStatsUI();
    this.updateButtonsUI();
    return true;
  }

  flashSlot(index) {
    const el = this.gridEl.querySelector('[data-index="' + index + '"]');
    if (!el) return;
    el.classList.remove('merge-flash');
    // force reflow so the animation can restart
    void el.offsetWidth;
    el.classList.add('merge-flash');
  }

  /**
   * Finds one mergeable pair and merges it. Returns true if a merge happened.
   */
  autoMergeOnePair() {
    for (let i = 0; i < this.state.grid.length; i++) {
      const a = this.state.grid[i];
      if (!a || a.level >= CONFIG.weapon.maxLevel) continue;
      for (let j = i + 1; j < this.state.grid.length; j++) {
        const b = this.state.grid[j];
        if (b && b.level === a.level) {
          return this.tryMerge(i, j);
        }
      }
    }
    return false;
  }

  /* ---------------- stats / buttons UI ---------------- */

  updateStatsUI() {
    this.els.gold.textContent = formatNumber(this.state.gold);
    this.els.dps.textContent = formatNumber(this.currentDps);
    this.els.level.textContent = String(this.equippedWeaponLevel);
    this.els.wave.textContent = String(this.state.killCount + 1);
  }

  updateButtonsUI() {
    const cost = this.forgeCost;
    this.els.forgeCost.textContent = formatNumber(cost) + ' zł';
    this.els.forgeBtn.disabled = this.state.gold < cost || !this.hasEmptySlot();

    const atkCost = this.attackSpeedCost;
    this.els.atkSpeedCost.textContent = formatNumber(atkCost) + ' zł';
    this.els.atkSpeedBtn.disabled = this.state.gold < atkCost;

    const now = Date.now();
    const am = this.state.autoMerge;
    if (am.active) {
      const remaining = Math.max(0, Math.ceil((am.endsAt - now) / 1000));
      this.els.autoMergeStatus.textContent = 'Aktywne: ' + remaining + 's';
      this.els.autoMergeBtn.disabled = true;
      this.els.autoMergeBtn.classList.add('active-effect');
    } else if (now < am.cooldownEndsAt) {
      const remaining = Math.max(0, Math.ceil((am.cooldownEndsAt - now) / 1000));
      this.els.autoMergeStatus.textContent = 'Odnowienie: ' + remaining + 's';
      this.els.autoMergeBtn.disabled = true;
      this.els.autoMergeBtn.classList.remove('active-effect');
    } else {
      this.els.autoMergeStatus.textContent = '30s (reklama)';
      this.els.autoMergeBtn.disabled = false;
      this.els.autoMergeBtn.classList.remove('active-effect');
    }
  }

  /* ---------------- canvas / combat ---------------- */

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.logicalWidth = rect.width;
    this.logicalHeight = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const groundY = this.logicalHeight * 0.72;
    this.knight.x = this.logicalWidth * 0.2;
    this.knight.y = groundY;
    if (this.enemy) this.enemy.y = groundY;
  }

  spawnEnemy() {
    this.state.killCount = this.state.killCount;
    const wave = this.state.killCount;
    const isBoss = wave > 0 && wave % CONFIG.enemy.bossEvery === 0;
    const groundY = this.logicalHeight * 0.72;
    this.enemy = new Enemy(wave, this.logicalWidth + 20, groundY, isBoss);
    this.waitingToSpawn = false;
  }

  onEnemyKilled(enemy) {
    for (let i = 0; i < (enemy.isBoss ? 24 : 12); i++) {
      this.particles.push(new Particle(enemy.x, enemy.y - enemy.size / 2, enemy.color));
    }
    this.state.gold += enemy.goldReward;
    this.state.killCount += 1;
    this.enemy = null;
    this.waitingToSpawn = true;
    this.spawnTimer = 0;
    this.updateStatsUI();
    this.updateButtonsUI();
  }

  updateCombat(dt) {
    if (this.enemy) {
      this.enemy.update(dt, this.knight.x + 40);
    } else if (this.waitingToSpawn) {
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= CONFIG.enemy.spawnDelayMs) {
        this.spawnEnemy();
      }
    }

    const hasTarget = !!(this.enemy && this.enemy.reachedTarget);
    const didAttack = this.knight.update(dt, this.attackIntervalMs, hasTarget);

    if (didAttack && this.enemy) {
      this.enemy.takeDamage(this.currentDamage);
      if (this.enemy.isDead()) {
        this.onEnemyKilled(this.enemy);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].isDead()) this.particles.splice(i, 1);
    }

    this.knight.weaponLevel = this.equippedWeaponLevel;
  }

  drawBackground(ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    const groundY = this.logicalHeight * 0.72;
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    ctx.strokeStyle = 'rgba(0,243,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 30);
    ctx.lineTo(this.logicalWidth, groundY + 30);
    ctx.stroke();

    // subtle vertical grid lines for depth
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    const spacing = 40;
    for (let x = 0; x < this.logicalWidth; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 30);
      ctx.lineTo(x, this.logicalHeight);
      ctx.stroke();
    }
    ctx.restore();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.drawBackground(ctx);

    this.knight.draw(ctx);
    if (this.enemy) this.enemy.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
  }

  /* ---------------- main loop ---------------- */

  loop(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    this.updateCombat(dt);

    // auto-merge power-up
    const am = this.state.autoMerge;
    if (am.active) {
      const now = Date.now();
      if (now >= am.endsAt) {
        am.active = false;
        am.cooldownEndsAt = now + CONFIG.autoMerge.cooldownMs;
        this.updateButtonsUI();
      } else {
        this.autoMergeTickAccum += dt * 1000;
        if (this.autoMergeTickAccum >= CONFIG.autoMerge.tickMs) {
          this.autoMergeTickAccum = 0;
          this.autoMergeOnePair();
        }
      }
    }

    // periodic UI refresh for countdowns / gold-gated buttons
    this._uiRefreshAccum = (this._uiRefreshAccum || 0) + dt * 1000;
    if (this._uiRefreshAccum >= 250) {
      this._uiRefreshAccum = 0;
      this.updateStatsUI();
      this.updateButtonsUI();
    }

    this.render();

    this.saveAccum += dt * 1000;
    if (this.saveAccum >= CONFIG.save.intervalMs) {
      this.saveAccum = 0;
      this.saveState();
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.cyberForgeGame = new Game();
});
