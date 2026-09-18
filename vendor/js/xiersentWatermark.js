/**
 * @file xiersentWatermark.js
 * Диагональный водяной знак «xiersent» поверх всех оверлеев:
 * только на localhost / 127.0.0.1 / file://, не в десктопной (Tauri) сборке.
 */
(function () {
    const WORD = 'xiersent';
    const ROOT_ID = 'somestoryXiersentWatermark';
    const COLS = 16;
    const ROWS = 22;

    function isDesktopApp() {
        return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
    }

    function isLocalhostHost() {
        const loc = window.location || {};
        const protocol = String(loc.protocol || '').toLowerCase();
        if (protocol === 'file:') return true;

        const h = String(loc.hostname != null ? loc.hostname : '')
            .toLowerCase()
            .replace(/^\[|\]$/g, '');
        if (!h && (protocol === 'http:' || protocol === 'https:')) {
            return true;
        }
        if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
        if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
        return false;
    }

    function pathHasSomestory() {
        const loc = window.location || {};
        const path = String(loc.pathname || '') + String(loc.href || '');
        return /somestory/i.test(path);
    }

    function shouldShowXiersentWatermark() {
        if (isDesktopApp()) return false;
        return isLocalhostHost() || pathHasSomestory();
    }

    window.isSomestoryDesktopApp = isDesktopApp;
    window.isSomestoryLocalhostHost = isLocalhostHost;
    window.pathHasSomestory = pathHasSomestory;
    window.shouldShowXiersentWatermark = shouldShowXiersentWatermark;

    function buildInner() {
        const inner = document.createElement('div');
        inner.className = 'somestory-xiersentWatermarkInner';
        const frag = document.createDocumentFragment();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const span = document.createElement('span');
                span.className = 'somestory-xiersentWatermarkWord';
                span.textContent = WORD;
                frag.appendChild(span);
            }
        }
        inner.appendChild(frag);
        return inner;
    }

    function ensureWatermark() {
        if (!shouldShowXiersentWatermark()) {
            const existing = document.getElementById(ROOT_ID);
            if (existing) existing.remove();
            return;
        }
        if (document.getElementById(ROOT_ID)) return;

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'somestory-xiersentWatermark';
        root.setAttribute('aria-hidden', 'true');
        root.appendChild(buildInner());

        const mount = () => {
            if (!document.body) return false;
            if (document.getElementById(ROOT_ID)) return true;
            document.body.appendChild(root);
            return true;
        };
        if (!mount()) {
            document.addEventListener('DOMContentLoaded', mount, { once: true });
        }
    }

    ensureWatermark();
})();
