// Pull-cord light/dark switch. Pull the bulb down (or tap it) to flip the theme.
// The cord stretches with rubber-band resistance and springs back with a little
// bounce, starting from wherever the bulb is and carrying the release velocity.

const STORAGE_KEY = 'unmark-theme';
const PULL_LIMIT = 40;          // px the bulb can travel at most
const TAP_SLOP = 3;             // px of movement before a press counts as a pull
const SPRING_STIFFNESS = 500;
const SPRING_DAMPING = 15;

function readSavedTheme() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // Storage can be unavailable (private mode, blocked site data).
    }
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// Apple's rubber-band curve: the further you pull, the less the bulb follows.
function rubberband(distance, dimension = PULL_LIMIT, constant = 0.55) {
    return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
}

function inverseRubberband(offset, dimension = PULL_LIMIT, constant = 0.55) {
    const clamped = Math.min(Math.abs(offset), dimension - 0.01) * Math.sign(offset);
    return (clamped * dimension) / (constant * (dimension - Math.abs(clamped)));
}

export function mountThemeSwitch(button) {
    if (!button) return;

    const root = document.documentElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    let pull = 0;
    let velocity = 0;
    let frame = 0;
    let drag = null;
    let suppressClick = false;

    function render() {
        button.style.setProperty('--pull', `${pull.toFixed(2)}px`);
    }

    function syncState() {
        const isDark = currentTheme() === 'dark';
        button.setAttribute('aria-checked', String(isDark));
        button.title = isDark ? 'Pull for light mode' : 'Pull for dark mode';
        if (themeColorMeta) {
            themeColorMeta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || (isDark ? '#000000' : '#f5f5f7');
        }
    }

    function applyTheme(theme, { animate = true } = {}) {
        const update = () => {
            root.dataset.theme = theme;
            syncState();
        };
        const canAnimate = animate
            && typeof document.startViewTransition === 'function'
            && document.visibilityState === 'visible'
            && !prefersReducedMotion();
        if (!canAnimate) {
            update();
            return;
        }
        // Cross-fade between themes; a skipped transition still runs `update`.
        const transition = document.startViewTransition(update);
        transition.ready.catch(() => {});
        transition.updateCallbackDone.catch(() => {});
        transition.finished.catch(() => {});
    }

    function toggle() {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        saveTheme(next);
        applyTheme(next);
    }

    function stopSpring() {
        cancelAnimationFrame(frame);
        frame = 0;
    }

    // Under-damped spring back to rest, integrated per frame from the live value.
    function springHome() {
        stopSpring();
        if (prefersReducedMotion()) {
            pull = 0;
            velocity = 0;
            render();
            return;
        }
        let last = performance.now();
        const step = (now) => {
            const dt = Math.min((now - last) / 1000, 1 / 30);
            last = now;
            const force = -SPRING_STIFFNESS * pull - SPRING_DAMPING * velocity;
            velocity += force * dt;
            pull += velocity * dt;
            render();
            if (Math.abs(pull) < 0.05 && Math.abs(velocity) < 5) {
                pull = 0;
                velocity = 0;
                render();
                frame = 0;
                return;
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
    }

    button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        stopSpring();
        button.setPointerCapture(event.pointerId);
        drag = {
            id: event.pointerId,
            // Respect where the bulb already is, so grabbing it mid-bounce doesn't jump.
            originY: event.clientY - inverseRubberband(pull),
            startY: event.clientY,
            moved: false,
            samples: [{ t: event.timeStamp, y: pull }]
        };
        button.classList.add('is-pulling');
    });

    button.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const raw = event.clientY - drag.originY;
        if (Math.abs(event.clientY - drag.startY) > TAP_SLOP) drag.moved = true;
        pull = rubberband(raw);
        render();
        drag.samples.push({ t: event.timeStamp, y: pull });
        if (drag.samples.length > 5) drag.samples.shift();
    });

    const release = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const { moved, samples } = drag;
        const pulledDown = event.clientY - drag.startY > 0;
        drag = null;
        button.classList.remove('is-pulling');

        const first = samples[0];
        const lastSample = samples[samples.length - 1];
        const elapsed = (lastSample.t - first.t) / 1000;
        velocity = elapsed > 0 ? (lastSample.y - first.y) / elapsed : 0;

        if (moved) {
            // A real pull: the click that follows shouldn't toggle a second time.
            suppressClick = true;
            if (pulledDown && event.type === 'pointerup') toggle();
        }
        springHome();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);

    // Taps, clicks and Enter/Space toggle too, with a small tug on the cord.
    button.addEventListener('click', () => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        toggle();
        velocity = 260;
        springHome();
    });

    // Follow the system setting until the person picks a theme themselves.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
        if (readSavedTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light');
    });

    syncState();
    render();
}
