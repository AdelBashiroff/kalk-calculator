(() => {
    const exprEl = document.getElementById('expr');
    const resultEl = document.getElementById('result');
    const tapeEl = document.getElementById('tape');
    const screenEl = document.querySelector('.screen');
    const soundBtn = document.getElementById('sound');

    const OPS = ['+', '−', '×', '÷'];
    let expr = '';
    let justEvaluated = false;
    const history = [];

    // ===== Хранилище (с защитой от недоступности) =====
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    };

    // ===== Парсер выражений (без eval) =====
    function tokenize(s) {
        const tokens = s.match(/\d+\.?\d*|\.\d+|[+−×÷%]/g) || [];
        return tokens;
    }

    function evaluate(s) {
        const t = tokenize(s);
        let i = 0;
        const peek = () => t[i];
        const next = () => t[i++];

        function number() {
            let sign = 1;
            while (peek() === '−' || peek() === '+') { if (next() === '−') sign = -sign; }
            const tok = next();
            if (tok === undefined || isNaN(parseFloat(tok))) throw new Error('syntax');
            let v = parseFloat(tok) * sign;
            while (peek() === '%') { next(); v /= 100; }
            return v;
        }
        function term() {
            let v = number();
            while (peek() === '×' || peek() === '÷') {
                const op = next();
                const r = number();
                if (op === '÷' && r === 0) throw new Error('div0');
                v = op === '×' ? v * r : v / r;
            }
            return v;
        }
        function sum() {
            let v = term();
            while (peek() === '+' || peek() === '−') {
                const op = next();
                const r = term();
                v = op === '+' ? v + r : v - r;
            }
            return v;
        }
        const out = sum();
        if (i < t.length) throw new Error('syntax');
        return out;
    }

    function fmt(n) {
        if (!isFinite(n)) throw new Error('range');
        let s = parseFloat(n.toPrecision(12)).toString();
        if (s.includes('e')) return s.replace('e+', 'e');
        const [int, dec] = s.split('.');
        const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return dec ? `${grouped},${dec}` : grouped;
    }

    // ===== Отрисовка =====
    function render() {
        exprEl.textContent = expr === '' ? '0' : expr.replace(/\./g, ',');
        exprEl.classList.toggle('small', expr.length > 11);

        // подсветка активного оператора
        const last = expr.slice(-1);
        document.querySelectorAll('.key.op').forEach(k =>
            k.classList.toggle('active', k.dataset.k === last));

        // живой результат
        resultEl.innerHTML = '&nbsp;';
        if (!justEvaluated && /[+−×÷%]/.test(expr.replace(/^−/, ''))) {
            try {
                const trimmed = OPS.includes(last) ? expr.slice(0, -1) : expr;
                resultEl.textContent = '= ' + fmt(evaluate(trimmed));
            } catch { /* ждём полного выражения */ }
        }
    }

    function renderTape() {
        tapeEl.innerHTML = '';
        history.slice(-3).forEach(h => {
            const li = document.createElement('li');
            li.textContent = `${h.expr.replace(/\./g, ',')} = ${h.res}`;
            li.title = 'Вернуть результат';
            li.addEventListener('click', () => {
                expr = h.raw;
                justEvaluated = true;
                render();
                click('soft');
            });
            tapeEl.appendChild(li);
        });
    }

    function error() {
        screenEl.classList.remove('error');
        void screenEl.offsetWidth;
        screenEl.classList.add('error');
    }

    // ===== Логика кнопок =====
    function lastNumber() {
        const m = expr.match(/(\d*\.?\d*)$/);
        return m ? m[1] : '';
    }

    function press(k) {
        if (/^\d$/.test(k)) {
            if (justEvaluated) { expr = ''; justEvaluated = false; }
            if (lastNumber() === '0') expr = expr.slice(0, -1);
            if (expr.slice(-1) === '%') return;
            expr += k;
        } else if (k === '.') {
            if (justEvaluated) { expr = ''; justEvaluated = false; }
            if (lastNumber().includes('.')) return;
            expr += (lastNumber() === '' ? '0.' : '.');
        } else if (OPS.includes(k)) {
            justEvaluated = false;
            if (expr === '') { if (k === '−') expr = '−'; return render(); }
            if (OPS.includes(expr.slice(-1))) expr = expr.slice(0, -1);
            if (expr === '−') return;
            expr += k;
        } else if (k === '%') {
            if (/[\d.]$/.test(expr)) { expr += '%'; justEvaluated = false; }
        } else if (k === '±') {
            const m = expr.match(/^(.*?)(−?)(\d*\.?\d*%?)$/);
            if (m && m[3]) {
                const before = m[1], neg = m[2], num = m[3];
                const prevIsNumber = /[\d%]$/.test(before);
                if (neg && (before === '' || OPS.includes(before.slice(-1)))) expr = before + num;
                else if (!neg && !prevIsNumber) expr = before + '−' + num;
                else if (!neg && prevIsNumber) return;
            }
        } else if (k === '⌫') {
            if (justEvaluated) { expr = ''; justEvaluated = false; }
            else expr = expr.slice(0, -1);
        } else if (k === 'AC') {
            expr = ''; justEvaluated = false; resultEl.innerHTML = '&nbsp;';
        } else if (k === '=') {
            if (expr === '') return;
            const trimmed = OPS.includes(expr.slice(-1)) ? expr.slice(0, -1) : expr;
            try {
                const v = evaluate(trimmed);
                const res = fmt(v);
                history.push({ expr: trimmed, res, raw: String(parseFloat(v.toPrecision(12))).replace('-', '−') });
                expr = String(parseFloat(v.toPrecision(12))).replace('-', '−');
                justEvaluated = true;
                renderTape();
            } catch (e) {
                error();
                resultEl.textContent = e.message === 'div0' ? 'на ноль делить нельзя' : 'не могу посчитать';
                return;
            }
        }
        render();
    }

    // ===== Звук =====
    let audio, soundOn = store.get('kalk-sound') === '1';
    function click(type = 'key') {
        if (!soundOn) return;
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            const now = audio.currentTime;
            const o = audio.createOscillator();
            const g = audio.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(type === 'eq' ? 520 : type === 'soft' ? 260 : 340, now);
            o.frequency.exponentialRampToValueAtTime(90, now + 0.06);
            g.gain.setValueAtTime(0.12, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            o.connect(g).connect(audio.destination);
            o.start(now); o.stop(now + 0.08);
        } catch { /* звук недоступен */ }
    }
    function syncSound() {
        soundBtn.textContent = 'Звук: ' + (soundOn ? 'вкл' : 'выкл');
        soundBtn.setAttribute('aria-pressed', soundOn);
    }
    soundBtn.addEventListener('click', () => {
        soundOn = !soundOn; store.set('kalk-sound', soundOn ? '1' : '0'); syncSound(); click();
    });
    syncSound();

    // ===== События: мышь/тач =====
    document.querySelectorAll('.key').forEach(btn => {
        btn.addEventListener('click', () => {
            click(btn.dataset.k === '=' ? 'eq' : 'key');
            press(btn.dataset.k);
        });
    });

    // ===== Клавиатура =====
    const KEYMAP = { '*': '×', '/': '÷', '-': '−', ',': '.', 'Enter': '=', '=': '=', 'Backspace': '⌫', 'Escape': 'AC', 'Delete': 'AC' };
    document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = KEYMAP[e.key] || e.key;
        const btn = [...document.querySelectorAll('.key')].find(b => b.dataset.k === k);
        if (!btn) return;
        if (e.key === 'Enter' || e.key === '/') e.preventDefault();
        if (e.target.closest && e.target.closest('button') && e.key === 'Enter') e.target.blur();
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 110);
        click(k === '=' ? 'eq' : 'key');
        press(k);
    });

    // ===== Темы =====
    const swatches = document.querySelectorAll('.swatch');
    function setTheme(name) {
        document.body.dataset.theme = name;
        swatches.forEach(s => s.setAttribute('aria-checked', s.dataset.set === name));
        store.set('kalk-theme', name);
    }
    swatches.forEach(s => s.addEventListener('click', () => { setTheme(s.dataset.set); click('soft'); }));
    const saved = store.get('kalk-theme');
    if (saved && document.querySelector(`.swatch[data-set="${saved}"]`)) setTheme(saved);

    render();

    // ===== Bento: интерактивные фишки =====
    const bigkey = document.getElementById('bigkey');
    const pushes = document.getElementById('pushes');
    let pushCount = 0;
    bigkey.addEventListener('click', () => { pushes.textContent = ++pushCount; click('eq'); });

    const live = document.getElementById('live');
    const liveout = document.getElementById('liveout');
    function updateLive() {
        const src = live.value.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−')
            .replace(/,/g, '.').replace(/[()\s]/g, '');
        // скобок парсер не знает — раскрываем простейший случай a*(b+c) через рекурсию по самым вложенным
        let text = live.value.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/,/g, '.').replace(/\s/g, '');
        try {
            let guard = 0;
            while (/\(/.test(text) && guard++ < 20) {
                text = text.replace(/\(([^()]*)\)/, (_, inner) => String(evaluate(inner)).replace('-', '−'));
            }
            liveout.textContent = '= ' + fmt(evaluate(text));
        } catch { liveout.textContent = src ? '…' : ''; }
    }
    live.addEventListener('input', updateLive);
    updateLive();

    const mini = document.getElementById('minitape');
    const samples = ['128×3+45', '1200÷8', '19,9×3', '72×0,15', '999+1'];
    let si = 0;
    function pushSample() {
        const e = samples[si++ % samples.length];
        let r; try { r = fmt(evaluate(e.replace(/,/g, '.'))); } catch { return; }
        const li = document.createElement('li');
        li.innerHTML = `<span>${e}</span><b>${r}</b>`;
        li.addEventListener('click', () => {
            expr = String(parseFloat(evaluate(e.replace(/,/g, '.')).toPrecision(12)));
            justEvaluated = true; render(); click('soft');
            document.getElementById('device').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        mini.prepend(li);
        while (mini.children.length > 3) mini.lastChild.remove();
    }
    pushSample(); pushSample(); pushSample();
    setInterval(pushSample, 2600);

    document.querySelectorAll('.chips button').forEach(b =>
        b.addEventListener('click', () => { setTheme(b.dataset.set); click('soft'); }));

    // ?demo=night — предзаполненный пример (для скриншотов)
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo !== null) {
        if (demo) setTheme(demo);
        ['1', '2', '8', '×', '3', '+', '4', '5', '=', '÷', '4', '=', '+', '2', '5', '×', '4'].forEach(press);
    }
})();
