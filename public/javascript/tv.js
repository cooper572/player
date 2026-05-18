(function () {
    var TV_KEYS = {
        ENTER: 13,
        LEFT: 37,
        RIGHT: 39,
        UP: 38,
        DOWN: 40,
        BACK: 8,
        PLAY_PAUSE: 179,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FWD: 417,
        REWIND: 412,
        INFO: 457,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406
    };

    var tvFocusables = [];
    var tvFocusIndex = -1;
    var tvNavMode = false;
    var _skipLockUntil = 0;
    var _sliderActive = false;
    var _prevFocusEl = null;
    var _settingsTileOrigin = null;
    var _focusLockUntil = 0;
    var _controllerConnected = false;
    var _navSource = 'desktop';

    function isTVDevice() {
        var ua = navigator.userAgent;
        return /SmartTV|SMART-TV|HbbTV|Tizen|WebOS|NetCast|BRAVIA|Philips|SonyDTV|MSPIE|Maple|Opera TV|AVS|OTV|AppleTV/.test(ua);
    }

    function updateInputProfile() {
        window.playerInputProfile = {
            device: isTVDevice() ? 'tv' : (_controllerConnected ? 'controller' : 'desktop'),
            navActive: tvNavMode,
            navSource: tvNavMode ? _navSource : 'desktop',
            isTV: isTVDevice(),
            hasController: _controllerConnected,
            isDesktop: !isTVDevice() && !_controllerConnected
        };
    }

    function enterTVNav(source) {
        if (tvNavMode) return;
        _navSource = source || _navSource || 'tv';
        tvNavMode = true;
        document.body.classList.add('tv-nav-mode');
        document.body.classList.toggle('tv-remote-nav-mode', _navSource === 'tv');
        document.body.classList.toggle('tv-controller-nav-mode', _navSource === 'controller');
        updateInputProfile();
        refreshFocusables();
        if (tvFocusIndex < 0 && tvFocusables.length) setFocus(0);
    }

    function exitTVNav() {
        tvNavMode = false;
        _sliderActive = false;
        _navSource = _controllerConnected ? 'controller' : (isTVDevice() ? 'tv' : 'desktop');
        document.body.classList.remove('tv-nav-mode');
        document.body.classList.remove('tv-remote-nav-mode');
        document.body.classList.remove('tv-controller-nav-mode');
        document.body.classList.remove('tv-slider-active');
        tvFocusables.forEach(function (el) { el.classList.remove('tv-focused'); });
        tvFocusIndex = -1;
        updateInputProfile();
    }

    function getSettingsOpen() {
        var w = document.getElementById('settings-modal-wrap');
        return w && w.classList.contains('open');
    }

    function getEpPanelOpen() {
        var p = document.getElementById('ep-panel');
        return p && p.classList.contains('open');
    }

    function getFocusedEl() {
        return tvFocusables[tvFocusIndex] || null;
    }

    function isSlider(el) {
        return el && el.tagName === 'INPUT' && el.type === 'range';
    }

    function isToggle(el) {
        return el && el.classList && el.classList.contains('settings-toggle');
    }

    function nudgeSlider(el, dir) {
        var step = parseFloat(el.step) || 1;
        var min = parseFloat(el.min) || 0;
        var max = parseFloat(el.max) || 100;
        var val = parseFloat(el.value);
        val = Math.min(max, Math.max(min, val + dir * step));
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        haptic(6);
    }

    function getActiveSubView() {
        var views = [
            {
                id: 'sub-custom-view', back: function () {
                    document.getElementById('sub-custom-view').style.display = 'none';
                    document.getElementById('sub-lang-group-view').style.display = 'flex';
                }
            },
            {
                id: 'sub-lang-entries-view', back: function () {
                    document.getElementById('sub-lang-entries-view').style.display = 'none';
                    document.getElementById('sub-lang-group-view').style.display = 'flex';
                }
            },
            {
                id: 'src-detail-view', back: function () {
                    document.getElementById('src-detail-view').style.display = 'none';
                    document.getElementById('src-list-view').style.display = 'flex';
                }
            }
        ];
        for (var i = 0; i < views.length; i++) {
            var el = document.getElementById(views[i].id);
            if (el && el.style.display !== 'none' && el.style.display !== '') return views[i];
        }
        return null;
    }

    function getActiveSettingsViewId() {
        var all = document.querySelectorAll('.settings-view');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var d = el.style.display;
            if (d === 'flex' || d === 'block') return el.id;
        }
        return null;
    }

    function goBack() {
        var epPanelOpen = document.getElementById('ep-panel') && document.getElementById('ep-panel').classList.contains('open');
        if (epPanelOpen) {
            var epSeasonView = document.getElementById('ep-panel-season-view');
            var epEpView = document.getElementById('ep-panel-episode-view');
            if (epEpView && epEpView.style.display !== 'none') {
                var backBtn = document.getElementById('ep-panel-ep-back');
                if (backBtn) {
                    backBtn.click();
                    _focusLockUntil = Date.now() + 150;
                    setTimeout(function () {
                        _focusLockUntil = 0;
                        refreshFocusables();
                        if (tvFocusables.length) setFocus(0);
                    }, 200);
                    return;
                }
            }
            var closeBtn = document.getElementById('ep-panel-close');
            if (closeBtn) closeBtn.click();
            setTimeout(function () {
                _focusLockUntil = 0;
                refreshFocusables();
                if (tvFocusables.length) setFocus(0);
            }, 200);
            return;
        }
        var sOpen = getSettingsOpen();
        var epOpen = getEpPanelOpen();
        if (sOpen) {
            var subView = getActiveSubView();
            if (subView) {
                subView.back();
                _focusLockUntil = Date.now() + 150;
                setTimeout(function () {
                    _focusLockUntil = 0;
                    refreshFocusables();
                    if (_settingsTileOrigin) {
                        var idx = tvFocusables.indexOf(_settingsTileOrigin);
                        if (idx >= 0) { setFocus(idx); return; }
                    }
                    if (tvFocusables.length) setFocus(0);
                }, 200);
                return;
            }
            var viewId = getActiveSettingsViewId();
            if (viewId && viewId !== 'settings-view-main') {
                var backBtn = document.querySelector('#' + viewId + ' .settings-back-btn, #' + viewId + ' .svsh-back');
                if (backBtn) {
                    backBtn.click();
                    _focusLockUntil = Date.now() + 150;
                    setTimeout(function () {
                        _focusLockUntil = 0;
                        refreshFocusables();
                        if (_settingsTileOrigin) {
                            var idx = tvFocusables.indexOf(_settingsTileOrigin);
                            if (idx >= 0) {
                                setFocus(idx);
                                _focusLockUntil = Date.now() + 300;
                                return;
                            }
                        }
                        if (tvFocusables.length) setFocus(0);
                    }, 200);
                    return;
                }
            }
            _settingsTileOrigin = null;
            var closeBtn = document.getElementById('settings-close-btn');
            if (closeBtn) closeBtn.click();
            setTimeout(function () {
                _focusLockUntil = 0;
                refreshFocusables();
                if (_settingsTileOrigin) {
                    var idx = tvFocusables.indexOf(_settingsTileOrigin);
                    if (idx >= 0) {
                        setFocus(idx);
                        _focusLockUntil = Date.now() + 300;
                        return;
                    }
                }
                if (tvFocusables.length) setFocus(0);
            }, 200);
        } else {
            showUI(true);
        }
    }

    function refreshFocusables() {
        if (Date.now() < _focusLockUntil) return;
        var sOpen = getSettingsOpen();
        var epPanelOpen = document.getElementById('ep-panel') && document.getElementById('ep-panel').classList.contains('open');
        var scope = epPanelOpen
            ? document.getElementById('ep-panel')
            : sOpen
                ? document.getElementById('settings-modal-wrap')
                : document.getElementById('player-controls-wrapper');
        if (!scope) return;

        var vid = document.getElementById('v');
        var isPaused = vid && vid.paused;

        tvFocusables = Array.from(scope.querySelectorAll(
            'button:not([disabled]), [role="button"], .settings-list-item, .settings-tile,' +
            '.settings-main-item, .ctrl-btn, .sub-lang-group-item, .sub-special-row,' +
            '.ep-season-row, .ep-panel-ep-row, .quality-row, .quality-auto-row,' +
            '.src-list-item, .sub-preset-btn, .sub-size-btn, .sub-pos-btn, .sub-bg-btn,' +
            'input[type="range"], .settings-toggle'
        )).filter(function (el) {
            if (el.id === 'track-wrap') return false;
            if (el.id === 'progress-container') return false;
            if (el.closest && el.closest('#progress-container')) return false;
            var p = el;
            while (p) {
                if (p.style && p.style.display === 'none') return false;
                p = p.parentElement;
            }
            var r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });

        if (!sOpen && !epPanelOpen) {
            var extras = ['btn-play', 'skip-segment-inner', 'next-ep-inner'];
            if (isPaused) extras.push('cf-skip-left', 'cf-skip-right');
            extras.forEach(function (eid) {
                var el = document.getElementById(eid);
                if (!el) return;
                if (tvFocusables.indexOf(el) >= 0) return;
                var r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) tvFocusables.push(el);
            });
            document.querySelectorAll('.skip-pill.show').forEach(function (el) {
                if (tvFocusables.indexOf(el) >= 0) return;
                var r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) tvFocusables.push(el);
            });
        }
    }

    function setFocus(idx, skipSave) {
        tvFocusables.forEach(function (el) { el.classList.remove('tv-focused'); });
        if (idx < 0) idx = 0;
        if (idx >= tvFocusables.length) idx = tvFocusables.length - 1;
        tvFocusIndex = idx;
        _sliderActive = false;
        document.body.classList.remove('tv-slider-active');
        var el = tvFocusables[idx];
        if (!el) return;
        if (!skipSave) _prevFocusEl = el;
        el.classList.add('tv-focused');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function restoreFocus() {
        refreshFocusables();
        if (_prevFocusEl) {
            var idx = tvFocusables.indexOf(_prevFocusEl);
            if (idx >= 0) { setFocus(idx, true); return; }
        }
        if (tvFocusables.length) setFocus(0, true);
    }

    function rectCenter(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function moveFocus(dir) {
        refreshFocusables();
        if (!tvFocusables.length) return;
        if (tvFocusIndex < 0) { setFocus(0); return; }
        var cur = tvFocusables[tvFocusIndex];
        if (!cur) { setFocus(0); return; }

        var cc = rectCenter(cur);
        var best = -1;
        var bestScore = Infinity;

        for (var i = 0; i < tvFocusables.length; i++) {
            if (i === tvFocusIndex) continue;
            var ec = rectCenter(tvFocusables[i]);
            var dx = ec.x - cc.x;
            var dy = ec.y - cc.y;

            var inDir = false;
            if (dir === 'right' && dx > 12) inDir = true;
            if (dir === 'left' && dx < -12) inDir = true;
            if (dir === 'down' && dy > 12) inDir = true;
            if (dir === 'up' && dy < -12) inDir = true;
            if (!inDir) continue;

            var primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
            var secondary = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
            var score = primary + secondary * 3.5;

            if (score < bestScore) { bestScore = score; best = i; }
        }

        if (best >= 0) {
            setFocus(best);
        } else {
            if (dir === 'down' && tvFocusIndex < tvFocusables.length - 1) setFocus(tvFocusIndex + 1);
            if (dir === 'up' && tvFocusIndex > 0) setFocus(tvFocusIndex - 1);
        }
    }

    function activateFocused() {
        var el = getFocusedEl();
        if (!el) return;
        if (isSlider(el)) {
            _sliderActive = !_sliderActive;
            document.body.classList.toggle('tv-slider-active', _sliderActive);
            haptic(10);
            return;
        }
        if (isToggle(el)) {
            el.click();
            haptic(10);
            return;
        }
        var isBackBtn = el.classList.contains('settings-back-btn') || el.classList.contains('svsh-back');
        if (isBackBtn) {
            goBack();
            return;
        }
        if (el.classList.contains('settings-tile') || el.classList.contains('settings-main-item')) {
            _settingsTileOrigin = el;
            _focusLockUntil = Date.now() + 300;
        }
        el.click();
        haptic(10);
    }

    var _tvSeeking = false;
    var _tvSeekInterval = null;
    var _tvKeyHeld = {};

    function startTVSeek(dir) {
        if (_tvSeeking) return;
        _tvSeeking = true;
        var vid = document.getElementById('v');
        _tvSeekInterval = setInterval(function () {
            vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + dir * 5));
            showUI();
        }, 300);
    }

    function stopTVSeek() {
        _tvSeeking = false;
        clearInterval(_tvSeekInterval);
        _tvSeekInterval = null;
    }

    function isPlaybackControlCode(code) {
        return code === TV_KEYS.PLAY_PAUSE || code === TV_KEYS.PLAY || code === TV_KEYS.PAUSE ||
            code === TV_KEYS.STOP || code === TV_KEYS.FAST_FWD || code === TV_KEYS.REWIND || code === TV_KEYS.INFO;
    }

    function isSpatialNavCode(code) {
        return code === TV_KEYS.BACK || code === 27 || code === TV_KEYS.ENTER ||
            code === TV_KEYS.UP || code === TV_KEYS.DOWN || code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT;
    }

    function handleNavInput(code, source, type) {
        var vid = document.getElementById('v');
        if (!vid) return false;
        if (type === 'keyup') {
            if (code === TV_KEYS.FAST_FWD || code === TV_KEYS.REWIND) {
                stopTVSeek();
                _tvKeyHeld[code] = false;
                return true;
            }
            return false;
        }

        if (code === TV_KEYS.PLAY_PAUSE || code === TV_KEYS.PLAY || code === TV_KEYS.PAUSE) {
            vid.paused ? vid.play() : vid.pause();
            showUI();
            return true;
        }
        if (code === TV_KEYS.STOP) {
            vid.pause();
            vid.currentTime = 0;
            showUI(true);
            return true;
        }
        if (code === TV_KEYS.FAST_FWD) {
            if (!_tvKeyHeld[code]) startTVSeek(1);
            _tvKeyHeld[code] = true;
            return true;
        }
        if (code === TV_KEYS.REWIND) {
            if (!_tvKeyHeld[code]) startTVSeek(-1);
            _tvKeyHeld[code] = true;
            return true;
        }
        if (code === TV_KEYS.INFO) {
            showUI(true);
            return true;
        }

        var sOpen = getSettingsOpen();
        var epOpen = getEpPanelOpen();

        if (code === TV_KEYS.BACK || code === 27) {
            if (_sliderActive) {
                _sliderActive = false;
                document.body.classList.remove('tv-slider-active');
                haptic(6);
                return true;
            }
            goBack();
            return true;
        }

        if (code === TV_KEYS.ENTER) {
            if (!tvNavMode) {
                enterTVNav(source);
                showUI(true);
                return true;
            }
            var prevIndex = tvFocusIndex;
            var prevEl = tvFocusables[prevIndex];
            var wasBackBtn = prevEl && (prevEl.classList.contains('settings-back-btn') || prevEl.classList.contains('svsh-back'));
            var wasSlider = isSlider(prevEl);
            var wasToggle = isToggle(prevEl);
            var wasTile = prevEl && (prevEl.classList.contains('settings-tile') || prevEl.classList.contains('settings-main-item'));
            activateFocused();
            if (!wasBackBtn && !wasSlider && !wasToggle && !wasTile) {
                setTimeout(function () {
                    if (Date.now() < _focusLockUntil) return;
                    refreshFocusables();
                    if (!tvFocusables.length) {
                        setTimeout(function () { restoreFocus(); }, 200);
                        return;
                    }
                    var sameIdx = prevEl ? tvFocusables.indexOf(prevEl) : -1;
                    if (sameIdx >= 0) {
                        setFocus(sameIdx);
                    } else {
                        setFocus(Math.min(prevIndex, tvFocusables.length - 1));
                    }
                }, 160);
            }
            return true;
        }

        if (code === TV_KEYS.UP || code === TV_KEYS.DOWN || code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) {
            if (Date.now() < _skipLockUntil) return true;

            var focused = getFocusedEl();

            if (_sliderActive && isSlider(focused)) {
                if (code === TV_KEYS.LEFT || code === TV_KEYS.DOWN) nudgeSlider(focused, -1);
                if (code === TV_KEYS.RIGHT || code === TV_KEYS.UP) nudgeSlider(focused, 1);
                return true;
            }

            enterTVNav(source);
            showUI(true);

            if (code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) {
                if (focused && isSlider(focused)) {
                    nudgeSlider(focused, code === TV_KEYS.RIGHT ? 1 : -1);
                    return true;
                }
                if (!sOpen && !epOpen && tvFocusIndex < 0) {
                    doSkip(code === TV_KEYS.RIGHT ? 'right' : 'left', 1);
                    _skipLockUntil = Date.now() + 800;
                    return true;
                }
                moveFocus(code === TV_KEYS.LEFT ? 'left' : 'right');
                return true;
            }

            if (tvFocusIndex < 0) {
                refreshFocusables();
                setFocus(0);
            } else {
                moveFocus(code === TV_KEYS.UP ? 'up' : 'down');
            }
            return true;
        }

        return false;
    }

    var _tvStyle = document.createElement('style');
    _tvStyle.textContent =
        '.tv-focused{outline:3px solid rgba(255,255,255,0.92)!important;outline-offset:3px!important;' +
        'background:rgba(255,255,255,0.13)!important;border-radius:10px!important;}' +
        '.tv-focused.ctrl-btn{background:rgba(255,255,255,0.2)!important;}' +
        '.tv-focused.settings-tile{background:rgba(255,255,255,0.16)!important;}' +
        '.tv-focused.cf-skip-btn{opacity:1!important;pointer-events:auto!important;}' +
        '.tv-focused.settings-toggle{outline:3px solid rgba(255,255,255,0.92)!important;outline-offset:3px!important;border-radius:100px!important;background:transparent!important;}' +
        'input[type="range"].tv-focused{outline:3px solid rgba(255,255,255,0.92)!important;outline-offset:4px!important;border-radius:6px!important;background:rgba(255,255,255,0.07)!important;}' +
        'body.tv-slider-active input[type="range"].tv-focused{outline:3px solid #55aaff!important;outline-offset:4px!important;box-shadow:0 0 0 6px rgba(85,170,255,0.18)!important;}' +
        '#center-flash.paused .cf-skip-btn{pointer-events:auto;}' +
        'body.tv-nav-mode #center-flash.paused{pointer-events:auto;}' +
        'body.tv-nav-mode *{cursor:none!important;}';
    document.head.appendChild(_tvStyle);

    document.addEventListener('keydown', function (e) {
        var code = e.keyCode;
        if (!isTVDevice()) {
            if (!isPlaybackControlCode(code) && !isSpatialNavCode(code)) return;
            if (code === TV_KEYS.BACK || code === 27 || code === TV_KEYS.ENTER || code === TV_KEYS.UP || code === TV_KEYS.DOWN || code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) return;
        }
        if (!isPlaybackControlCode(code) && !isSpatialNavCode(code)) return;
        if (handleNavInput(code, 'tv', 'keydown')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('keyup', function (e) {
        var code = e.keyCode;
        if (!isTVDevice()) return;
        if ((code === TV_KEYS.FAST_FWD || code === TV_KEYS.REWIND) && handleNavInput(code, 'tv', 'keyup')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });

    document.addEventListener('mousemove', function () {
        if (tvNavMode) {
            exitTVNav();
            document.body.style.cursor = '';
        }
    });

    document.addEventListener('touchstart', function () {
        if (tvNavMode) exitTVNav();
    }, { passive: true });

    updateInputProfile();

    if (isTVDevice()) {
        _navSource = 'tv';
        setTimeout(function () { enterTVNav('tv'); }, 500);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var player = document.getElementById('player');
        if (player) player.focus();
    });

    window.addEventListener('load', function () {
        document.body.focus();
        var player = document.getElementById('player');
        if (player) { player.setAttribute('tabindex', '0'); player.focus(); }

        (function () {
            var gpPollTimer = null;
            var gpPrevButtons = {};

            var GP_MAP = {
                0: TV_KEYS.ENTER,
                1: 27,
                8: TV_KEYS.PLAY_PAUSE,
                9: TV_KEYS.INFO,
                12: TV_KEYS.UP,
                13: TV_KEYS.DOWN,
                14: TV_KEYS.LEFT,
                15: TV_KEYS.RIGHT,
                6: TV_KEYS.REWIND,
                7: TV_KEYS.FAST_FWD
            };

            function pollGamepad() {
                var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                var hasConnectedPad = false;
                for (var gi = 0; gi < gamepads.length; gi++) {
                    var gp = gamepads[gi];
                    if (!gp) continue;
                    hasConnectedPad = true;
                    for (var btn in GP_MAP) {
                        var pressed = gp.buttons[btn] && gp.buttons[btn].pressed;
                        var wasPressed = gpPrevButtons[gi + '_' + btn];
                        if (pressed && !wasPressed) {
                            handleNavInput(GP_MAP[btn], 'controller', 'keydown');
                        }
                        if (!pressed && wasPressed) {
                            handleNavInput(GP_MAP[btn], 'controller', 'keyup');
                        }
                        gpPrevButtons[gi + '_' + btn] = pressed;
                    }
                    var axisThreshold = 0.5;
                    var axLeft = gp.axes[0] < -axisThreshold;
                    var axRight = gp.axes[0] > axisThreshold;
                    var axUp = gp.axes[1] < -axisThreshold;
                    var axDown = gp.axes[1] > axisThreshold;
                    var axStates = { axLeft: axLeft, axRight: axRight, axUp: axUp, axDown: axDown };
                    var axKeys = { axLeft: TV_KEYS.LEFT, axRight: TV_KEYS.RIGHT, axUp: TV_KEYS.UP, axDown: TV_KEYS.DOWN };
                    for (var ax in axStates) {
                        var isOn = axStates[ax];
                        var wasOn = gpPrevButtons[gi + '_' + ax];
                        if (isOn && !wasOn) {
                            handleNavInput(axKeys[ax], 'controller', 'keydown');
                        }
                        if (!isOn && wasOn) {
                            handleNavInput(axKeys[ax], 'controller', 'keyup');
                        }
                        gpPrevButtons[gi + '_' + ax] = isOn;
                    }
                }
                _controllerConnected = hasConnectedPad;
                if (_controllerConnected && !isTVDevice() && !tvNavMode) {
                    _navSource = 'controller';
                }
                updateInputProfile();
                gpPollTimer = requestAnimationFrame(pollGamepad);
            }

            window.addEventListener('gamepadconnected', function () {
                _controllerConnected = true;
                _navSource = isTVDevice() ? 'tv' : 'controller';
                updateInputProfile();
                if (!gpPollTimer) gpPollTimer = requestAnimationFrame(pollGamepad);
            });
            window.addEventListener('gamepaddisconnected', function () {
                _controllerConnected = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some(Boolean);
                if (!_controllerConnected && tvNavMode && document.body.classList.contains('tv-controller-nav-mode')) {
                    exitTVNav();
                } else {
                    updateInputProfile();
                }
                if (!_controllerConnected && gpPollTimer) { cancelAnimationFrame(gpPollTimer); gpPollTimer = null; }
            });
            if (navigator.getGamepads && Array.from(navigator.getGamepads()).some(Boolean)) {
                _controllerConnected = true;
                _navSource = isTVDevice() ? 'tv' : 'controller';
                updateInputProfile();
                gpPollTimer = requestAnimationFrame(pollGamepad);
            }
        })();
    });
})();
