// Light / dark theme. Loaded in <head> so the right colours are there before the first paint (no flash).
// The visitor's choice is remembered; without a choice the system setting decides.
(function () {
    var KEY = 'tdw_theme';

    function stored() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function resolve() {
        var saved = stored();
        if (saved === 'dark' || saved === 'light') return saved;
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c0e13' : '#f5f5f2');
    }

    apply(resolve());

    window.getTheme = function () {
        return document.documentElement.getAttribute('data-theme') || 'light';
    };

    window.setTheme = function (theme) {
        try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: the choice just is not remembered */ }
        apply(theme);
        document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
    };

    window.toggleTheme = function () {
        window.setTheme(window.getTheme() === 'dark' ? 'light' : 'dark');
    };

    if (window.matchMedia) {
        var query = window.matchMedia('(prefers-color-scheme: dark)');
        var onSystemChange = function () {
            if (!stored()) {
                apply(resolve());
                document.dispatchEvent(new CustomEvent('themechange', { detail: window.getTheme() }));
            }
        };
        if (query.addEventListener) query.addEventListener('change', onSystemChange);
    }
})();
