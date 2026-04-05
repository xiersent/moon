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
        this.audioCtx = null;
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
            const response = await fetch(url + '?t=' + Date.now(), { method: 'HEAD' });
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
        return new Promise((resolve) => {
            const soundUrl = this.getSoundUrl(fileName);
            if (!soundUrl) {
                resolve(false);
                return;
            }
            
            const urlWithCacheBust = soundUrl + '?t=' + Date.now();
            const audio = new Audio();
            audio.src = urlWithCacheBust;
            audio.volume = this.options.soundVolume;
            audio.preload = 'auto';
            
            let resolved = false;
            
            const onCanPlay = () => {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        if (!resolved) {
                            resolved = true;
                            if (this.options.onSoundStart) this.options.onSoundStart(fileName);
                            resolve(true);
                        }
                    }).catch(() => {
                        if (!resolved) {
                            resolved = true;
                            resolve(false);
                        }
                    });
                }
            };
            
            const onError = () => {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            };
            
            const onEnded = () => {
                if (this.options.onSoundEnd) this.options.onSoundEnd();
            };
            
            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onError);
            audio.addEventListener('ended', onEnded);
            
            audio.load();
            
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            }, 5000);
        });
    }
    
    async _playBuiltinSound() {
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
            const durationSec = duration / 1000;
            
            const gainNode = this.audioCtx.createGain();
            gainNode.gain.setValueAtTime(this.options.soundVolume, now);
            const fadeStart = Math.max(0, durationSec - 0.3);
            if (fadeStart > 0) {
                gainNode.gain.setValueAtTime(this.options.soundVolume, now + fadeStart);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
            } else {
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
            }
            
            const oscillator = this.audioCtx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            oscillator.start();
            oscillator.stop(now + durationSec);
            
            if (this.options.onSoundStart) this.options.onSoundStart('[встроенный звук]');
            
            setTimeout(() => {
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