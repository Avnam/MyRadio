// Playback: fallback across a station's stream URLs, reconnect after a mid-stream
// drop, real frequency data when the stream allows CORS (C-11, C-13).
// Knows nothing about the station list or playlist order — see stations-db.js
// and app.js for next/previous wiring (including Media Session's next/prev keys).

const ERR = { 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'refused or not audio' };
const MAX_RETRIES = 4;
const SILENCE_MS = 4000;
// How long an in-flight, not-yet-settled connection attempt is protected from
// being interrupted by a newer request (C-13a). Mashing next/previous used to
// tear down and recreate the <audio> element on every single press — killing
// a connection before it had any real chance to reach 'playing'. This needs
// to comfortably outlast a real connect on a real (often mobile/cellular)
// network, not just a fast desktop connection — 900ms tested fine on desktop
// Wi-Fi but was still shorter than real mobile connect times, so the safety
// valve kept firing and reproducing the exact bug it was meant to prevent.
const BUSY_GRACE_MS = 5000;

export class Player extends EventTarget {
  constructor() {
    super();
    this.audio = null;
    this.station = null;
    this.volume = 0.8;
    this.playing = false;

    this._urlIdx = 0;
    this._useCors = true;
    this._hasPlayed = false;
    this._retries = 0;
    this._attemptId = 0;
    this._failures = [];

    this._ctx = null;
    this._sourceNode = null;
    this._analyser = null;
    this._gain = null;
    this._raf = null;
    this._freq = null;
    this._lastSound = 0;
    this._lastTime = 0;

    this._quietAutoplayBlock = false;

    // An attempt is "busy" from the moment it starts connecting until it
    // either plays or definitively gives up (not while merely retrying/
    // falling back to another URL — that's still the same busy session).
    // A request that arrives while busy is queued (only the latest survives)
    // and applied as soon as the current attempt settles, or forcibly after
    // BUSY_GRACE_MS if it's taking unusually long.
    this._busy = false;
    this._queuedStation = null;
    this._busyTimer = null;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Emits {key, params, isError} for the theme to translate with i18n's t(). */
  _status(key, params, isError) {
    this._emit('status', { key, params, isError: !!isError });
  }

  /**
   * Loads a station (station: null clears the player, e.g. your last station
   * was removed). opts.quiet: a browser can never truly autoplay without a
   * real user gesture, no matter how long you wait first — so a boot-time
   * autostart attempt that gets blocked isn't an error, it's the expected
   * outcome; this falls back to the normal "press play" state instead of an
   * error message.
   */
  load(station, autoplay, opts = {}) {
    this.station = station;
    this._quietAutoplayBlock = !!opts.quiet;
    this._emit('state', { playing: false, live: false, station }); // instant UI feedback, even while queued

    if (!station || !autoplay) {
      this._queuedStation = null;
      this._clearBusyTimer();
      this._attemptId++;
      this._busy = false;
      this._teardown();
      this._resetChain();
      this.playing = false;
      if (station) this._status('player.pressPlay');
      return;
    }

    this._requestPlay(station);
  }

  play() {
    if (!this.station) return;
    this._requestPlay(this.station);
  }

  _requestPlay(station) {
    if (this._busy) {
      // Something is still connecting — queue this instead of killing it
      // outright; only the latest request survives a rapid burst.
      this._queuedStation = station;
      this._status('player.connecting');
      if (!this._busyTimer) {
        this._busyTimer = setTimeout(() => this._forceAdvance(), BUSY_GRACE_MS);
      }
      return;
    }
    this._startAttempt(station);
  }

  _forceAdvance() {
    this._busyTimer = null;
    if (this._queuedStation) this._startAttempt(this._queuedStation);
  }

  /** Called whenever the current attempt reaches a final state (played, or fully given up). */
  _settle() {
    this._busy = false;
    this._clearBusyTimer();
    if (this._queuedStation) {
      const next = this._queuedStation;
      this._queuedStation = null;
      this._startAttempt(next);
    }
  }

  _clearBusyTimer() {
    clearTimeout(this._busyTimer);
    this._busyTimer = null;
  }

  _startAttempt(station) {
    this._queuedStation = null;
    this._clearBusyTimer();
    this.station = station;
    this._attemptId++;
    this._busy = true;
    this._teardown();
    this._resetChain();
    // playing means "intending to play" (connecting, buffering, retrying, or
    // actually live) — not literally "audio is flowing right now". It flips
    // true here, immediately, not only once the 'playing' DOM event fires.
    // Otherwise a rapid next-press made while the station you just switched
    // to is still buffering reads playing as false, silently downgrades to
    // "select only" (decision #2), and playback quietly stops with no error.
    this.playing = true;
    this._emit('state', { playing: true, live: false, station: this.station });
    this._attempt(false);
  }

  /**
   * Pauses without destroying the <audio> element. A live stream can't resume
   * from where it left off anyway (play() always starts a fresh connection),
   * so there's nothing to gain by tearing it down here — and destroying it
   * (removeAttribute('src') + load()) is what makes Android Chrome drop our
   * Media Session while paused, handing "now playing" focus to another app.
   */
  stop() {
    this._attemptId++;
    this._queuedStation = null;
    this._clearBusyTimer();
    this._busy = false;
    this._stopLevels();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this.audio?.pause();
    this.playing = false;
    this._emit('state', { playing: false, live: false, station: this.station });
    this._status('player.stopped');
  }

  setVolume(v) {
    this.volume = v;
    if (this._gain) this._gain.gain.value = v;
    else if (this.audio) this.audio.volume = v;
  }

  _resetChain() {
    this._urlIdx = 0;
    this._useCors = true;
    this._hasPlayed = false;
    this._retries = 0;
    this._failures = [];
  }

  _attempt(cacheBust) {
    const quietAutoplayBlock = this._quietAutoplayBlock;
    this._quietAutoplayBlock = false;
    this._teardown();
    const id = ++this._attemptId;
    const base = this.station.urls[this._urlIdx];
    const url = cacheBust ? base + (base.includes('?') ? '&' : '?') + '_=' + Date.now() : base;

    const el = this.audio = new Audio();
    el.preload = 'none';
    if (this._useCors) el.crossOrigin = 'anonymous';
    el.volume = this.volume;
    el.src = url;
    const errText = () => el.error ? `${ERR[el.error.code]} [code ${el.error.code}]` : null;

    let failed = false;
    const fail = (why) => {
      if (failed || id !== this._attemptId) return;
      failed = true;
      this._onFailure(why);
    };

    el.addEventListener('playing', () => {
      if (id !== this._attemptId) return;
      this._hasPlayed = true;
      this._retries = 0;
      this.playing = true;
      this._emit('state', { playing: true, live: true, station: this.station });
      this._status(this._urlIdx > 0 ? 'player.onAirBackup' : 'player.onAir', { n: this._urlIdx + 1 });
      if (this._useCors) this._connectAnalyser();
      this._settle();
    });
    el.addEventListener('waiting', () => {
      if (id !== this._attemptId) return;
      this._emit('state', { playing: this.playing, live: false, station: this.station });
      this._status('player.buffering');
    });
    el.addEventListener('stalled', () => { if (this._hasPlayed && !el.paused) fail('stalled'); });
    el.addEventListener('error', () => fail(errText() || 'error'));

    this._status(this._hasPlayed ? 'player.reconnecting' : 'player.connecting');
    el.play()
      .then(() => { if (id === this._attemptId) this.playing = true; })
      .catch(err => {
        if (id !== this._attemptId) return;
        if (err && err.name === 'NotAllowedError') {
          failed = true;
          this.playing = false;
          this._emit('state', { playing: false, live: false, station: this.station });
          if (quietAutoplayBlock) this._status('player.pressPlay');
          else this._status('player.blockedByBrowser', null, true);
          this._settle();
          return;
        }
        if (err && err.name === 'AbortError') return;
        fail(errText() || (err && err.message) || 'failed');
      });
  }

  _onFailure(why) {
    this._emit('state', { playing: this.playing, live: false, station: this.station });

    if (this._hasPlayed && this._retries < MAX_RETRIES) {
      this._retries++;
      const wait = 1000 * this._retries;
      this._status('player.streamDropped', { seconds: wait / 1000, attempt: this._retries, max: MAX_RETRIES });
      const id = this._attemptId;
      setTimeout(() => { if (id === this._attemptId) this._attempt(true); }, wait);
      return;
    }

    this._failures.push(`stream ${this._urlIdx + 1}${this._useCors ? ' (cors)' : ''}: ${why}`);

    if (this._useCors) {
      this._useCors = false;
      this._hasPlayed = false;
      this._attempt(false);
      return;
    }

    if (this._urlIdx + 1 < this.station.urls.length) {
      this._urlIdx++;
      this._useCors = true;
      this._hasPlayed = false;
      this._retries = 0;
      this._status('player.tryingBackup', { n: this._urlIdx + 1 });
      this._attempt(false);
      return;
    }

    this._teardown();
    this.playing = false;
    this._emit('state', { playing: false, live: false, station: this.station });
    if (location.protocol === 'https:' && this.station.urls.some(u => u.startsWith('http:'))) {
      this._status('player.mixedContentBlocked', null, true);
    } else {
      this._status('player.allFailed', { name: this.station.name, details: this._failures.join('; ') }, true);
    }
    this._settle();
  }

  _teardown() {
    this._stopLevels();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    // Disconnect the WebAudio graph explicitly — dropping just the JS
    // references left the nodes connected forever, accumulating garbage in
    // the shared AudioContext on every attempt that briefly reached
    // 'playing' before being superseded. Mobile devices have tighter audio
    // resource limits than desktop, so this could compound into real
    // failures there well before it would show up on a desktop test.
    try { this._sourceNode?.disconnect(); } catch { /* already disconnected */ }
    try { this._analyser?.disconnect(); } catch { /* already disconnected */ }
    try { this._gain?.disconnect(); } catch { /* already disconnected */ }
    this._sourceNode = null;
    this._analyser = null;
    this._gain = null;
    if (this.audio) {
      const a = this.audio;
      this.audio = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
  }

  _connectAnalyser() {
    if (this._analyser) return;
    try {
      this._ctx = this._ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume();

      const src = this._ctx.createMediaElementSource(this.audio);
      this._sourceNode = src;
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.minDecibels = -95;
      this._analyser.maxDecibels = -25;
      this._analyser.smoothingTimeConstant = 0.78;
      this._gain = this._ctx.createGain();
      this._gain.gain.value = this.volume;

      src.connect(this._analyser);
      this._analyser.connect(this._gain);
      this._gain.connect(this._ctx.destination);

      this.audio.volume = 1;
      this._freq = new Uint8Array(this._analyser.frequencyBinCount);
      this._lastSound = performance.now();
      this._lastTime = this.audio.currentTime;
      this._emit('analysed', { on: true });
      this._drawLevels();
    } catch {
      this._sourceNode = null;
      this._analyser = null;
      this._gain = null;
      this._emit('analysed', { on: false });
    }
  }

  _drawLevels() {
    if (!this._analyser) return;
    this._analyser.getByteFrequencyData(this._freq);
    this._emit('levels', this._freq);

    const any = this._freq.some(v => v > 0);
    const now = performance.now();
    if (any) this._lastSound = now;
    const advancing = this.audio && this.audio.currentTime > this._lastTime;
    if (this.audio) this._lastTime = this.audio.currentTime;
    if (!any && advancing && now - this._lastSound > SILENCE_MS) {
      this._failures.push(`stream ${this._urlIdx + 1} (cors): silent through Web Audio`);
      this._useCors = false;
      this._hasPlayed = false;
      this._status('player.buffering');
      this._attempt(false);
      return;
    }
    this._raf = requestAnimationFrame(() => this._drawLevels());
  }

  _stopLevels() {
    this._emit('levels', null);
  }
}
