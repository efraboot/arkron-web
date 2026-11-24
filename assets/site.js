(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const canvas of document.querySelectorAll('.banner-network')) {
    const context = canvas.getContext('2d');
    if (!context) continue;
    const banner = canvas.parentElement;
    let width = 0;
    let height = 0;
    let nodes = [];
    let connections = [];
    let cursor = null;
    let spot = null;
    let energy = 0;
    let keyboardFocus = false;
    let queuedFrame = 0;
    let previousFrame = 0;

    function draw(time) {
      queuedFrame = 0;
      context.clearRect(0, 0, width, height);
      const target = cursor || (keyboardFocus ? { x: width * .65, y: height * .54 } : null);
      const delta = Math.min(42, time - previousFrame || 16);
      previousFrame = time;
      const easing = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 55);
      const targetEnergy = target ? 1 : 0;
      energy += (targetEnergy - energy) * easing;
      if (Math.abs(targetEnergy - energy) < .015) energy = targetEnergy;
      if (target) {
        spot ??= {...target};
        spot.x += (target.x - spot.x) * easing;
        spot.y += (target.y - spot.y) * easing;
      } else if (energy === 0) spot = null;

      const radius = Math.min(235, Math.max(105, width * .25));
      const light = nodes.map(node => spot ? energy * Math.max(0, 1 - Math.hypot(node.x - spot.x, node.y - spot.y) / radius) : 0);
      const animateSignals = Boolean(cursor && !reducedMotion.matches);

      for (const [index, [from, to]] of connections.entries()) {
        const glow = Math.max(light[from], light[to]);
        context.strokeStyle = `rgba(98, 222, 255, ${.085 + glow * .66})`;
        context.lineWidth = .75 + glow * .9;
        context.beginPath();
        context.moveTo(nodes[from].x, nodes[from].y);
        context.lineTo(nodes[to].x, nodes[to].y);
        context.stroke();
        if (animateSignals && glow > .28 && index % 3 === 0) {
          const progress = (time / 1250 + index * .19) % 1;
          const signalX = nodes[from].x + (nodes[to].x - nodes[from].x) * progress;
          const signalY = nodes[from].y + (nodes[to].y - nodes[from].y) * progress;
          context.fillStyle = `rgba(174, 249, 255, ${glow * Math.sin(Math.PI * progress)})`;
          context.beginPath();
          context.arc(signalX, signalY, 1.8, 0, 2 * Math.PI);
          context.fill();
        }
      }

      nodes.forEach(({x, y}, i) => {
        const glow = light[i];
        if (glow > .12) {
          const bloom = context.createRadialGradient(x, y, 0, x, y, 5 + glow * 14);
          bloom.addColorStop(0, `rgba(83, 225, 255, ${glow * .64})`);
          bloom.addColorStop(1, 'rgba(83, 225, 255, 0)');
          context.fillStyle = bloom;
          context.fillRect(x - 20, y - 20, 40, 40);
        }
        context.fillStyle = `rgba(165, 237, 255, ${.27 + glow * .73})`;
        context.beginPath();
        context.arc(x, y, 1.35 + glow * 2.15, 0, 2 * Math.PI);
        context.fill();
      });
      if (animateSignals || energy !== targetEnergy) requestDraw();
    }

    function requestDraw() {
      if (!queuedFrame) queuedFrame = window.requestAnimationFrame(draw);
    }

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const columns = Math.min(16, Math.max(5, Math.round(width / 79)));
      const rows = Math.min(7, Math.max(3, Math.round(height / 83)));
      const dx = width / columns;
      const dy = height / rows;
      const spacing = Math.max(dx, dy) * 1.29;
      nodes = [];
      connections = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const index = row * columns + column;
          nodes.push({ x: (column + .5 + .29 * Math.sin(index * 2.89)) * dx, y: (row + .5 + .32 * Math.cos(index * 1.73)) * dy });
          for (const neighbor of [column ? index - 1 : -1, index - columns, column && row ? index - columns - 1 : -1]) {
            if (neighbor >= 0 && Math.hypot(nodes[index].x - nodes[neighbor].x, nodes[index].y - nodes[neighbor].y) < spacing) connections.push([index, neighbor]);
          }
        }
      }
      requestDraw();
    }

    banner.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const bounds = canvas.getBoundingClientRect();
      cursor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      requestDraw();
    }, {passive: true});
    banner.addEventListener('pointerleave', () => { cursor = null; requestDraw(); });
    banner.addEventListener('focusin', event => {
      keyboardFocus = event.target.matches(':focus-visible');
      requestDraw();
    });
    banner.addEventListener('focusout', () => { keyboardFocus = false; requestDraw(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize, {passive: true});
    resize();
  }

  const parameters = new URLSearchParams(window.location.search);
  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.main-nav');
  let disclosure = null;

  function closeSubmenu() {
    if (!disclosure) return;
    const { toggle, list } = disclosure;
    disclosure = null;
    toggle.setAttribute('aria-expanded', 'false');
    list.hidden = true;
  }

  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (!open) closeSubmenu();
  }

  if (menuButton && menu) {
    const desktopMenu = window.matchMedia('(min-width: 926px) and (hover: hover)');
    for (const group of menu.querySelectorAll('[data-submenu]')) {
      const toggle = group.querySelector('.submenu-toggle');
      const list = group.querySelector('.submenu-list');

      function showSubmenu(pinned) {
        closeSubmenu();
        disclosure = { group, toggle, list, pinned };
        toggle.setAttribute('aria-expanded', 'true');
        list.hidden = false;
      }

      toggle.addEventListener('click', () => {
        if (disclosure?.group === group && disclosure.pinned) closeSubmenu();
        else showSubmenu(true);
      });
      group.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' && desktopMenu.matches && disclosure?.group !== group) showSubmenu(false);
      });
      group.addEventListener('pointerleave', () => {
        if (disclosure?.group === group && !disclosure.pinned && !group.matches(':focus-within')) closeSubmenu();
      });
      group.addEventListener('focusout', event => {
        if (disclosure?.group === group && !group.contains(event.relatedTarget)) closeSubmenu();
      });
    }
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') === 'false'));
    menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (disclosure) {
        const toggle = disclosure.toggle;
        const returnFocus = disclosure.group.contains(document.activeElement);
        closeSubmenu();
        if (returnFocus) toggle.focus();
      } else if (menuButton.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuButton.focus();
      }
    });
  }

  for (const panel of document.querySelectorAll('[data-demo]')) {
    const caption = panel.querySelector('.phase-caption');
    let activeNode = panel.querySelector('.diagram-node[aria-pressed="true"]');

    for (const node of panel.querySelectorAll('.diagram-node')) {
      function activate() {
        if (activeNode === node) return;
        activeNode.setAttribute('aria-pressed', 'false');
        node.setAttribute('aria-pressed', 'true');
        caption.textContent = node.dataset.note;
        activeNode = node;
      }

      node.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') activate();
      });
      node.addEventListener('focus', activate);
      node.addEventListener('click', activate);
    }
  }

  const cards = [...document.querySelectorAll('[data-family-card]')];
  const jumps = [...document.querySelectorAll('[data-jump]')];
  if (cards.length && 'IntersectionObserver' in window) {
    function highlight(card) {
      cards.forEach(item => item.classList.toggle('is-active', item === card));
      for (const jump of jumps) {
        if (jump.hash === `#${card.id}`) jump.setAttribute('aria-current', 'location');
        else jump.removeAttribute('aria-current');
      }
    }
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting);
      if (visible) highlight(visible.target);
    }, {rootMargin: '-26% 0px -49% 0px'});
    cards.forEach(card => observer.observe(card));
    highlight(cards.find(card => `#${card.id}` === window.location.hash) || cards[0]);
  }

  const normalized = text => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  for (const catalog of document.querySelectorAll('[data-catalog]')) {
    const items = [...catalog.querySelectorAll('[data-filter-item]')];
    const buttons = [...catalog.querySelectorAll('[data-filter]')];
    const field = catalog.querySelector('[data-search-input]');
    const status = catalog.querySelector('[data-filter-status]');
    const empty = catalog.querySelector('[data-filter-empty]');
    const context = catalog.querySelector('[data-filter-context]');
    const isBrands = catalog.dataset.catalog === 'brands';
    const linkedCategory = parameters.get('categoria');
    let category = !isBrands && buttons.some(button => button.dataset.filter === linkedCategory) ? linkedCategory : 'all';
    let exactBrand = isBrands ? items.find(item => item.dataset.id === parameters.get('marca')) : null;
    if (exactBrand) field.value = exactBrand.querySelector('h3').textContent;
    const groups = isBrands ? null : JSON.parse(catalog.dataset.brandGroups);
    let maker = groups && Object.hasOwn(groups, parameters.get('marca')) ? groups[parameters.get('marca')] : null;

    function renderCatalog() {
      const terms = normalized(field.value).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const item of items) {
        const matches = (category === 'all' || item.dataset.category === category)
          && (!exactBrand || item === exactBrand)
          && (!maker || maker.groups.includes(item.dataset.category))
          && terms.every(term => normalized(item.dataset.search).includes(term));
        item.hidden = !matches;
        if (matches) count += 1;
      }
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === category));
      const noun = isBrands ? (count === 1 ? 'fabricante' : 'fabricantes') : (count === 1 ? 'familia' : 'familias');
      status.textContent = `${count} ${noun}`;
      empty.hidden = count > 0;
    }

    function clearExactBrand() {
      if (!exactBrand) return;
      exactBrand = null;
      field.value = '';
    }

    if (maker) {
      const note = document.createElement('span');
      note.textContent = `Categorías de catálogo relacionadas con ${maker.name}`;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Ver todas';
      clear.addEventListener('click', () => {
        maker = null;
        context.hidden = true;
        category = 'all';
        renderCatalog();
        field.focus();
      });
      context.append(note, clear);
      context.hidden = false;
    }

    for (const button of buttons) button.addEventListener('click', () => {
      clearExactBrand();
      category = button.dataset.filter;
      renderCatalog();
      if (button.matches('.product-category')) catalog.querySelector('#resultados-productos').scrollIntoView({block: 'start'});
    });
    field.addEventListener('input', () => { exactBrand = null; renderCatalog(); });
    renderCatalog();
  }

  function openLinkedService() {
    const detail = document.querySelector('.service-card:target .service-detail');
    if (detail) detail.open = true;
  }
  window.addEventListener('hashchange', openLinkedService);
  openLinkedService();

  const form = document.querySelector('#solicitud');
  if (form) {
    const fields = form.elements;
    const service = (parameters.get('servicio') || '').trim().slice(0, 240);
    const manufacturer = (parameters.get('fabricante') || '').trim().slice(0, 100);
    if (service) {
      if (![...fields.servicio.options].some(option => option.value === service)) {
        fields.servicio.add(new Option(service, service));
      }
      fields.servicio.value = service;
    }
    if (manufacturer) {
      form.querySelector('[data-brand-field]').hidden = false;
      fields.fabricante.value = manufacturer;
    }

    const result = form.querySelector('.request-result');
    const summary = form.querySelector('#resumen-solicitud');
    const message = form.querySelector('[data-request-status]');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const details = new FormData(form);
      const values = [['Nombre', 'nombre'], ['Empresa', 'empresa'], ['Correo', 'correo'], ['Teléfono', 'telefono'], ['Solución o servicio', 'servicio'], ['Fabricante', 'fabricante']];
      const lines = values.filter(([, key]) => String(details.get(key) || '').trim()).map(([label, key]) => `${label}: ${String(details.get(key)).trim()}`);
      summary.value = ['Solicitud de cotización | ARKRON', '', ...lines, '', 'Requerimiento', String(details.get('detalle')).trim()].join('\n');
      result.hidden = false;
      message.textContent = '';
      summary.focus();
    });
    form.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(summary.value);
        message.textContent = 'Solicitud copiada.';
      } catch {
        summary.focus();
        summary.select();
        message.textContent = 'El texto está seleccionado. Usa la opción Copiar de tu dispositivo.';
      }
    });
    form.querySelector('[data-download]').addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([summary.value], {type: 'text/plain;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Solicitud-ARKRON.txt';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.textContent = 'Archivo de solicitud preparado.';
    });
    form.querySelector('[type="submit"]').disabled = false;
  }
}());
