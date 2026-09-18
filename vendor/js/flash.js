// vendor/js/flash.js
class FlashModule {
    constructor(options = {}) {
        this.options = {
            soundPath: './sounds/',
            soundFile: null,
            flashDuration: 200,
            soundVolume: 0.8,
            useBuiltinSound: true,
            builtinSoundDuration: 3000,
            builtinSoundFrequency: 880,
            builtinSoundEnvelope: 'fadeOut',
            soundEnabled: true,
            onReady: null,
            onError: null,
            onSoundStart: null,
            onSoundEnd: null,
            onFlashStart: null,
            onFlashEnd: null,
            debug: false,
            ...options
        };

        this.videoTrack = null;
        this.mediaStream = null;
        this.torchReady = false;
        this.isFlashing = false;
        this.isPlaying = false;
        this.audioElement = null;
        this._audioObjectUrl = null;
        this.audioCtx = null;
        this._builtinOscillator = null;
        this._builtinGain = null;
        this._builtinEndTimer = null;
        this.useBuiltin = !this.options.soundFile;
        
        this.initCamera = this.initCamera.bind(this);
        this.play = this.play.bind(this);
        this.playFlashWithSound = this.playFlashWithSound.bind(this);
        this.playOnlyFlash = this.playOnlyFlash.bind(this);
        this.playOnlySound = this.playOnlySound.bind(this);
        this.blink = this.blink.bind(this);
        this.playSound = this.playSound.bind(this);
        this.releaseCamera = this.releaseCamera.bind(this);
        
        if (options.autoInit) {
            this.initCamera();
        }
    }
    
    async setSound(fileName) {
        if (!fileName) {
            this.useBuiltin = true;
            this.options.soundFile = null;
            return true;
        }
        
        this.options.soundFile = fileName;
        const exists = await this._checkSoundFile(fileName);
        
        if (exists) {
            this.useBuiltin = false;
            return true;
        } else {
            this.useBuiltin = true;
            return false;
        }
    }
    
    async _checkSoundFile(fileName) {
        const url = this.getSoundUrl(fileName);
        if (!url) return false;
        try {
            const response = await fetch(this._cacheBustUrl(url), {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            return response.ok;
        } catch(e) {
            return false;
        }
    }
    
    getSoundUrl(fileName = null) {
        const file = fileName || this.options.soundFile;
        if (!file) return null;
        const basePath = this.options.soundPath.replace(/\/$/, '');
        return `${basePath}/${file}`;
    }

    _cacheBustUrl(url) {
        const sep = String(url).indexOf('?') >= 0 ? '&' : '?';
        return url + sep + 'nocache=' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    }

    async _fetchSoundObjectUrl(fileName) {
        const soundUrl = this.getSoundUrl(fileName);
        if (!soundUrl) return null;
        const response = await fetch(this._cacheBustUrl(soundUrl), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob || blob.size === 0) return null;
        return URL.createObjectURL(blob);
    }
    
    async initCamera() {
        if (this.videoTrack && this.torchReady && this.videoTrack.readyState === 'live') {
            return true;
        }
        
        if (this.videoTrack || this.mediaStream) {
            await this.releaseCamera();
        }
        
        if (this.options.debug) console.log("[FlashModule] Инициализация камеры...");
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: "environment" } }
            });
            
            this.mediaStream = stream;
            const tracks = stream.getVideoTracks();
            
            if (!tracks.length) {
                throw new Error("Нет видеодорожек");
            }
            
            this.videoTrack = tracks[0];
            
            let torchSupported = false;
            try {
                const caps = this.videoTrack.getCapabilities();
                torchSupported = caps && caps.torch === true;
            } catch(e) {}
            
            if (!torchSupported) {
                try {
                    await this.videoTrack.applyConstraints({ advanced: [{ torch: false }] });
                    torchSupported = true;
                } catch(e) {}
            }
            
            if (!torchSupported) {
                throw new Error("Torch API не поддерживается (нужен Android Chrome)");
            }
            
            await this.videoTrack.applyConstraints({ advanced: [{ torch: false }] });
            this.torchReady = true;
            
            if (this.options.debug) console.log("[FlashModule] Камера готова");
            if (this.options.onReady) this.options.onReady();
            return true;
            
        } catch (err) {
            console.error("[FlashModule] Ошибка:", err);
            if (this.options.onError) this.options.onError(err);
            return false;
        }
    }
    
    async _setTorch(state) {
        if (!this.torchReady || !this.videoTrack) {
            throw new Error("Камера не готова");
        }
        await this.videoTrack.applyConstraints({
            advanced: [{ torch: state }]
        });
    }
    
    async blink(durationMs = null) {
        const flashTime = durationMs !== null ? durationMs : this.options.flashDuration;
        
        if (this.isFlashing) return false;
        
        if (!this.torchReady) {
            const success = await this.initCamera();
            if (!success) return false;
        }
        
        this.isFlashing = true;
        if (this.options.onFlashStart) this.options.onFlashStart(flashTime);
        
        try {
            await this._setTorch(true);
            await new Promise(r => setTimeout(r, flashTime));
            await this._setTorch(false);
            if (this.options.onFlashEnd) this.options.onFlashEnd(flashTime);
            return true;
        } catch (err) {
            try { await this._setTorch(false); } catch(e) {}
            return false;
        } finally {
            this.isFlashing = false;
        }
    }
    
    _stopActiveSound() {
        if (this._builtinEndTimer) {
            clearTimeout(this._builtinEndTimer);
            this._builtinEndTimer = null;
        }
        if (this._builtinOscillator) {
            try { this._builtinOscillator.stop(); } catch (e) {}
            try { this._builtinOscillator.disconnect(); } catch (e) {}
            this._builtinOscillator = null;
        }
        if (this._builtinGain) {
            try { this._builtinGain.disconnect(); } catch (e) {}
            this._builtinGain = null;
        }
        if (this.audioElement) {
            try {
                this.audioElement.pause();
                this.audioElement.removeAttribute('src');
                this.audioElement.load();
            } catch (e) {}
            this.audioElement = null;
        }
        if (this._audioObjectUrl) {
            try { URL.revokeObjectURL(this._audioObjectUrl); } catch (e) {}
            this._audioObjectUrl = null;
        }
    }

    async playSound(fileName = null) {
        const targetFile = fileName || this.options.soundFile;
        
        if (targetFile && !this.useBuiltin && this.options.soundEnabled) {
            const success = await this._playFileSound(targetFile);
            if (success) return true;
            this.useBuiltin = true;
        }
        
        if (this.options.soundEnabled) {
            return this._playBuiltinSound();
        }
        
        return false;
    }
    
    async _playFileSound(fileName) {
        this._stopActiveSound();
        let objectUrl = null;
        try {
            objectUrl = await this._fetchSoundObjectUrl(fileName);
        } catch (e) {
            return false;
        }
        if (!objectUrl) return false;

        this._audioObjectUrl = objectUrl;

        return new Promise((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.volume = this.options.soundVolume;
            audio.src = objectUrl;
            
            let resolved = false;
            let started = false;
            let safetyTimer = null;
            let durationTimer = null;
            
            const finish = (ok) => {
                if (resolved) return;
                resolved = true;
                if (safetyTimer) clearTimeout(safetyTimer);
                if (durationTimer) clearTimeout(durationTimer);
                if (this._audioObjectUrl === objectUrl) {
                    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
                    this._audioObjectUrl = null;
                }
                resolve(ok);
            };
            
            const markStarted = () => {
                if (started) return;
                started = true;
                if (this.options.onSoundStart) this.options.onSoundStart(fileName);
                const ms = (isFinite(audio.duration) && audio.duration > 0)
                    ? Math.min(8000, audio.duration * 1000 + 150)
                    : 2000;
                durationTimer = setTimeout(() => {
                    if (this.options.onSoundEnd) this.options.onSoundEnd();
                    finish(true);
                }, ms);
            };
            
            const onCanPlay = () => {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        markStarted();
                    }).catch(() => {
                        if (!started) finish(false);
                    });
                } else {
                    markStarted();
                }
            };
            
            const onError = () => {
                if (!started) finish(false);
            };
            
            const onEnded = () => {
                if (this.options.onSoundEnd) this.options.onSoundEnd();
                finish(true);
            };
            
            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onError);
            audio.addEventListener('ended', onEnded);
            
            this.audioElement = audio;
            audio.load();
            
            safetyTimer = setTimeout(() => {
                finish(started);
            }, 5000);
        });
    }
    
    async _playBuiltinSound() {
        this._stopActiveSound();
        const duration = this.options.builtinSoundDuration;
        const frequency = this.options.builtinSoundFrequency;
        
        if (!window.AudioContext && !window.webkitAudioContext) {
            return false;
        }
        
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {
                return false;
            }
        }
        
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        
        return new Promise((resolve) => {
            const now = this.audioCtx.currentTime;
            const durationSec = Math.max(0.05, duration / 1000);
            
            const gainNode = this.audioCtx.createGain();
            const vol = Math.max(0.0001, this.options.soundVolume || 0.8);
            const quiet = 0.0001;
            const envelope = this.options.builtinSoundEnvelope || 'fadeOut';
            const g = gainNode.gain;
            
            // Нарастание = обратное затуханию: линейно от тишины к громкости.
            if (envelope === 'fadeIn') {
                g.setValueAtTime(quiet, now);
                g.linearRampToValueAtTime(vol, now + durationSec);
            } else {
                g.setValueAtTime(vol, now);
                g.linearRampToValueAtTime(quiet, now + durationSec);
            }
            
            const oscillator = this.audioCtx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            oscillator.start(now);
            oscillator.stop(now + durationSec);
            this._builtinOscillator = oscillator;
            this._builtinGain = gainNode;
            
            if (this.options.onSoundStart) this.options.onSoundStart('[встроенный звук]');
            
            this._builtinEndTimer = setTimeout(() => {
                this._builtinEndTimer = null;
                this._builtinOscillator = null;
                this._builtinGain = null;
                if (this.options.onSoundEnd) this.options.onSoundEnd();
                resolve(true);
            }, duration + 20);
        });
    }
    
    // Вспышка горит всё время проигрывания звука
    async playFlashWithSound(soundFile = null) {
        if (this.isPlaying) {
            return false;
        }
        
        this.isPlaying = true;
        
        try {
            await this.initCamera();
            
            // Включаем вспышку
            await this._setTorch(true);
            if (this.options.onFlashStart) this.options.onFlashStart();
            
            // Настраиваем звук
            if (soundFile) {
                this.options.soundFile = soundFile;
                this.useBuiltin = false;
            }
            
            // Воспроизводим звук и ждём окончания
            if (this.options.soundEnabled) {
                await this.playSound();
            }
            
            // Выключаем вспышку после звука
            await this._setTorch(false);
            if (this.options.onFlashEnd) this.options.onFlashEnd();
            
            return true;
        } catch (err) {
            console.error("[FlashModule] playFlashWithSound error:", err);
            try { await this._setTorch(false); } catch(e) {}
            return false;
        } finally {
            this.isPlaying = false;
        }
    }
    
    async play() {
        if (this.isPlaying) return false;
        
        this.isPlaying = true;
        
        await this.initCamera();
        await this._setTorch(true);
        if (this.options.onFlashStart) this.options.onFlashStart();
        
        if (this.options.soundEnabled) {
            await this.playSound();
        }
        
        await this._setTorch(false);
        if (this.options.onFlashEnd) this.options.onFlashEnd();
        
        this.isPlaying = false;
        return true;
    }
    
    async playOnlyFlash() {
        if (this.isPlaying) return false;
        
        this.isPlaying = true;
        
        await this.initCamera();
        const result = await this.blink();
        
        this.isPlaying = false;
        return result;
    }
    
    async playOnlySound() {
        if (this.isPlaying) return false;
        
        this.isPlaying = true;
        
        if (this.options.soundEnabled) {
            await this.playSound();
        }
        
        this.isPlaying = false;
        return true;
    }
    
    async releaseCamera() {
        if (this.videoTrack) {
            try {
                await this._setTorch(false);
                this.videoTrack.stop();
            } catch(e) {}
            this.videoTrack = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        this.torchReady = false;
    }
    
    destroy() {
        this.releaseCamera();
        if (this.audioCtx) {
            this.audioCtx.close().catch(()=>{});
            this.audioCtx = null;
        }
        this.isPlaying = false;
        this.isFlashing = false;
    }
    
    setVolume(vol) {
        this.options.soundVolume = Math.min(1, Math.max(0, vol));
    }
    
    setSoundEnabled(enabled) {
        this.options.soundEnabled = enabled;
    }
    
    isTorchSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlashModule;
} else if (typeof window !== 'undefined') {
    window.FlashModule = FlashModule;
}