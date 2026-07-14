(function () {
    pagination(true);
})();

/* Project links sidebar (custom-project template).
 * Metadata comes from per-post code injection (post header), either as
 * `window.projectMetadata = {...}` or a JSON payload:
 * <script type="application/json" data-project-metadata>{...}</script>
 * Supported keys: repository, issues, documentation, download.
 * `issues` defaults to `<repository>/issues` for GitHub repositories. */
(function () {
    const nav = document.querySelector('[data-project-links]');
    if (!nav) return;

    let meta = window.projectMetadata;
    if (!meta) {
        const data = document.querySelector('script[type="application/json"][data-project-metadata]');
        if (data) {
            try {
                meta = JSON.parse(data.textContent);
            } catch (err) {
                console.warn('Ignoring invalid project metadata:', err); // eslint-disable-line no-console
            }
        }
    }
    if (!meta) return;

    if (!meta.issues && meta.repository && /^https:\/\/github\.com\//.test(meta.repository)) {
        meta.issues = meta.repository.replace(/\/+$/, '') + '/issues';
    }

    nav.querySelectorAll('[data-project-link]').forEach(function (link) {
        const url = meta[link.getAttribute('data-project-link')];
        if (!url) return;
        link.href = url;
        link.removeAttribute('hidden');
    });
})();

(function () {
    if (!document.body.classList.contains('post-template')) return;

    const cover = document.querySelector('.gh-cover');
    if (!cover) return;

    const image = cover.querySelector('.gh-cover-image');

    window.addEventListener('load', function () {
        //cover.style.setProperty('--cover-height', image.clientWidth * image.naturalHeight / image.naturalWidth + 'px');
        cover.classList.remove('loading');
    });
})();

/* Optional content renderers are loaded only when the article needs them. */
(function () {
    const content = document.querySelector('.gh-content');
    const assets = document.querySelector('script[data-optional-renderers]');
    if (!content || !assets) return;

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStylesheet(href) {
        return new Promise(function (resolve, reject) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    function hasMath() {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                return node.parentElement.closest('pre, code, script, style, textarea, .mermaid, .no-katex')
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            }
        });

        while (walker.nextNode()) {
            const text = walker.currentNode.nodeValue;
            if (/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|(^|[^\\$])\$(?!\$)(?:\\.|[^$\n])+?\$(?!\$)/.test(text)) {
                return true;
            }
        }

        return false;
    }

    function normalizeMathBlocks() {
        content.querySelectorAll('p').forEach(function (paragraph) {
            if (!paragraph.querySelector('br')) return;

            const source = Array.from(paragraph.childNodes).map(function (node) {
                return node.nodeName === 'BR' ? '\n' : node.textContent;
            }).join('');

            if (/^\s*\$\$[\s\S]+\$\$\s*$/.test(source)) {
                paragraph.textContent = source;
            }
        });
    }

    async function highlightCode() {
        const blocks = Array.from(content.querySelectorAll('pre > code[class*="language-"]'))
            .filter(function (block) {
                return !block.classList.contains('language-mermaid');
            });
        if (!blocks.length) return;

        window.Prism = {manual: true};
        await loadScript(assets.dataset.prismCore);
        await loadScript(assets.dataset.prismAutoloader);
        const prismCoreUrl = new URL(assets.dataset.prismCore, document.baseURI);
        window.Prism.plugins.autoloader.languages_path = new URL('.', prismCoreUrl).href;
        blocks.forEach(function (block) {
            window.Prism.highlightElement(block);
        });
    }

    async function renderDiagrams() {
        const sources = Array.from(content.querySelectorAll('code.language-mermaid, pre.mermaid'));
        const originals = Array.from(new Set(sources.map(function (source) {
            return source.matches('code') ? source.closest('pre') : source;
        })));
        if (!originals.length) return;

        const diagrams = originals.map(function (original) {
            const source = original.querySelector('code.language-mermaid') || original;
            const diagram = document.createElement('div');
            diagram.className = 'mermaid is-loading';
            diagram.textContent = source.textContent;
            diagram.style.minHeight = Math.max(120, original.offsetHeight) + 'px';
            diagram.setAttribute('aria-busy', 'true');
            diagram.setAttribute('aria-label', 'Rendering diagram');
            original.replaceWith(diagram);
            return {diagram: diagram, original: original};
        });

        try {
            const module = await import(assets.dataset.mermaid);
            const mermaid = module.default;
            mermaid.initialize({startOnLoad: false, securityLevel: 'strict'});
            await mermaid.run({nodes: diagrams.map(function (item) { return item.diagram; })});
            diagrams.forEach(function (item) {
                item.diagram.classList.remove('is-loading');
                item.diagram.style.removeProperty('min-height');
                item.diagram.removeAttribute('aria-busy');
                item.diagram.removeAttribute('aria-label');
            });
        } catch (err) {
            diagrams.forEach(function (item) {
                item.diagram.replaceWith(item.original);
            });
            console.warn('Unable to render Mermaid diagrams:', err); // eslint-disable-line no-console
        }
    }

    async function renderMath() {
        normalizeMathBlocks();
        if (!hasMath()) return;

        await Promise.all([
            loadStylesheet(assets.dataset.katexStyles),
            loadScript(assets.dataset.katex)
        ]);
        await loadScript(assets.dataset.katexAutoRender);
        window.renderMathInElement(content, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false},
                {left: '$', right: '$', display: false}
            ],
            ignoredClasses: ['mermaid', 'no-katex'],
            output: 'htmlAndMathml',
            throwOnError: false,
            strict: 'warn',
            trust: false,
            maxSize: 50,
            maxExpand: 1000
        });
        await loadScript(assets.dataset.katexCopy);
    }

    function initializeRenderers() {
        Promise.allSettled([
            renderDiagrams(),
            highlightCode(),
            renderMath()
        ]).then(function (results) {
            results.forEach(function (result) {
                if (result.status === 'rejected') {
                    console.warn('Unable to initialize an optional content renderer:', result.reason); // eslint-disable-line no-console
                }
            });
        });
    }

    requestAnimationFrame(function () {
        requestAnimationFrame(initializeRenderers);
    });
})();
