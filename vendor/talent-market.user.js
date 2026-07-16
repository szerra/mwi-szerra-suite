// ==UserScript==
// @name         [MWI]Talent Market
// @namespace    http://tampermonkey.net/
// @version      1.5.6
// @description  MWI Talent Market(www.papiyas.chat)，游戏页面内嵌网站弹窗，支持一键导入角色信息生成名片上传
// @author       SHIIN
// @match        https://www.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://test.milkywayidlecn.com/*
// @match        https://papiyas.chat/*
// @match        https://shykai.github.io/MWICombatSimulatorTest/*
// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @icon         https://www.papiyas.chat/img/favicon.ico
// @license      CC-BY-NC-SA-4.0
// @connect      papiyas.chat
// @connect      tupian.li
// @connect      www.milkywayidle.com
// @connect      www.milkywayidlecn.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js
// @resource     cardStyles https://papiyas.chat/static/js/mwi-card-styles.css?v=1.5.2
// @downloadURL https://update.greasyfork.org/scripts/559347/%5BMWI%5DTalent%20Market.user.js
// @updateURL https://update.greasyfork.org/scripts/559347/%5BMWI%5DTalent%20Market.meta.js
// ==/UserScript==

(function(global) {
    'use strict';
    const SnapDOM = (function() {
        function initSnapDOM() {
            if (typeof global.snapdom !== 'undefined') return;
            global.snapdom = async function(node, options = {}) {
                const scale = options.scale || 2;
                const width = options.width || node.offsetWidth;
                const height = options.height || node.offsetHeight;
                const bgcolor = options.backgroundColor || 'transparent';
                async function cloneNode(node, filter) {
                    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
                    if (node.nodeType !== Node.ELEMENT_NODE) return null;
                    const clone = node.cloneNode(false);
                    const style = window.getComputedStyle(node);
                    for (let i = 0; i < style.length; i++) {
                        const name = style[i];
                        if (name !== 'backgroundImage') clone.style[name] = style.getPropertyValue(name);
                    }
                    const classNameForFix = typeof node.className === 'string' ? node.className : (node.className?.baseVal || '');
                    if (classNameForFix.includes('mwi-stat-value') || classNameForFix.includes('mwi-stat-label') || classNameForFix.includes('mwi-character-id')) {
                        clone.style.setProperty('overflow', 'visible', 'important');
                        clone.style.setProperty('text-overflow', 'clip', 'important');
                        clone.style.setProperty('white-space', 'nowrap', 'important');
                        clone.style.setProperty('max-width', 'none', 'important');
                    }
                    if (classNameForFix.includes('mwi-stat-item') || classNameForFix.includes('mwi-character-id-wrapper') || classNameForFix.includes('mwi-character-info-top')) {
                        clone.style.setProperty('overflow', 'visible', 'important');
                        clone.style.setProperty('max-width', 'none', 'important');
                    }
                    if (classNameForFix.includes('CharacterName_name') || classNameForFix.includes('CharacterName_characterName')) {
                        clone.style.setProperty('overflow', 'visible', 'important');
                        clone.style.setProperty('height', 'auto', 'important');
                        clone.style.setProperty('max-height', 'none', 'important');
                        clone.style.setProperty('line-height', 'normal', 'important');
                    }
                    if (node.style) {
                        for (let i = 0; i < node.style.length; i++) {
                            const propName = node.style[i];
                            if (propName.startsWith('--')) clone.style.setProperty(propName, node.style.getPropertyValue(propName));
                        }
                    }
                    if (node.tagName === 'use' || node.tagName === 'USE') {
                        const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                        if (href) { clone.setAttribute('href', href); clone.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); }
                    }
                    let backgroundApplied = false;
                    if (node.style?.backgroundImage && node.style.backgroundImage !== 'none') {
                        clone.style.backgroundImage = node.style.backgroundImage;
                        const inlineMatch = node.style.backgroundImage.match(/url\(["']?([^"']*?)["']?\)/);
                        backgroundApplied = !!(inlineMatch?.[1] || node.style.backgroundImage.includes('gradient'));
                    }
                    const bgProps = ['backgroundImage', 'backgroundColor', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment', 'backgroundClip', 'backgroundOrigin'];
                    bgProps.forEach(prop => {
                        const computedValue = style.getPropertyValue(prop);
                        if (computedValue && computedValue !== 'none' && computedValue !== 'initial') {
                            clone.style.setProperty(prop, computedValue);
                            if (prop === 'backgroundImage' && computedValue !== 'none') backgroundApplied = true;
                        }
                    });
                    if (backgroundApplied) {
                        ['backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundAttachment'].forEach(prop => {
                            const value = node.style?.[prop] || style.getPropertyValue(prop);
                            if (value && value !== 'initial') clone.style[prop] = value;
                        });
                    }
                    const supportsMask = CSS.supports('mask', 'linear-gradient(#fff 0 0)') || CSS.supports('-webkit-mask', 'linear-gradient(#fff 0 0)');
                    ['::before', '::after'].forEach(pseudo => {
                        const pseudoStyle = window.getComputedStyle(node, pseudo);
                        const content = pseudoStyle.getPropertyValue('content');
                        const background = pseudoStyle.getPropertyValue('background');
                        if ((content && content !== 'none' && content !== 'normal') || (background && background.includes('gradient'))) {
                            const classNameStr = typeof node.className === 'string' ? node.className : (node.className?.baseVal || node.className?.toString() || '');
                            if (classNameStr.includes('mwi-character-info-top') && pseudo === '::before') return;
                            if (classNameStr.includes('mwi-character-card') && pseudo === '::before' && !supportsMask) return;
                            const pseudoElement = document.createElement('div');
                            pseudoElement.className = `pseudo-${pseudo.replace('::', '')}`;
                            ['position', 'top', 'right', 'bottom', 'left', 'inset', 'width', 'height', 'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-attachment', 'background-clip', 'border-radius', 'padding', 'margin', 'z-index', 'pointer-events', 'backdrop-filter', '-webkit-backdrop-filter', 'mask', '-webkit-mask', 'mask-composite', '-webkit-mask-composite'].forEach(prop => {
                                const value = pseudoStyle.getPropertyValue(prop);
                                if (value && value !== 'initial' && value !== 'auto' && value !== 'normal') pseudoElement.style.setProperty(prop, value);
                            });
                            const zIndex = pseudoStyle.getPropertyValue('z-index');
                            pseudoElement.style.setProperty('z-index', (zIndex && zIndex !== 'auto') ? zIndex : '-1', 'important');
                            if (pseudo === '::before') clone.insertBefore(pseudoElement, clone.firstChild || null);
                            else clone.appendChild(pseudoElement);
                        }
                    });
                    for (let i = 0; i < node.childNodes.length; i++) {
                        const child = await cloneNode(node.childNodes[i], filter);
                        if (child) clone.appendChild(child);
                    }
                    return clone;
                }
                async function embedSVG(clone) {
                    const spriteMap = {};
                    const uses = clone.querySelectorAll('use');
                    for (const use of uses) {
                        const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                        if (!href) continue;
                        if (href.includes('.svg#')) {
                            const [spriteUrl, symbolId] = href.split('#');
                            if (!spriteMap[spriteUrl]) spriteMap[spriteUrl] = new Set();
                            spriteMap[spriteUrl].add(symbolId);
                        } else if (href.startsWith('#')) {
                            const symbolId = href.substring(1);
                            const symbol = document.getElementById(symbolId);
                            if (!symbol) continue;
                            const svg = use.closest('svg');
                            if (!svg) continue;
                            let defs = svg.querySelector('defs');
                            if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
                            if (!defs.querySelector('#' + symbolId)) { const clonedSymbol = symbol.cloneNode(true); clonedSymbol.querySelectorAll('text, tspan').forEach(t => t.remove()); defs.appendChild(clonedSymbol); }
                        }
                    }
                    for (const [spriteUrl, symbolIds] of Object.entries(spriteMap)) {
                        try {
                            const response = await fetch(spriteUrl);
                            const svgText = await response.text();
                            const svgDoc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
                            for (const symbolId of symbolIds) {
                                const symbol = svgDoc.getElementById(symbolId);
                                if (!symbol) continue;
                                const relevantUses = clone.querySelectorAll(`use[href="${spriteUrl}#${symbolId}"]`);
                                for (const use of relevantUses) {
                                    const svg = use.closest('svg');
                                    if (!svg) continue;
                                    let defs = svg.querySelector('defs');
                                    if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
                                    const spriteType = spriteUrl.match(/\/([^\/]+)_sprite/)?.[1] || 'unknown';
                                    const uniqueId = `${spriteType}_${symbolId}`;
                                    if (!defs.querySelector('#' + uniqueId)) { const clonedSymbol = symbol.cloneNode(true); clonedSymbol.id = uniqueId; clonedSymbol.querySelectorAll('text, tspan').forEach(t => t.remove()); defs.appendChild(clonedSymbol); }
                                    use.setAttribute('href', '#' + uniqueId);
                                    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + uniqueId);
                                }
                            }
                        } catch (error) { console.warn('[SnapDOM] embedSVG fetch failed for sprite:', error.message); }
                    }
                }
                const clonedNode = await cloneNode(node, options.filter);
                await embedSVG(clonedNode);
                [{ selector: '.mwi-equipment-slot.filled', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-ability-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-consumable-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-house-item:not(.empty)', bgColor: 'rgba(255, 255, 255, 0.08)' }, { selector: '.mwi-stat-item', bgColor: 'rgba(255, 255, 255, 0.03)' }, { selector: '.mwi-consumables-container, .mwi-abilities-grid, .mwi-equipment-grid, .mwi-house-grid', bgColor: 'rgba(0, 0, 0, 0.2)' }, { selector: '.mwi-stats-grid', bgColor: 'rgba(0, 0, 0, 0.06)' }].forEach(fix => {
                    clonedNode.querySelectorAll(fix.selector).forEach(el => {
                        if (!el.style.backgroundColor || el.style.backgroundColor === 'transparent') { el.style.backgroundColor = fix.bgColor; el.style.backdropFilter = 'blur(20px) saturate(180%)'; el.style.webkitBackdropFilter = 'blur(20px) saturate(180%)'; }
                    });
                });
                const xmlns = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(xmlns, 'svg');
                svg.setAttribute('width', width * scale); svg.setAttribute('height', height * scale);
                svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                svg.setAttribute('color-interpolation', 'sRGB'); svg.setAttribute('color-interpolation-filters', 'sRGB');
                svg.style.backgroundColor = bgcolor;
                const foreignObject = document.createElementNS(xmlns, 'foreignObject');
                foreignObject.setAttribute('width', '100%'); foreignObject.setAttribute('height', '100%');
                foreignObject.setAttribute('x', '0'); foreignObject.setAttribute('y', '0');
                let bgImageUrl = null;
                const cardElement = clonedNode.querySelector('.mwi-character-card') || clonedNode;
                if (cardElement && cardElement.style.backgroundImage) {
                    const match = cardElement.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
                    if (match && match[1]) bgImageUrl = match[1];
                }
                foreignObject.appendChild(clonedNode); svg.appendChild(foreignObject);
                const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
                return {
                    async toCanvas() {
                        return new Promise((resolve, reject) => {
                            const canvas = document.createElement('canvas');
                            canvas.width = width * scale; canvas.height = height * scale;
                            const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
                            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                            const drawSvgContent = () => {
                                const svgImg = new Image();
                                svgImg.crossOrigin = 'anonymous'; svgImg.decoding = 'sync';
                                svgImg.onload = () => { ctx.drawImage(svgImg, 0, 0); resolve(canvas); };
                                svgImg.onerror = () => reject(new Error('Failed to load SVG image'));
                                svgImg.src = dataUrl;
                            };
                            if (bgImageUrl) {
                                const bgImg = new Image();
                                bgImg.crossOrigin = 'anonymous';
                                bgImg.onload = () => { ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height); drawSvgContent(); };
                                bgImg.onerror = () => { drawSvgContent(); };
                                bgImg.src = bgImageUrl;
                            } else {
                                if (bgcolor && bgcolor !== 'transparent') { ctx.fillStyle = bgcolor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
                                drawSvgContent();
                            }
                        });
                    }
                };
            };
        }
        return { async toCanvas(element, options = {}) { initSnapDOM(); const result = await global.snapdom(element, options); return result.toCanvas(); } };
    })();
    global.SnapDOM = SnapDOM;
})(typeof window !== 'undefined' ? window : this);

(function(global) {
    'use strict';
    const SVGTool = {
        sprites: { items: null, skills: null, abilities: null, misc: null, chat_icons: null, avatars: null, avatar_outfits: null },
        initialized: false,
        init() {
            if (this.initialized) return;
            try {
                const rawAssets = localStorage.getItem('preloadedAssets');
                if (rawAssets) {
                    const preloadedAssets = JSON.parse(rawAssets);
                    ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                        const key = `${type}_sprite`;
                        if (preloadedAssets[key]) this.sprites[type] = preloadedAssets[key].split('?')[0];
                    });
                }
            } catch (e) {}
            const missingSprites = Object.keys(this.sprites).filter(k => !this.sprites[k]);
            if (missingSprites.length > 0) {
                document.querySelectorAll("svg use[href*='sprite']").forEach(useEl => {
                    const href = useEl.getAttribute("href") || useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    if (!href) return;
                    const [filePath] = href.split('#');
                    missingSprites.forEach(type => { if (filePath.includes(`${type}_sprite`) && !this.sprites[type]) this.sprites[type] = filePath; });
                });
            }
            const defaults = { items: '/static/media/items_sprite.6d12eb9d.svg', skills: '/static/media/skills_sprite.3bb4d936.svg', abilities: '/static/media/abilities_sprite.fdd1b4de.svg', misc: '/static/media/misc_sprite.6fa5e97c.svg', chat_icons: '/static/media/chat_icons_sprite.f870cd32.svg', avatars: '/static/media/avatars_sprite.23c6df2d.svg', avatar_outfits: '/static/media/avatar_outfits_sprite.fe228a76.svg' };
            Object.keys(defaults).forEach(key => { if (!this.sprites[key]) this.sprites[key] = defaults[key]; });
            this.initialized = true;
        },
        getSpriteURL(type = 'items') { if (!this.initialized) this.init(); return this.sprites[type] || this.sprites.items; },
        refreshFromDOM() {
            try {
                const rawAssets = localStorage.getItem('preloadedAssets');
                if (rawAssets) {
                    const preloadedAssets = JSON.parse(rawAssets);
                    ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                        const key = `${type}_sprite`;
                        if (preloadedAssets[key]) {
                            const url = preloadedAssets[key].split('?')[0];
                            if (url && this.sprites[type] !== url) this.sprites[type] = url;
                        }
                    });
                }
            } catch (e) {}
            document.querySelectorAll("svg use[href*='sprite']").forEach(useEl => {
                const href = useEl.getAttribute("href") || useEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                if (!href) return;
                const [filePath] = href.split('#');
                ['items', 'skills', 'abilities', 'misc', 'chat_icons', 'avatars', 'avatar_outfits'].forEach(type => {
                    if (filePath.includes(`${type}_sprite`) && this.sprites[type] !== filePath) this.sprites[type] = filePath;
                });
            });
        },
        createIcon(hrid, width = 40, height = 40, type = 'items') {
            const iconId = hrid.split('/').pop();
            const spriteURL = this.getSpriteURL(type);
            if (!spriteURL) return `<div style="width:${width}px;height:${height}px;background:rgba(255,255,255,0.1);border-radius:4px;">?</div>`;
            return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${width}"><use href="${spriteURL}#${iconId}"></use></svg>`;
        }
    };
    global.SVGTool = SVGTool;
})(typeof window !== 'undefined' ? window : this);

(function() {
    'use strict';
    
    try {
        const cardStyles = GM_getResourceText('cardStyles');
        if (cardStyles) {
            GM_addStyle(cardStyles);
        }
    } catch (e) {
    }
    
    const SITE_URL = 'https://papiyas.chat';
    const IntervalManager = {
        intervals: new Map(),
        isPageVisible: true,
        visibilityHandler: null,
        
        init() {
            if (this.visibilityHandler) return;
            this.visibilityHandler = () => {
                this.isPageVisible = !document.hidden;
                if (this.isPageVisible) {
                    this.resumeAll();
                } else {
                    this.pauseAll();
                }
            };
            document.addEventListener('visibilitychange', this.visibilityHandler);
        },
        
        register(name, callback, interval) {
            this.init();
            if (this.intervals.has(name)) {
                this.clear(name);
            }
            const id = setInterval(() => {
                if (this.isPageVisible) {
                    callback();
                }
            }, interval);
            this.intervals.set(name, { id, callback, interval });
            return id;
        },
        
        clear(name) {
            const entry = this.intervals.get(name);
            if (entry) {
                clearInterval(entry.id);
                this.intervals.delete(name);
            }
        },
        
        pauseAll() {
        },
        
        resumeAll() {
        },
        
        clearAll() {
            this.intervals.forEach((entry, name) => {
                clearInterval(entry.id);
            });
            this.intervals.clear();
            if (this.visibilityHandler) {
                document.removeEventListener('visibilitychange', this.visibilityHandler);
                this.visibilityHandler = null;
            }
        }
    };
    const currentHostname = window.location.hostname;
    const isSimulatorPage = document.URL.includes("shykai.github.io/MWICombatSimulatorTest") ||
                            document.URL.includes("amvoidguy.github.io/MWICombatSimulatorTest");
    
    const cardLinkFillStatus = {
        submitFormFilled: false,
        editFormFilled: false,
        submitFormExists: false,
        editFormExists: false,
        currentTimestamp: 0,
        checkFormExistence: function() {
            this.submitFormExists = !!document.querySelector('#cardLink');
            this.editFormExists = !!document.querySelector('#editCardLink');
        },
        markFilled: function(formType, timestamp) {
            if (timestamp !== this.currentTimestamp) {
                this.submitFormFilled = false;
                this.editFormFilled = false;
                this.currentTimestamp = timestamp;
            }
            this.checkFormExistence();
            if (formType === 'submit') {
                this.submitFormFilled = true;
            } else if (formType === 'edit') {
                this.editFormFilled = true;
            }
            const submitDone = !this.submitFormExists || this.submitFormFilled;
            const editDone = !this.editFormExists || this.editFormFilled;
            if (submitDone && editDone) {
                GM_setValue('mwi_card_image_url', '');
                GM_setValue('mwi_card_image_timestamp', 0);
                GM_setValue('mwi_upload_progress', 0);
                GM_setValue('mwi_upload_status', '');
                this.submitFormFilled = false;
                this.editFormFilled = false;
                this.currentTimestamp = 0;
            }
        },
        reset: function() {
            this.submitFormFilled = false;
            this.editFormFilled = false;
            this.submitFormExists = false;
            this.editFormExists = false;
            this.currentTimestamp = 0;
        }
    };
    function enableClipboardPermissionsIfSupported(iframeElement) {
        if (!iframeElement) {
            return;
        }
        try {
            const userAgent = (navigator.userAgent || '').toLowerCase();
            const isChromiumFamily = /chrome|edg|opr|brave|vivaldi/.test(userAgent) && !userAgent.includes('firefox');
            if (!isChromiumFamily) {
                return;
            }
            iframeElement.setAttribute('allow', 'clipboard-read; clipboard-write');
        } catch (error) {
        }
    }
    if (currentHostname === 'papiyas.chat') {
        try {
            localStorage.setItem('mwi_tm_version', GM_info.script.version);
        } catch (e) {}
        if (window.self !== window.top) {
            initPapiyasChatFeatures();
        }
        return;
    }
    try {
        GM_setValue('mwi_tm_version', GM_info.script.version);
    } catch (e) {}

    if (!isSimulatorPage) {
    (function initNavigationLink() {
        window.detectLanguage = function() {
            const lang = localStorage.getItem("i18nextLng") || document.documentElement.lang || navigator.language || 'en';
            return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        };
        
        function findSocko(container) {
            return [...container.children].find(el => 
                el.textContent.includes('socko') || el.textContent.includes('战斗榜')
            );
        }
        
        function createLink() {
            const lang = window.detectLanguage();
            const div = document.createElement('div');
            div.className = 'NavigationBar_minorNavigationLink__31K7Y mwi-talent-market-link';
            div.style.cssText = 'cursor: pointer; color: #FFA500;';
            div.textContent = lang === 'zh' ? '人才市场 SHIIN' : 'Talent Market SHIIN';
            div.addEventListener('click', () => {
                if (typeof window.toggleTalentMarketModal === 'function') {
                    window.toggleTalentMarketModal();
                }
            });
            return div;
        }
        
        function insertOrRepositionLink(forceFallback = false) {
            const container = document.querySelector('.NavigationBar_minorNavigationLinks__dbxh7');
            if (!container) return false;
            
            const socko = findSocko(container);
            let link = document.querySelector('.mwi-talent-market-link');
            
            if (link) {
                if (socko && socko.nextElementSibling !== link) {
                    socko.insertAdjacentElement('afterend', link);
                }
                return true;
            }
            
            if (socko) {
                socko.insertAdjacentElement('afterend', createLink());
                return true;
            }
            
            if (forceFallback) {
                container.insertAdjacentElement('afterbegin', createLink());
                return true;
            }
            
            return false;
        }
        
        let attempts = 0;
        const maxAttempts = 15;
        const checkInterval = setInterval(() => {
            attempts++;
            const isLastAttempt = attempts >= maxAttempts;
            if (insertOrRepositionLink(isLastAttempt) || isLastAttempt) {
                clearInterval(checkInterval);
            }
        }, 200);
        
        let throttleTimer = null;
        let initialCheckDone = false;
        const observer = new MutationObserver(() => {
            if (throttleTimer) return;
            throttleTimer = setTimeout(() => {
                throttleTimer = null;
                const linkExists = !!document.querySelector('.mwi-talent-market-link');
                insertOrRepositionLink(!linkExists && initialCheckDone);
            }, 200);
        });
        setTimeout(() => { initialCheckDone = true; }, 3000);
        
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
    })();
    } // end if (!isSimulatorPage)
    
    const CARD_BACKGROUND_IMAGE = 'https://tupian.li/images/2026/01/06/695c6aa763f87.png';
    const BackgroundImagePreloader = {
        cachedDataURL: null,
        isLoading: false,
        loadPromise: null,
        async preload() {
            if (this.cachedDataURL) {
                return this.cachedDataURL;
            }
            if (this.isLoading) {
                return this.loadPromise;
            }
            this.isLoading = true;
            this.loadPromise = this._loadImage();
            try {
                this.cachedDataURL = await this.loadPromise;
                return this.cachedDataURL;
            } catch (error) {
                this.cachedDataURL = null;
                throw error;
            } finally {
                this.isLoading = false;
                this.loadPromise = null;
            }
        },
        async _loadImage() {
            if (!CARD_BACKGROUND_IMAGE || CARD_BACKGROUND_IMAGE.trim() === '') {
                throw new Error('Background image URL not configured');
            }
            const blob = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: CARD_BACKGROUND_IMAGE,
                    responseType: 'blob',
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error loading background image')),
                    ontimeout: () => reject(new Error('Timeout loading background image'))
                });
            });
            const img = await new Promise((resolve, reject) => {
                const imgEl = new Image();
                imgEl.crossOrigin = 'anonymous';
                imgEl.decoding = 'sync';
                const blobUrl = URL.createObjectURL(blob);
                imgEl.onload = () => { URL.revokeObjectURL(blobUrl); resolve(imgEl); };
                imgEl.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to decode background image')); };
                imgEl.src = blobUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb', willReadFrequently: false });
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            return canvas.toDataURL('image/png', 1.0);
        },
        getCached() {
            return this.cachedDataURL;
        },
        clear() {
            this.cachedDataURL = null;
            this.isLoading = false;
            this.loadPromise = null;
        }
    };
    if (currentHostname !== 'papiyas.chat' && !isSimulatorPage) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                BackgroundImagePreloader.preload().catch(() => {});
            });
        } else {
            BackgroundImagePreloader.preload().catch(() => {});
        }
    }
    
    function initCardUploadMonitor() {
        let lastProcessedTimestamp = 0;
        let isUploading = false;
        
        const monitorCallback = async () => {
            if (isUploading) {
                return;
            }
            
            const requestTimestamp = GM_getValue('mwi_card_upload_request', 0);
            
            if (requestTimestamp && requestTimestamp !== lastProcessedTimestamp) {
                lastProcessedTimestamp = requestTimestamp;
                isUploading = true;
                
                GM_setValue('mwi_card_upload_request', 0);
                
                try {
                    let cardElement = document.getElementById('mwi-card-content');
                    
                    if (!cardElement) {
                        if (typeof generateCharacterCard === 'function') {
                            await generateCharacterCard();
                            
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            
                            cardElement = document.getElementById('mwi-card-content');
                            if (!cardElement) {
                                throw new Error('名片生成后仍未找到DOM元素');
                            }
                        } else {
                            throw new Error('generateCharacterCard函数不存在');
                        }
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                    
                    const imageUrl = await generateAndUploadCard();
                    
                    const responseData = {
                        type: 'MWI_UPLOAD_CARD_RESPONSE',
                        success: true,
                        imageUrl: imageUrl
                    };
                    
                    window.postMessage(responseData, '*');
                    
                    const iframes = document.querySelectorAll('iframe');
                    iframes.forEach((iframe, index) => {
                        try {
                            iframe.contentWindow.postMessage(responseData, '*');
                        } catch (e) {}
                    });
                    
                    if (window.parent && window.parent !== window) {
                        try {
                            window.parent.postMessage(responseData, '*');
                        } catch (e) {}
                    }
                    
                } catch (error) {
                    const errorData = {
                        type: 'MWI_UPLOAD_CARD_RESPONSE',
                        success: false,
                        error: error.message
                    };
                    window.postMessage(errorData, '*');
                    
                    const iframes = document.querySelectorAll('iframe');
                    iframes.forEach((iframe) => {
                        try {
                            iframe.contentWindow.postMessage(errorData, '*');
                        } catch (e) {}
                    });
                } finally {
                    isUploading = false;
                }
            }
        };
        
        IntervalManager.register('cardUploadMonitor', monitorCallback, 500);
    }
    function initPapiyasChatFeatures() {
        try {
            const btName = GM_getValue('bt_auth_name', '');
            if (btName) localStorage.setItem('bt_auth_name', btName);
            localStorage.setItem('mwi_tm_version', GM_info.script.version);
        } catch (e) { /* silent */ }
        initFormImportListener();
        initSimulatorDataAutoFill();
        initCardImageUrlAutoFill();
        initEditFormAutoFill();
        initEditCardImageUrlAutoFill();
        initGuildFormAutoFill();
        initEditGuildFormAutoFill();
    }
    function initCardImageUrlAutoFill() {
        let lastProcessedTimestamp = 0;
        function fillCardLink(cardImageUrl, timestamp) {
            if (typeof window.__fillCardLink__ === 'function') {
                window.__fillCardLink__(cardImageUrl);
            }
            lastProcessedTimestamp = timestamp;
            cardLinkFillStatus.markFilled('submit', timestamp);
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
        }
        function checkAndFillCardLink() {
            try {
                const cardImageUrl = GM_getValue('mwi_card_image_url', '');
                const timestamp = GM_getValue('mwi_card_image_timestamp', 0);
                
                if (cardImageUrl && timestamp && timestamp !== lastProcessedTimestamp) {
                    fillCardLink(cardImageUrl, timestamp);
                    return;
                }
            } catch (error) {
            }
        }
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'MWI_UPLOAD_CARD_RESPONSE' && event.data.success && event.data.imageUrl) {
                const timestamp = Date.now();
                if (timestamp !== lastProcessedTimestamp) {
                    fillCardLink(event.data.imageUrl, timestamp);
                }
            }
        });
        IntervalManager.register('cardImageUrlAutoFill', checkAndFillCardLink, 500);
        setTimeout(checkAndFillCardLink, 100);
    }

    
    function initFormImportListener() {
        function getUserIdFromPage() {
            const pageType = detectPageType();
            let userId = '';
            if (pageType === 'guild') {
                const submitInput = document.querySelector('#guildLeaderId');
                const editInput = document.querySelector('#editGuildLeaderId');
                userId = submitInput?.value?.trim() || editInput?.value?.trim() || '';
            } else {
                const submitInput = document.querySelector('#playerId');
                const editInput = document.querySelector('#editPlayerId');
                userId = submitInput?.value?.trim() || editInput?.value?.trim() || '';
            }
            return userId;
        }
        function detectPageType() {
            const url = window.location.pathname;
            if (url.includes('/guild')) return 'guild';
            if (url.includes('/IC')) return 'ic';
            return 'standard';
        }
        async function getGameData(pageType) {
            const simulatorDataStr = GM_getValue('mwi_simulator_data', null);
            
            if (simulatorDataStr) {
                try {
                    const simulatorData = JSON.parse(simulatorDataStr);
                    return simulatorData;
                } catch (e) {}
            }
            
            const baseData = {
                battleLevel: '123.456',
                combatLevel: '78.901',
                mainAttributeLevel: '45.678',
                characterTotalLevel: '567.890'
            };
            if (pageType === 'guild') {
                return {
                    battleLevel: baseData.battleLevel,
                    combatLevel: baseData.combatLevel,
                    mainAttributeLevel: baseData.mainAttributeLevel,
                    characterTotalLevel: baseData.characterTotalLevel
                };
            } else {
                return baseData;
            }
        }
        async function fillFormData(data, pageType) {
            const commonFields = {
                'battle-level-input': data.battleLevel,
                'combat-level-input': data.combatLevel,
                'main-attribute-level-input': data.mainAttributeLevel,
                'character-total-level-input': data.characterTotalLevel
            };
            const guildFields = {
                'guild-battle-level': data.battleLevel,
                'guild-combat-level': data.combatLevel,
                'guild-main-attribute-level': data.mainAttributeLevel,
                'guild-character-total-level': data.characterTotalLevel
            };
            const fieldsToFill = pageType === 'guild' ? 
                { ...commonFields, ...guildFields } : 
                commonFields;
            for (const [id, value] of Object.entries(fieldsToFill)) {
                const selectors = [
                    `#${id}`,
                    `input[id="${id}"]`,
                    `input[name="${id}"]`,
                    `[data-field="${id}"]`
                ];
                for (const selector of selectors) {
                    const input = document.querySelector(selector);
                    if (input) {
                        input.removeAttribute('readonly');
                        input.removeAttribute('disabled');
                        input.value = value;
                        const events = ['input', 'change', 'blur', 'keyup'];
                        events.forEach(eventType => {
                            input.dispatchEvent(new Event(eventType, { bubbles: true }));
                        });
                        break;
                    }
                }
            }
        }
        function listenImportButton() {
            if (window._MWI_IMPORT_LISTENER_ATTACHED) {
                return;
            }
            
            const importHandler = async (e) => {
                
                try {
                    const pageType = detectPageType();
                    
                    const gameData = await getGameData(pageType);
                    
                    await fillFormData(gameData, pageType);
                    
                    document.dispatchEvent(new CustomEvent('plugin-import-response', {
                        detail: {
                            success: true,
                            data: gameData,
                            pageType: pageType
                        }
                    }));
                    
                    const isInGuildModal = !!(document.querySelector('.guild-submit-modal-content') || document.querySelector('.edit-guild-modal-content'));
                    
                    if (!isInGuildModal) {
                        GM_setValue('mwi_card_upload_request', Date.now());
                    }
                } catch (error) {
                    document.dispatchEvent(new CustomEvent('plugin-import-response', {
                        detail: {
                            success: false,
                            error: error.message
                        }
                    }));
                }
            };
            
            document.addEventListener('plugin-import-request', importHandler);
            window._MWI_IMPORT_LISTENER_ATTACHED = true;
        }
        listenImportButton();
    }
    
    async function generateAndUploadCard() {
        return await autoUploadCard();
    }
    
    window.addEventListener('message', async (event) => {
        if (event.data && event.data.type === 'MWI_GENERATE_CARD_REQUEST') {
            try {
                if (typeof generateCharacterCard === 'function') {
                    await generateCharacterCard();
                } else {
                    throw new Error('generateCharacterCard函数未找到');
                }
            } catch (error) {
            }
        }
        if (event.data && event.data.type === 'MWI_UPLOAD_CARD_REQUEST') {
            try {
                const imageUrl = await generateAndUploadCard();
                
                const responseData = {
                    type: 'MWI_UPLOAD_CARD_RESPONSE',
                    success: true,
                    imageUrl: imageUrl
                };
                
                if (event.source) {
                    event.source.postMessage(responseData, event.origin);
                }
                
                window.postMessage(responseData, '*');
                
            } catch (error) {
                const errorData = {
                    type: 'MWI_UPLOAD_CARD_RESPONSE',
                    success: false,
                    error: error.message
                };
                
                if (event.source) {
                    event.source.postMessage(errorData, event.origin);
                }
                window.postMessage(errorData, '*');
            }
        }
        
        if (event.data && event.data.type === 'MODAL_OPENED') {
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
        }
        
        if (event.data && event.data.type === 'MODAL_CLOSED') {
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
            GM_setValue('mwi_card_upload_request', 0);
        }
    });
    function initSimulatorDataAutoFill() {
        function attachImportListener() {
            const importBtnSelectors = [
                '#submitForm > div:nth-child(1) > button:nth-child(1)',
                '#submitForm button:first-child'
            ];
            let importBtn = null;
            for (const selector of importBtnSelectors) {
                importBtn = document.querySelector(selector);
                if (importBtn) {
                    break;
                }
            }
            if (!importBtn) {
                const allButtons = document.querySelectorAll('#submitForm button');
                for (const btn of allButtons) {
                    const text = btn.textContent?.trim() || '';
                    if (text.includes('导入数据') || text.includes('Import Data')) {
                        importBtn = btn;
                        break;
                    }
                }
            }
            if (!importBtn) {
                return false;
            }
            if (importBtn.dataset.simulatorListenerAttached) {
                importBtn.removeEventListener('click', importBtn._simulatorClickHandler);
            }
            const clickHandler = async function(e) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const simDataInput = document.querySelector('#simData');
                    if (!simDataInput) {
                        return;
                    }
                    let simulatorData = null;
                    try {
                        const storedData = GM_getValue('mwi_simulator_data', '');
                        if (storedData) {
                            simulatorData = JSON.parse(storedData);
                        }
                    } catch (e) {
                    }
                    if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                        const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                        if (typeof getSimData === 'function') {
                            simulatorData = getSimData();
                        }
                    }
                    if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                        simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                    }
                    if (!simulatorData) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                        alert(message);
                        return;
                    }
                    const dataString = JSON.stringify(simulatorData, null, 2);
                    simDataInput.value = dataString;
                    simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                    simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    let targetWindow = null;
                    if (window.opener && !window.opener.closed) {
                        targetWindow = window.opener;
                    } else if (window.parent && window.parent !== window) {
                        targetWindow = window.parent;
                    } else if (window.top && window.top !== window) {
                        targetWindow = window.top;
                    }
                    if (targetWindow) {
                        targetWindow.postMessage({
                            type: 'MWI_GENERATE_CARD_REQUEST',
                            timestamp: Date.now()
                        }, '*');
                    } else if (window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.generateCard === 'function') {
                        await window.MWI_INTEGRATED.generateCard();
                    }
                } catch (error) {
                    const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                    const message = lang === 'zh' ? '填写数据失败: ' + error.message : 'Failed to fill data: ' + error.message;
                    alert(message);
                }
            };
            importBtn._simulatorClickHandler = clickHandler;
            importBtn.addEventListener('click', clickHandler);
            importBtn.dataset.simulatorListenerAttached = 'true';
            return true;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    if (!attachImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            });
        } else {
            setTimeout(() => {
                if (!attachImportListener()) {
                    const observer = new MutationObserver(() => {
                        if (attachImportListener()) {
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            }, 500);
        }
    }
    function initEditFormAutoFill() {
        function attachEditImportListener() {
            const importBtnSelectors = [
                '#editForm > div:nth-child(1) > button:nth-child(1)',
                '#editForm button:first-child',
                '#editForm .import-data-btn'
            ];
            let importBtn = null;
            for (const selector of importBtnSelectors) {
                importBtn = document.querySelector(selector);
                if (importBtn) {
                    break;
                }
            }
            if (!importBtn) {
                return false;
            }
            if (importBtn.dataset.editSimulatorListenerAttached) {
                importBtn.removeEventListener('click', importBtn._editSimulatorClickHandler);
            }
            const clickHandler = async function(e) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const simDataInput = document.querySelector('#editSimData');
                    if (!simDataInput) {
                        return;
                    }
                    let simulatorData = null;
                    try {
                        const storedData = GM_getValue('mwi_simulator_data', '');
                        if (storedData) {
                            simulatorData = JSON.parse(storedData);
                        }
                    } catch (e) {
                    }
                    if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                        const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                        if (typeof getSimData === 'function') {
                            simulatorData = getSimData();
                        }
                    }
                    if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                        simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                    }
                    if (!simulatorData) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                        alert(message);
                        return;
                    }
                    const dataString = JSON.stringify(simulatorData, null, 2);
                    simDataInput.value = dataString;
                    simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                    simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    let targetWindow = null;
                    if (window.opener && !window.opener.closed) {
                        targetWindow = window.opener;
                    } else if (window.parent && window.parent !== window) {
                        targetWindow = window.parent;
                    } else if (window.top && window.top !== window) {
                        targetWindow = window.top;
                    }
                    if (targetWindow) {
                        targetWindow.postMessage({
                            type: 'MWI_GENERATE_CARD_REQUEST',
                            timestamp: Date.now()
                        }, '*');
                    } else if (window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.generateCard === 'function') {
                        await window.MWI_INTEGRATED.generateCard();
                    }
                } catch (error) {
                    const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                    const message = lang === 'zh' ? '填写数据失败: ' + error.message : 'Failed to fill data: ' + error.message;
                    alert(message);
                }
            };
            importBtn._editSimulatorClickHandler = clickHandler;
            importBtn.addEventListener('click', clickHandler);
            importBtn.dataset.editSimulatorListenerAttached = 'true';
            return true;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    if (!attachEditImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachEditImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            });
        } else {
            setTimeout(() => {
                if (!attachEditImportListener()) {
                    const observer = new MutationObserver(() => {
                        if (attachEditImportListener()) {
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            }, 500);
        }
    }
    function initGuildFormAutoFill() {
        function attachGuildImportListener() {
            const importBtnSelectors = [
                '#guildForm > div:nth-child(1) > button:nth-child(1)',
                '#guildForm button:first-child',
                '#guildForm .import-data-btn'
            ];
            let importBtn = null;
            for (const selector of importBtnSelectors) {
                importBtn = document.querySelector(selector);
                if (importBtn) {
                    break;
                }
            }
            if (!importBtn) {
                return false;
            }
            if (importBtn.dataset.guildSimulatorListenerAttached) {
                importBtn.removeEventListener('click', importBtn._guildSimulatorClickHandler);
            }
            const clickHandler = async function(e) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const simDataInput = document.querySelector('#guildSimData');
                    if (!simDataInput) {
                        return;
                    }
                    let simulatorData = null;
                    try {
                        const storedData = GM_getValue('mwi_simulator_data', '');
                        if (storedData) {
                            simulatorData = JSON.parse(storedData);
                        }
                    } catch (e) {
                    }
                    if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                        const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                        if (typeof getSimData === 'function') {
                            simulatorData = getSimData();
                        }
                    }
                    if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                        simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                    }
                    if (!simulatorData) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                        alert(message);
                        return;
                    }
                    const dataString = JSON.stringify(simulatorData, null, 2);
                    simDataInput.value = dataString;
                    simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                    simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (error) {
                    alert('填写数据失败: ' + error.message);
                }
            };
            importBtn._guildSimulatorClickHandler = clickHandler;
            importBtn.addEventListener('click', clickHandler);
            importBtn.dataset.guildSimulatorListenerAttached = 'true';
            return true;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    if (!attachGuildImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachGuildImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            });
        } else {
            setTimeout(() => {
                if (!attachGuildImportListener()) {
                    const observer = new MutationObserver(() => {
                        if (attachGuildImportListener()) {
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            }, 500);
        }
    }
    function initEditGuildFormAutoFill() {
        function attachEditGuildImportListener() {
            const importBtnSelectors = [
                '#editGuildForm > div:nth-child(1) > button:nth-child(1)',
                '#editGuildForm button:first-child',
                '#editGuildForm .import-data-btn'
            ];
            let importBtn = null;
            for (const selector of importBtnSelectors) {
                importBtn = document.querySelector(selector);
                if (importBtn) {
                    break;
                }
            }
            if (!importBtn) {
                return false;
            }
            if (importBtn.dataset.editGuildSimulatorListenerAttached) {
                importBtn.removeEventListener('click', importBtn._editGuildSimulatorClickHandler);
            }
            const clickHandler = async function(e) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const simDataInput = document.querySelector('#editGuildSimData');
                    if (!simDataInput) {
                        return;
                    }
                    let simulatorData = null;
                    try {
                        const storedData = GM_getValue('mwi_simulator_data', '');
                        if (storedData) {
                            simulatorData = JSON.parse(storedData);
                        }
                    } catch (e) {
                    }
                    if (!simulatorData && window.opener && window.opener.MWI_INTEGRATED) {
                        const getSimData = window.opener.MWI_INTEGRATED.getSimulatorData;
                        if (typeof getSimData === 'function') {
                            simulatorData = getSimData();
                        }
                    }
                    if (!simulatorData && window.MWI_INTEGRATED && typeof window.MWI_INTEGRATED.getSimulatorData === 'function') {
                        simulatorData = window.MWI_INTEGRATED.getSimulatorData();
                    }
                    if (!simulatorData) {
                        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
                        const message = lang === 'zh' ? '无法获取模拟器数据\n\n请确保:\n1. 已在游戏页面加载完整数据\n2. 游戏页面已接收到WebSocket数据\n3. 刷新游戏页面后再试' : 'Unable to get simulator data\n\nPlease ensure:\n1. Data is fully loaded on game page\n2. Game page has received WebSocket data\n3. Refresh game page and try again';
                        alert(message);
                        return;
                    }
                    const dataString = JSON.stringify(simulatorData, null, 2);
                    simDataInput.value = dataString;
                    simDataInput.dispatchEvent(new Event('input', { bubbles: true }));
                    simDataInput.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (error) {
                    alert('填写数据失败: ' + error.message);
                }
            };
            importBtn._editGuildSimulatorClickHandler = clickHandler;
            importBtn.addEventListener('click', clickHandler);
            importBtn.dataset.editGuildSimulatorListenerAttached = 'true';
            return true;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    if (!attachEditGuildImportListener()) {
                        const observer = new MutationObserver(() => {
                            if (attachEditGuildImportListener()) {
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    }
                }, 500);
            });
        } else {
            setTimeout(() => {
                if (!attachEditGuildImportListener()) {
                    const observer = new MutationObserver(() => {
                        if (attachEditGuildImportListener()) {
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            }, 500);
        }
    }
    function initEditCardImageUrlAutoFill() {
        let lastProcessedTimestamp = 0;
        function fillEditCardLink(cardImageUrl, timestamp) {
            if (typeof window.__fillCardLink__ === 'function') {
                window.__fillCardLink__(cardImageUrl);
            }
            lastProcessedTimestamp = timestamp;
            cardLinkFillStatus.markFilled('edit', timestamp);
        }
        function checkAndFillEditCardLink() {
            try {
                const cardImageUrl = GM_getValue('mwi_card_image_url', '');
                const timestamp = GM_getValue('mwi_card_image_timestamp', 0);
                
                if (cardImageUrl && timestamp && timestamp !== lastProcessedTimestamp) {
                    fillEditCardLink(cardImageUrl, timestamp);
                    return;
                }
            } catch (error) {
            }
        }
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'MWI_UPLOAD_CARD_RESPONSE' && event.data.success && event.data.imageUrl) {
                const timestamp = Date.now();
                if (timestamp !== lastProcessedTimestamp) {
                    fillEditCardLink(event.data.imageUrl, timestamp);
                }
            }
        });
        IntervalManager.register('editCardImageUrlAutoFill', checkAndFillEditCardLink, 500);
        setTimeout(checkAndFillEditCardLink, 100);
    }
    window.MWI_INTEGRATED = {
        generateCard: null,
        closeCard: null,
        getData: null,
        getSimulatorData: null,
        isDataLoaded: null,
        websocketData: null
    };

    const BuildScoreModule = (function() {
        function getMarketApiUrl() {
            if (window.location.href.includes("milkywayidle.com")) return "https://www.milkywayidle.com/game_data/marketplace.json";
            if (window.location.href.includes("milkywayidlecn.com")) return "https://www.milkywayidlecn.com/game_data/marketplace.json";
            var server = GM_getValue('mwi_game_server', 'en');
            return server === 'cn' ? "https://www.milkywayidlecn.com/game_data/marketplace.json" : "https://www.milkywayidle.com/game_data/marketplace.json";
        }

        let cachedMarketData = null;
        let marketDataTimestamp = 0;
        let levelExperienceTable = null;
        let itemDetailMap = null;
        let actionDetailMap = null;
        let houseRoomDetailMap = null;

        const enhanceParams = {
            enhancing_level: 125,
            laboratory_level: 6,
            enhancer_bonus: 5.42,
            glove_bonus: 12.9,
            tea_enhancing: false,
            tea_super_enhancing: false,
            tea_ultra_enhancing: true,
            tea_blessed: true,
            priceAskBidRatio: 1,
        };

        async function fetchMarketData(forceFetch = false) {
            const now = Date.now();
            if (!forceFetch && cachedMarketData && (now - marketDataTimestamp) < 3600000) {
                return cachedMarketData;
            }

            try {
                var gmMktJson = GM_getValue('mwi_market_data_for_sim', '');
                var gmMktTs = GM_getValue('mwi_market_data_timestamp', '');
                if (!forceFetch && gmMktJson && gmMktTs && (now - parseInt(gmMktTs)) < 3600000) {
                    cachedMarketData = JSON.parse(gmMktJson);
                    marketDataTimestamp = parseInt(gmMktTs);
                    return cachedMarketData;
                }
            } catch (e) {}

            const cachedTimestamp = localStorage.getItem("MWITools_marketAPI_timestamp");
            const cachedJson = localStorage.getItem("MWITools_marketAPI_json");
            if (!forceFetch && cachedTimestamp && cachedJson && (now - parseInt(cachedTimestamp)) < 3600000) {
                try {
                    cachedMarketData = JSON.parse(cachedJson);
                    marketDataTimestamp = parseInt(cachedTimestamp);
                    return cachedMarketData;
                } catch (e) {}
            }

            const sendRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
            if (!sendRequest) return cachedMarketData;

            const response = await new Promise((resolve) => {
                sendRequest({
                    url: getMarketApiUrl(),
                    method: "GET",
                    timeout: 5000,
                    onload: resolve,
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            });

            if (response && response.status === 200) {
                const jsonObj = JSON.parse(response.responseText);
                if (jsonObj && jsonObj.marketData) {
                    jsonObj.marketData["/items/coin"] = { 0: { a: 1, b: 1 } };
                    jsonObj.marketData["/items/task_token"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/cowbell"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/small_treasure_chest"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/medium_treasure_chest"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/large_treasure_chest"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/basic_task_badge"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/advanced_task_badge"] = { 0: { a: 0, b: 0 } };
                    jsonObj.marketData["/items/expert_task_badge"] = { 0: { a: 0, b: 0 } };
                    cachedMarketData = jsonObj;
                    marketDataTimestamp = now;
                    localStorage.setItem("MWITools_marketAPI_timestamp", now.toString());
                    localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(jsonObj));
                    return jsonObj;
                }
            }
            return cachedMarketData;
        }

        function initClientData(clientData) {
            if (clientData) {
                levelExperienceTable = clientData.levelExperienceTable;
                itemDetailMap = clientData.itemDetailMap;
                actionDetailMap = clientData.actionDetailMap;
                houseRoomDetailMap = clientData.houseRoomDetailMap;
            }
        }

        function getWeightedMarketPrice(marketPrices, ratio = 0.5) {
            if (!marketPrices || !marketPrices[0]) return 0;
            let ask = marketPrices[0].a || 0;
            let bid = marketPrices[0].b || 0;
            if (ask > 0 && bid < 0) bid = ask;
            if (bid > 0 && ask < 0) ask = bid;
            return ask * ratio + bid * (1 - ratio);
        }

        async function getHouseFullBuildPrice(house) {
            const marketData = await fetchMarketData();
            if (!marketData || !houseRoomDetailMap) return 0;

            const roomDetail = houseRoomDetailMap[house.houseRoomHrid];
            if (!roomDetail || !roomDetail.upgradeCostsMap) return 0;

            let cost = 0;
            for (let i = 1; i <= house.level; i++) {
                const levelCosts = roomDetail.upgradeCostsMap[i];
                if (levelCosts) {
                    for (const item of levelCosts) {
                        const prices = marketData.marketData[item.itemHrid];
                        if (prices && prices[0]) {
                            cost += item.count * getWeightedMarketPrice(prices);
                        }
                    }
                }
            }
            return cost;
        }

        async function calculateAbilityScore(combatAbilities) {
            const marketData = await fetchMarketData();
            if (!marketData || !combatAbilities || !levelExperienceTable) return 0;

            const exp50Skills = ["poke", "scratch", "smack", "quick_shot", "water_strike", "fireball", "entangle", "minor_heal"];

            const getNeedBooksToLevel = (targetLevel, expPerBook) => {
                const needExp = levelExperienceTable[targetLevel] || 0;
                return parseFloat(((needExp / expPerBook) + 1).toFixed(1));
            };

            let totalPrice = 0;
            for (const ability of combatAbilities) {
                if (!ability || !ability.abilityHrid) continue;
                const expPerBook = exp50Skills.some(s => ability.abilityHrid.includes(s)) ? 50 : 500;
                const numBooks = getNeedBooksToLevel(ability.level, expPerBook);
                const itemHrid = ability.abilityHrid.replace("/abilities/", "/items/");
                const prices = marketData.marketData[itemHrid];
                if (prices && prices[0]) {
                    totalPrice += numBooks * getWeightedMarketPrice(prices);
                }
            }
            return totalPrice / 1000000;
        }

        function Enhancelate(itemHrid, stopAt, protectAt) {
            const successRate = [50, 45, 45, 40, 40, 40, 35, 35, 35, 35, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
            const itemLevel = itemDetailMap?.[itemHrid]?.itemLevel || 1;

            const effectiveLevel = enhanceParams.enhancing_level +
                (enhanceParams.tea_enhancing ? 3 : 0) +
                (enhanceParams.tea_super_enhancing ? 6 : 0) +
                (enhanceParams.tea_ultra_enhancing ? 8 : 0);

            let totalBonus;
            if (effectiveLevel >= itemLevel) {
                totalBonus = 1 + (0.05 * (effectiveLevel + enhanceParams.laboratory_level - itemLevel) + enhanceParams.enhancer_bonus) / 100;
            } else {
                totalBonus = 1 - 0.5 * (1 - effectiveLevel / itemLevel) + (0.05 * enhanceParams.laboratory_level + enhanceParams.enhancer_bonus) / 100;
            }

            let markov = math.zeros(20, 20);
            for (let i = 0; i < stopAt; i++) {
                const successChance = (successRate[i] / 100.0) * totalBonus;
                const destination = i >= protectAt ? i - 1 : 0;
                if (enhanceParams.tea_blessed) {
                    markov.set([i, i + 2], successChance * 0.01);
                    markov.set([i, i + 1], successChance * 0.99);
                    markov.set([i, destination], 1 - successChance);
                } else {
                    markov.set([i, i + 1], successChance);
                    markov.set([i, destination], 1.0 - successChance);
                }
            }
            markov.set([stopAt, stopAt], 1.0);

            const Q = markov.subset(math.index(math.range(0, stopAt), math.range(0, stopAt)));
            const M = math.inv(math.subtract(math.identity(stopAt), Q));
            const attemptsArray = M.subset(math.index(math.range(0, 1), math.range(0, stopAt)));
            const attempts = math.flatten(math.row(attemptsArray, 0).valueOf()).reduce((a, b) => a + b, 0);
            const protectAttempts = M.subset(math.index(math.range(0, 1), math.range(protectAt, stopAt)));
            const protectArray = typeof protectAttempts === "number" ? [protectAttempts] : math.flatten(math.row(protectAttempts, 0).valueOf());
            const protects = protectArray.map((a, i) => a * markov.get([i + protectAt, i + protectAt - 1])).reduce((a, b) => a + b, 0);

            return { actions: attempts, protectCount: protects };
        }

        function getItemMarketPrice(hrid, marketData) {
            const priceData = marketData?.marketData?.[hrid];
            if (!priceData || !priceData[0]) return 0;
            let ask = priceData[0].a || 0;
            let bid = priceData[0].b || 0;
            if (ask > 0 && bid < 0) bid = ask;
            if (bid > 0 && ask < 0) ask = bid;
            return ask * enhanceParams.priceAskBidRatio + bid * (1 - enhanceParams.priceAskBidRatio);
        }

        function getActionHridFromItemName(name) {
            let newName = name.replace("Milk", "Cow");
            newName = newName.replace("Log", "Tree");
            newName = newName.replace("Cowing", "Milking");
            newName = newName.replace("Rainbow Cow", "Unicow");
            newName = newName.replace("Collector's Boots", "Collectors Boots");
            newName = newName.replace("Knight's Aegis", "Knights Aegis");

            if (!actionDetailMap) return null;

            for (const action of Object.values(actionDetailMap)) {
                if (action.name === newName) {
                    return action.hrid;
                }
            }
            return null;
        }

        function getBaseItemProductionCost(itemName, marketData) {
            const actionHrid = getActionHridFromItemName(itemName);
            if (!actionHrid || !actionDetailMap || !actionDetailMap[actionHrid]) {
                return -1;
            }

            let totalPrice = 0;
            const inputItems = JSON.parse(JSON.stringify(actionDetailMap[actionHrid].inputItems || []));

            for (let item of inputItems) {
                totalPrice += getItemMarketPrice(item.itemHrid, marketData) * item.count;
            }
            totalPrice *= 0.9;

            const upgradedFromItemHrid = actionDetailMap[actionHrid]?.upgradeItemHrid;
            if (upgradedFromItemHrid) {
                totalPrice += getItemMarketPrice(upgradedFromItemHrid, marketData) * 1;
            }

            return totalPrice;
        }

        function getRealisticBaseItemPrice(hrid, marketData) {
            const itemDetail = itemDetailMap?.[hrid];
            if (!itemDetail) return 0;

            const productionCost = getBaseItemProductionCost(itemDetail.name, marketData);
            const priceData = marketData?.marketData?.[hrid];
            const ask = priceData?.[0]?.a || 0;
            const bid = priceData?.[0]?.b || 0;

            let result = 0;

            if (ask > 0) {
                if (bid > 0) {
                    if (ask / bid > 1.3) {
                        result = Math.max(bid, productionCost);
                    } else {
                        result = ask;
                    }
                } else {
                    if (productionCost > 0 && ask / productionCost > 1.3) {
                        result = productionCost;
                    } else {
                        result = Math.max(ask, productionCost);
                    }
                }
            } else {
                if (bid > 0) {
                    result = Math.max(bid, productionCost);
                } else {
                    result = productionCost > 0 ? productionCost : 0;
                }
            }

            return result;
        }

        function getCosts(hrid, marketData) {
            const detail = itemDetailMap?.[hrid];
            if (!detail) return null;

            const baseCost = getRealisticBaseItemPrice(hrid, marketData);
            const protectHrids = detail.protectionItemHrids 
                ? [hrid, "/items/mirror_of_protection", ...detail.protectionItemHrids]
                : [hrid, "/items/mirror_of_protection"];

            let minProtectCost = getRealisticBaseItemPrice(protectHrids[0], marketData);
            for (let i = 1; i < protectHrids.length; i++) {
                const cost = getRealisticBaseItemPrice(protectHrids[i], marketData);
                if (cost > 0 && (minProtectCost <= 0 || cost < minProtectCost)) {
                    minProtectCost = cost;
                }
            }

            let perActionCost = 0;
            if (detail.enhancementCosts) {
                for (const need of detail.enhancementCosts) {
                    const price = need.itemHrid.startsWith("/items/trainee_") ? 250000 : getRealisticBaseItemPrice(need.itemHrid, marketData);
                    perActionCost += price * need.count;
                }
            }

            return { baseCost, minProtectCost, perActionCost };
        }

        async function findBestEnhanceStrat(itemHrid, stopAt) {
            const marketData = await fetchMarketData();
            if (!marketData || !itemDetailMap) return null;

            let best = null;
            for (let protectAt = 2; protectAt <= stopAt; protectAt++) {
                const sim = Enhancelate(itemHrid, stopAt, protectAt);
                const costs = getCosts(itemHrid, marketData);
                if (!costs) continue;
                const totalCost = costs.baseCost + costs.minProtectCost * sim.protectCount + costs.perActionCost * sim.actions;
                if (!best || totalCost < best.totalCost) {
                    best = { protectAt, totalCost };
                }
            }
            return best;
        }

        async function findBestEnhanceStratWithPhiMirror(itemHrid, stopAt) {
            const marketData = await fetchMarketData();
            if (!marketData || !itemDetailMap) return null;

            let best = await findBestEnhanceStrat(itemHrid, stopAt);
            if (!best) return best;

            const pMirrorHrid = "/items/philosophers_mirror";
            const pMirrorCost = getItemMarketPrice(pMirrorHrid, marketData);
            if (pMirrorCost <= 0) return best;

            if (stopAt <= 3) return best;

            const keyRefined = "_refined";
            const isRefined = itemHrid.includes(keyRefined);
            const baseItemHrid = isRefined ? itemHrid.replace(keyRefined, "") : itemHrid;

            const lowerBest = {};
            const lowestAt = 9;
            for (let i = lowestAt; i < stopAt; i++) {
                lowerBest[i] = await findBestEnhanceStrat(baseItemHrid, i);
            }

            let refinedCost = 0;
            if (isRefined && actionDetailMap) {
                const itemDetail = itemDetailMap[itemHrid];
                if (itemDetail) {
                    const actionHrid = getActionHridFromItemName(itemDetail.name);
                    if (actionHrid && actionDetailMap[actionHrid]?.inputItems) {
                        for (const item of actionDetailMap[actionHrid].inputItems) {
                            refinedCost += getItemMarketPrice(item.itemHrid, marketData) * item.count;
                        }
                    }
                }
            }

            const fibonacci = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181];

            for (let protectAt = lowestAt + 1; protectAt < stopAt; protectAt++) {
                if (!lowerBest[protectAt] || !lowerBest[protectAt - 1]) continue;

                const baseCount = fibonacci[stopAt - protectAt + 1];
                const inputCount = fibonacci[stopAt - protectAt];
                const protectCount = baseCount + inputCount - 1;

                const totalCost = baseCount * lowerBest[protectAt].totalCost + inputCount * lowerBest[protectAt - 1].totalCost + pMirrorCost * protectCount + refinedCost;

                if (totalCost < best.totalCost) {
                    best = { protectAt, totalCost };
                }
            }
            return best;
        }

        async function calculateEquipmentScore(characterItems) {
            const marketData = await fetchMarketData();
            if (!marketData || !characterItems) return 0;

            let totalValue = 0;
            for (const item of characterItems) {
                if (item.itemLocationHrid === "/item_locations/inventory") continue;

                const enhanceLevel = item.enhancementLevel || 0;
                const prices = marketData.marketData[item.itemHrid];

                if (enhanceLevel > 1) {
                    const best = await findBestEnhanceStratWithPhiMirror(item.itemHrid, enhanceLevel);
                    if (best) {
                        var roundedCost = best.totalCost ? Math.round(best.totalCost) : 0;
                        totalValue += item.count * roundedCost;
                    }
                } else if (prices && prices[0]) {
                    const ask = prices[0].a > 0 ? prices[0].a : 0;
                    const bid = prices[0].b > 0 ? prices[0].b : 0;
                    totalValue += item.count * (ask * 0.5 + bid * 0.5);
                }
            }
            return totalValue / 1000000;
        }

        async function calculateBuildScore(characterData) {
            if (!characterData) return null;

            const battleHouses = ["dining_room", "library", "dojo", "gym", "armory", "archery_range", "mystical_study"];
            let houseScore = 0;

            if (characterData.characterHouseRoomMap) {
                for (const key in characterData.characterHouseRoomMap) {
                    const house = characterData.characterHouseRoomMap[key];
                    if (battleHouses.some(h => house.houseRoomHrid.includes(h))) {
                        houseScore += await getHouseFullBuildPrice(house) / 1000000;
                    }
                }
            }

            const combatAbilities = characterData.combatUnit?.combatAbilities || [];
            const abilityScore = await calculateAbilityScore(combatAbilities);

            const equipmentScore = await calculateEquipmentScore(characterData.characterItems || []);

            const totalScore = houseScore + abilityScore + equipmentScore;

            return {
                total: parseFloat(totalScore.toFixed(1)),
                house: parseFloat(houseScore.toFixed(1)),
                ability: parseFloat(abilityScore.toFixed(1)),
                equipment: parseFloat(equipmentScore.toFixed(1))
            };
        }

        return {
            initClientData,
            fetchMarketData,
            calculateBuildScore
        };
    })();

    const DataStore = {
        raw: null,
        characterSkills: null,
        characterItems: null,
        characterAbilities: null,
        combatUnit: null,
        characterHouseRoomMap: null,
        currentEquipmentMap: {},
        currentActions: [],
        combatSetup: null,
        actionTypeFoodSlotsMap: null,
        actionTypeDrinkSlotsMap: null,
        abilityCombatTriggersMap: null,
        consumableCombatTriggersMap: null,
        characterName: null,
        totalLevel: null,
        buildScore: null,
        weaponType: null,
        weaponTypeEN: null,
        combatLevel: null,
        guildName: null,
        guildLevel: null,
        guildMembers: null,
        characterId: null,
        nameColor: null,
        nameColorHrid: null,
        nameElementHTML: null,
        chatIconHrid: null,
        supporterBadgeHrid: null,
        profileIconHrid: null,
        avatarHrid: null,
        outfitHrid: null,
        itemDetailMap: null,
        actionDetailMap: null,
        abilityDetailMap: null,
        achievementDetailMap: null,
        achievementTierDetailMap: null,
        characterAchievements: null,
        isLoaded: false,
        hookInstalled: false,
        dataLoadedOnce: false,
        gameMode: null,
        partyInfo: null,
        sharableCharacterMap: null,
        wsConnection: null,
        pendingSentMessages: [],
        profileMap: {},
        profileRequestTemplate: null,
        suppressProfileUI: false
    };

    const WebSocketHook = {
        install() {
            if (DataStore.hookInstalled) {
                return false;
            }
            
            this.hookSend();
            
            window.addEventListener('mwi_websocket_data', (e) => {
                if (e.detail && e.detail.rawMessage) {
                    this.handleMessage(e.detail.rawMessage);
                }
            });
            
            try {
                const descriptor = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
                if (!descriptor || !descriptor.get) {
                    DataStore.hookInstalled = true;
                    return false;
                }
                const originalGetter = descriptor.get;
                
                if (originalGetter._MWI_HOOKED || originalGetter._MWI_INTEGRATED_HOOKED) {
                    DataStore.hookInstalled = true;
                    return false;
                }
                
                descriptor.get = function interceptData() {
                    const ws = this.currentTarget;
                    if (!(ws instanceof WebSocket)) {
                        return originalGetter.call(this);
                    }
                    const isMWIWebSocket = ws.url && (
                        ws.url.includes("api.milkywayidle.com/ws") ||
                        ws.url.includes("api-test.milkywayidle.com/ws") ||
                        ws.url.includes("api.milkywayidlecn.com/ws") ||
                        ws.url.includes("api-test.milkywayidlecn.com/ws")
                    );
                    if (!isMWIWebSocket) {
                        return originalGetter.call(this);
                    }
                    if (!DataStore.wsConnection || DataStore.wsConnection.readyState !== WebSocket.OPEN) {
                        DataStore.wsConnection = ws;
                    }
                    const rawMessage = originalGetter.call(this);
                    try {
                        Object.defineProperty(this, "data", {
                            value: rawMessage,
                            writable: false,
                            configurable: true
                        });
                    } catch (e) {}
                    
                    try {
                        window.dispatchEvent(new CustomEvent('mwi_websocket_data', {
                            detail: { rawMessage: rawMessage }
                        }));
                    } catch (e) {}
                    
                    WebSocketHook.handleMessage(rawMessage);
                    return rawMessage;
                };
                
                descriptor.get._MWI_HOOKED = true;
                descriptor.get._MWI_INTEGRATED_HOOKED = true;
                
                try {
                    Object.defineProperty(MessageEvent.prototype, "data", descriptor);
                } catch (e) {
                    DataStore.hookInstalled = true;
                    return false;
                }
                DataStore.hookInstalled = true;
                return true;
            } catch (error) {
                DataStore.hookInstalled = true;
                return false;
            }
        },
        hookSend() {
            const origSend = WebSocket.prototype.send;
            if (origSend._MWI_TM_SEND_HOOKED) return;
            WebSocket.prototype.send = function (data) {
                const isMWI = this.url && (
                    this.url.includes("api.milkywayidle.com/ws") ||
                    this.url.includes("api-test.milkywayidle.com/ws") ||
                    this.url.includes("api.milkywayidlecn.com/ws") ||
                    this.url.includes("api-test.milkywayidlecn.com/ws")
                );
                if (isMWI) {
                    if (!DataStore.wsConnection || DataStore.wsConnection.readyState !== WebSocket.OPEN) {
                        DataStore.wsConnection = this;
                    }
                    try {
                        const msg = JSON.parse(data);
                        DataStore.pendingSentMessages.push({ msg, timestamp: Date.now() });
                        if (DataStore.pendingSentMessages.length > 20) {
                            DataStore.pendingSentMessages.shift();
                        }
                    } catch (e) { }
                }
                return origSend.call(this, data);
            };
            WebSocket.prototype.send._MWI_TM_SEND_HOOKED = true;
        },
        _simDataSaveTimer: null,
        _debouncedSaveSimData(delay) {
            const self = this;
            if (self._simDataSaveTimer) clearTimeout(self._simDataSaveTimer);
            self._simDataSaveTimer = setTimeout(() => {
                self._simDataSaveTimer = null;
                try {
                    const simulatorData = self.generateSimulatorData();
                    if (simulatorData) {
                        GM_setValue('mwi_simulator_data', JSON.stringify(simulatorData));
                    }
                } catch (e) {}
            }, delay || 300);
        },
        handleMessage(rawMessage) {
            try {
                const data = JSON.parse(rawMessage);
                switch (data.type) {
                    case "init_character_data":
                        this.processCharacterData(data);
                        DataStore.dataLoadedOnce = true;
                        break;
                    case "init_client_data":
                        if (!DataStore.dataLoadedOnce) this.processClientData(data);
                        break;
                    case "items_updated":
                        this.updateItems(data);
                        break;
                    case "profile_shared":
                        this.storeProfile(data);
                        break;
                    case "actions_updated":
                        if (DataStore.isLoaded && data.characterActions) {
                            DataStore.currentActions = data.characterActions;
                        }
                        break;
                    case "party_updated":
                        if (DataStore.isLoaded) {
                            DataStore.partyInfo = data.partyInfo || DataStore.partyInfo;
                            if (data.partyInfo?.sharableCharacterMap) {
                                DataStore.sharableCharacterMap = data.partyInfo.sharableCharacterMap;
                            }
                        }
                        break;
                    default:
                        break;
                }
            } catch (error) {
            }
        },
        processCharacterData(data) {
            DataStore.raw = data;
            DataStore.characterSkills = data.characterSkills || [];
            DataStore.characterItems = data.characterItems || [];
            DataStore.characterAbilities = data.characterAbilities || [];
            DataStore.combatUnit = data.combatUnit || null;
            DataStore.characterHouseRoomMap = data.characterHouseRoomMap || {};
            DataStore.currentActions = data.characterActions || [];
            DataStore.combatSetup = data.characterCombatSetup || null;
            DataStore.actionTypeFoodSlotsMap = data.actionTypeFoodSlotsMap || {};
            DataStore.actionTypeDrinkSlotsMap = data.actionTypeDrinkSlotsMap || {};
            DataStore.abilityCombatTriggersMap = data.abilityCombatTriggersMap || {};
            DataStore.consumableCombatTriggersMap = data.consumableCombatTriggersMap || {};
            DataStore.characterName = data.characterName || 
                                     data.character?.name || 
                                     data.combatUnit?.name ||
                                     this.getNameFromDOM() ||
                                     "Unknown Adventurer";
            DataStore.characterId = data.character?.id || null;
            DataStore.gameMode = data.gameMode || data.character?.gameMode || null;
            DataStore.nameColor = null;
            DataStore.nameColorHrid = data.character?.nameColorHrid || null;
            DataStore.chatIconHrid = data.character?.chatIconHrid || null;
            DataStore.supporterBadgeHrid = data.character?.specialChatIconHrid || null;
            DataStore.profileIconHrid = data.character?.profileIconHrid || null;
            DataStore.avatarHrid = data.character?.avatarHrid || null;
            DataStore.outfitHrid = data.character?.avatarOutfitHrid || null;
            DataStore.characterAchievements = data.characterAchievements || [];
            const host = location.hostname;
            const apiUrls = host.includes('test.milkywayidlecn') ? ['https://api-test.milkywayidlecn.com/v1/users/me']
                : host.includes('milkywayidlecn') ? ['https://api.milkywayidlecn.com/v1/users/me']
                : host.includes('test.milkywayidle') ? ['https://api-test.milkywayidle.com/v1/users/me']
                : ['https://api.milkywayidle.com/v1/users/me'];
            const tryFetch = (index = 0) => {
                if (index >= apiUrls.length) return;
                fetch(apiUrls[index], { credentials: 'include' })
                    .then(r => {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(apiData => {
                        if (apiData?.characters) {
                            const char = apiData.characters.find(c => c.name === DataStore.characterName);
                            if (char) {
                                DataStore.chatIconHrid = char.chatIconHrid || DataStore.chatIconHrid;
                                DataStore.supporterBadgeHrid = char.specialChatIconHrid || DataStore.supporterBadgeHrid;
                                DataStore.avatarHrid = char.avatarHrid || DataStore.avatarHrid;
                                DataStore.outfitHrid = char.avatarOutfitHrid || DataStore.outfitHrid;
                                DataStore.nameColorHrid = char.nameColorHrid || DataStore.nameColorHrid;
                                DataStore.gameMode = char.gameMode || DataStore.gameMode;
                                this._debouncedSaveSimData();
                            }
                        }
                    })
                    .catch(() => tryFetch(index + 1));
            };
            tryFetch();
            DataStore.guildName = data.guild?.name || null;
            DataStore.guildLevel = data.guild?.level || null;
            DataStore.guildMembers = data.guildCharacterMap ? Object.keys(data.guildCharacterMap).length : null;
            DataStore.totalLevel = null;
            DataStore.buildScore = null;
            const self = this;
            const checkTotalLevel = (attempt = 0, maxAttempts = 10) => {
                const totalLevelElem = document.querySelector('.Header_totalLevel__8LY3Q');
                if (totalLevelElem) {
                    const match = totalLevelElem.textContent.match(/(\d+)/);
                    if (match) {
                        DataStore.totalLevel = parseInt(match[1]);
                        window.dispatchEvent(new CustomEvent('mwi_totallevel_updated', { detail: { totalLevel: DataStore.totalLevel } }));
                        self._debouncedSaveSimData();
                        return;
                    }
                }
                if (attempt < maxAttempts) {
                    setTimeout(() => checkTotalLevel(attempt + 1, maxAttempts), 500);
                }
            };
            setTimeout(() => checkTotalLevel(), 1500);
            const nameColorHrid = data.character?.nameColorHrid || null;
            DataStore.nameElementHTML = null;
            if (nameColorHrid || DataStore.characterName) {
                setTimeout(() => {
                    const nameContainer = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                                         document.querySelector('[class*="CharacterName_characterName"]');
                    if (nameContainer) {
                        const nameLink = nameContainer.querySelector('a') || nameContainer;
                        const computedStyle = window.getComputedStyle(nameLink);
                        const extractedColor = computedStyle.color;
                        if (extractedColor && extractedColor !== 'rgb(255, 255, 255)' && extractedColor !== 'rgb(0, 0, 0)') {
                            DataStore.nameColor = extractedColor;
                            self._debouncedSaveSimData();
                        }
                        const clonedContainer = nameContainer.cloneNode(true);
                        const chatIcon = clonedContainer.querySelector('.CharacterName_chatIcon__22lxV') ||
                                        clonedContainer.querySelector('[class*="CharacterName_chatIcon"]');
                        if (chatIcon) chatIcon.remove();
                        const clickableElements = clonedContainer.querySelectorAll('a, [href]');
                        clickableElements.forEach(el => {
                            if (el.tagName.toLowerCase() === 'a') {
                                const span = document.createElement('span');
                                span.innerHTML = el.innerHTML;
                                if (el.className) span.className = el.className;
                                if (el.style.cssText) span.style.cssText = el.style.cssText;
                                el.replaceWith(span);
                            } else {
                                el.removeAttribute('href');
                            }
                        });
                        DataStore.nameElementHTML = clonedContainer.outerHTML;
                    }
                }, 2000);
            }
            DataStore.partyInfo = data.partyInfo || null;
            DataStore.sharableCharacterMap = data.partyInfo?.sharableCharacterMap || null;
            DataStore.currentEquipmentMap = {};
            DataStore.characterItems.forEach(item => {
                if (item.itemLocationHrid && item.itemLocationHrid !== "/item_locations/inventory") {
                    DataStore.currentEquipmentMap[item.itemLocationHrid] = item;
                }
            });
            const weaponInfo = getWeapon(DataStore.currentEquipmentMap);
            DataStore.weaponType = weaponInfo.zh;
            DataStore.weaponTypeEN = weaponInfo.en;
            DataStore.combatLevel = DataStore.combatUnit?.combatLevel || null;
            if (DataStore.combatLevel === null && DataStore.characterSkills) {
                const stamina = DataStore.characterSkills.find(s => s.skillHrid === '/skills/stamina')?.level || 0;
                const intelligence = DataStore.characterSkills.find(s => s.skillHrid === '/skills/intelligence')?.level || 0;
                const attack = DataStore.characterSkills.find(s => s.skillHrid === '/skills/attack')?.level || 0;
                const defense = DataStore.characterSkills.find(s => s.skillHrid === '/skills/defense')?.level || 0;
                const melee = DataStore.characterSkills.find(s => s.skillHrid === '/skills/melee')?.level || 0;
                const ranged = DataStore.characterSkills.find(s => s.skillHrid === '/skills/ranged')?.level || 0;
                const magic = DataStore.characterSkills.find(s => s.skillHrid === '/skills/magic')?.level || 0;
                const maxCombatSkill = Math.max(melee, ranged, magic);
                const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
                DataStore.combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
            }
            DataStore.isLoaded = true;
            try { GM_setValue("bt_auth_name", DataStore.characterName); } catch (e) { }
            btRestoreAutoUploadState();
            window.MWI_INTEGRATED.websocketData = data;
            this._debouncedSaveSimData(0);
            window.dispatchEvent(new CustomEvent("mwi_data_ready", {
                detail: { characterName: DataStore.characterName, dataLoaded: true }
            }));
            if (DataStore.itemDetailMap) {
                const self = this;
                (async () => {
                    try {
                        const scoreResult = await BuildScoreModule.calculateBuildScore(DataStore.raw);
                        if (scoreResult) {
                            DataStore.buildScore = scoreResult.total;
                            window.dispatchEvent(new CustomEvent('mwi_buildscore_updated', { detail: { buildScore: DataStore.buildScore } }));
                            self._debouncedSaveSimData();
                        }
                    } catch (e) {}
                })();
            }
        },
        processClientData(data) {
            DataStore.itemDetailMap = data.itemDetailMap || null;
            DataStore.actionDetailMap = data.actionDetailMap || null;
            DataStore.abilityDetailMap = data.abilityDetailMap || null;
            DataStore.achievementDetailMap = data.achievementDetailMap || null;
            DataStore.achievementTierDetailMap = data.achievementTierDetailMap || null;
            BuildScoreModule.initClientData(data);
            try {
                const clientDataForSim = {
                    levelExperienceTable: data.levelExperienceTable || null,
                    itemDetailMap: data.itemDetailMap || null,
                    actionDetailMap: data.actionDetailMap || null,
                    houseRoomDetailMap: data.houseRoomDetailMap || null
                };
                GM_setValue('mwi_client_data_for_sim', LZString.compressToUTF16(JSON.stringify(clientDataForSim)));
            } catch (e) { /* silent */ }
            if (DataStore.raw) {
                const self = this;
                (async () => {
                    try {
                        const scoreResult = await BuildScoreModule.calculateBuildScore(DataStore.raw);
                        if (scoreResult) {
                            DataStore.buildScore = scoreResult.total;
                            window.dispatchEvent(new CustomEvent('mwi_buildscore_updated', { detail: { buildScore: DataStore.buildScore } }));
                            self._debouncedSaveSimData();
                        }
                    } catch (e) {}
                })();
            }
        },
        updateItems(data) {
            if (!DataStore.isLoaded || !data.characterItems) return;
            DataStore.characterItems = data.characterItems;
            DataStore.currentEquipmentMap = {};
            DataStore.characterItems.forEach(item => {
                if (item.itemLocationHrid && item.itemLocationHrid !== "/item_locations/inventory") {
                    DataStore.currentEquipmentMap[item.itemLocationHrid] = item;
                }
            });
            const weaponInfo = getWeapon(DataStore.currentEquipmentMap);
            DataStore.weaponType = weaponInfo.zh;
            DataStore.weaponTypeEN = weaponInfo.en;
        },
        getNameFromDOM() {
            const selectors = [
                '.CharacterName_characterName__2FqyZ',
                '.Header_name__227rJ',
                '.character-name',
                '.player-name'
            ];
            for (const selector of selectors) {
                const elem = document.querySelector(selector);
                if (elem?.textContent?.trim()) return elem.textContent.trim();
            }
            return null;
        },
        generateSimulatorData() {
            if (!DataStore.characterSkills) {
                return null;
            }
            const foodSlots = (DataStore.actionTypeFoodSlotsMap || {})["/action_types/combat"] || [];
            const drinkSlots = (DataStore.actionTypeDrinkSlotsMap || {})["/action_types/combat"] || [];
            const mapSlots = (slots) => slots.map(slot => ({ itemHrid: slot?.itemHrid || "" }));
            const food = { "/action_types/combat": mapSlots(foodSlots) };
            const drinks = { "/action_types/combat": mapSlots(drinkSlots) };
            const abilities = Array(5).fill({ abilityHrid: "", level: "1" });
            const combatAbilities = DataStore.combatUnit?.combatAbilities || [];
            let normalIdx = 1;
            combatAbilities.forEach(ability => {
                if (!ability) return;
                const detail = DataStore.abilityDetailMap?.[ability.abilityHrid];
                const idx = detail?.isSpecialAbility ? 0 : (normalIdx < abilities.length ? normalIdx++ : -1);
                if (idx >= 0) {
                    abilities[idx] = { abilityHrid: ability.abilityHrid, level: ability.level };
                }
            });
            const triggerMap = Object.assign(
                {}, 
                DataStore.abilityCombatTriggersMap || {}, 
                DataStore.consumableCombatTriggersMap || {}
            );
            const productionTools = [
                "/item_locations/woodcutting_tool",
                "/item_locations/foraging_tool",
                "/item_locations/milking_tool",
                "/item_locations/cheesesmithing_tool",
                "/item_locations/crafting_tool",
                "/item_locations/tailoring_tool",
                "/item_locations/cooking_tool",
                "/item_locations/brewing_tool",
                "/item_locations/alchemy_tool",
                "/item_locations/enhancing_tool"
            ];
            const getSkillLevel = (skillHrid) => {
                return DataStore.characterSkills?.find(s => s.skillHrid === skillHrid)?.level || 0;
            };
            const meleeLevel = getSkillLevel("/skills/melee");
            const rangedLevel = getSkillLevel("/skills/ranged");
            const magicLevel = getSkillLevel("/skills/magic");
            return {
                player: {
                    defenseLevel: getSkillLevel("/skills/defense"),
                    magicLevel: magicLevel,
                    attackLevel: getSkillLevel("/skills/attack"),
                    intelligenceLevel: getSkillLevel("/skills/intelligence"),
                    staminaLevel: getSkillLevel("/skills/stamina"),
                    meleeLevel: meleeLevel,
                    rangedLevel: rangedLevel,
                    equipment: Object.entries(DataStore.currentEquipmentMap)
                        .filter(([location]) => !productionTools.includes(location))
                        .map(([location, item]) => ({
                            itemLocationHrid: location,
                            itemHrid: item.itemHrid,
                            enhancementLevel: item.enhancementLevel || 0
                        }))
                },
                food: food,
                drinks: drinks,
                abilities: abilities,
                triggerMap: triggerMap,
                houseRooms: Object.fromEntries(
                    Object.entries(DataStore.characterHouseRoomMap || {}).map(([hrid, data]) => [hrid, data.level || 0])
                ),
                characterName: DataStore.characterName || "Unknown Adventurer",
                totalLevel: DataStore.totalLevel || null,
                buildScore: DataStore.buildScore || null,
                combatLevel: DataStore.combatLevel || null,
                weaponType: DataStore.weaponTypeEN || null,
                guildName: DataStore.guildName || null,
                guildLevel: DataStore.guildLevel || null,
                guildMembers: DataStore.guildMembers || null,
                nameColorHrid: DataStore.nameColorHrid || null,
                chatIconHrid: DataStore.chatIconHrid || null,
                supporterBadgeHrid: DataStore.supporterBadgeHrid || null,
                gameMode: DataStore.gameMode || null
            };
        },
        storeProfile(data) {
            if (!data.profile?.characterSkills?.[0]?.characterID) return;
            const charID = data.profile.characterSkills[0].characterID;
            const charName = data.profile.sharableCharacter?.name || "Unknown";
            DataStore.profileMap[charID] = { characterID: charID, characterName: charName, profile: data.profile, timestamp: Date.now() };
            const wt = getWeapon(data.profile?.wearableItemMap);
            btCacheWeaponType(charID, charName, wt?.en || null);
            try {
                GM_xmlhttpRequest({ 
                    method: "POST", 
                    url: SITE_URL + "/api/teams/player", 
                    headers: { "Content-Type": "application/json" }, 
                    data: JSON.stringify({ characterId: charID, playerName: charName, weaponType: wt?.en || '' }), 
                    onload(r) { }, 
                    onerror(e) { } 
                });
            } catch (e) { }
        }
    };

    const BT_WEAPON_LISTS = {
        bow: ["gobo_shooter", "cursed_bow", "cursed_bow_refined"],
        water: ["rippling_trident", "rippling_trident_refined", "frost_staff", "frost_staff_refined"],
        fire: ["gobo_boomstick", "blazing_trident", "blazing_trident_refined", "infernal_battlestaff", "infernal_battlestaff_refined"],
        nature: ["jackalope_staff", "jackalope_staff_refined", "blooming_trident", "blooming_trident_refined"],
        sword: ["gobo_slasher", "werewolf_slasher", "werewolf_slasher_refined"],
        mace: ["gobo_smasher", "granite_bludgeon", "granite_bludgeon_refined", "chaotic_flail", "chaotic_flail_refined"],
        spear: ["gobo_stabber"],
        bulwark: ["griffin_bulwark", "griffin_bulwark_refined", "spiked_bulwark", "spiked_bulwark_refined"]
    };
    function btGetItemHridBySlot(map, slot) {
        const d = map[slot]?.itemHrid;
        if (d) return d;
        for (const k in map) { if (map[k].itemLocationHrid === slot) return map[k].itemHrid; }
        return null;
    }
    function getWeapon(wearableItemMap) {
        if (!wearableItemMap) return { zh: null, en: null };
        const weaponTypeMap = {
            "水法": "Water",
            "火法": "Fire",
            "自然法": "Nature",
            "弓": "Bow",
            "弩": "Crossbow",
            "盾": "Bulwark",
            "枪": "Spear",
            "锤": "Flail",
            "剑": "Sword"
        };
        const oh = btGetItemHridBySlot(wearableItemMap, '/item_locations/off_hand');
        if (oh) {
            const offWeapon = oh.includes('/') ? oh.split('/').pop() : oh;
            if (offWeapon && (offWeapon.includes("_bulwark") || BT_WEAPON_LISTS.bulwark.includes(offWeapon))) {
                return { zh: "盾", en: "Bulwark" };
            }
        }
        const h = btGetItemHridBySlot(wearableItemMap, '/item_locations/main_hand') || btGetItemHridBySlot(wearableItemMap, '/item_locations/two_hand');
        if (!h) return { zh: null, en: null };
        const weapon = h.includes('/') ? h.split('/').pop() : h;
        if (!weapon) return { zh: null, en: null };
        let typeZH = null;
        if (weapon.includes("_bow") || BT_WEAPON_LISTS.bow.includes(weapon)) {
            typeZH = "弓";
        } else if (weapon.includes("_crossbow")) {
            typeZH = "弩";
        } else if (weapon.includes("_water_staff") || BT_WEAPON_LISTS.water.includes(weapon)) {
            typeZH = "水法";
        } else if (weapon.includes("_fire_staff") || BT_WEAPON_LISTS.fire.includes(weapon)) {
            typeZH = "火法";
        } else if (weapon.includes("_nature_staff") || BT_WEAPON_LISTS.nature.includes(weapon)) {
            typeZH = "自然法";
        } else if (weapon.includes("_sword") || BT_WEAPON_LISTS.sword.includes(weapon)) {
            if (weapon === "cheese_sword") return { zh: null, en: null };
            typeZH = "剑";
        } else if (weapon.includes("_mace") || BT_WEAPON_LISTS.mace.includes(weapon)) {
            typeZH = "锤";
        } else if (weapon.includes("_spear") || BT_WEAPON_LISTS.spear.includes(weapon)) {
            typeZH = "枪";
        } else if (weapon.includes("_bulwark") || BT_WEAPON_LISTS.bulwark.includes(weapon)) {
            typeZH = "盾";
        }
        return {
            zh: typeZH,
            en: typeZH ? weaponTypeMap[typeZH] : null
        };
    }
    // ==================== Persistent Weapon Cache ====================
    const BT_WEAPON_CACHE_KEY = 'mwi_bt_weapon_cache';
    let btWeaponCache = {};
    try { btWeaponCache = JSON.parse(GM_getValue(BT_WEAPON_CACHE_KEY, '{}')); } catch (e) { btWeaponCache = {}; }
    function btSaveWeaponCache() {
        try { GM_setValue(BT_WEAPON_CACHE_KEY, JSON.stringify(btWeaponCache)); } catch (e) {}
    }
    function btCacheWeaponType(characterID, characterName, weaponType) {
        btWeaponCache[characterID] = { name: characterName, weapon: weaponType, ts: Date.now() };
        btSaveWeaponCache();
    }
    function btGetCachedWeaponType(characterID) {
        return btWeaponCache[characterID]?.weapon || null;
    }
    function btGetMissingMembers() {
        const psm = DataStore.partyInfo?.partySlotMap;
        if (!psm) return [];
        const missing = [];
        for (const m of Object.values(psm)) {
            if (!m.characterID || m.characterID === DataStore.characterId) continue;
            if (DataStore.profileMap[m.characterID] || btWeaponCache[m.characterID]) continue;
            const sc = DataStore.sharableCharacterMap?.[m.characterID] || DataStore.sharableCharacterMap?.[String(m.characterID)];
            missing.push(sc?.name || 'Unknown');
        }
        return missing;
    }
    function btRestoreAutoUploadState() {
        if (GM_getValue('mwi_upload_team_disabled', false)) return;
        BattleTeamsModule.startAutoUpload();
    }

    const BattleTeamsModule = (() => {
        const UPLOAD_URL = SITE_URL + "/api/teams/upload";
        const AUTO_INTERVAL_MS = 90 * 60 * 1000;
        const ADZ = ['pirate_cove', 'enchanted_fortress', 'sinister_circus', 'chimerical_den'];
        let autoUploadTimer = null;

        function getMemberName(characterID) {
            const p = DataStore.profileMap[characterID];
            if (p) return p.characterName;
            const sm = DataStore.sharableCharacterMap;
            const sc = sm?.[characterID] || sm?.[String(characterID)];
            return sc?.name || "Unknown";
        }

        function buildTeamExportData() {
            if (!DataStore.isLoaded) return { error: "Game data not loaded" };
            const psm = DataStore.partyInfo?.partySlotMap;
            const members = [];
            let zone = "", difficulty = "";
            if (psm) {
                zone = DataStore.partyInfo?.party?.actionHrid || "";
                const dt = DataStore.partyInfo?.party?.difficultyTier;
                difficulty = (dt != null) ? "T" + dt : "";
            }
            if (!zone) {
                const combatAction = (DataStore.currentActions || []).find(a => a?.actionHrid?.includes("/actions/combat/"));
                if (combatAction) {
                    zone = combatAction.actionHrid;
                    difficulty = (combatAction.difficultyTier != null) ? "T" + combatAction.difficultyTier : "";
                }
            }
            const selfWeapon = getWeapon(DataStore.currentEquipmentMap).en;
            if (!psm) {
                if (!zone) zone = 'solo';
                members.push({ slot: 1, player_name: DataStore.characterName, weapon_type: selfWeapon, weapon_ts: Date.now() });
            } else {
                if (!zone) return { error: "Not in combat" };
                let si = 1;
                for (const m of Object.values(psm)) {
                    if (!m.characterID) { si++; continue; }
                    if (String(m.characterID) === String(DataStore.characterId)) {
                        members.push({ slot: si, player_name: DataStore.characterName, weapon_type: selfWeapon, weapon_ts: Date.now() });
                    } else {
                        const p = DataStore.profileMap[m.characterID];
                        const mwt = p ? getWeapon(p.profile?.wearableItemMap).en : btGetCachedWeaponType(m.characterID);
                        const mts = p ? (p.timestamp || 0) : (btWeaponCache[m.characterID]?.ts || 0);
                        members.push({ slot: si, player_name: getMemberName(m.characterID), weapon_type: mwt, weapon_ts: mts });
                    }
                    si++;
                }
            }
            if (members.length < 1) return { error: "No team members detected" };
            const isBattling = !!(DataStore.partyInfo?.party?.status === "battling" || (DataStore.currentActions || []).some(a => a?.actionHrid?.includes("/actions/combat/")));
            return { zone, difficulty, members, isBattling };
        }

        function uploadTeamData(data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: UPLOAD_URL,
                    headers: { "Content-Type": "application/json" },
                    data: JSON.stringify(data),
                    onload(r) { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(e); } },
                    onerror(e) { reject(e); }
                });
            });
        }

        async function silentUpload() {
            if (!DataStore.isLoaded) return;
            if (DataStore.gameMode && DataStore.gameMode !== 'standard') return;
            const result = buildTeamExportData();
            if (result.error) return;
            result.characterType = 'standard';
            result.gameMode = DataStore.gameMode || null;
            result.reporter = DataStore.characterName || '';
            try { await uploadTeamData(result); } catch (e) {}
        }

        return {
            startAutoUpload() {
                if (autoUploadTimer) clearInterval(autoUploadTimer);
                setTimeout(() => silentUpload(), 5000);
                autoUploadTimer = setInterval(() => silentUpload(), AUTO_INTERVAL_MS);
            },
            stopAutoUpload() {
                if (autoUploadTimer) {
                    clearInterval(autoUploadTimer);
                    autoUploadTimer = null;
                }
            },
            isRunning() { return autoUploadTimer !== null; }
        };
    })();
    const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
    const currentLang = isZH ? 'zh' : 'en';
    const i18n = {
        combat: { zh: '战斗', en: 'Combat' },
        intelligence: { zh: '智力', en: 'Intelligence' },
        stamina: { zh: '耐力', en: 'Stamina' },
        attack: { zh: '攻击', en: 'Attack' },
        defense: { zh: '防御', en: 'Defense' },
        melee: { zh: '近战', en: 'Melee' },
        ranged: { zh: '远程', en: 'Ranged' },
        magic: { zh: '魔法', en: 'Magic' },
        house: { zh: '房屋', en: 'House' },
        dojo: { zh: '道场', en: 'Dojo' },
        library: { zh: '图书馆', en: 'Library' },
        dining_room: { zh: '餐厅', en: 'Dining Room' },
        mystical_study: { zh: '神秘研究室', en: 'Mystical Study' },
        armory: { zh: '军械库', en: 'Armory' },
        gym: { zh: '健身房', en: 'Gym' },
        archery_range: { zh: '射箭场', en: 'Archery Range' },
        back: { zh: '背部', en: 'Back' },
        head: { zh: '头部', en: 'Head' },
        trinket: { zh: '饰品', en: 'Trinket' },
        neck: { zh: '项链', en: 'Neck' },
        main_hand: { zh: '主手', en: 'Main Hand' },
        body: { zh: '身体', en: 'Body' },
        off_hand: { zh: '副手', en: 'Off Hand' },
        earrings: { zh: '耳环', en: 'Earrings' },
        hands: { zh: '手套', en: 'Hands' },
        legs: { zh: '腿部', en: 'Legs' },
        pouch: { zh: '腰包', en: 'Pouch' },
        ring: { zh: '戒指', en: 'Ring' },
        feet: { zh: '鞋子', en: 'Feet' },
        charm: { zh: '护符', en: 'Charm' },
        two_hand: { zh: '双手', en: 'Two Hand' },
        food: { zh: '食物', en: 'Food' },
        drink: { zh: '饮料', en: 'Drink' },
        abilities: { zh: '技能', en: 'Abilities' },
        level: { zh: 'Lv', en: 'Lv' },
        unknown: { zh: '未知', en: 'Unknown' }
    };
    function t(key) {
        return i18n[key]?.[currentLang] || key;
    }
    const ClientData = new class {
        #data = null;
        #hrid2name = {};
        #name2hrid = {};
        #loaded = false;
        init() {
            if (this.#loaded) return;
            const compressed = localStorage.getItem("initClientData");
            if (!compressed) return;
            try {
                this.#data = JSON.parse(LZString.decompressFromUTF16(compressed));
                this.#buildMappings();
                this.#loaded = true;
                DataStore.itemDetailMap = this.#data.itemDetailMap;
                DataStore.actionDetailMap = this.#data.actionDetailMap;
                DataStore.abilityDetailMap = this.#data.abilityDetailMap;
                DataStore.achievementDetailMap = this.#data.achievementDetailMap;
                DataStore.achievementTierDetailMap = this.#data.achievementTierDetailMap;
            } catch (e) { /* silent */ }
        }
        get() {
            if (!this.#loaded) this.init();
            return this.#data;
        }
        #buildMappings() {
            if (!this.#data) return;
            const maps = [
                this.#data.itemDetailMap,
                this.#data.abilityDetailMap,
                this.#data.actionDetailMap,
                this.#data.skillDetailMap
            ];
            for (const detailMap of maps) {
                if (!detailMap) continue;
                for (const hrid in detailMap) {
                    const detail = detailMap[hrid];
                    if (detail && detail.name) {
                        this.#hrid2name[hrid] = detail.name;
                        this.#name2hrid[detail.name] = hrid;
                    }
                }
            }
        }
        hrid2name(hrid) {
            if (!hrid) return hrid;
            if (!this.#loaded) this.init();
            return this.#hrid2name[hrid] || hrid.split('/').pop();
        }
        name2hrid(name) {
            if (!name) return name;
            if (!this.#loaded) this.init();
            return this.#name2hrid[name] || name;
        }
        getItemDetail(hrid) {
            if (!this.#loaded) this.init();
            return this.#data?.itemDetailMap?.[hrid] || null;
        }
    };
    function getAllData() {
        if (!DataStore.isLoaded) {
            return null;
        }
        return {
            characterName: DataStore.characterName,
            characterId: DataStore.characterId,
            totalLevel: DataStore.totalLevel,
            buildScore: DataStore.buildScore,
            combatLevel: DataStore.combatLevel,
            weaponType: DataStore.weaponType,
            weaponTypeEN: DataStore.weaponTypeEN,
            guildName: DataStore.guildName,
            guildLevel: DataStore.guildLevel,
            guildMembers: DataStore.guildMembers,
            displayName: DataStore.characterName || 'Player 1',
            nameColor: DataStore.nameColor,
            chatIconHrid: DataStore.chatIconHrid,
            profileIconHrid: DataStore.profileIconHrid,
            avatarHrid: DataStore.avatarHrid,
            outfitHrid: DataStore.outfitHrid,
            characterSkills: DataStore.characterSkills,
            characterItems: DataStore.characterItems,
            characterAbilities: DataStore.characterAbilities,
            equipment: DataStore.currentEquipmentMap,
            combatUnit: DataStore.combatUnit,
            houseRooms: DataStore.characterHouseRoomMap,
            foodSlots: DataStore.actionTypeFoodSlotsMap,
            drinkSlots: DataStore.actionTypeDrinkSlotsMap,
            combatSetup: DataStore.combatSetup
        };
    }
    function getSimulatorData() {
        return WebSocketHook.generateSimulatorData();
    }
    function isDataReady() {
        return DataStore.isLoaded;
    }
    function waitForData(timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (DataStore.isLoaded) {
                resolve(getAllData());
                return;
            }
            const timer = setTimeout(() => {
                window.removeEventListener('mwi_data_ready', handler);
                reject(new Error('Data loading timeout'));
            }, timeout);
            const handler = () => {
                clearTimeout(timer);
                resolve(getAllData());
            };
            window.addEventListener('mwi_data_ready', handler, { once: true });
        });
    }
    function toggleTalentMarketModal() {
        const existing = document.getElementById('talent-market-modal');
        if (existing) {
            if (existing.style.display === 'none') {
                existing.style.display = '';
                if (existing._onShow) existing._onShow();
            } else {
                if (existing._onHide) existing._onHide();
                existing.style.display = 'none';
            }
            return;
        }
        createTalentMarketModal();
    }
    window.toggleTalentMarketModal = toggleTalentMarketModal;
    function createTalentMarketModal() {
        const isZH = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
        const I18N = {
            zh: {
                title: 'Talent Market',
                back: '返回',
                refresh: '刷新',
                close: '关闭',
                loading: '加载中...',
                loadingSlow: '加载时间较长,请稍候...',
                loadFailed: '加载失败,请检查网络连接',
                loadTimeout: '加载超时，请检查网络连接或刷新页面',
                disableUpload: '不上传队伍信息',
            },
            en: {
                title: 'Talent Market',
                back: 'Back',
                refresh: 'Refresh',
                close: 'Close',
                loading: 'Loading...',
                loadingSlow: 'Loading is taking longer...',
                loadFailed: 'Failed to load, check connection',
                loadTimeout: 'Loading timeout, please check network connection or refresh the page',
                disableUpload: 'Disable Upload',
            }
        };
        const t = I18N[isZH ? 'zh' : 'en'];
        const LAYOUT_CONFIG = {
            MIN_WIDTH: 540,
            MIN_HEIGHT: 787,
            NARROW_THRESHOLD: 970,
            MOBILE_THRESHOLD: 550,
            MARGIN_RATIO: 0.05,
            VIEWPORT_RATIO: 0.9,
            LOAD_TIMEOUT: 10000,
            MESSAGING_DELAY: 200,
            RESIZE_DEBOUNCE: 150
        };
        const existing = document.getElementById('talent-market-modal');
        if (existing) {
            return existing;
        }
        const modal = document.createElement('div');
        modal.id = 'talent-market-modal';
        modal._currentUrl = SITE_URL;
        modal.innerHTML = `
            <div class="tm-overlay">
                <div class="tm-container">
                    <div class="tm-header">
                        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                            <button class="tm-btn-refresh" title="${t.refresh}">${t.refresh}</button>
                            <button class="tm-btn-settings" title="${isZH ? '战力分自动更新设置' : 'BuildScore Auto-Update Settings'}" style="background:${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? '#166534' : '#334155'};color:${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? '#86efac' : '#94a3b8'};border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">${GM_getValue('mwi_buildscore_auto_enabled', false) && GM_getValue('mwi_buildscore_password', null) ? (isZH ? '已启用自动更新' : 'Auto: ON') : (isZH ? '未启用自动更新' : 'Auto: OFF')}</button>
                            <label class="tm-upload-team-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#ffffff;user-select:none;white-space:nowrap;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px 10px;">
                                <input type="checkbox" class="tm-upload-team-checkbox" ${GM_getValue('mwi_upload_team_disabled', false) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:#66CCFF;" />
                                ${t.disableUpload}
                            </label>
                        </div>
                        <div class="tm-title">
                            <h2>${t.title}</h2>
                        </div>
                        <div class="tm-controls">
                            <button class="tm-btn-close" title="${t.close}">${t.close}</button>
                        </div>
                    </div>
                    <div class="tm-content">
                        <iframe 
                            id="tm-iframe" 
                            src="${SITE_URL}?embedded=true&v=${Date.now()}"
                            frameborder="0"
                            loading="eager"
                            fetchpriority="high"
                        ></iframe>

                        <div class="tm-loading">
                            <div class="tm-spinner"></div>
                            <p>${t.loading}</p>
                        </div>
                    </div>
                </div>
            </div>
            `;
            const container = modal.querySelector('.tm-container');
            initCardUploadMonitor();
            bindTalentMarketEvents(modal, t, LAYOUT_CONFIG);
            requestAnimationFrame(() => {
                document.body.appendChild(modal);
                updateScrollbarState(container, LAYOUT_CONFIG);
            });
        const iframe = modal.querySelector('#tm-iframe');
        enableClipboardPermissionsIfSupported(iframe);
        const loadingEl = modal.querySelector('.tm-loading');
        let loadTimeout = null;
        const handleResize = () => {
            updateScrollbarState(container, LAYOUT_CONFIG);
            updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
        };
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === container) {
                    handleResize();
                }
            }
        });
        resizeObserver.observe(container);
        modal._onHide = () => {
            IntervalManager.clear('cardUploadMonitor');
            window._MWI_UPLOAD_IN_PROGRESS = false;
            GM_setValue('mwi_card_upload_request', 0);
            GM_setValue('mwi_card_image_url', '');
            GM_setValue('mwi_card_image_timestamp', 0);
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
            cardLinkFillStatus.reset();
            closeCard();
        };
        modal._onShow = () => {
            initCardUploadMonitor();
            updateScrollbarState(container, LAYOUT_CONFIG);
            updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
        };
        modal._cleanup = () => {
            resizeObserver.disconnect();
            document.removeEventListener('keydown', handleEscape);
            if (loadTimeout) clearTimeout(loadTimeout);
            modal._onHide();
        };
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                toggleTalentMarketModal();
            }
        };
        document.addEventListener('keydown', handleEscape);
        iframe.addEventListener('load', () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            loadingEl.style.display = 'none';
            iframe._loaded = true;
            setupIframeMessaging(iframe, LAYOUT_CONFIG);
            updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
        }, { once: true });
        loadTimeout = setTimeout(() => {
            if (loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `<p style="color:#fbbf24;">${t.loadingSlow}</p>`;
            }
        }, LAYOUT_CONFIG.LOAD_TIMEOUT);
        iframe.addEventListener('error', () => {
            if (loadTimeout) clearTimeout(loadTimeout);
            loadingEl.innerHTML = `<p style="color:#ef4444;">${t.loadFailed}</p>`;
        }, { once: true });
        return modal;
    }
    function bindTalentMarketEvents(modal, t, LAYOUT_CONFIG) {
        const loadingEl = modal.querySelector('.tm-loading');

        const refreshIframe = () => {
            const iframe = modal.querySelector('#tm-iframe');
            if (iframe) {
                if (loadingEl) {
                    loadingEl.style.display = 'flex';
                    loadingEl.innerHTML = `<div class="tm-spinner"></div><p>${t.loading}</p>`;
                }
                const hideLoadingOnLoad = () => {
                    if (loadingEl) {
                        loadingEl.style.display = 'none';
                    }
                };
                iframe.addEventListener('load', hideLoadingOnLoad, { once: true });
                const currentSrc = iframe.src;
                iframe.src = 'about:blank';
                setTimeout(() => {
                    iframe.src = currentSrc;
                }, 50);
            }
        };
        modal.querySelector('.tm-btn-close').addEventListener('click', () => {
            if (modal._onHide) modal._onHide();
            modal.style.display = 'none';
        });
        modal.querySelector('.tm-btn-refresh').addEventListener('click', () => {
            refreshIframe();
        });
        modal.querySelector('.tm-btn-settings').addEventListener('click', () => {
            if (typeof BuildScoreAutoUpdater !== 'undefined') {
                BuildScoreAutoUpdater.showSettingsDialog();
            }
        });
        const uploadTeamCheckbox = modal.querySelector('.tm-upload-team-checkbox');
        if (uploadTeamCheckbox) {
            uploadTeamCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    GM_setValue('mwi_upload_team_disabled', true);
                    BattleTeamsModule.stopAutoUpload();
                } else {
                    GM_setValue('mwi_upload_team_disabled', false);
                    BattleTeamsModule.startAutoUpload();
                }
            });
        }
    }
    function updateIframeViewportInfo(iframe, width, height, LAYOUT_CONFIG) {
        if (!iframe || !iframe.contentWindow || !iframe._loaded) return;
        if (!iframe.src || !iframe.src.startsWith(SITE_URL)) return;
        const isMobile = width < LAYOUT_CONFIG.MOBILE_THRESHOLD;
        const isNarrow = width < LAYOUT_CONFIG.NARROW_THRESHOLD;
        try {
            iframe.contentWindow.postMessage({
                type: 'VIEWPORT_UPDATE',
                data: { width, height, isMobile, isNarrow }
            }, SITE_URL);
        } catch (e) {}
    }
    function setupIframeMessaging(iframe, LAYOUT_CONFIG) {
        const container = iframe.closest('.tm-container');
        if (container) {
            setTimeout(() => {
                updateIframeViewportInfo(iframe, container.offsetWidth, container.offsetHeight, LAYOUT_CONFIG);
            }, LAYOUT_CONFIG.MESSAGING_DELAY);
        }
        if (window._talentMarketMessageListenerAdded) return;
        window._talentMarketMessageListenerAdded = true;
        window.addEventListener('message', (event) => {
            if (event.origin !== SITE_URL) return;
            const { type, data } = event.data;
            switch(type) {
                case 'CLOSE_MODAL':
                    const modal = document.getElementById('talent-market-modal');
                    if (modal) {
                        if (modal._cleanup) modal._cleanup();
                        modal.remove();
                    }
                    break;
            }
        });
    }
    function updateScrollbarState(container, LAYOUT_CONFIG) {
        const currentWidth = container.offsetWidth;
        const currentHeight = container.offsetHeight;
        if (currentWidth < LAYOUT_CONFIG.NARROW_THRESHOLD) {
            container.setAttribute('data-narrow', 'true');
        } else {
            container.removeAttribute('data-narrow');
        }
        if (currentHeight < LAYOUT_CONFIG.MIN_HEIGHT) {
            container.setAttribute('data-short', 'true');
        } else {
            container.removeAttribute('data-short');
        }
        if (currentWidth < LAYOUT_CONFIG.MOBILE_THRESHOLD) {
            container.setAttribute('data-mobile', 'true');
        } else {
            container.removeAttribute('data-mobile');
        }
    }
    function generateRandomGradientBorder() {
        let colorPool, angles;
        try {
            const style = getComputedStyle(document.documentElement);
            const poolStr = style.getPropertyValue('--card-gradient-colors').trim().replace(/^'|'$/g, '');
            const anglesStr = style.getPropertyValue('--card-gradient-angles').trim().replace(/^'|'$/g, '');
            if (poolStr) colorPool = JSON.parse(poolStr);
            if (anglesStr) angles = JSON.parse(anglesStr);
        } catch (e) {}
        if (!colorPool || !colorPool.length) {
            colorPool = ['#8B5CF6','#EC4899','#F59E0B','#A855F7','#3B82F6','#9333EA','#DB2777','#C084FC','#26C6DA','#F472B6','#7C3AED','#A78BFA','#06B6D4','#9D4EDD','#C77DFF','#E0AAFF','#BF40BF','#DA70D6','#EE82EE','#E879F9','#BA55D3','#9370DB','#34D399','#10B981','#14B8A6','#22C55E','#6366F1','#0EA5E9','#FF006E','#FF499E','#F43F5E','#FB7185','#E91E63','#FF1744','#FF4081','#FF69B4','#FF1493','#F59E0B','#EF4444','#FBBF24','#F97316','#DC2626','#FFD700','#FFA500','#FF8C00','#00CED1','#48D1CC','#20B2AA','#4169E1','#6495ED','#7B68EE','#536DFE','#FF6347','#FF4500','#1E90FF','#00BFFF','#87CEEB','#4FC3F7','#29B6F6','#64B5F6','#00E676','#1DE9B6','#18FFFF','#64FFDA','#69F0AE','#EEFF41','#FFD740','#FFAB40','#FF6E40','#9890E3','#B721FF','#FBC2EB','#A18CD1'];
        }
        if (!angles || !angles.length) {
            angles = [45, 90, 135, 180, 225, 270, 315, 360];
        }
        const count = 3 + Math.floor(Math.random() * 2);
        const shuffled = colorPool.slice().sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, count);
        const angle = angles[Math.floor(Math.random() * angles.length)];
        return `linear-gradient(${angle}deg, ${picked.join(', ')})`;
    }
    function getCompletedAchievementTiers() {
        const achievements = DataStore.characterAchievements || [];
        const achievementDetailMap = DataStore.achievementDetailMap || {};
        const tierCounts = {
            '/achievement_tiers/beginner': { completed: 0, total: 0 },
            '/achievement_tiers/novice': { completed: 0, total: 0 },
            '/achievement_tiers/adept': { completed: 0, total: 0 },
            '/achievement_tiers/veteran': { completed: 0, total: 0 },
            '/achievement_tiers/elite': { completed: 0, total: 0 },
            '/achievement_tiers/champion': { completed: 0, total: 0 }
        };
        for (const hrid in achievementDetailMap) {
            const detail = achievementDetailMap[hrid];
            if (detail && detail.tierHrid && tierCounts[detail.tierHrid]) {
                tierCounts[detail.tierHrid].total++;
            }
        }
        achievements.forEach(ach => {
            if (ach.isCompleted) {
                const detail = achievementDetailMap[ach.achievementHrid];
                if (detail && detail.tierHrid && tierCounts[detail.tierHrid]) {
                    tierCounts[detail.tierHrid].completed++;
                }
            }
        });
        const completedTiers = [];
        const tierOrder = ['beginner', 'novice', 'adept', 'veteran', 'elite', 'champion'];
        tierOrder.forEach(tier => {
            const tierHrid = `/achievement_tiers/${tier}`;
            const data = tierCounts[tierHrid];
            if (data && data.completed > 0 && data.completed === data.total) {
                completedTiers.push(tier);
            }
        });
        return completedTiers;
    }
    function generateAchievementIconsHTML() {
        const completedTiers = getCompletedAchievementTiers();
        const iconConfig = {
            beginner: { sprite: 'buffs', id: 'gathering' },
            novice: { sprite: 'buffs', id: 'wisdom' },
            adept: { sprite: 'buffs', id: 'efficiency' },
            veteran: { sprite: 'items', id: 'butter_of_proficiency' },
            elite: { sprite: 'misc', id: 'combat' },
            champion: { sprite: 'skills', id: 'enhancing' }
        };
        const spriteURLs = {
            buffs: '/static/media/buffs_sprite.cd54d85e.svg',
            items: SVGTool.getSpriteURL('items'),
            misc: SVGTool.getSpriteURL('misc'),
            skills: SVGTool.getSpriteURL('skills')
        };
        let html = '<div class="mwi-achievement-icons" style="display:flex;gap:3px;position:absolute;top:12px;left:12px;z-index:10;">';
        html += `<svg width="30" height="30" viewBox="0 0 40 40" style="width:30px;height:30px;margin-top:-2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"><g clip-path="url(#ach)"><path fill="#546DDB" d="M4 7h32v26H4z"></path><path fill="#546DDB" d="M4 7h5v26H4z"></path><path fill="#000" fill-opacity=".2" d="M4 7h5v26H4z"></path><path fill="#546DDB" d="M31 7h5v26h-5z"></path><path fill="#000" fill-opacity=".2" d="M31 7h5v26h-5z"></path><path fill="#546DDB" d="M1 7h6v26H1z"></path><path fill="#fff" fill-opacity=".6" d="M1 7h6v26H1z"></path><path fill="#546DDB" d="M33 7h6v26h-6z"></path><path fill="#fff" fill-opacity=".6" d="M33 7h6v26h-6z"></path><path d="M5 1.875C5 3.325 4.552 6 4 6S3 3.325 3 1.875C3 .425 3.448 0 4 0s1 .425 1 1.875ZM3 38.125C3 36.675 3.448 34 4 34s1 2.675 1 4.125C5 39.575 4.552 40 4 40s-1-.425-1-1.875ZM37 1.875C37 3.325 36.552 6 36 6s-1-2.675-1-4.125C35 .425 35.448 0 36 0s1 .425 1 1.875ZM35 38.125c0-1.45.448-4.125 1-4.125s1 2.675 1 4.125c0 1.45-.448 1.875-1 1.875s-1-.425-1-1.875Z" fill="#C57A09"></path><rect y="5" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect y="5" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect y="33" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect y="33" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect x="32" y="5" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect x="32" y="5" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><rect x="32" y="33" width="8" height="2" rx="1" fill="#FAA21E"></rect><rect x="32" y="33" width="8" height="2" rx="1" fill="#000" fill-opacity=".4"></rect><path d="M18.99 11.846c.382-.886 1.639-.886 2.02 0l1.706 3.96c.16.37.508.624.909.66l4.293.399c.961.09 1.35 1.285.625 1.922l-3.24 2.846a1.1 1.1 0 0 0-.347 1.068l.948 4.206c.212.942-.805 1.68-1.635 1.188l-3.707-2.201a1.1 1.1 0 0 0-1.124 0l-3.707 2.201c-.83.493-1.847-.246-1.635-1.188l.948-4.206a1.1 1.1 0 0 0-.347-1.069l-3.24-2.845c-.725-.637-.336-1.833.625-1.922l4.293-.398c.401-.037.75-.29.91-.66l1.705-3.961Z" fill="#FAA21E"></path></g></svg>`;
        completedTiers.forEach(tier => {
            const config = iconConfig[tier];
            if (config) {
                const spriteURL = spriteURLs[config.sprite];
                html += `<svg width="24" height="24" viewBox="0 0 24 24" style="width:26px;height:26px;border:1px solid #59d0b9;border-radius:4px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"><use href="${spriteURL}#${config.id}"></use></svg>`;
            }
        });
        html += '</div>';
        return html;
    }
    async function generateCharacterCard() {
        const existingContainer = document.querySelector('.mwi-card-container');
        if (existingContainer) return;
        if (!DataStore.characterSkills || DataStore.characterSkills.length === 0) {
            alert('Data not loaded!' + String.fromCharCode(10) + String.fromCharCode(10) + 'Please refresh the page and wait for data to auto-load (about 3 seconds)');
            return;
        }
        const container = document.createElement('div');
        container.className = 'mwi-card-container';
        let bgImageDataURL = '';
        if (CARD_BACKGROUND_IMAGE && CARD_BACKGROUND_IMAGE.trim() !== '') {
            try {
                bgImageDataURL = BackgroundImagePreloader.getCached();
                if (!bgImageDataURL) {
                    bgImageDataURL = await BackgroundImagePreloader.preload();
                }
                if (!bgImageDataURL) {
                    throw new Error('Failed to load background image');
                }
            } catch (error) {
                bgImageDataURL = '';
            }
        } else {
            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
            const message = lang === 'zh' 
                ? '错误:未配置名片背景图!' + String.fromCharCode(10) + String.fromCharCode(10) + '请在脚本中设置CARD_BACKGROUND_IMAGE变量'
                : 'Error: Card background image not configured!' + String.fromCharCode(10) + String.fromCharCode(10) + 'Please set CARD_BACKGROUND_IMAGE variable in the script';
            alert(message);
            return;
        }
        const bgImageStyle = bgImageDataURL ? `background-image: url(${bgImageDataURL});` : '';
        const borderGradient = generateRandomGradientBorder();
        container.innerHTML = `
            <div class="mwi-character-card" id="mwi-card-content" style="${bgImageStyle} --card-border-gradient: ${borderGradient};" data-border-gradient="${borderGradient}">
                <div style="text-align: center; padding: 40px; color: #94a3b8;">Generating...</div>
            </div>
        `;
        document.body.appendChild(container);
        setTimeout(() => renderCard(), 100);
    }
    function renderCard() {
        const cardContent = document.getElementById('mwi-card-content');
        if (!cardContent) return;
        const container = cardContent.parentElement;
        if (!container) return;
        const borderGradient = cardContent.getAttribute('data-border-gradient') || generateRandomGradientBorder();
        SVGTool.refreshFromDOM();
        ClientData.init();
        const isZH = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
        const nameElementHTML = DataStore.nameElementHTML;
        const chatIconSpriteURL = SVGTool.getSpriteURL('chat_icons');
        const avatarsSpriteURL = SVGTool.getSpriteURL('avatars');
        const avatarOutfitsSpriteURL = SVGTool.getSpriteURL('avatar_outfits');
        const chatIconId = DataStore.chatIconHrid ? DataStore.chatIconHrid.split('/').pop() : null;
        const supporterBadgeId = DataStore.supporterBadgeHrid ? DataStore.supporterBadgeHrid.split('/').pop() : null;
        const avatarId = DataStore.avatarHrid ? DataStore.avatarHrid.split('/').pop() : null;
        const outfitId = DataStore.outfitHrid ? DataStore.outfitHrid.split('/').pop() : null;
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const achievementIconsHTML = generateAchievementIconsHTML();
        let html = `
            ${achievementIconsHTML}
            <div class="mwi-card-body" data-lang="${currentLang}" style="position:relative;">
                <div class="mwi-card-timestamp">${timestamp}</div>
        `;
        html += `
                <div class="mwi-card-character">
        `;
        html += `
            <div class="mwi-card-section">
                <div class="mwi-character-info-container">
        `;
        if (supporterBadgeId || chatIconId || nameElementHTML || DataStore.characterName) {
            html += `
                <div class="mwi-character-info-top" style="--name-border-gradient: ${borderGradient};">
            `;
            if (supporterBadgeId) {
                html += `
                    <svg class="mwi-character-supporter-badge" width="40" height="40" viewBox="0 0 24 24">
                        <use href="${chatIconSpriteURL}#${supporterBadgeId}"></use>
                    </svg>
                `;
            }
            if (chatIconId) {
                html += `
                    <svg class="mwi-character-chat-icon" width="40" height="40" viewBox="0 0 24 24">
                        <use href="${chatIconSpriteURL}#${chatIconId}"></use>
                    </svg>
                `;
            }
            if (nameElementHTML) {
                const _iconCount = (supporterBadgeId ? 1 : 0) + (chatIconId ? 1 : 0);
                const _wrapperStyle = _iconCount >= 2 ? 'transform: translate(-18px, 0px);' : '';
                html += `
                    <div class="mwi-character-id-wrapper" style="${_wrapperStyle}">
                        ${nameElementHTML}
                    </div>
                `;
            } else if (DataStore.characterName) {
                html += `
                    <div class="mwi-character-id" style="color: #ffffff !important;">${DataStore.characterName}</div>
                `;
            }
            html += `
                </div>
            `;
        }
        if (avatarId || outfitId) {
            html += `
                <div class="mwi-character-info-bottom">
                    <div class="mwi-character-avatar-wrapper">
            `;
            if (avatarId) {
                html += `
                        <svg class="mwi-character-avatar" width="280" height="280" viewBox="0 0 24 24">
                            <use href="${avatarsSpriteURL}#${avatarId}"></use>
                        </svg>
                `;
            }
            if (outfitId) {
                html += `
                        <svg class="mwi-character-outfit" width="280" height="280" viewBox="0 0 24 24">
                            <use href="${avatarOutfitsSpriteURL}#${outfitId}"></use>
                        </svg>
                `;
            }
            html += `
                    </div>
                </div>
            `;
        }
        html += `
                </div>
            </div>
        `;
        html += `
                </div>
        `;
        html += `
                <div class="mwi-card-left">
        `;
        html += `
            <div class="mwi-card-section">
                <div class="mwi-equipment-grid">
        `;
        const equipmentSlots = {
            '/item_locations/back': { row: 1, col: 1, name: t('back') },
            '/item_locations/head': { row: 1, col: 2, name: t('head') },
            '/item_locations/trinket': { row: 1, col: 3, name: t('trinket') },
            '/item_locations/neck': { row: 1, col: 4, name: t('neck') },
            '/item_locations/main_hand': { row: 2, col: 1, name: t('main_hand') },
            '/item_locations/body': { row: 2, col: 2, name: t('body') },
            '/item_locations/off_hand': { row: 2, col: 3, name: t('off_hand') },
            '/item_locations/earrings': { row: 2, col: 4, name: t('earrings') },
            '/item_locations/hands': { row: 3, col: 1, name: t('hands') },
            '/item_locations/legs': { row: 3, col: 2, name: t('legs') },
            '/item_locations/pouch': { row: 3, col: 3, name: t('pouch') },
            '/item_locations/ring': { row: 3, col: 4, name: t('ring') },
            '/item_locations/feet': { row: 4, col: 2, name: t('feet') },
            '/item_locations/charm': { row: 4, col: 4, name: t('charm') },
            '/item_locations/two_hand': { row: 2, col: 1, name: t('two_hand'), colspan: 2 }
        };
        const hasTwoHand = !!DataStore.currentEquipmentMap['/item_locations/two_hand'];
        for (let row = 1; row <= 4; row++) {
            for (let col = 1; col <= 4; col++) {
                if ((row === 4 && col === 1) || (row === 4 && col === 3)) {
                    html += `<div style="width: 60px; height: 60px;"></div>`;
                    continue;
                }
                let slotEntry = Object.entries(equipmentSlots).find(([_, slot]) => 
                    slot.row === row && slot.col === col
                );
                if (row === 2 && col === 1 && hasTwoHand) {
                    slotEntry = ['/item_locations/two_hand', equipmentSlots['/item_locations/two_hand']];
                }
                if (row === 2 && col === 3 && hasTwoHand) {
                    slotEntry = null;
                }
                if (slotEntry) {
                    const [slotHrid, slotInfo] = slotEntry;
                    const item = DataStore.currentEquipmentMap[slotHrid];
                    if (item) {
                        const itemDetail = DataStore.itemDetailMap?.[item.itemHrid];
                        const itemName = itemDetail?.name || item.itemHrid.split('/').pop();
                        const enhance = item.enhancementLevel || 0;
                        const itemLevel = itemDetail?.itemLevel || 0;
                        const iconId = item.itemHrid.split('/').pop();
                        const spriteURL = SVGTool.getSpriteURL('items');
                        html += `
                            <div class="mwi-equipment-slot filled" title="${itemName}${enhance > 0 ? ` +${enhance}` : ''}">
                                <svg viewBox="0 0 42 42">
                                    <use href="${spriteURL}#${iconId}"></use>
                                </svg>
                                ${enhance > 0 ? `<div class="mwi-enhance-level">+${enhance}</div>` : ''}
                                ${itemLevel > 0 ? `<div class="mwi-item-level">${itemLevel}</div>` : ''}
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="mwi-equipment-slot empty"></div>
                        `;
                    }
                } else {
                    html += `<div class="mwi-equipment-slot empty" style="opacity: 0.3;"></div>`;
                }
            }
        }
        html += `</div></div>`;
        const stamina = DataStore.characterSkills.find(s => s.skillHrid === '/skills/stamina')?.level || 0;
        const intelligence = DataStore.characterSkills.find(s => s.skillHrid === '/skills/intelligence')?.level || 0;
        const attack = DataStore.characterSkills.find(s => s.skillHrid === '/skills/attack')?.level || 0;
        const defense = DataStore.characterSkills.find(s => s.skillHrid === '/skills/defense')?.level || 0;
        const melee = DataStore.characterSkills.find(s => s.skillHrid === '/skills/melee')?.level || 0;
        const ranged = DataStore.characterSkills.find(s => s.skillHrid === '/skills/ranged')?.level || 0;
        const magic = DataStore.characterSkills.find(s => s.skillHrid === '/skills/magic')?.level || 0;
        const maxCombatSkill = Math.max(melee, ranged, magic);
        const maxAllCombat = Math.max(attack, defense, melee, ranged, magic);
        const combatLevel = Math.floor(0.1 * (stamina + intelligence + attack + defense + maxCombatSkill) + 0.5 * maxAllCombat);
        const firstRowStats = [
            { hrid: '/skills/intelligence', name: t('intelligence'), level: intelligence },
            { hrid: '/skills/stamina', name: t('stamina'), level: stamina },
            { hrid: '/skills/attack', name: t('attack'), level: attack }
        ].sort((a, b) => b.level - a.level);
        const secondRowStats = [
            { hrid: '/skills/magic', name: t('magic'), level: magic },
            { hrid: '/skills/melee', name: t('melee'), level: melee },
            { hrid: '/skills/ranged', name: t('ranged'), level: ranged },
            { hrid: '/skills/defense', name: t('defense'), level: defense }
        ].sort((a, b) => b.level - a.level);
        html += `
            <div class="mwi-card-section">
                <div class="mwi-stats-grid">
        `;
        const miscSpriteURL = SVGTool.getSpriteURL('misc');
        const skillsSpriteURL = SVGTool.getSpriteURL('skills');
        const combatLevelClass = combatLevel >= 140 ? 'highlight' : '';
        html += `
            <div class="mwi-stat-item">
                <span class="mwi-stat-label">${t('combat')}</span>
                <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                    <use href="${miscSpriteURL}#combat"></use>
                </svg>
                <span class="mwi-stat-value ${combatLevelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size:14px;font-weight:bold;">Lv.${combatLevel}</span>
            </div>
        `;
        firstRowStats.forEach(stat => {
            const name = stat.hrid.split('/').pop();
            const levelClass = stat.level >= 140 ? 'highlight' : '';
            html += `
                <div class="mwi-stat-item">
                    <span class="mwi-stat-label">${stat.name}</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                        <use href="${skillsSpriteURL}#${name}"></use>
                    </svg>
                    <span class="mwi-stat-value ${levelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size: 14px; font-weight: bold;">Lv.${stat.level}</span>
                </div>
            `;
        });
        secondRowStats.forEach(stat => {
            const name = stat.hrid.split('/').pop();
            const levelClass = stat.level >= 140 ? 'highlight' : '';
            html += `
                <div class="mwi-stat-item">
                    <span class="mwi-stat-label">${stat.name}</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;">
                        <use href="${skillsSpriteURL}#${name}"></use>
                    </svg>
                    <span class="mwi-stat-value ${levelClass}" style="overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size:14px;font-weight:bold;">Lv.${stat.level}</span>
                </div>
            `;
        });
        html += `</div></div>`;
        html += `
                </div>
        `;
        html += `
                <div class="mwi-card-right">
        `;
        const productionToolSlots = [
            "/item_locations/woodcutting_tool",
            "/item_locations/foraging_tool",
            "/item_locations/milking_tool",
            "/item_locations/cheesesmithing_tool",
            "/item_locations/crafting_tool",
            "/item_locations/tailoring_tool",
            "/item_locations/cooking_tool",
            "/item_locations/brewing_tool",
            "/item_locations/alchemy_tool",
            "/item_locations/enhancing_tool"
        ];
        html += `
            <div class="mwi-card-section">
                <div class="mwi-equipment-grid" style="grid-template-columns:repeat(5,46px);grid-template-rows:repeat(2,46px);width:294px;height:154px;margin:0 auto;padding:10px 15px;gap:8px;box-sizing:border-box;justify-content:center;align-content:center;">
        `;
        for (const slot of productionToolSlots) {
            const item = DataStore.currentEquipmentMap[slot];
            if (item) {
                const itemDetail = DataStore.itemDetailMap?.[item.itemHrid];
                const itemName = itemDetail?.name || item.itemHrid.split('/').pop();
                const enhance = item.enhancementLevel || 0;
                const iconId = item.itemHrid.split('/').pop();
                const spriteURL = SVGTool.getSpriteURL('items');
                html += `
                    <div class="mwi-equipment-slot filled" title="${itemName}${enhance > 0 ? ` +${enhance}` : ''}" style="width:100%;height:100%;">
                        <svg viewBox="0 0 42 42">
                            <use href="${spriteURL}#${iconId}"></use>
                        </svg>
                        ${enhance > 0 ? `<div class="mwi-enhance-level">+${enhance}</div>` : ''}
                    </div>
                `;
            } else {
                html += `<div class="mwi-equipment-slot empty" style="width:100%;height:100%;"></div>`;
            }
        }
        html += `
                </div>
            </div>
        `;
        const houseRooms = DataStore.characterHouseRoomMap || {};
        const firstRowRooms = [
            { hrid: '/house_rooms/dojo', icon: 'attack', name: t('dojo') },
            { hrid: '/house_rooms/library', icon: 'intelligence', name: t('library') },
            { hrid: '/house_rooms/dining_room', icon: 'stamina', name: t('dining_room') }
        ];
        const secondRowRooms = [
            { hrid: '/house_rooms/mystical_study', icon: 'magic', name: t('mystical_study') },
            { hrid: '/house_rooms/armory', icon: 'defense', name: t('armory') },
            { hrid: '/house_rooms/gym', icon: 'melee', name: t('gym') },
            { hrid: '/house_rooms/archery_range', icon: 'ranged', name: t('archery_range') }
        ];
        const existingFirstRow = firstRowRooms
            .filter(room => houseRooms[room.hrid])
            .sort((a, b) => {
                const levelA = houseRooms[a.hrid]?.level || 0;
                const levelB = houseRooms[b.hrid]?.level || 0;
                return levelB - levelA;
            });
        const existingSecondRow = secondRowRooms
            .filter(room => houseRooms[room.hrid])
            .sort((a, b) => {
                const levelA = houseRooms[a.hrid]?.level || 0;
                const levelB = houseRooms[b.hrid]?.level || 0;
                return levelB - levelA;
            });
        html += `
            <div class="mwi-card-section">
                <div class="mwi-house-grid">
        `;
        for (let i = 0; i < 3; i++) {
            const room = existingFirstRow[i];
            if (room) {
                const roomData = houseRooms[room.hrid];
                const roomLevel = roomData.level || 0;
                const spriteURL = SVGTool.getSpriteURL('skills');
                const levelClass = roomLevel === 8 ? 'max' : 'normal';
                html += `
                    <div class="mwi-house-item" title="${room.name} Lv.${roomLevel}">
                        <svg viewBox="0 0 42 42">
                            <use href="${spriteURL}#${room.icon}"></use>
                        </svg>
                        <div class="mwi-house-level ${levelClass}">Lv.${roomLevel}</div>
                    </div>
                `;
            } else {
                html += `<div class="mwi-house-item empty"></div>`;
            }
        }
        html += `<div class="mwi-house-item" style="cursor: default; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" style="width: 42px; height: 42px;">
                <use href="${miscSpriteURL}#house"></use>
            </svg>
        </div>`;
        for (let i = 0; i < 4; i++) {
            const room = existingSecondRow[i];
            if (room) {
                const roomData = houseRooms[room.hrid];
                const roomLevel = roomData.level || 0;
                const spriteURL = SVGTool.getSpriteURL('skills');
                const levelClass = roomLevel === 8 ? 'max' : 'normal';
                html += `
                    <div class="mwi-house-item" title="${room.name} Lv.${roomLevel}">
                        <svg viewBox="0 0 42 42">
                            <use href="${spriteURL}#${room.icon}"></use>
                        </svg>
                        <div class="mwi-house-level ${levelClass}">Lv.${roomLevel}</div>
                    </div>
                `;
            } else {
                html += `<div class="mwi-house-item empty"></div>`;
            }
        }
        html += `</div></div>`;
        const combatAbilities = DataStore.combatUnit?.combatAbilities || [];
        const auraAbilities = [
            '/abilities/insanity',
            '/abilities/mystic_aura',
            '/abilities/critical_aura',
            '/abilities/speed_aura',
            '/abilities/fierce_aura',
            '/abilities/guardian_aura',
            '/abilities/revive',
            '/abilities/invincible'
        ];
        const equippedNormalAbilities = [];
        const equippedAuras = [];
        combatAbilities.forEach(ability => {
            if (auraAbilities.includes(ability.abilityHrid)) {
                equippedAuras.push(ability);
            } else {
                equippedNormalAbilities.push(ability);
            }
        });
        const equippedAbilityHrids = new Set(combatAbilities.map(a => a.abilityHrid));
        const unequippedAuras = [];
        auraAbilities.forEach(auraHrid => {
            const learnedAura = DataStore.characterAbilities.find(a => a.abilityHrid === auraHrid);
            if (learnedAura && !equippedAbilityHrids.has(auraHrid)) {
                unequippedAuras.push(learnedAura);
            }
        });
        unequippedAuras.sort((a, b) => b.level - a.level);
        const firstRowAbilities = equippedNormalAbilities.slice(0, 4);
        const auraRowDisplay = [];
        if (equippedAuras.length > 0) {
            auraRowDisplay.push(equippedAuras[0]);
        }
        const remainingSlots = 4 - auraRowDisplay.length;
        const topUnequippedAuras = unequippedAuras.slice(0, remainingSlots);
        auraRowDisplay.push(...topUnequippedAuras);
        html += `
            <div class="mwi-card-section">
                <div class="mwi-abilities-grid">
        `;
        for (let i = 0; i < 4; i++) {
            const ability = firstRowAbilities[i];
            if (ability && ability.abilityHrid) {
                const abilityDetail = DataStore.abilityDetailMap?.[ability.abilityHrid];
                const abilityName = abilityDetail?.name || ability.abilityHrid.split('/').pop();
                const combatActionHrid = abilityDetail?.combatActionHrid || ability.abilityHrid;
                const iconId = combatActionHrid.split('/').pop();
                const spriteURL = SVGTool.getSpriteURL('abilities');
                html += `
                    <div class="mwi-ability-item" title="${abilityName} Lv.${ability.level}">
                        <svg viewBox="0 0 40 40">
                            <use href="${spriteURL}#${iconId}"></use>
                        </svg>
                        <div class="mwi-ability-level">Lv.${ability.level}</div>
                    </div>
                `;
            } else {
                html += `<div class="mwi-ability-item empty"></div>`;
            }
        }
        for (let i = 0; i < 4; i++) {
            const aura = auraRowDisplay[i];
            if (aura && aura.abilityHrid) {
                const abilityDetail = DataStore.abilityDetailMap?.[aura.abilityHrid];
                const abilityName = abilityDetail?.name || aura.abilityHrid.split('/').pop();
                const combatActionHrid = abilityDetail?.combatActionHrid || aura.abilityHrid;
                const iconId = combatActionHrid.split('/').pop();
                const spriteURL = SVGTool.getSpriteURL('abilities');
                html += `
                    <div class="mwi-ability-item" title="${abilityName} Lv.${aura.level}">
                        <svg viewBox="0 0 40 40">
                            <use href="${spriteURL}#${iconId}"></use>
                        </svg>
                        <div class="mwi-ability-level">Lv.${aura.level}</div>
                    </div>
                `;
            } else {
                html += `<div class="mwi-ability-item empty"></div>`;
            }
        }
        html += `</div></div>`;
        html += `
                </div>
            </div>
        `;
        cardContent.innerHTML = html;
    }
    function closeCard() {
        const container = document.querySelector('.mwi-card-container');
        if (container) {
            container.remove();
            window._MWI_UPLOAD_IN_PROGRESS = false;
            GM_setValue('mwi_card_upload_request', 0);
            GM_setValue('mwi_card_image_url', '');
            GM_setValue('mwi_card_image_timestamp', 0);
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
            cardLinkFillStatus.reset();
        }
    }
    async function autoUploadCard() {
        if (window._MWI_UPLOAD_IN_PROGRESS) {
            return;
        }
        
        const cardElement = document.getElementById('mwi-card-content');
        if (!cardElement) {
            const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
            throw new Error(lang === 'zh' ? '未找到名片元素' : 'Card element not found');
        }
        
        window._MWI_UPLOAD_IN_PROGRESS = true;
        
        const lang = typeof window.detectLanguage === 'function' ? window.detectLanguage() : 'zh';
        
        const existingOverlay = document.getElementById('mwi-upload-progress-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        const abortController = new AbortController();
        let isCancelled = false;
        
        const progressOverlay = document.createElement('div');
        progressOverlay.id = 'mwi-upload-progress-overlay';
        progressOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 999999999;
            backdrop-filter: blur(4px);
        `;
        progressOverlay.innerHTML = `
            <div style="position: relative; max-width: 90%;">
                <button id="mwi-upload-close-btn" style="
                    position: absolute;
                    top: -40px;
                    right: 0;
                    border: none;
                    background: rgba(255, 255, 255, 0.15);
                    backdrop-filter: blur(8px);
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 12px;
                    cursor: pointer;
                    padding: 6px 12px;
                    border-radius: 6px;
                    transition: background 0.2s;
                " title="${lang === 'zh' ? '中止上传' : 'Cancel upload'}">${lang === 'zh' ? '中止上传' : 'Cancel'}</button>
                <div style="background: white; border-radius: 12px; padding: 32px 48px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); min-width: 300px; text-align: center;">
                    <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 20px;">${lang === 'zh' ? '名片上传中...' : 'Uploading card...'}</div>
                    <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
                        <div id="mwi-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); transition: width 0.3s;"></div>
                    </div>
                    <div id="mwi-progress-text" style="font-size: 14px; color: #666;">${lang === 'zh' ? '准备中...' : 'Preparing...'}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(progressOverlay);
        
        const closeBtn = document.getElementById('mwi-upload-close-btn');
        closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = 'rgba(255, 255, 255, 0.25)'; });
        closeBtn.addEventListener('mouseout', () => { closeBtn.style.background = 'rgba(255, 255, 255, 0.15)'; });
        closeBtn.addEventListener('click', () => {
            isCancelled = true;
            abortController.abort();
            progressOverlay.remove();
            closeCard();
            window._MWI_UPLOAD_IN_PROGRESS = false;
            GM_setValue('mwi_card_upload_request', 0);
            GM_setValue('mwi_card_image_url', '');
            GM_setValue('mwi_card_image_timestamp', 0);
            GM_setValue('mwi_upload_progress', 0);
            GM_setValue('mwi_upload_status', '');
            cardLinkFillStatus.reset();
        });
        
        const progressBar = document.getElementById('mwi-progress-bar');
        const progressText = document.getElementById('mwi-progress-text');
        function updateProgress(percent, text) {
            if (isCancelled) return;
            if (progressBar) progressBar.style.width = percent + '%';
            if (progressText) progressText.textContent = text;
        }
        try {
            if (isCancelled) return;
            updateProgress(10, lang === 'zh' ? '生成截图中...' : 'Generating screenshot...');
            const cardContainer = cardElement.closest('.mwi-card-container');
            const savedContainerCss = cardContainer ? cardContainer.style.cssText : '';
            const savedCardCss = cardElement.style.cssText;
            if (cardContainer) cardContainer.style.cssText += ';max-width:none!important;width:940px!important;overflow:visible!important;';
            cardElement.style.cssText += ';width:940px!important;height:520px!important;';
            await new Promise(r => setTimeout(r, 50));
            const canvas = await SnapDOM.toCanvas(cardElement, {
                width: 940,
                height: 520,
                backgroundColor: '#1a1a2e',
                scale: 2,
                logging: false
            });
            if (cardContainer) cardContainer.style.cssText = savedContainerCss;
            cardElement.style.cssText = savedCardCss;
            if (isCancelled) throw new Error('cancelled');
            updateProgress(30, lang === 'zh' ? '转换图片中...' : 'Converting image...');
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (!blob) reject(new Error(lang === 'zh' ? 'Canvas转换Blob失败' : 'Canvas to Blob conversion failed'));
                    else resolve(blob);
                }, 'image/png', 1.0);
            });
            if (isCancelled) throw new Error('cancelled');
            updateProgress(50, lang === 'zh' ? '截图完成,开始上传...' : 'Screenshot complete, uploading...');
            const UPLOAD_ENDPOINT = 'https://tupian.li/api/v1/upload';
            updateProgress(80, lang === 'zh' ? '正在上传图片...需要2分钟' : 'Uploading image... may take 2 minutes');
            const formData = new FormData();
            formData.append('file', blob, 'character-card.png');
            let uploadResp;
            let lastError;
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (isCancelled) throw new Error('cancelled');
                    if (attempt > 1) {
                        const retryText = lang === 'zh' 
                            ? `重试上传 (${attempt}/${maxRetries})...`
                            : `Retrying upload (${attempt}/${maxRetries})...`;
                        updateProgress(80 + (attempt - 1) * 3, retryText);
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    }
                    uploadResp = await fetch(UPLOAD_ENDPOINT, {
                        method: 'POST',
                        body: formData,
                        signal: abortController.signal
                    });
                    if (uploadResp.ok) {
                        break;
                    }
                    lastError = new Error(lang === 'zh' ? `状态码: ${uploadResp.status}` : `Status code: ${uploadResp.status}`);
                    if (attempt === maxRetries) {
                        throw lastError;
                    }
                } catch (error) {
                    if (isCancelled || error.name === 'AbortError' || error.message === 'cancelled') {
                        throw new Error('cancelled');
                    }
                    lastError = error;
                    if (attempt === maxRetries) {
                        const errorMsg = lang === 'zh'
                            ? `上传失败 (已重试${maxRetries}次): ${error.message}`
                            : `Upload failed (retried ${maxRetries} times): ${error.message}`;
                        throw new Error(errorMsg);
                    }
                }
            }
            if (!uploadResp || !uploadResp.ok) {
                throw lastError || new Error(lang === 'zh' ? '上传失败' : 'Upload failed');
            }
            if (isCancelled) throw new Error('cancelled');
            updateProgress(90, lang === 'zh' ? '处理响应...' : 'Processing response...');
            const data = await uploadResp.json();
            let imageUrl = null;
            if (data && typeof data === 'object' && data.status === true && data.data && data.data.pathname) {
                imageUrl = 'https://tupian.li/images/' + data.data.pathname;
            } else if (data && typeof data === 'object' && data.success && data.data && data.data.url) {
                imageUrl = data.data.url;
            } else if (data && typeof data === 'object' && data.url) {
                imageUrl = data.url;
            } else if (data && typeof data === 'object' && data.link) {
                imageUrl = data.link;
            }
            if (!imageUrl) {
                throw new Error(lang === 'zh' ? '无法解析API返回的图片链接' : 'Unable to parse image link from API response');
            }
            if (isCancelled) throw new Error('cancelled');
            updateProgress(100, lang === 'zh' ? '名片上传成功!' : 'Card upload successful!');
            const timestamp = Date.now();
            GM_setValue('mwi_card_image_url', imageUrl);
            GM_setValue('mwi_card_image_timestamp', timestamp);
            
            if (typeof window.__fillCardLink__ === 'function') {
                window.__fillCardLink__(imageUrl);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            const savedUrl = GM_getValue('mwi_card_image_url', '');
            const savedTimestamp = GM_getValue('mwi_card_image_timestamp', 0);
            if (savedUrl !== imageUrl || savedTimestamp !== timestamp) {
                GM_setValue('mwi_card_image_url', imageUrl);
                GM_setValue('mwi_card_image_timestamp', timestamp);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            setTimeout(() => {
                progressOverlay.remove();
                closeCard();
                window._MWI_UPLOAD_IN_PROGRESS = false;
            }, 800);
            return imageUrl;
        } catch (error) {
            if (isCancelled || error.message === 'cancelled') {
                return;
            }
            progressOverlay.innerHTML = `
                <div style="background: white; border-radius: 12px; padding: 32px 48px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); min-width: 300px; max-width: 90%; text-align: center;">
                    <div style="color: #ef4444; font-size: 16px; margin-bottom: 10px;">${lang === 'zh' ? '上传失败' : 'Upload failed'}</div>
                    <div style="color: #94a3b8; font-size: 14px;">${error.message}</div>
                </div>
            `;
            setTimeout(() => {
                progressOverlay.remove();
            }, 3000);
            throw error;
        }
    }
    if (!isSimulatorPage) {
        WebSocketHook.install();
    }

    const EQUIP_SLOTS = ['head', 'body', 'legs', 'feet', 'hands', 'weapon', 'off_hand', 'pouch', 'neck', 'earrings', 'ring', 'back', 'charm'];
    const LEVEL_TYPES = ['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'];
    const ABILITY_SLOT_COUNT = 5;
    const PLAYER_COUNT = 5;

    const SimulatorBuildScore = {
        playerData: {},
        clientDataLoaded: false,
        calculating: {},
        extraItems: {},
        extraItemsCaptured: {},

        init() {
            if (!isSimulatorPage) return;
            this.loadClientData();
            this.injectStyles();
            this.waitForDOM();
        },

        loadClientData() {
            if (this.clientDataLoaded) return true;
            try {
                const compressed = GM_getValue('mwi_client_data_for_sim', '');
                if (!compressed) return false;
                const json = LZString.decompressFromUTF16(compressed);
                if (!json) return false;
                BuildScoreModule.initClientData(JSON.parse(json));
                this.clientDataLoaded = true;
                return true;
            } catch (e) {
                return false;
            }
        },

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = '.tm-bs-badge { display:inline-block; font-size:14px; font-weight:700; color:#fbbf24; background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.3); border-radius:4px; padding:1px 6px; margin-left:6px; line-height:22px; vertical-align:middle; white-space:nowrap; transition:all .3s ease; }' +
                '.tm-bs-badge.calculating { color:#94a3b8; background:rgba(148,163,184,0.15); border-color:rgba(148,163,184,0.3); }' +
                '.tm-bs-summary { display:flex; gap:8px; padding:6px 12px; background:rgba(30,41,59,0.8); border:1px solid rgba(148,163,184,0.2); border-radius:6px; margin:8px 0; font-size:12px; color:#e2e8f0; flex-wrap:wrap; align-items:center; }' +
                '.tm-bs-summary-item { display:flex; align-items:center; gap:4px; }' +
                '.tm-bs-summary-label { color:#94a3b8; }' +
                '.tm-bs-summary-value { color:#fbbf24; font-weight:700; font-size:15px; }' +
                '.tm-bs-summary-total { color:#f59e0b; font-weight:700; font-size:20px; }' +
                '.tm-bs-recalc { cursor:pointer; color:#94a3b8; font-size:11px; margin-left:auto; padding:2px 8px; border:1px solid rgba(148,163,184,0.3); border-radius:3px; background:transparent; transition:all .2s; }' +
                '.tm-bs-recalc:hover { color:#fbbf24; border-color:rgba(251,191,36,0.4); }' +
                'a[id^="player"][id$="-tab"]:focus, a[id^="player"][id$="-tab"]:focus-visible { outline:none !important; box-shadow:none !important; }';
            document.head.appendChild(style);
        },

        _getActivePlayerIdx() {
            const tab = document.querySelector('a.nav-link.active[id^="player"][id$="-tab"]');
            return tab ? parseInt(tab.id.replace('player', '').replace('-tab', '')) : 0;
        },

        _interceptInputValue(input, onValueSet) {
            if (!input || input._tmBsHooked) return;
            input._tmBsHooked = true;
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            if (desc && desc.set) {
                const origSet = desc.set;
                Object.defineProperty(input, 'value', {
                    get() { return desc.get.call(this); },
                    set(val) { origSet.call(this, val); if (val) onValueSet(val); },
                    configurable: true
                });
            }
            input.addEventListener('input', () => { if (input.value) onValueSet(input.value); });
        },

        _listenChange(el, handler) {
            if (!el) return;
            el.addEventListener('change', handler);
            if (el.tagName === 'INPUT') el.addEventListener('input', handler);
        },

        waitForDOM() {
            var self = this;
            var check = function() {
                var firstTab = document.querySelector('a#player1-tab');
                if (firstTab) {
                    for (var t = 1; t <= PLAYER_COUNT; t++) {
                        var pt = document.querySelector('a#player' + t + '-tab');
                        if (pt) pt.spellcheck = false;
                    }
                    self.hookImportButton();
                    self.observeTabChanges();
                    self.observeFormChanges();
                    self.observeModalCheckboxes();
                    self.tryReadExistingData();
                    return;
                }
                setTimeout(check, 300);
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', check);
            } else {
                check();
            }
        },

        hookImportButton() {
            var self = this;
            var check = function() {
                var importBtn = document.querySelector('button#buttonImportSet');
                if (!importBtn) {
                    setTimeout(check, 300);
                    return;
                }
                if (importBtn._tmBsHooked) return;
                importBtn._tmBsHooked = true;

                importBtn.addEventListener('click', function() {
                    setTimeout(function() {
                        self.readImportedData();
                        for (var pp = 1; pp <= PLAYER_COUNT; pp++) {
                            self.readPerPlayerImportedData(pp);
                        }
                    }, 200);
                });

                var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                if (inputElem) {
                    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                    if (desc && desc.set) {
                        var origSet = desc.set;
                        Object.defineProperty(inputElem, 'value', {
                            get: function() { return desc.get.call(this); },
                            set: function(val) {
                                origSet.call(this, val);
                                if (val) {
                                    self._pendingImportData = val;
                                    setTimeout(function() { self.readImportedData(); }, 300);
                                }
                            },
                            configurable: true
                        });
                    }
                    inputElem.addEventListener('input', function() {
                        if (inputElem.value) {
                            setTimeout(function() { self.readImportedData(); }, 300);
                        }
                    });
                }

                for (var pi = 1; pi <= PLAYER_COUNT; pi++) {
                    (function(idx) {
                        var perPlayerInput = document.querySelector('input#inputSetGroupCombatplayer' + idx);
                        if (perPlayerInput && !perPlayerInput._tmBsHooked) {
                            perPlayerInput._tmBsHooked = true;
                            var ppDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                            if (ppDesc && ppDesc.set) {
                                var origPPSet = ppDesc.set;
                                Object.defineProperty(perPlayerInput, 'value', {
                                    get: function() { return ppDesc.get.call(this); },
                                    set: function(val) {
                                        origPPSet.call(this, val);
                                        if (val) setTimeout(function() { self.readPerPlayerImportedData(idx); }, 300);
                                    },
                                    configurable: true
                                });
                            }
                            perPlayerInput.addEventListener('input', function() {
                                if (perPlayerInput.value) setTimeout(function() { self.readPerPlayerImportedData(idx); }, 300);
                            });
                        }
                    })(pi);
                }

                var soloImportBtn = document.querySelector('button#buttonImportSolo');
                if (soloImportBtn && !soloImportBtn._tmBsHooked) {
                    soloImportBtn._tmBsHooked = true;
                    soloImportBtn.addEventListener('click', function() {
                        setTimeout(function() { self.readSoloImportedData(); }, 200);
                    });
                }

                var soloInput = document.querySelector('input#inputSetSolo');
                if (soloInput && !soloInput._tmBsHooked) {
                    soloInput._tmBsHooked = true;
                    var soloDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                    if (soloDesc && soloDesc.set) {
                        var origSoloSet = soloDesc.set;
                        Object.defineProperty(soloInput, 'value', {
                            get: function() { return soloDesc.get.call(this); },
                            set: function(val) {
                                origSoloSet.call(this, val);
                                if (val) {
                                    setTimeout(function() { self.readSoloImportedData(); }, 300);
                                }
                            },
                            configurable: true
                        });
                    }
                    soloInput.addEventListener('input', function() {
                        if (soloInput.value) {
                            setTimeout(function() { self.readSoloImportedData(); }, 300);
                        }
                    });
                }
            };
            check();
        },

        readImportedData() {
            try {
                var rawData = this._pendingImportData || null;
                this._pendingImportData = null;
                if (!rawData) {
                    var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                    if (inputElem) rawData = inputElem.value;
                }
                if (!rawData) return;
                var exportObj = JSON.parse(rawData);
                for (var i = 1; i <= PLAYER_COUNT; i++) {
                    if (exportObj[i]) {
                        var pds = typeof exportObj[i] === 'string' ? exportObj[i] : JSON.stringify(exportObj[i]);
                        this.playerData[i] = JSON.parse(pds);
                        if (this.playerData[i].characterName) {
                            this.playerData[i]._characterName = this.playerData[i].characterName;
                        }
                    }
                }
                this.extraItems = {};
                this.extraItemsCaptured = {};
                this.readPlayerNamesFromTabs();
                this.recalculateAll();
            } catch (e) { /* silent */ }
        },

        readSoloImportedData() {
            try {
                var inputElem = document.querySelector('input#inputSetSolo');
                if (!inputElem || !inputElem.value) return;
                var playerData = JSON.parse(inputElem.value);
                var playerIdx = this._getActivePlayerIdx() || 1;
                this.playerData[playerIdx] = playerData;
                if (playerData.characterName) {
                    this.playerData[playerIdx]._characterName = playerData.characterName;
                }
                delete this.extraItems[playerIdx];
                delete this.extraItemsCaptured[playerIdx];
                this.readPlayerNamesFromTabs();
                this.recalculatePlayer(playerIdx);
            } catch (e) { /* silent */ }
        },

        readPerPlayerImportedData(playerIdx) {
            try {
                var inputElem = document.querySelector('input#inputSetGroupCombatplayer' + playerIdx);
                if (!inputElem || !inputElem.value) return;
                var playerData = JSON.parse(inputElem.value);
                this.playerData[playerIdx] = playerData;
                if (playerData.characterName) {
                    this.playerData[playerIdx]._characterName = playerData.characterName;
                }
                delete this.extraItems[playerIdx];
                delete this.extraItemsCaptured[playerIdx];
                this.readPlayerNamesFromTabs();
                this.recalculatePlayer(playerIdx);
            } catch (e) { /* silent */ }
        },

        readPlayerNamesFromTabs() {
            for (var i = 1; i <= PLAYER_COUNT; i++) {
                var tab = document.querySelector('a#player' + i + '-tab');
                if (!tab || !this.playerData[i]) continue;
                var badge = tab.querySelector('.tm-bs-badge');
                var name = tab.textContent.trim();
                if (badge) name = name.replace(badge.textContent, '').trim();
                this.playerData[i]._characterName = this.playerData[i].characterName
                    || (name && name !== 'Player ' + i ? name : null)
                    || 'Player ' + i;
            }
        },

        tryReadExistingData() {
            var self = this;
            setTimeout(function() {
                var inputElem = document.querySelector('input#inputSetGroupCombatAll');
                if (inputElem && inputElem.value) {
                    self.readImportedData();
                    return;
                }
                var hasNamedTabs = false;
                for (var i = 1; i <= PLAYER_COUNT; i++) {
                    var tab = document.querySelector('a#player' + i + '-tab');
                    if (tab) {
                        var name = tab.textContent.trim();
                        if (name && name !== 'Player ' + i) {
                            hasNamedTabs = true;
                            break;
                        }
                    }
                }
                if (hasNamedTabs) {
                    setTimeout(function() {
                        var inp = document.querySelector('input#inputSetGroupCombatAll');
                        if (inp && inp.value) {
                            self.readImportedData();
                        }
                    }, 2000);
                }
            }, 500);
        },

        observeTabChanges() {
            var tabList = document.querySelector('#playerTab');
            if (!tabList) return;
            var self = this;

            var observer = new MutationObserver(function(mutations) {
                for (var k = 0; k < mutations.length; k++) {
                    var m = mutations[k];
                    if (m.type === 'characterData' || m.type === 'childList') {
                        var target = m.target.closest ? m.target.closest('.nav-link') :
                                    (m.target.parentElement && m.target.parentElement.closest ? m.target.parentElement.closest('.nav-link') : null);
                        if (target && target.id && /^player\d+-tab$/.test(target.id)) {
                            var idx = parseInt(target.id.replace('player', '').replace('-tab', ''));
                            if (self.playerData[idx]) {
                                var badge = target.querySelector('.tm-bs-badge');
                                var nm = target.textContent.trim();
                                if (badge) nm = nm.replace(badge.textContent, '').trim();
                                if (nm && nm !== 'Player ' + idx) {
                                    self.playerData[idx]._characterName = nm;
                                }
                            }
                        }
                    }
                }
            });
            observer.observe(tabList, { childList: true, subtree: true, characterData: true });
        },

        observeFormChanges() {
            var self = this;
            var debounceTimer = null;
            var handleChange = function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function() {
                    var idx = self._getActivePlayerIdx();
                    if (idx) self.readPlayerStateFromDOM(idx);
                }, 800);
            };
            for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                this._listenChange(document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]), handleChange);
                this._listenChange(document.getElementById('inputEquipmentEnhancementLevel_' + EQUIP_SLOTS[i]), handleChange);
            }
            for (var j = 0; j < ABILITY_SLOT_COUNT; j++) {
                this._listenChange(document.getElementById('selectAbility_' + j), handleChange);
                this._listenChange(document.getElementById('inputAbilityLevel_' + j), handleChange);
            }
            for (var k = 0; k < LEVEL_TYPES.length; k++) {
                this._listenChange(document.getElementById('inputLevel_' + LEVEL_TYPES[k]), handleChange);
            }
            var houseInputs = document.querySelectorAll('input[data-house-hrid]');
            for (var h = 0; h < houseInputs.length; h++) {
                this._listenChange(houseInputs[h], handleChange);
            }
        },

        captureExtraItems(playerIdx) {
            var data = this.playerData[playerIdx];
            this.extraItems[playerIdx] = [];
            if (!data || !data.player || !data.player.equipment) return;
            var visibleHrids = {};
            for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                var sel = document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]);
                if (sel && sel.value) visibleHrids[sel.value] = true;
            }
            for (var j = 0; j < data.player.equipment.length; j++) {
                var eq = data.player.equipment[j];
                if (eq && eq.itemHrid && !visibleHrids[eq.itemHrid]) {
                    this.extraItems[playerIdx].push({
                        itemLocationHrid: eq.itemLocationHrid || '/item_locations/unknown',
                        itemHrid: eq.itemHrid,
                        enhancementLevel: eq.enhancementLevel || 0,
                        count: 1
                    });
                }
            }
        },

        buildCharacterDataFromDOM() {
            var items = [];
            for (var i = 0; i < EQUIP_SLOTS.length; i++) {
                var sel = document.getElementById('selectEquipment_' + EQUIP_SLOTS[i]);
                if (!sel || !sel.value) continue;
                var enh = document.getElementById('inputEquipmentEnhancementLevel_' + EQUIP_SLOTS[i]);
                items.push({
                    itemLocationHrid: '/item_locations/equipment',
                    itemHrid: sel.value,
                    enhancementLevel: enh ? (parseInt(enh.value) || 0) : 0,
                    count: 1
                });
            }
            var abilities = [];
            for (var j = 0; j < ABILITY_SLOT_COUNT; j++) {
                var abSel = document.getElementById('selectAbility_' + j);
                if (!abSel || !abSel.value) continue;
                var abLvl = document.getElementById('inputAbilityLevel_' + j);
                abilities.push({ abilityHrid: abSel.value, level: parseInt(abLvl ? abLvl.value : '1') || 1 });
            }
            var rooms = {};
            var houseInputs = document.querySelectorAll('input[data-house-hrid]');
            for (var h = 0; h < houseInputs.length; h++) {
                var hrid = houseInputs[h].dataset.houseHrid;
                var level = parseInt(houseInputs[h].value) || 0;
                if (hrid && level > 0) rooms[hrid] = { houseRoomHrid: hrid, level: level };
            }
            return { characterHouseRoomMap: rooms, combatUnit: { combatAbilities: abilities }, characterItems: items };
        },

        readPlayerStateFromDOM(playerIdx) {
            if (!this.extraItemsCaptured[playerIdx] && this.playerData[playerIdx]) {
                this.captureExtraItems(playerIdx);
                this.extraItemsCaptured[playerIdx] = true;
            }
            var characterData = this.buildCharacterDataFromDOM();
            if (this.extraItems[playerIdx]) {
                for (var x = 0; x < this.extraItems[playerIdx].length; x++) {
                    characterData.characterItems.push(this.extraItems[playerIdx][x]);
                }
            }
            this._calculate(playerIdx, characterData);
        },

        async _calculate(playerIdx, characterData) {
            if (!this.loadClientData()) return;
            if (this.calculating[playerIdx]) return;
            this.calculating[playerIdx] = true;
            this.updateBadge(playerIdx, null, true);
            try {
                var result = await BuildScoreModule.calculateBuildScore(characterData);
                if (result) {
                    this.updateBadge(playerIdx, result, false);
                    this.updateDetailPanel(playerIdx, result);
                }
            } catch (e) {
                this.updateBadge(playerIdx, null, false);
            } finally {
                this.calculating[playerIdx] = false;
            }
        },

        async recalculateAll() {
            if (!this.loadClientData()) return;
            for (var i = 1; i <= PLAYER_COUNT; i++) {
                if (this.playerData[i]) await this.recalculatePlayer(i);
            }
        },

        recalculatePlayer(playerIdx) {
            var data = this.playerData[playerIdx];
            if (!data) return;
            return this._calculate(playerIdx, this.convertToCharacterData(data));
        },

        convertToCharacterData(pd) {
            var rooms = {};
            if (pd.houseRooms) {
                var hrids = Object.keys(pd.houseRooms);
                for (var h = 0; h < hrids.length; h++) {
                    rooms[hrids[h]] = { houseRoomHrid: hrids[h], level: pd.houseRooms[hrids[h]] };
                }
            }
            var abilities = [];
            if (pd.abilities) {
                for (var a = 0; a < pd.abilities.length; a++) {
                    var ab = pd.abilities[a];
                    if (ab && ab.abilityHrid) abilities.push({ abilityHrid: ab.abilityHrid, level: parseInt(ab.level) || 1 });
                }
            }
            var items = [];
            if (pd.player && pd.player.equipment) {
                for (var e = 0; e < pd.player.equipment.length; e++) {
                    var eq = pd.player.equipment[e];
                    if (eq && eq.itemHrid) {
                        items.push({ itemLocationHrid: eq.itemLocationHrid || '/item_locations/unknown', itemHrid: eq.itemHrid, enhancementLevel: eq.enhancementLevel || 0, count: 1 });
                    }
                }
            }
            return { characterHouseRoomMap: rooms, combatUnit: { combatAbilities: abilities }, characterItems: items };
        },

        updateBadge(playerIdx, scoreResult, isCalculating) {
            var tab = document.querySelector('a#player' + playerIdx + '-tab');
            if (!tab) return;
            var charName = this.playerData[playerIdx] && this.playerData[playerIdx]._characterName;
            if (charName) {
                var found = false;
                for (var c = 0; c < tab.childNodes.length; c++) {
                    if (tab.childNodes[c].nodeType === 3) {
                        tab.childNodes[c].textContent = charName;
                        found = true;
                        break;
                    }
                }
                if (!found) tab.insertBefore(document.createTextNode(charName), tab.firstChild);
            }
            var badge = tab.querySelector('.tm-bs-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'tm-bs-badge';
                tab.appendChild(badge);
            }
            if (isCalculating) {
                badge.className = 'tm-bs-badge calculating';
                badge.textContent = '...';
            } else if (scoreResult) {
                badge.className = 'tm-bs-badge';
                badge.textContent = scoreResult.total.toFixed(1);
            } else {
                badge.className = 'tm-bs-badge calculating';
                badge.textContent = 'N/A';
            }
        },

        updateDetailPanel(playerIdx, scoreResult) {
            var tabContent = document.querySelector('#player' + playerIdx);
            if (!tabContent) return;
            var panel = tabContent.querySelector('.tm-bs-summary');
            if (!panel) {
                panel = document.createElement('div');
                panel.className = 'tm-bs-summary';
                tabContent.insertBefore(panel, tabContent.firstChild);
            }
            var name = (this.playerData[playerIdx] && this.playerData[playerIdx]._characterName)
                       ? this.playerData[playerIdx]._characterName : 'Player ' + playerIdx;
            var self = this;
            var _isZH = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh');
            var _lbl = _isZH
                ? { total: '\u6218\u529b\u6253\u9020\u5206:', house: '\u623f\u5b50\u5206:', ability: '\u6280\u80fd\u5206:', equip: '\u88c5\u5907\u5206:' }
                : { total: 'Build Score:', house: 'House:', ability: 'Ability:', equip: 'Equipment:' };
            panel.innerHTML =
                '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + name + '</span></span>' +
                '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.total + '</span> <span class="tm-bs-summary-total">' + scoreResult.total.toFixed(1) + '</span></span>' +
                '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.house + '</span> <span class="tm-bs-summary-value">' + scoreResult.house.toFixed(1) + '</span></span>' +
                '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.ability + '</span> <span class="tm-bs-summary-value">' + scoreResult.ability.toFixed(1) + '</span></span>' +
                '<span class="tm-bs-summary-item"><span class="tm-bs-summary-label">' + _lbl.equip + '</span> <span class="tm-bs-summary-value">' + scoreResult.equipment.toFixed(1) + '</span></span>' +
                '<button class="tm-bs-recalc" title="Recalculate">Recalc</button>';
            panel.querySelector('.tm-bs-recalc').addEventListener('click', function() {
                self.readImportedData();
            });
        },

        styleModalPlayerCheckboxes() {
            var playerInfo = [];
            for (var i = 1; i <= PLAYER_COUNT; i++) {
                var tab = document.querySelector('a#player' + i + '-tab');
                if (!tab) continue;
                var badge = tab.querySelector('.tm-bs-badge');
                if (!badge) continue;
                var scoreText = badge.textContent.trim();
                if (!scoreText) continue;
                var fullText = tab.textContent.trim();
                var name = fullText.replace(scoreText, '').trim();
                if (!name) continue;
                playerInfo.push({ name: name, score: scoreText, concat: name + scoreText });
            }
            if (playerInfo.length === 0) return;
            var labels = document.querySelectorAll('.modal-body .form-check-label');
            for (var k = 0; k < labels.length; k++) {
                var label = labels[k];
                if (label.querySelector('.tm-bs-badge')) continue;
                var txt = label.textContent.trim();
                for (var j = 0; j < playerInfo.length; j++) {
                    if (txt === playerInfo[j].concat) {
                        var input = label.querySelector('input');
                        if (input) {
                            label.textContent = '';
                            label.appendChild(input);
                            label.appendChild(document.createTextNode(playerInfo[j].name));
                        } else {
                            label.textContent = playerInfo[j].name;
                        }
                        var b = document.createElement('span');
                        b.className = 'tm-bs-badge';
                        b.textContent = playerInfo[j].score;
                        label.appendChild(b);
                        break;
                    }
                }
            }
        },

        observeModalCheckboxes() {
            var self = this;
            var debounceTimer = null;
            var observer = new MutationObserver(function() {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function() {
                    self.styleModalPlayerCheckboxes();
                }, 200);
            });
            var target = document.body;
            if (target) {
                observer.observe(target, { childList: true, subtree: true });
            }
        }
    };

    SimulatorBuildScore.init();

    const TM_BROWSER_API = 'https://papiyas.chat/api/user-data-all';
    const TMB_BLANK_PLAYER = '{"player":{"attackLevel":1,"magicLevel":1,"meleeLevel":1,"rangedLevel":1,"defenseLevel":1,"staminaLevel":1,"intelligenceLevel":1,"equipment":[]},"food":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"drinks":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"abilities":[{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"}],"triggerMap":{},"zone":"/actions/combat/fly","simulationTime":"100","houseRooms":{"/house_rooms/dairy_barn":0,"/house_rooms/garden":0,"/house_rooms/log_shed":0,"/house_rooms/forge":0,"/house_rooms/workshop":0,"/house_rooms/sewing_parlor":0,"/house_rooms/kitchen":0,"/house_rooms/brewery":0,"/house_rooms/laboratory":0,"/house_rooms/observatory":0,"/house_rooms/dining_room":0,"/house_rooms/library":0,"/house_rooms/dojo":0,"/house_rooms/gym":0,"/house_rooms/armory":0,"/house_rooms/archery_range":0,"/house_rooms/mystical_study":0}}';

    const TMB_I18N = {
        zh: {
            title: 'Talent Market', btn: '\u4eba\u624d\u5e02\u573a',
            job: '\u804c\u4e1a', minPower: '\u6700\u4f4e\u6218\u529b', minLevel: '\u6700\u4f4e\u7b49\u7ea7', idSearch: '\u641c\u7d22ID',
            clear: '\u6e05\u9664', all: '\u5168\u90e8',
            colId: 'ID', colJob: '\u804c\u4e1a', colPower: '\u6218\u529b\u5206', colLevel: '\u6218\u7b49', colMainAttr: '\u4e3b\u5c5e\u6027', colCard: '\u540d\u7247', colAction: '\u64cd\u4f5c',
            view: '\u67e5\u770b\u540d\u7247', add: '\u5bfc\u5165\u81f3', loading: '\u52a0\u8f7d\u4e2d...', noData: '\u672a\u627e\u5230\u7528\u6237',
            loadFail: '\u52a0\u8f7d\u5931\u8d25', parseFail: '\u89e3\u6790\u5931\u8d25', usersFound: '\u4e2a\u7528\u6237',
            tabStd: '\u6807\u51c6', tabIC: 'IC',
            loginId: '\u89d2\u8272ID', loginPwd: '\u7b80\u5386\u5bc6\u7801',
            loginBtn: '\u767b\u5f55', loginCancel: '\u53d6\u6d88', loginFail: '\u9a8c\u8bc1\u5931\u8d25',
            loginSuccess: '\u9a8c\u8bc1\u6210\u529f', loginNoPwd: '\u8be5ID\u672a\u8bbe\u7f6e\u5bc6\u7801',
            loginLocked: '\u5c1d\u8bd5\u6b21\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', loginVerifying: '\u9a8c\u8bc1\u4e2d...',
            authVerified: '\u5df2\u9a8c\u8bc1', authUnverified: '\u672a\u767b\u5f55',
            loginDesc: '\u8bf7\u8f93\u5165\u4eba\u624d\u5e02\u573a\u7684\u7528\u6237\u540d\u548c\u5bc6\u7801\u8fdb\u884c\u767b\u5f55\uff0c\u767b\u5f55\u540e\u624d\u53ef\u8c03\u7528\u6570\u636e\n\u5982\u679c\u6ca1\u6709\u7528\u6237\u540d\u548c\u5bc6\u7801\uff0c\u8bf7\u5148\u524d\u5f80\u4eba\u624d\u5e02\u573a\u63d0\u4ea4\u7b80\u5386\u4ee5\u83b7\u53d6\u7528\u6237\u540d\u548c\u5bc6\u7801'
        },
        en: {
            title: 'Talent Market', btn: 'Talent Market',
            job: 'Job', minPower: 'Min Power', minLevel: 'Min Level', idSearch: 'Search ID',
            clear: 'Clear', all: 'All',
            colId: 'ID', colJob: 'Job', colPower: 'Power', colLevel: 'Level', colMainAttr: 'Main Attr', colCard: 'Card', colAction: 'Action',
            view: 'View Card', add: 'Import', loading: 'Loading...', noData: 'No users found',
            loadFail: 'Failed to load', parseFail: 'Failed to parse', usersFound: 'users found',
            tabStd: 'Standard', tabIC: 'IC',
            loginId: 'Character ID', loginPwd: 'Resume Password',
            loginBtn: 'Login', loginCancel: 'Cancel', loginFail: 'Verification failed',
            loginSuccess: 'Verified', loginNoPwd: 'No password set for this ID',
            loginLocked: 'Too many attempts, try later', loginVerifying: 'Verifying...',
            authVerified: 'Verified', authUnverified: 'Not logged in',
            loginDesc: 'Please enter your Talent Market username and password to log in. You need to log in before importing data.\nIf you don\'t have an account, please submit a resume on the Talent Market website first.'
        }
    };

    const TalentMarketBrowser = {
        data: { standard: [], ic: [] },
        activeTab: 'standard',
        loading: false,
        panelVisible: false,
        filters: { job: '', minPower: '', minLevel: '', idSearch: '' },
        sortField: 'updateTime',
        sortDir: 'desc',

        _t(key) {
            var lang = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
            return (TMB_I18N[lang] && TMB_I18N[lang][key]) || TMB_I18N.en[key] || key;
        },

        _getMainAttr(u) {
            if (u._cachedMainAttr !== undefined) return u._cachedMainAttr;
            try {
                var sd = u.simdata;
                if (!sd) { u._cachedMainAttr = ''; return ''; }
                var parsed = typeof sd === 'string' ? JSON.parse(sd) : sd;
                var p = parsed.player || parsed;
                var isZH = (localStorage.getItem('i18nextLng') || '').toLowerCase().startsWith('zh');
                var attrs = [
                    { key: 'meleeLevel', zh: '\u8fd1\u6218', en: 'Melee' },
                    { key: 'rangedLevel', zh: '\u8fdc\u7a0b', en: 'Ranged' },
                    { key: 'magicLevel', zh: '\u9b54\u6cd5', en: 'Magic' },
                    { key: 'attackLevel', zh: '\u653b\u51fb', en: 'Attack' }
                ];
                var best = null;
                for (var i = 0; i < attrs.length; i++) {
                    var val = parseInt(p[attrs[i].key]) || 0;
                    if (!best || val > best.val) best = { val: val, attr: attrs[i] };
                }
                var result = (!best || best.val <= 0) ? '' : best.val + ' ' + (isZH ? best.attr.zh : best.attr.en);
                u._cachedMainAttr = result;
                return result;
            } catch (e) { u._cachedMainAttr = ''; return ''; }
        },

        init() {
            if (!isSimulatorPage) return;
            this._injectStyles();
            this._waitForDOM();
        },

        _injectStyles() {
            var s = document.createElement('style');
            s.textContent =
                '#tmBrowserBtn { display:inline-flex; align-items:center; gap:4px; padding:6px 16px; margin-left:8px; background:#0F95B0; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; vertical-align:middle; transition:all .2s; }' +
                '#tmBrowserBtn:hover { background:#0D7A8E; transform:translateY(-1px); }' +
                '#tmBrowserBtn.active { box-shadow:0 0 0 2px #0F95B0; }' +
                '#tmBrowserOverlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center; }' +
                '#tmBrowserOverlay.visible { display:flex; }' +
                '#tmBrowserPanel { background:linear-gradient(135deg,hsl(190,87%,12%) 0%,hsl(190,70%,14%) 25%,hsl(190,59%,16%) 50%,hsl(190,50%,18%) 75%,hsl(190,45%,20%) 100%); border:1px solid rgba(255,255,255,0.15); border-radius:16px; width:900px; max-width:95vw; height:80vh; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.1); }' +
                '.tmb-header { display:flex; justify-content:center; align-items:center; padding:20px 16px; background:rgba(255,255,255,0.08); border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0; position:relative; }' +
                '.tmb-header .tm-title { text-align:center; }' +
                '.tmb-header .tm-title h2 { display:block; color:#e8eaed; font-size:1.8em; font-weight:600; margin:0; border:none; padding:0; line-height:1.2; }' +
                '.tmb-close-btn { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#e8eaed; font-size:28px; font-weight:bold; cursor:pointer; padding:0; line-height:1; opacity:1; }' +
                '.tmb-close-btn:hover { color:#64b5f6; }' +
                '.tmb-auth-btn { position:absolute; left:12px; top:50%; transform:translateY(-50%); padding:4px 12px; font-size:13px; border-radius:6px; cursor:pointer; border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); transition:all .15s; }' +
                '.tmb-auth-btn:hover { background:rgba(255,255,255,0.15); }' +
                '.tmb-auth-btn.verified { background:rgba(76,175,80,0.15); border-color:rgba(76,175,80,0.4); color:#66bb6a; }' +
                '.tmb-tabs { display:flex; border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0; }' +
                '.tmb-tab { flex:1; padding:8px 0; text-align:center; font-size:15px; font-weight:600; color:rgba(255,255,255,0.6); background:transparent; border:none; cursor:pointer; transition:all .2s; border-bottom:2px solid transparent; }' +
                '.tmb-tab.active { color:#e8eaed; border-bottom-color:rgba(85,155,135,0.6); background:rgba(255,255,255,0.05); }' +
                '.tmb-tab:hover { color:rgba(255,255,255,0.85); }' +
                '.tmb-filters { display:flex; gap:10px; padding:12px 16px; flex-wrap:wrap; align-items:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin:6px; flex-shrink:0; }' +
                '.tmb-filter-item { display:flex; flex-direction:column; gap:2px; justify-content:center; }' +
                '.tmb-filter-item label { font-size:15px; color:rgba(255,255,255,0.8); font-weight:500; }' +
                '.tmb-filter-item select, .tmb-filter-item input { padding:6px 10px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:6px; outline:none; min-width:120px; height:32px; }' +
                '.tmb-filter-item select:focus, .tmb-filter-item input:focus { outline:none; border-color:rgba(255,255,255,0.4); }' +
                '.tmb-filter-item select option { background:rgba(255,255,255,0.95); color:#333; }' +
                '.tmb-filter-item input::placeholder { color:rgba(255,255,255,0.5); font-size:13px; }' +
                '.tmb-clear-btn { padding:6px 28px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.3); border-radius:6px; cursor:pointer; margin-left:auto; transition:all .15s; align-self:stretch; display:flex; align-items:center; }' +
                '.tmb-clear-btn:hover { background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.4); }' +
                '.tmb-table-wrap { flex:1; overflow-y:auto; overflow-x:auto; min-height:0; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin:0 6px 6px; scrollbar-width:thin; scrollbar-color:rgb(85,155,135) transparent; }' +
                '.tmb-table-wrap::-webkit-scrollbar { width:1px; height:1px; }' +
                '.tmb-table-wrap::-webkit-scrollbar-track { background:transparent; }' +
                '.tmb-table-wrap::-webkit-scrollbar-thumb { background:rgb(20,54,60); border-radius:1px; }' +
                '.tmb-table { width:100%; border-collapse:collapse; font-size:16px; }' +
                '.tmb-table thead { position:sticky; top:0; z-index:2; background:rgba(20,54,60,0.95); backdrop-filter:blur(10px); }' +
                '.tmb-table th { padding:10px 10px; color:#e8eaed; font-weight:600; text-align:center; border-bottom:2px solid rgba(85,155,135,0.6); border-right:1px solid rgba(255,255,255,0.1); white-space:nowrap; font-size:16px; }' +
                '.tmb-table th:last-child { border-right:none; }' +
                '.tmb-table th.sortable { cursor:pointer; user-select:none; }' +
                '.tmb-table th.sortable:hover { background:rgba(255,255,255,0.08); }' +
                '.tmb-sort-indicator { display:inline-block; margin-left:2px; font-size:12px; color:rgba(255,255,255,0.3); width:12px; height:12px; vertical-align:middle; }' +
                '.tmb-sort-indicator::after { content:"\\25BC"; }' +
                '.tmb-sort-indicator.sort-desc { color:#4fc3f7; }' +
                '.tmb-table td { padding:8px 10px; color:#e8eaed; border-bottom:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1); text-align:center; font-size:16px; }' +
                '.tmb-table td:last-child { border-right:none; }' +
                '.tmb-table tbody tr { height:44px; border-bottom:1px solid rgba(255,255,255,0.1); transition:background-color 0.2s ease; background:rgba(255,255,255,0.02); }' +
                '.tmb-table tbody tr:nth-child(even) { background:rgba(255,255,255,0.06); }' +
                '.tmb-table tbody tr:hover { background:rgba(85,155,135,0.2); }' +
                '.tmb-card-link { color:#64b5f6; cursor:pointer; text-decoration:none; font-size:15px; }' +
                '.tmb-card-link:hover { text-decoration:underline; }' +
                '.tmb-add-btn { padding:8px 18px; font-size:15px; background:#0F95B0; color:#fff; border:none; border-radius:6px; cursor:pointer; white-space:nowrap; position:relative; transition:all .2s; }' +
                '.tmb-add-btn:hover { background:#0D7A8E; }' +
                '.tmb-add-menu { position:absolute; right:0; top:100%; background:rgba(20,54,60,0.98); border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:4px; z-index:100; box-shadow:0 4px 16px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:3px; backdrop-filter:blur(10px); }' +
                '.tmb-add-menu button { padding:8px 24px; font-size:15px; background:rgba(255,255,255,0.1); color:#e8eaed; border:1px solid rgba(255,255,255,0.2); border-radius:6px; cursor:pointer; white-space:nowrap; transition:all .15s; }' +
                '.tmb-add-menu button:hover { background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.3); }' +
                '.tmb-loading { text-align:center; padding:20px; color:rgba(255,255,255,0.7); font-size:13px; }' +
                '.tmb-empty { text-align:center; padding:20px; color:rgba(255,255,255,0.5); font-size:13px; }' +
                '.tmb-count { font-size:14px; color:rgba(255,255,255,0.6); padding:6px 12px; flex-shrink:0; }' +
                '#tmbCardPreview { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10001; justify-content:center; align-items:center; cursor:pointer; }' +
                '#tmbCardPreview.visible { display:flex; }' +
                '#tmbCardPreview img { max-width:90vw; max-height:90vh; border-radius:0; box-shadow:0 8px 32px rgba(0,0,0,0.5); object-fit:contain; }' +
                '#tmbCardPreview .tmb-preview-close { position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); color:#fff; font-size:24px; width:40px; height:40px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; }' +
                '#tmbCardPreview .tmb-preview-close:hover { background:rgba(255,255,255,0.3); }' +
                '#tmbLoginOverlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10002; justify-content:center; align-items:center; }' +
                '#tmbLoginOverlay.visible { display:flex; }' +
                '.tmb-login-panel { background:linear-gradient(135deg,hsl(190,87%,12%),hsl(190,50%,18%)); border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:24px; min-width:320px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.4); }' +
                '.tmb-login-desc { color:#ffffff; font-size:18px; line-height:1.6; margin-bottom:14px; white-space:pre-line; text-align:center; }' +
                '.tmb-login-field { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; align-items:center; }' +
                '.tmb-login-field label { color:rgba(255,255,255,0.8); font-size:14px; }' +
                '.tmb-login-field input { padding:8px 12px; font-size:15px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:6px; outline:none; width:50%; box-sizing:border-box; }' +
                '.tmb-login-field input:focus { border-color:rgba(255,255,255,0.4); }' +
                '.tmb-login-msg { text-align:center; font-size:13px; min-height:20px; margin-bottom:8px; }' +
                '.tmb-login-msg.error { color:#ef5350; }' +
                '.tmb-login-msg.success { color:#66bb6a; }' +
                '.tmb-login-btns { display:flex; gap:10px; justify-content:center; }' +
                '.tmb-login-btns button { padding:8px 24px; font-size:15px; border-radius:6px; cursor:pointer; border:1px solid rgba(255,255,255,0.2); transition:all .15s; }' +
                '.tmb-login-submit { background:#0F95B0; color:#fff; border-color:#0F95B0 !important; }' +
                '.tmb-login-submit:hover { background:#0D7A8E; }' +
                '.tmb-login-submit:disabled { opacity:0.6; cursor:not-allowed; }' +
                '.tmb-login-cancel { background:rgba(255,255,255,0.1); color:#e8eaed; }' +
                '.tmb-login-cancel:hover { background:rgba(255,255,255,0.2); }';
            document.head.appendChild(s);
        },

        _waitForDOM() {
            var self = this;
            var check = function() {
                var tabList = document.querySelector('#playerTab');
                if (tabList) {
                    self._createUI(tabList);
                    return;
                }
                setTimeout(check, 500);
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', check);
            } else {
                check();
            }
        },

        _createUI(tabList) {
            var self = this;
            var li = document.createElement('li');
            li.className = 'nav-item';
            li.setAttribute('role', 'presentation');
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            var btn = document.createElement('button');
            btn.id = 'tmBrowserBtn';
            btn.innerHTML = self._t('btn');
            btn.addEventListener('click', function() { self._toggle(); });
            li.appendChild(btn);
            tabList.appendChild(li);

            var overlay = document.createElement('div');
            overlay.id = 'tmBrowserOverlay';
            var panel = document.createElement('div');
            panel.id = 'tmBrowserPanel';

            var header = document.createElement('div');
            header.className = 'tmb-header';
            var isAuthed = GM_getValue('tmb_auth_id', '') && GM_getValue('tmb_auth_pwd', '');
            var authCls = isAuthed ? 'tmb-auth-btn verified' : 'tmb-auth-btn';
            var authTxt = isAuthed ? self._t('authVerified') : self._t('authUnverified');
            header.innerHTML = '<button class="' + authCls + '" id="tmbAuthBtn">' + authTxt + '</button><div class="tm-title"><h2>' + self._t('title') + '</h2></div><button class="tmb-close-btn">\u00d7</button>';
            header.querySelector('.tmb-close-btn').addEventListener('click', function() { self._toggle(); });
            header.querySelector('#tmbAuthBtn').addEventListener('click', function() {
                self._showLoginDialog(function() { self._updateAuthBtn(); });
            });
            panel.appendChild(header);

            var tabs = document.createElement('div');
            tabs.className = 'tmb-tabs';
            var tabStd = document.createElement('button');
            tabStd.className = 'tmb-tab active';
            tabStd.textContent = self._t('tabStd');
            tabStd.dataset.tab = 'standard';
            var tabIC = document.createElement('button');
            tabIC.className = 'tmb-tab';
            tabIC.textContent = self._t('tabIC');
            tabIC.dataset.tab = 'ic';
            tabs.appendChild(tabStd);
            tabs.appendChild(tabIC);
            tabs.addEventListener('click', function(e) {
                if (e.target.dataset.tab) {
                    self.activeTab = e.target.dataset.tab;
                    tabs.querySelectorAll('.tmb-tab').forEach(function(t) { t.classList.remove('active'); });
                    e.target.classList.add('active');
                    self._applyFilters();
                }
            });
            panel.appendChild(tabs);

            var filters = document.createElement('div');
            filters.className = 'tmb-filters';
            filters.innerHTML =
                '<div class="tmb-filter-item"><label>' + self._t('minPower') + '</label><input type="number" id="tmbPowerFilter" placeholder="0" min="0" step="any"></div>' +
                '<div class="tmb-filter-item"><label>' + self._t('minLevel') + '</label><input type="number" id="tmbLevelFilter" placeholder="0" min="0" step="1"></div>' +
                '<div class="tmb-filter-item"><label>' + self._t('idSearch') + '</label><input type="text" id="tmbIdFilter" placeholder="' + self._t('idSearch') + '"></div>' +
                '<div class="tmb-filter-item"><label>' + self._t('job') + '</label><select id="tmbJobFilter">' +
                '<option value="">' + self._t('all') + '</option>' +
                '<option value="\u6c34\u6cd5">\u6c34\u6cd5</option>' +
                '<option value="\u706b\u6cd5">\u706b\u6cd5</option>' +
                '<option value="\u81ea\u7136\u6cd5">\u81ea\u7136\u6cd5</option>' +
                '<option value="\u5f13">\u5f13</option>' +
                '<option value="\u5f29">\u5f29</option>' +
                '<option value="\u76fe">\u76fe</option>' +
                '<option value="\u67aa">\u67aa</option>' +
                '<option value="\u9524">\u9524</option>' +
                '<option value="\u5251">\u5251</option>' +
                '</select></div>' +
                '<button class="tmb-clear-btn" id="tmbClearBtn">' + self._t('clear') + '</button>';
            panel.appendChild(filters);

            var countRow = document.createElement('div');
            countRow.className = 'tmb-count';
            countRow.id = 'tmbCount';
            panel.appendChild(countRow);

            var tableWrap = document.createElement('div');
            tableWrap.className = 'tmb-table-wrap';
            tableWrap.innerHTML =
                '<table class="tmb-table"><thead><tr>' +
                '<th>' + self._t('colId') + '</th>' +
                '<th>' + self._t('colJob') + '</th>' +
                '<th class="sortable" data-sort="power">' + self._t('colPower') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                '<th class="sortable" data-sort="level">' + self._t('colLevel') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                '<th class="sortable" data-sort="mainAttr">' + self._t('colMainAttr') + '<span class="tmb-sort-indicator notranslate" translate="no"></span></th>' +
                '<th>' + self._t('colCard') + '</th>' +
                '<th>' + self._t('colAction') + '</th>' +
                '</tr></thead><tbody id="tmbBody"></tbody></table>';
            tableWrap.querySelector('thead').addEventListener('click', function(e) {
                var th = e.target.closest('th.sortable');
                if (!th) return;
                var field = th.dataset.sort;
                if (self.sortField === field) {
                    self.sortField = 'updateTime';
                    self.sortDir = 'desc';
                } else {
                    self.sortField = field;
                    self.sortDir = 'desc';
                }
                tableWrap.querySelectorAll('.tmb-sort-indicator').forEach(function(s) { s.className = 'tmb-sort-indicator'; });
                if (self.sortField === field) {
                    var indicator = th.querySelector('.tmb-sort-indicator');
                    if (indicator) indicator.className = 'tmb-sort-indicator sort-desc';
                }
                self._applyFilters();
            });
            panel.appendChild(tableWrap);

            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) self._toggle();
            });

            var debounce = null;
            var onFilter = function() {
                clearTimeout(debounce);
                debounce = setTimeout(function() {
                    self.filters.job = document.getElementById('tmbJobFilter').value;
                    self.filters.minPower = document.getElementById('tmbPowerFilter').value;
                    self.filters.minLevel = document.getElementById('tmbLevelFilter').value;
                    self.filters.idSearch = document.getElementById('tmbIdFilter').value;
                    self._applyFilters();
                }, 250);
            };
            ['tmbJobFilter', 'tmbPowerFilter', 'tmbLevelFilter', 'tmbIdFilter'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', onFilter);
                    el.addEventListener('change', onFilter);
                }
            });
            document.getElementById('tmbClearBtn').addEventListener('click', function() {
                self.filters = { job: '', minPower: '', minLevel: '', idSearch: '' };
                document.getElementById('tmbJobFilter').value = '';
                document.getElementById('tmbPowerFilter').value = '';
                document.getElementById('tmbLevelFilter').value = '';
                document.getElementById('tmbIdFilter').value = '';
                self._applyFilters();
            });

            document.addEventListener('click', function(e) {
                if (!e.target.closest('.tmb-add-btn') && !e.target.closest('.tmb-add-menu')) {
                    var menus = document.querySelectorAll('.tmb-add-menu');
                    menus.forEach(function(m) { m.remove(); });
                }
            });
        },

        _toggle() {
            var overlay = document.getElementById('tmBrowserOverlay');
            var btn = document.getElementById('tmBrowserBtn');
            if (!overlay) return;
            this.panelVisible = !this.panelVisible;
            overlay.classList.toggle('visible', this.panelVisible);
            btn.classList.toggle('active', this.panelVisible);
            if (this.panelVisible && this.data.standard.length === 0 && this.data.ic.length === 0) {
                this._fetchData();
            }
        },

        _fetchData() {
            if (this.loading) return;
            this.loading = true;
            var self = this;
            var body = document.getElementById('tmbBody');
            var count = document.getElementById('tmbCount');
            if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-loading">' + self._t('loading') + '</td></tr>';
            if (count) count.textContent = '';
            GM_xmlhttpRequest({
                method: 'GET',
                url: TM_BROWSER_API,
                timeout: 15000,
                onload: function(response) {
                    try {
                        var json = JSON.parse(response.responseText);
                        var rawStd = (json.standard && json.standard.data) ? json.standard.data : [];
                        var rawIc = (json.ic && json.ic.data) ? json.ic.data : [];
                        var hasSimdata = function(u) { return u.simdata && u.simdata.trim().length > 0; };
                        self.data.standard = rawStd.filter(hasSimdata);
                        self.data.ic = rawIc.filter(hasSimdata);
                        self._applyFilters();
                    } catch (e) {
                        if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('parseFail') + '</td></tr>';
                    } finally {
                        self.loading = false;
                    }
                },
                onerror: function() {
                    if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('loadFail') + '</td></tr>';
                    self.loading = false;
                },
                ontimeout: function() {
                    if (body) body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + self._t('loadFail') + '</td></tr>';
                    self.loading = false;
                }
            });
        },

        _applyFilters() {
            var src = this.activeTab === 'ic' ? this.data.ic : this.data.standard;
            var f = this.filters;
            var filtered = src.filter(function(u) {
                if (f.job && (u.job || '') !== f.job) return false;
                if (f.minPower && parseFloat(u.mainAttrLevel || 0) < parseFloat(f.minPower)) return false;
                if (f.minLevel) {
                    var lvl = 0;
                    if (u.simdataDisplay) lvl = parseInt(u.simdataDisplay) || 0;
                    else if (u.battleLevel) lvl = parseInt(u.battleLevel) || 0;
                    if (lvl < parseInt(f.minLevel)) return false;
                }
                if (f.idSearch && (u.id || '').toLowerCase().indexOf(f.idSearch.toLowerCase()) === -1) return false;
                return true;
            });
            var self = this;
            var sf = this.sortField;
            filtered.sort(function(a, b) {
                var va, vb;
                if (sf === 'power') {
                    va = parseFloat(a.mainAttrLevel) || 0;
                    vb = parseFloat(b.mainAttrLevel) || 0;
                } else if (sf === 'level') {
                    va = parseInt(a.simdataDisplay || a.battleLevel) || 0;
                    vb = parseInt(b.simdataDisplay || b.battleLevel) || 0;
                } else if (sf === 'mainAttr') {
                    var ma = self._getMainAttr(a), mb = self._getMainAttr(b);
                    va = ma ? parseInt(ma) || 0 : 0;
                    vb = mb ? parseInt(mb) || 0 : 0;
                } else {
                    va = a.updateTime ? new Date(a.updateTime).getTime() : 0;
                    vb = b.updateTime ? new Date(b.updateTime).getTime() : 0;
                }
                return vb - va;
            });
            this._renderTable(filtered);
        },

        _renderTable(users) {
            var body = document.getElementById('tmbBody');
            var count = document.getElementById('tmbCount');
            if (!body) return;
            if (count) count.textContent = users.length + ' ' + this._t('usersFound');
            if (users.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="tmb-empty">' + this._t('noData') + '</td></tr>';
                return;
            }
            var self = this;
            var html = '';
            var max = Math.min(users.length, 200);
            for (var i = 0; i < max; i++) {
                var u = users[i];
                var uid = (u.id || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                var job = (u.job || '').replace(/</g, '&lt;');
                var power = u.mainAttrLevel || '';
                var levelRaw = u.simdataDisplay || u.battleLevel || '';
                var level = levelRaw ? parseInt(levelRaw) || levelRaw : '';
                var hasCard = u.cardLink ? true : false;
                var mainAttr = self._getMainAttr(u);
                html += '<tr data-idx="' + i + '">' +
                    '<td>' + uid + '</td>' +
                    '<td>' + job + '</td>' +
                    '<td>' + power + '</td>' +
                    '<td>' + level + '</td>' +
                    '<td>' + mainAttr + '</td>' +
                    '<td>' + (hasCard ? '<a class="tmb-card-link" data-card="' + i + '">' + self._t('view') + '</a>' : '-') + '</td>' +
                    '<td><button class="tmb-add-btn" data-add="' + i + '">' + self._t('add') + '</button></td>' +
                    '</tr>';
            }
            body.innerHTML = html;
            body._tmbUsers = users;
            body.onclick = function(e) {
                var cardLink = e.target.closest('[data-card]');
                if (cardLink) {
                    var ci = parseInt(cardLink.dataset.card);
                    if (users[ci] && users[ci].cardLink) {
                        self._viewCard(users[ci].cardLink);
                    }
                    return;
                }
                var menuBtn = e.target.closest('.tmb-add-menu button');
                if (menuBtn) {
                    e.stopPropagation();
                    var pi = parseInt(menuBtn.dataset.player);
                    var rowIdx = parseInt(menuBtn.dataset.useridx);
                    var menuEl = menuBtn.closest('.tmb-add-menu');
                    if (menuEl) menuEl.remove();
                    if (users[rowIdx]) {
                        self._requireAuth(function() { self._addToPlayer(pi, users[rowIdx]); });
                    }
                    return;
                }
                var addBtn = e.target.closest('[data-add]');
                if (addBtn) {
                    e.stopPropagation();
                    var ai = parseInt(addBtn.dataset.add);
                    self._showAddMenu(addBtn, users[ai]);
                    return;
                }
            };
        },

        _showAddMenu(btn) {
            document.querySelectorAll('.tmb-add-menu').forEach(function(m) { m.remove(); });
            var menu = document.createElement('div');
            menu.className = 'tmb-add-menu';
            var idx = parseInt(btn.dataset.add);
            for (var p = 1; p <= PLAYER_COUNT; p++) {
                var b = document.createElement('button');
                b.textContent = 'P' + p;
                b.dataset.player = p;
                b.dataset.useridx = idx;
                menu.appendChild(b);
            }
            btn.appendChild(menu);
        },

        _viewCard(cardUrl) {
            var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;
            if (isMobile) {
                window.open(cardUrl, '_blank');
                return;
            }
            var preview = document.getElementById('tmbCardPreview');
            if (!preview) {
                preview = document.createElement('div');
                preview.id = 'tmbCardPreview';
                preview.innerHTML = '<button class="tmb-preview-close">\u00d7</button><img src="" alt="Card">';
                preview.addEventListener('click', function(e) {
                    if (e.target === preview || e.target.classList.contains('tmb-preview-close')) {
                        preview.classList.remove('visible');
                    }
                });
                document.body.appendChild(preview);
            }
            preview.querySelector('img').src = cardUrl;
            preview.classList.add('visible');
        },

        _updateAuthBtn() {
            var btn = document.getElementById('tmbAuthBtn');
            if (!btn) return;
            var isAuthed = GM_getValue('tmb_auth_id', '') && GM_getValue('tmb_auth_pwd', '');
            btn.className = isAuthed ? 'tmb-auth-btn verified' : 'tmb-auth-btn';
            btn.textContent = isAuthed ? this._t('authVerified') : this._t('authUnverified');
        },

        _requireAuth(callback) {
            var savedId = GM_getValue('tmb_auth_id', '');
            var savedPwd = GM_getValue('tmb_auth_pwd', '');
            if (savedId && savedPwd) {
                callback();
                return;
            }
            this._showLoginDialog(callback);
        },

        _showLoginDialog(callback) {
            var self = this;
            var existing = document.getElementById('tmbLoginOverlay');
            if (existing) existing.remove();
            var overlay = document.createElement('div');
            overlay.id = 'tmbLoginOverlay';
            var savedId = GM_getValue('tmb_auth_id', '');
            var escapedId = savedId.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            overlay.innerHTML =
                '<div class="tmb-login-panel">' +
                '<div class="tmb-login-desc">' + self._t('loginDesc') + '</div>' +
                '<div class="tmb-login-field"><label>' + self._t('loginId') + '</label><input type="text" id="tmbLoginId" value="' + escapedId + '" autocomplete="off"></div>' +
                '<div class="tmb-login-field"><label>' + self._t('loginPwd') + '</label><input type="password" id="tmbLoginPwd" autocomplete="new-password"></div>' +
                '<div class="tmb-login-msg" id="tmbLoginMsg"></div>' +
                '<div class="tmb-login-btns">' +
                '<button class="tmb-login-cancel" id="tmbLoginCancel">' + self._t('loginCancel') + '</button>' +
                '<button class="tmb-login-submit" id="tmbLoginSubmit">' + self._t('loginBtn') + '</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            overlay.classList.add('visible');
            var idInput = document.getElementById('tmbLoginId');
            var pwdInput = document.getElementById('tmbLoginPwd');
            var msgEl = document.getElementById('tmbLoginMsg');
            var submitBtn = document.getElementById('tmbLoginSubmit');
            var cancelBtn = document.getElementById('tmbLoginCancel');
            if (!savedId) idInput.focus(); else pwdInput.focus();
            cancelBtn.addEventListener('click', function() { overlay.remove(); });
            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
            submitBtn.addEventListener('click', function() {
                var id = idInput.value.trim();
                var pwd = pwdInput.value;
                if (!id || !pwd) {
                    msgEl.className = 'tmb-login-msg error';
                    msgEl.textContent = self._t('loginFail');
                    return;
                }
                submitBtn.disabled = true;
                submitBtn.textContent = self._t('loginVerifying');
                msgEl.className = 'tmb-login-msg';
                msgEl.textContent = '';
                self._verifyCredentials(id, pwd, function(success, errMsg) {
                    if (success) {
                        GM_setValue('tmb_auth_id', id);
                        GM_setValue('tmb_auth_pwd', pwd);
                        msgEl.className = 'tmb-login-msg success';
                        msgEl.textContent = self._t('loginSuccess');
                        self._updateAuthBtn();
                        setTimeout(function() {
                            overlay.remove();
                            callback();
                        }, 500);
                    } else {
                        submitBtn.disabled = false;
                        submitBtn.textContent = self._t('loginBtn');
                        msgEl.className = 'tmb-login-msg error';
                        msgEl.textContent = errMsg || self._t('loginFail');
                    }
                });
            });
            pwdInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') submitBtn.click();
            });
        },

        _verifyCredentials(id, pwd, callback) {
            var self = this;
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://papiyas.chat/api/verify-password',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ id: id, password: pwd }),
                onload: function(response) {
                    try {
                        var json = JSON.parse(response.responseText);
                        if (json.success) {
                            callback(true);
                        } else {
                            var msg = self._t('loginFail');
                            if (json.code === 'ERR-2') msg = self._t('loginNoPwd');
                            else if (json.code === 'ERR-LOCKED') msg = self._t('loginLocked');
                            else if (json.message) msg = json.message;
                            callback(false, msg);
                        }
                    } catch (e) {
                        callback(false, self._t('loginFail'));
                    }
                },
                onerror: function() {
                    callback(false, self._t('loginFail'));
                }
            });
        },

        _addToPlayer(playerIdx, userData) {
            if (!userData || !userData.simdata) return;
            var simdata = userData.simdata;
            if (typeof simdata === 'object') simdata = JSON.stringify(simdata);
            var groupObj = {};
            for (var s = 1; s <= 5; s++) {
                if (s === playerIdx) {
                    groupObj[s] = simdata;
                } else if (typeof SimulatorBuildScore !== 'undefined' && SimulatorBuildScore.playerData && SimulatorBuildScore.playerData[s]) {
                    groupObj[s] = JSON.stringify(SimulatorBuildScore.playerData[s]);
                } else {
                    groupObj[s] = TMB_BLANK_PLAYER;
                }
            }
            var groupJson = JSON.stringify(groupObj);
            var groupTab = document.querySelector('a#group-combat-tab');
            if (groupTab) groupTab.click();
            var groupInput = document.querySelector('input#inputSetGroupCombatAll');
            if (groupInput) {
                groupInput.value = groupJson;
            }
            var importBtn = document.querySelector('button#buttonImportSet');
            if (importBtn) {
                importBtn.click();
            }
            var playerTab = document.querySelector('a#player' + playerIdx + '-tab');
            if (playerTab && userData.id) {
                playerTab.textContent = userData.id;
            }
        }
    };

    TalentMarketBrowser.init();

    const BuildScoreAutoUpdater = {
        INTERVAL: 60 * 60 * 1000,
        timer: null,
        lastUpdate: 0,
        enabled: false,
        password: null,
        initTimeout: null,
        
        init() {
            this.enabled = GM_getValue('mwi_buildscore_auto_enabled', false);
            this.password = GM_getValue('mwi_buildscore_password', null);
            if (this.enabled && this.password) {
                this.start();
                if (this.initTimeout) clearTimeout(this.initTimeout);
                this.initTimeout = setTimeout(() => {
                    if (DataStore.isLoaded && DataStore.buildScore) {
                        this.sendBuildScoreUpdate();
                    }
                }, 5000);
            }
        },
        
        setPassword(pwd) {
            this.password = pwd;
            GM_setValue('mwi_buildscore_password', pwd);
        },
        
        enable() {
            this.enabled = true;
            GM_setValue('mwi_buildscore_auto_enabled', true);
            this.start();
        },
            
        disable() {
            this.enabled = false;
            GM_setValue('mwi_buildscore_auto_enabled', false);
            this.stop();
        },
            
        sendBuildScoreUpdate() {
            if (!this.enabled || !this.password) {
                return false;
            }
            if (!DataStore.isLoaded || !DataStore.characterName || !DataStore.buildScore) {
                return false;
            }
            const gameMode = DataStore.gameMode;
            const isIronman = gameMode && (gameMode === 'IRONMAN' || gameMode.toLowerCase().includes('iron'));
            const apiEndpoint = isIronman 
                ? `${SITE_URL}/api/ic/ranking/${encodeURIComponent(DataStore.characterName)}/buildscore`
                : `${SITE_URL}/api/ranking/${encodeURIComponent(DataStore.characterName)}/buildscore`;
            
            const simdata = WebSocketHook.generateSimulatorData();
            const self = this;
            
            GM_xmlhttpRequest({
                method: 'PATCH',
                url: apiEndpoint,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ 
                    buildScore: DataStore.buildScore, 
                    password: this.password,
                    simdata: simdata ? JSON.stringify(simdata) : null
                }),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        self.lastUpdate = Date.now();
                    } else {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.code === 'ERR-WRONG-PWD') {
                                self.disable();
                            }
                        } catch (e) {}
                    }
                },
                onerror: function() {}
            });
            return true;
        },
        
        start() {
            if (this.timer) return;
            if (!this.enabled || !this.password) return;
            this.timer = setInterval(() => {
                if (DataStore.isLoaded && DataStore.buildScore) {
                    this.sendBuildScoreUpdate();
                }
            }, this.INTERVAL);
        },
        
        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        },
        
        showSettingsDialog() {
            const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
            const existing = document.getElementById('buildscore-settings-dialog');
            if (existing) existing.remove();
            
            const currentEnabled = GM_getValue('mwi_buildscore_auto_enabled', false);
            this.enabled = currentEnabled;
            
            const dialog = document.createElement('div');
            dialog.id = 'buildscore-settings-dialog';
            dialog.innerHTML = `
                <div class="bs-dialog-container">
                    <h3 class="bs-dialog-title">${isZH ? '模拟器数据自动更新' : 'Simulator Data Auto-Update'}</h3>
                    <div class="bs-dialog-checkbox-row">
                        <label class="bs-dialog-checkbox-label">
                            <input type="checkbox" id="bs-auto-enabled" class="bs-dialog-checkbox" ${currentEnabled ? 'checked' : ''}>
                            <span>${isZH ? '启用自动更新' : 'Enable auto-update'}</span>
                        </label>
                    </div>
                    <div class="bs-dialog-description">
                        ${isZH ? '启用并保存简历密码后，会定时自动获取模拟器数据上传更新到人才市场<br><br>注：名片图片仍需手动重新导入生成提交<br>如果没有提交过简历请先投递简历此设置才生效' : 'After enabling and saving resume password, simulator data will be automatically uploaded to talent market<br><br>Note: Card images still need to be manually re-imported and submitted<br>If you have not submitted a resume yet, please submit one first for this setting to take effect'}
                    </div>
                    <div class="bs-dialog-input-group">
                        <label class="bs-dialog-label">${isZH ? '简历密码' : 'Resume Password'}</label>
                        <input type="password" id="bs-password" class="bs-dialog-input" autocomplete="new-password" placeholder="${this.password ? (isZH ? '已保存' : 'Saved') : (isZH ? '请输入简历密码' : 'Enter resume password')}">
                    </div>
                    <div class="bs-dialog-buttons">
                        <button id="bs-cancel" class="bs-dialog-btn-cancel">${isZH ? '取消' : 'Cancel'}</button>
                        <button id="bs-save" class="bs-dialog-btn-save">${isZH ? '保存' : 'Save'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            const self = this;
            dialog.querySelector('#bs-cancel').onclick = () => dialog.remove();
            dialog.querySelector('#bs-save').onclick = async () => {
                const enabled = dialog.querySelector('#bs-auto-enabled').checked;
                const pwd = dialog.querySelector('#bs-password').value;
                const saveBtn = dialog.querySelector('#bs-save');
                
                if (enabled) {
                    const passwordToUse = pwd || self.password;
                    if (!passwordToUse) {
                        self.showToast(isZH ? '请先输入密码' : 'Please enter password', 'warning');
                        return;
                    }
                    
                    let charName = DataStore.characterName;
                    if (!charName) {
                        const nameEl = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                                      document.querySelector('[class*="CharacterName_characterName"]');
                        if (nameEl) {
                            charName = nameEl.textContent?.trim();
                            if (charName) DataStore.characterName = charName;
                        }
                    }
                    
                    if (!charName) {
                        self.showToast(isZH ? '无法获取角色名，请刷新页面重试' : 'Cannot get character name, please refresh', 'warning');
                        return;
                    }
                    
                    if (!DataStore.buildScore || DataStore.buildScore <= 0) {
                        self.showToast(isZH ? '数据未加载，请刷新页面再尝试' : 'BuildScore not loaded, please wait for game data', 'warning');
                        return;
                    }
                    
                    saveBtn.disabled = true;
                    saveBtn.textContent = isZH ? '验证中...' : 'Verifying...';
                    
                    const gameMode = DataStore.gameMode;
                    const isIronman = gameMode && (gameMode === 'IRONMAN' || gameMode.toLowerCase().includes('iron'));
                    const apiEndpoint = isIronman 
                        ? `${SITE_URL}/api/ic/ranking/${encodeURIComponent(charName)}/buildscore`
                        : `${SITE_URL}/api/ranking/${encodeURIComponent(charName)}/buildscore`;
                    
                    GM_xmlhttpRequest({
                        method: 'PATCH',
                        url: apiEndpoint,
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ buildScore: DataStore.buildScore || 0, password: passwordToUse }),
                        onload: function(response) {
                            try {
                                const result = JSON.parse(response.responseText);
                                if (response.status >= 200 && response.status < 300) {
                                    self.setPassword(passwordToUse);
                                    self.enable();
                                    self.updateButtonText();
                                    self.showToast(isZH ? '自动更新已启用' : 'Auto-update enabled', 'success');
                                    dialog.remove();
                                } else if (result.code === 'ERR-WRONG-PWD') {
                                    self.showToast(isZH ? '密码不正确' : 'Incorrect password', 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = isZH ? '保存' : 'Save';
                                } else if (result.code === 'ERR-RATE-LIMIT') {
                                    self.setPassword(passwordToUse);
                                    self.enable();
                                    self.updateButtonText();
                                    self.showToast(isZH ? '自动更新已启用' : 'Auto-update enabled (rate limited, will update later)', 'success');
                                    dialog.remove();
                                } else if (result.code === 'ERR-NO-PWD-SET') {
                                    self.showToast(isZH ? '该用户未设置简历密码，请先确定已提交过简历' : 'No password set, please set one on website first', 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = isZH ? '保存' : 'Save';
                                } else if (response.status === 404) {
                                    self.showToast(isZH ? '用户记录不存在，请先提交简历' : 'User not found, please submit resume first', 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = isZH ? '保存' : 'Save';
                                } else {
                                    self.showToast(isZH ? '验证失败: ' + result.message : 'Verification failed: ' + result.message, 'error');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = isZH ? '保存' : 'Save';
                                }
                            } catch (e) {
                                self.showToast(isZH ? '响应解析错误' : 'Response parse error', 'error');
                                saveBtn.disabled = false;
                                saveBtn.textContent = isZH ? '保存' : 'Save';
                            }
                        },
                        onerror: function() {
                            self.showToast(isZH ? '网络错误，请重试' : 'Network error, please try again', 'error');
                            saveBtn.disabled = false;
                            saveBtn.textContent = isZH ? '保存' : 'Save';
                        }
                    });
                } else {
                    self.disable();
                    self.updateButtonText();
                    dialog.remove();
                }
            };
            dialog.onclick = (e) => { if (e.target === dialog) dialog.remove(); };
        },
        
        updateButtonText() {
            const btn = document.querySelector('.tm-btn-settings');
            if (!btn) return;
            const isZH = !['en'].some(lang => localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith(lang));
            if (this.enabled && this.password) {
                btn.textContent = isZH ? '已启用自动更新' : 'Auto: ON';
                btn.style.background = '#166534';
                btn.style.color = '#86efac';
            } else {
                btn.textContent = isZH ? '未启用自动更新' : 'Auto: OFF';
                btn.style.background = '#334155';
                btn.style.color = '#94a3b8';
            }
        },
        
        showToast(message, type = 'success') {
            const existing = document.getElementById('bs-toast');
            if (existing) existing.remove();
            
            const toast = document.createElement('div');
            toast.id = 'bs-toast';
            toast.className = type;
            toast.textContent = message;
            
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%,-50%) scale(0.9)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    };
    
    window.MWI_INTEGRATED.showBuildScoreSettings = () => BuildScoreAutoUpdater.showSettingsDialog();
    window.addEventListener('mwi_buildscore_updated', () => {
        BuildScoreAutoUpdater.init();
    });
    
    const tryGetCharacterNameFromDOM = () => {
        if (DataStore.characterName) return DataStore.characterName;
        const nameEl = document.querySelector('.CharacterName_characterName__2FqyZ') || 
                      document.querySelector('[class*="CharacterName_characterName"]');
        if (nameEl) {
            const name = nameEl.textContent?.trim();
            if (name) {
                DataStore.characterName = name;
                return name;
            }
        }
        return null;
    };
    
    let initRetryCount = 0;
    const initAutoUpdater = () => {
        if (DataStore.isLoaded && DataStore.characterName) {
            BuildScoreAutoUpdater.init();
        } else {
            tryGetCharacterNameFromDOM();
            initRetryCount++;
            if (initRetryCount < 30) {
                setTimeout(initAutoUpdater, 2000);
            }
        }
    };
    if (!isSimulatorPage) {
        setTimeout(initAutoUpdater, 3000);
    }
    
    (function loadCachedClientData() {
        const cachedData = localStorage.getItem("initClientData");
        if (cachedData) {
            try {
                const decompressed = LZString.decompressFromUTF16(cachedData);
                if (decompressed) {
                    const clientData = JSON.parse(decompressed);
                    BuildScoreModule.initClientData(clientData);
                    DataStore.itemDetailMap = clientData.itemDetailMap || null;
                    DataStore.actionDetailMap = clientData.actionDetailMap || null;
                    DataStore.abilityDetailMap = clientData.abilityDetailMap || null;
                    try {
                        GM_setValue('mwi_client_data_for_sim', cachedData);
                        GM_setValue('mwi_game_server', window.location.href.includes('milkywayidlecn.com') ? 'cn' : 'en');
                        var mktJson = localStorage.getItem('MWITools_marketAPI_json');
                        var mktTs = localStorage.getItem('MWITools_marketAPI_timestamp');
                        if (mktJson && mktTs) {
                            GM_setValue('mwi_market_data_for_sim', mktJson);
                            GM_setValue('mwi_market_data_timestamp', mktTs);
                        }
                    } catch (e2) { /* silent */ }
                }
            } catch (e) {}
        }
    })();
    ClientData.init();
    SVGTool.init();
    function waitForDOMAndCreateUI() {
        if (document.body) {
            window.MWI_INTEGRATED.generateCard = generateCharacterCard;
            window.MWI_INTEGRATED.closeCard = closeCard;
            window.MWI_INTEGRATED.getData = getAllData;
            window.MWI_INTEGRATED.getSimulatorData = getSimulatorData;
            window.MWI_INTEGRATED.isDataLoaded = isDataReady;
            window.MWI_INTEGRATED.waitForData = waitForData;
            window.MWI_INTEGRATED.ClientData = ClientData;
        } else {
            setTimeout(waitForDOMAndCreateUI, 50);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForDOMAndCreateUI);
        window.addEventListener('load', waitForDOMAndCreateUI);
    } else {
        waitForDOMAndCreateUI();
    }
})();