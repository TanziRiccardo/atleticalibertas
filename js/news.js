/**
 * Atletica Libertas — contenuti pubblici, sola lettura.
 * L'autorizzazione a modificare i fogli è gestita da Google Drive/Sheets.
 * Nessun endpoint di scrittura, password o ruolo amministratore nel browser.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', api.init, { once: true });
        } else api.init();
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const FEEDS = Object.freeze({
        events: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsOkZ93mzlt-_cgnWRIPq0y23jcHz7vonOz74-FCUv_mP14LltvLoVDPGym-p5U-og8Sh4BTHdlEL3/pub?gid=0&single=true&output=csv',
        news: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXxF7-47GrbPewTHFdbqGUzMAZJTnzB9AQYWfrXAQYHnH-i0ScQv36kbBBodmvYbteFpiU1_I1moiN/pub?gid=0&single=true&output=csv'
    });
    const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const PAGE_SIZE = 4;

    /** CSV con BOM, separatore ,/;/tab, virgolette, ritorni a capo nelle celle. */
    function parseCsv(input) {
        const text = String(input || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        if (!text.trim()) return [];
        if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) throw new Error('La sorgente non è CSV');
        const headerLine = text.trimStart().split('\n')[0];
        const counts = { ',': 0, ';': 0, '\t': 0 };
        let quoted = false;
        for (let i = 0; i < headerLine.length; i++) {
            const ch = headerLine[i];
            if (ch === '"') {
                if (quoted && headerLine[i + 1] === '"') i++;
                else quoted = !quoted;
            } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch]++;
        }
        const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const matrix = [];
        let row = [], cell = '';
        quoted = false;
        function pushRow() {
            row.push(cell.trim());
            if (row.some(value => value !== '')) matrix.push(row);
            row = []; cell = '';
        }
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"') {
                if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
                else if (quoted || !cell.trim()) quoted = !quoted;
                else cell += ch;
            } else if (ch === delimiter && !quoted) {
                row.push(cell.trim()); cell = '';
            } else if (ch === '\n' && !quoted) pushRow();
            else cell += ch;
        }
        if (quoted) throw new Error('Virgolette CSV non chiuse');
        if (cell || row.length) pushRow();
        if (!matrix.length) return [];
        const headers = matrix.shift().map(h => h.toLowerCase().trim());
        if (!headers.some(h => h === 'title' || h === 'titolo') ||
            !headers.some(h => ['date', 'data', 'giorno'].includes(h))) {
            throw new Error('Intestazioni date/title mancanti');
        }
        return matrix.map(values => {
            const record = Object.create(null);
            headers.forEach((header, index) => { if (header) record[header] = values[index] || ''; });
            return record;
        });
    }

    /** Accetta date ISO e italiane, rifiuta date inesistenti senza normalizzarle. */
    function parseDate(value) {
        const str = String(value || '').trim();
        let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
        let year, month, day;
        if (match) [, year, month, day] = match.map(Number);
        else {
            match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(str);
            if (!match) return null;
            day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
        }
        if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return {
            year, month, day,
            iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            sort: year * 10000 + month * 100 + day
        };
    }

    function parseTime(value) {
        const match = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(String(value || '').trim());
        if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
        return `${match[1].padStart(2, '0')}:${match[2]}`;
    }

    /** Nessuno schema javascript:/data:, credenziali o URL senza protocollo. */
    function safeUrl(value, base) {
        const raw = String(value || '').trim();
        if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw) || raw.startsWith('//')) return '';
        try {
            const url = new URL(raw, base || (typeof document !== 'undefined' ? document.baseURI : 'https://www.atleticalibertas.it/'));
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
            return url.href;
        } catch (_) { return ''; }
    }

    function getImageSources(value, kind) {
        const fallback = kind === 'events' ? 'img/evento.jpg' : 'img/agonismo.jpg';
        const url = safeUrl(value);
        if (!url) return [fallback];
        const parsed = new URL(url);
        if (parsed.hostname === 'drive.google.com') {
            const match = /\/file\/d\/([A-Za-z0-9_-]+)/.exec(parsed.pathname);
            const id = match ? match[1] : parsed.searchParams.get('id');
            if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return [fallback];
            const resourceKey = parsed.searchParams.get('resourcekey');
            const key = resourceKey ? '&resourcekey=' + encodeURIComponent(resourceKey) : '';
            return [
                `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200${key}`,
                `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}${key}`,
                fallback
            ];
        }
        return [url, fallback];
    }

    function pick(row, keys) {
        for (const key of keys) if (String(row[key] || '').trim()) return String(row[key]).trim();
        return '';
    }

    function normalizeRows(rows, kind) {
        return rows.map(row => ({
            kind,
            date: parseDate(pick(row, ['date', 'data', 'giorno'])),
            time: parseTime(pick(row, ['time', 'ora', 'orario'])),
            title: pick(row, ['title', 'titolo']),
            location: pick(row, ['location', 'luogo']),
            tag: pick(row, ['tag', 'categoria']),
            excerpt: pick(row, ['excerpt', 'anteprima', 'sommario', 'descrizione', 'testo']),
            url: safeUrl(pick(row, ['url', 'link'])),
            image: pick(row, ['image', 'immagine', 'locandina'])
        })).filter(item => item.title && item.date).sort((a, b) => {
            const dateOrder = a.date.sort - b.date.sort;
            return kind === 'events' ? dateOrder || a.time.localeCompare(b.time) : -dateOrder;
        });
    }

    function searchText(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
    }

    function matches(item, query) {
        if (!query) return true;
        return searchText([item.title, item.location, item.tag, item.excerpt, item.date.iso,
            `${item.date.day}/${item.date.month}/${item.date.year}`].join(' ')).includes(searchText(query));
    }

    function todayKey(now) {
        // La classificazione resta sul fuso italiano anche per chi visita dall'estero.
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now || new Date());
        const partsByType = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return Number(partsByType.year + partsByType.month + partsByType.day);
    }

    function visibleEvents(items, mode, today, query) {
        const results = items.filter(item => (mode === 'past' ? item.date.sort < today : item.date.sort >= today) && matches(item, query));
        return results.slice().sort((a, b) => mode === 'past'
            ? b.date.sort - a.date.sort || b.time.localeCompare(a.time)
            : a.date.sort - b.date.sort || a.time.localeCompare(b.time));
    }

    function element(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function imageFor(item, className) {
        const img = element('img', className);
        const sources = getImageSources(item.image, item.kind);
        let index = 0;
        img.alt = item.title;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
            index++;
            if (index < sources.length) img.src = sources[index];
            else img.hidden = true;
        });
        img.src = sources[0];
        return img;
    }

    function readableDate(date) {
        return `${date.day} ${MONTHS[date.month - 1].toLowerCase()} ${date.year}`;
    }

    function externalLink(url, label, className) {
        const link = element('a', className, label);
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
    }

    function dateBadge(date) {
        const badge = element('time', 'content-date');
        badge.dateTime = date.iso;
        badge.setAttribute('aria-label', readableDate(date));
        badge.append(element('span', 'content-date-day', String(date.day).padStart(2, '0')),
            element('span', 'content-date-month', MONTHS[date.month - 1]),
            element('span', 'content-date-year', String(date.year)));
        return badge;
    }

    function init() {
        const targets = { events: document.getElementById('events-list'), news: document.getElementById('news-list') };
        if (!targets.events || !targets.news) return;
        const states = {
            events: { items: [], status: 'loading' },
            news: { items: [], status: 'loading' }
        };
        let mode = 'upcoming', query = '', limit = PAGE_SIZE;
        const more = document.getElementById('show-all-news');
        const dialog = document.getElementById('content-dialog');
        const close = document.getElementById('close-content-dialog');
        let opener = null;

        function showDetails(item, source) {
            if (!dialog || typeof dialog.showModal !== 'function') {
                if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
                return;
            }
            opener = source;
            document.getElementById('content-dialog-title').textContent = item.title;
            const body = document.getElementById('content-dialog-body');
            body.replaceChildren();
            const meta = [readableDate(item.date), item.time, item.location].filter(Boolean).join(' · ');
            body.append(element('p', 'content-meta', meta));
            if (item.tag) body.append(element('span', 'content-tag mb-3', item.tag));
            body.append(imageFor(item, 'content-dialog-image'));
            if (item.excerpt) body.append(element('p', 'content-full-text mt-4', item.excerpt));
            const links = element('div', 'd-flex flex-wrap gap-2 mt-4');
            if (item.url) links.append(externalLink(item.url, 'Apri il link', 'btn btn-primary'));
            const original = safeUrl(item.image);
            if (original) links.append(externalLink(original, 'Apri immagine originale', 'btn btn-outline-primary border-2'));
            body.append(links);
            dialog.showModal();
            document.body.classList.add('content-modal-open');
            close.focus();
        }
        if (dialog && close) {
            close.addEventListener('click', () => dialog.close());
            dialog.addEventListener('close', () => {
                document.body.classList.remove('content-modal-open');
                if (opener && opener.isConnected) opener.focus();
            });
            dialog.addEventListener('click', event => {
                if (event.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
            });
        }

        function detailButton(item) {
            const button = element('button', 'btn btn-outline-primary border-2', item.kind === 'events' ? 'Vedi evento' : 'Leggi notizia');
            button.type = 'button';
            button.setAttribute('aria-label', `${item.kind === 'events' ? 'Vedi evento' : 'Leggi notizia'}: ${item.title}`);
            button.addEventListener('click', () => showDetails(item, button));
            return button;
        }

        function eventCard(item) {
            const article = element('article', 'event-card');
            article.append(dateBadge(item.date), imageFor(item, 'event-image'));
            const body = element('div', 'event-card-body');
            if (item.tag) body.append(element('span', 'content-tag', item.tag));
            body.append(element('h3', 'event-card-title', item.title));
            const meta = [item.time ? `Ore ${item.time}` : 'Orario da definire', item.location].filter(Boolean).join(' · ');
            body.append(element('p', 'content-meta mb-0', meta));
            article.append(body, detailButton(item));
            return article;
        }

        function newsCard(item) {
            const column = element('div', 'col-md-6');
            const article = element('article', 'news-card h-100');
            const media = element('div', 'news-card-media');
            media.append(imageFor(item, 'news-card-image'), dateBadge(item.date));
            const body = element('div', 'news-card-body');
            if (item.tag) body.append(element('span', 'content-tag', item.tag));
            body.append(element('h3', 'news-card-title', item.title));
            if (item.excerpt) body.append(element('p', 'news-excerpt', item.excerpt));
            const footer = element('div', 'news-card-footer');
            footer.append(detailButton(item));
            article.append(media, body, footer);
            column.append(article);
            return column;
        }

        function message(kind, text, action) {
            const box = element('div', kind === 'news' ? 'col-12' : '');
            const panel = element('div', 'content-message');
            panel.append(element('p', 'mb-0', text));
            if (action) {
                const button = element('button', 'btn btn-outline-primary border-2 mt-3', action.label);
                button.type = 'button';
                button.addEventListener('click', action.callback);
                panel.append(button);
            }
            box.append(panel);
            targets[kind].replaceChildren(box);
        }

        function render(kind) {
            const state = states[kind];
            if (kind === 'news') more.hidden = true;
            targets[kind].setAttribute('aria-busy', state.status === 'loading' ? 'true' : 'false');
            const counter = document.getElementById(kind + '-count');
            if (state.status === 'loading') {
                counter.textContent = '';
                message(kind, kind === 'events' ? 'Caricamento degli eventi…' : 'Caricamento delle notizie…');
                return;
            }
            if (state.status === 'error') {
                counter.textContent = '';
                message(kind, 'Non riusciamo a caricare i contenuti in questo momento. Riprova tra poco.', {
                    label: 'Riprova', callback: () => load(kind)
                });
                return;
            }
            const result = kind === 'events'
                ? visibleEvents(state.items, mode, todayKey(), query)
                : state.items.filter(item => matches(item, query));
            counter.textContent = `${result.length} ${kind === 'events' ? (result.length === 1 ? 'evento' : 'eventi') : (result.length === 1 ? 'notizia' : 'notizie')}`;
            if (!result.length) {
                if (query.trim()) message(kind, 'Nessun risultato per questa ricerca. Prova con un’altra parola.');
                else if (kind === 'events' && mode === 'upcoming') {
                    const pastCount = state.items.filter(item => item.date.sort < todayKey()).length;
                    message(kind, 'Al momento non ci sono eventi in programma. Torna a trovarci per i prossimi appuntamenti.', pastCount ? {
                        label: 'Consulta gli eventi passati', callback: () => setMode('past')
                    } : null);
                } else message(kind, kind === 'events' ? 'Non ci sono eventi passati in archivio.' : 'Le prossime notizie della società saranno pubblicate qui.');
                return;
            }
            const fragment = document.createDocumentFragment();
            (kind === 'news' ? result.slice(0, limit) : result).forEach(item => fragment.append(kind === 'events' ? eventCard(item) : newsCard(item)));
            targets[kind].replaceChildren(fragment);
            if (kind === 'news' && result.length > limit) {
                more.hidden = false;
                more.textContent = `Mostra altre notizie (${result.length - limit})`;
            }
        }

        function setMode(value) {
            mode = value;
            document.getElementById('events-title').textContent = mode === 'past' ? 'Eventi passati' : 'Prossimi Eventi';
            document.querySelectorAll('[data-events-view]').forEach(button => {
                const active = button.dataset.eventsView === mode;
                button.setAttribute('aria-pressed', String(active));
                button.classList.toggle('is-active', active);
            });
            render('events');
        }
        document.querySelectorAll('[data-events-view]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.eventsView)));
        const search = document.getElementById('content-search');
        if (search) search.addEventListener('input', () => {
            query = search.value; limit = PAGE_SIZE;
            render('events'); render('news');
        });
        more.addEventListener('click', () => {
            const previous = limit;
            limit += PAGE_SIZE;
            render('news');
            const firstNew = targets.news.children[previous];
            if (firstNew) {
                firstNew.setAttribute('tabindex', '-1');
                firstNew.focus({ preventScroll: true });
            }
        });

        async function load(kind) {
            states[kind].status = 'loading';
            render(kind);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 18000);
            try {
                const response = await fetch(FEEDS[kind], {
                    method: 'GET', cache: 'no-store', mode: 'cors', credentials: 'omit', signal: controller.signal
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const rows = parseCsv(await response.text());
                const items = normalizeRows(rows, kind);
                if (rows.length && !items.length) throw new Error('Nessuna riga con titolo e data validi');
                states[kind] = { items, status: 'ready' };
            } catch (error) {
                states[kind].status = 'error';
                console.warn(`[Atletica Libertas] ${kind}: caricamento non riuscito`, error.message);
            } finally {
                clearTimeout(timer);
                render(kind);
            }
        }
        // Richieste indipendenti: un problema su una sorgente non blocca l'altra.
        load('events');
        load('news');
    }

    return Object.freeze({ parseCsv, parseDate, parseTime, safeUrl, getImageSources, normalizeRows, matches, todayKey, visibleEvents, init });
});
