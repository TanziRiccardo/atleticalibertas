(function () {
    'use strict';
    function init() {
        const spinner = document.getElementById('spinner');
        if (spinner) spinner.classList.remove('show');
        const navbar = document.querySelector('.navbar');
        const top = document.querySelector('.back-to-top');
        function updateScroll() {
            if (navbar) {
                ['position-fixed', 'bg-dark', 'shadow-sm'].forEach(name => navbar.classList.toggle(name, window.scrollY > 0));
            }
            if (top) top.style.display = window.scrollY > 300 ? 'flex' : 'none';
        }
        window.addEventListener('scroll', updateScroll, { passive: true });
        updateScroll();
        if (top) top.addEventListener('click', function (event) {
            event.preventDefault();
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        });
        if (typeof window.WOW === 'function') new window.WOW().init();
        const $ = window.jQuery;
        if ($ && $.fn && typeof $.fn.owlCarousel === 'function') {
            $('.testimonial-carousel').owlCarousel({ autoplay: true, smartSpeed: 1000, loop: true, nav: false, dots: true, items: 1, dotsData: true });
        }
        // Menu di riserva: navigazione utilizzabile anche se il CDN di Bootstrap è assente.
        if (!(window.bootstrap && window.bootstrap.Collapse)) {
            document.querySelectorAll('.navbar-toggler').forEach(function (button) {
                const menu = document.querySelector(button.getAttribute('data-bs-target'));
                if (!menu) return;
                button.addEventListener('click', function () {
                    const opened = menu.classList.toggle('show');
                    button.setAttribute('aria-expanded', String(opened));
                });
            });
            document.querySelectorAll('[data-bs-toggle="collapse"][data-bs-target^="#c"]').forEach(function (button) {
                const panel = document.querySelector(button.getAttribute('data-bs-target'));
                if (!panel) return;
                button.addEventListener('click', function () {
                    const opened = panel.classList.toggle('show');
                    button.classList.toggle('collapsed', !opened);
                    button.setAttribute('aria-expanded', String(opened));
                });
            });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
