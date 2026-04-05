// flash-module.js
// Модуль вспышки со звуками из каталога ./sounds/

class FlashModule {
    constructor(options = {}) {
        // Настройки
        this.options = {
            soundPath: './sounds/',           // относительный путь
            soundFile: null,                 // если null — используем встроенный звук
            flashDuration: 200,              // длительность вспышки (мс)
            soundVolume: 0.8,                // громкость 0-1
            useBuiltinSound: true,           // использовать встроенный звук, если файл не найден
            builtinSoundDuration: 3000,      // длительность встроенного звука (мс)
            builtinSoundFrequency: 880,      // частота встроенного звука
            soundEnabled: true,              // включен ли звук
            onReady: null,
            onError: null,
            onSoundStart: null,
            onSoundEnd: null,
            onFlashStart: null,
            onFlashEnd: null,
            debug: false,
            ...options
        };

        // Внутреннее состояние
        this.videoTrack = null;
        this.mediaStream = null;
        this.torchReady = false;
        this.isFlashing = false;
        this.isPlaying = false;
        this.audioElement = null;
        this.audioCtx = null;
        this.useBuiltin = !this.options.soundFile;
        this.fileExists = false; // флаг существования файла
        
        // Привязка методов
        this.initCamera = this.initCamera.bind(this);
        this.play = this.play.bind(this);
        this.playOnlyFlash = this.playOnlyFlash.bind(this);
        this.playOnlySound = this.playOnlySound.bind(this);
        this.blink = this.blink.bind(this);
        this.playSound = this.playSound.bind(this);
        this.setSound = this.setSound.bind(this);
        this.releaseCamera = this.releaseCamera.bind(this);
        
        if (options.autoInit) {
            this.initCamera();
        }
    }
    
    // Установка звукового файла (проверяет существование)
    async setSound(fileName) {
        if (!fileName) {
            this.useBuiltin = true;
            this.options.soundFile = null;
            this._log("Переключено на встроенный звук");
            return true;
        }
        
        this.options.soundFile = fileName;
        
        // Проверяем, существует ли файл
        const exists = await this._checkSoundFile(fileName);
        
        if (exists) {
            this.useBuiltin = false;
            this.fileExists = true;
            this._log(`Звук установлен: ${fileName} (файл найден)`);
            return true;
        } else {
            this._log(`Файл ${fileName} не найден, используем встроенный звук`);
            this.useBuiltin = true;
            this.fileExists = false;
            return false;
        }
    }
    
    // Проверка существования звукового файла
    async _checkSoundFile(fileName) {
        const url = this.getSoundUrl(fileName);
        if (!url) return false;
        try {
            // Пробуем получить файл с обходом кеша
            const response = await fetch(url + '?check=' + Date.now(), { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            const exists = response.ok;
            this._log(`Проверка файла ${fileName}: ${exists ? 'найден' : 'не найден'} (статус: ${response.status})`);
            return exists;
        } catch(e) {
            this._log(`Ошибка проверки файла: ${e.message}`);
            return false;
        }
    }
    
    // Получить полный URL звукового файла
    getSoundUrl(fileName = null) {
        const file = fileName || this.options.soundFile;
        if (!file) return null;
        const basePath = this.options.soundPath.replace(/\/$/, '');
        return `${basePath}/${file}`;
    }
    
    // Принудительно установить использование файлового звука
    forceFileSound(fileName) {
        this.options.soundFile = fileName;
        this.useBuiltin = false;
        this._log(`Принудительно установлен файловый звук: ${fileName}`);
    }
    
    // Инициализация камеры
    async initCamera() {
        if (this.videoTrack && this.torchReady && this.videoTrack.readyState === 'live') {
            return true;
        }
        
        if (this.videoTrack || this.mediaStream) {
            await this.releaseCamera();
        }
        
        this._log("Инициализация камеры...");
        
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
                const caps = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : null;
                if (caps && caps.torch === true) torchSupported = true;
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
            
            this._log("Камера готова");
            if (this.options.onReady) this.options.onReady();
            return true;
            
        } catch (err) {
            this._logError("Ошибка:", err);
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
            this._logError("Ошибка вспышки:", err);
            try { await this._setTorch(false); } catch(e) {}
            return false;
        } finally {
            this.isFlashing = false;
        }
    }
    
    // Воспроизведение звука (автовыбор: файл или встроенный)
    async playSound(fileName = null) {
        const targetFile = fileName || this.options.soundFile;
        
        this._log(`playSound вызван, targetFile: ${targetFile}, useBuiltin: ${this.useBuiltin}, soundEnabled: ${this.options.soundEnabled}`);
        
        // Если файл указан и НЕ используем встроенный - пробуем файл
        if (targetFile && !this.useBuiltin && this.options.soundEnabled) {
            this._log(`Пробуем воспроизвести файл: ${targetFile}`);
            const success = await this._playFileSound(targetFile);
            if (success) {
                this._log(`Файл успешно воспроизведён!`);
                return true;
            }
            this._log(`Файл не воспроизвёлся, переключаемся на встроенный`);
            this.useBuiltin = true;
        }
        
        // Если звук включён - пробуем встроенный
        if (this.options.soundEnabled) {
            this._log(`Воспроизводим встроенный звук`);
            return this._playBuiltinSound();
        }
        
        return false;
    }
    
    // Воспроизведение файлового звука
    async _playFileSound(fileName) {
        return new Promise((resolve) => {
            const soundUrl = this.getSoundUrl(fileName);
            if (!soundUrl) {
                this._log(`Нет URL для файла ${fileName}`);
                resolve(false);
                return;
            }
            
            // Добавляем timestamp для обхода кеша
            const urlWithCacheBust = soundUrl + '?t=' + Date.now();
            this._log(`Попытка воспроизвести файл: ${urlWithCacheBust}`);
            
            const audio = new Audio();
            audio.src = urlWithCacheBust;
            audio.volume = this.options.soundVolume;
            audio.preload = 'auto';
            
            let resolved = false;
            
            const onCanPlay = () => {
                this._log(`Аудио загружено, пробуем воспроизвести...`);
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this._log(`✅ Файл успешно воспроизводится!`);
                        if (!resolved) {
                            resolved = true;
                            if (this.options.onSoundStart) this.options.onSoundStart(fileName);
                            resolve(true);
                        }
                    }).catch((err) => {
                        this._log(`❌ Ошибка play(): ${err.message}`);
                        if (!resolved) {
                            resolved = true;
                            resolve(false);
                        }
                    });
                } else {
                    // Для старых браузеров
                    if (!resolved) {
                        resolved = true;
                        if (this.options.onSoundStart) this.options.onSoundStart(fileName);
                        resolve(true);
                    }
                }
            };
            
            const onError = (e) => {
                this._log(`❌ Ошибка загрузки аудио: ${audio.error ? audio.error.code : 'unknown'}`);
                if (audio.error) {
                    switch(audio.error.code) {
                        case 1: this._log(`  MEDIA_ERR_ABORTED`); break;
                        case 2: this._log(`  MEDIA_ERR_NETWORK`); break;
                        case 3: this._log(`  MEDIA_ERR_DECODE`); break;
                        case 4: this._log(`  MEDIA_ERR_SRC_NOT_SUPPORTED`); break;
                    }
                }
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            };
            
            const onEnded = () => {
                this._log(`Аудио воспроизведение завершено`);
                if (this.options.onSoundEnd) this.options.onSoundEnd();
            };
            
            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onError);
            audio.addEventListener('ended', onEnded);
            
            // Начинаем загрузку
            audio.load();
            
            // Таймер-защита
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this._log(`❌ Таймаут загрузки аудио (5 сек)`);
                    resolve(false);
                }
            }, 5000);
        });
    }
    
    // Встроенный синтезированный звук
    async _playBuiltinSound() {
        const duration = this.options.builtinSoundDuration;
        const frequency = this.options.builtinSoundFrequency;
        
        this._log(`Воспроизведение встроенного звука (${duration}ms, ${frequency}Hz)`);
        
        if (!window.AudioContext && !window.webkitAudioContext) {
            this._log("Web Audio не поддерживается");
            return false;
        }
        
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {
                this._logError("Не удалось создать AudioContext");
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
    
    // Основная функция: звук → вспышка
    async play() {
        if (this.isPlaying) {
            this._log("Уже выполняется");
            return false;
        }
        
        this.isPlaying = true;
        
        const cameraPromise = this.initCamera();
        
        if (this.options.soundEnabled) {
            await this.playSound();
        }
        
        await cameraPromise;
        await new Promise(r => setTimeout(r, 40));
        const result = await this.blink();
        
        this.isPlaying = false;
        return result;
    }
    
	// Только вспышка
	async playOnlyFlash() {
		if (this.isPlaying) {
			this._log("Уже выполняется");
			return false;
		}
		
		this.isPlaying = true;
		
		const cameraPromise = this.initCamera();
		
		await cameraPromise;
		await new Promise(r => setTimeout(r, 40));
		const result = await this.blink();
		
		this.isPlaying = false;
		return result;
	}
    
    // Только звук
    async playOnlySound() {
        if (this.isPlaying) {
            this._log("Уже выполняется");
            return false;
        }
        
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
    
    setFlashDuration(ms) {
        this.options.flashDuration = ms;
    }
    
    getFlashDuration() {
        return this.options.flashDuration;
    }
    
    setVolume(vol) {
        this.options.soundVolume = Math.min(1, Math.max(0, vol));
    }
    
    setSoundEnabled(enabled) {
        this.options.soundEnabled = enabled;
        this._log(`Звук ${enabled ? 'включён' : 'выключен'}`);
    }
    
    isSoundEnabled() {
        return this.options.soundEnabled;
    }
    
    setBuiltinSoundDuration(ms) {
        this.options.builtinSoundDuration = ms;
    }
    
    setBuiltinSoundFrequency(freq) {
        this.options.builtinSoundFrequency = freq;
    }
    
    isTorchSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    
    _log(...args) {
        if (this.options.debug) console.log("[FlashModule]", ...args);
    }
    
    _logError(...args) {
        console.error("[FlashModule]", ...args);
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlashModule;
} else if (typeof window !== 'undefined') {
    window.FlashModule = FlashModule;
}