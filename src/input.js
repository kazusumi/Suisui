// Keyboard + mouse (pointer lock) and touch (virtual stick, swipe look, up/down buttons).
export class Input {
  constructor(canvas, ui) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // x: strafe, y: forward
    this.vert = 0;
    this.look = { x: 0, y: 0 };
    this.enabled = false;
    this.canvas = canvas;
    this.touch = { stickId: null, sx: 0, sy: 0, x: 0, y: 0, lookId: null, lx: 0, ly: 0 };
    this.btnUp = false;
    this.btnDown = false;
    this.sensitivity = 1;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // tour mode: the route drives, all input only turns the head
    this.tourMode = false;
    this.dragging = false;
    canvas.addEventListener('click', () => {
      if (this.enabled && !this.tourMode && !this.isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.enabled && this.tourMode && e.button === 0) this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.look.x += e.movementX * 0.0022 * this.sensitivity;
        this.look.y += e.movementY * 0.0022 * this.sensitivity;
      } else if (this.dragging) {
        this.look.x += e.movementX * 0.0035 * this.sensitivity;
        this.look.y += e.movementY * 0.0035 * this.sensitivity;
      }
    });

    // ---- touch ----
    this.isTouch = false;
    const stick = ui.stick;
    const knob = ui.knob;
    const onStart = (e) => {
      if (!this.enabled) return;
      this.isTouch = true;
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tbtn, .hud-btn, #menu, #modebar, #minimap')) continue;
        if (!this.tourMode && t.clientX < innerWidth * 0.45 && this.touch.stickId === null) {
          this.touch.stickId = t.identifier;
          this.touch.sx = t.clientX;
          this.touch.sy = t.clientY;
          this.touch.x = 0;
          this.touch.y = 0;
          stick.style.left = `${t.clientX}px`;
          stick.style.top = `${t.clientY}px`;
          stick.classList.add('on');
          knob.style.transform = 'translate(-50%,-50%)';
        } else if (this.touch.lookId === null) {
          this.touch.lookId = t.identifier;
          this.touch.lx = t.clientX;
          this.touch.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.stickId) {
          let dx = t.clientX - this.touch.sx;
          let dy = t.clientY - this.touch.sy;
          const r = 55;
          const l = Math.hypot(dx, dy);
          if (l > r) {
            dx *= r / l;
            dy *= r / l;
          }
          this.touch.x = dx / r;
          this.touch.y = -dy / r;
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === this.touch.lookId) {
          this.look.x += (t.clientX - this.touch.lx) * 0.0055 * this.sensitivity;
          this.look.y += (t.clientY - this.touch.ly) * 0.0055 * this.sensitivity;
          this.touch.lx = t.clientX;
          this.touch.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.stickId) {
          this.touch.stickId = null;
          this.touch.x = this.touch.y = 0;
          stick.classList.remove('on');
        }
        if (t.identifier === this.touch.lookId) this.touch.lookId = null;
      }
    };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    const hold = (el, key) => {
      const on = (e) => {
        e.preventDefault();
        this[key] = true;
        el.classList.add('down');
      };
      const off = (e) => {
        e.preventDefault();
        this[key] = false;
        el.classList.remove('down');
      };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    };
    hold(ui.up, 'btnUp');
    hold(ui.down, 'btnDown');
  }

  update() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.touch.x;
    y += this.touch.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.move.x = x;
    this.move.y = y;
    let v = 0;
    if (k.has('Space') || k.has('KeyE') || this.btnUp) v += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyQ') || k.has('KeyC') || this.btnDown) v -= 1;
    this.vert = v;
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return l;
  }

  release() {
    this.keys.clear();
    this.touch.stickId = this.touch.lookId = null;
    this.touch.x = this.touch.y = 0;
    this.btnUp = this.btnDown = false;
    this.dragging = false;
  }
}
