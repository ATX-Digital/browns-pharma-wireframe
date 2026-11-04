(() => {
  'use strict';

  let values = {};
  let comments = [];
  let editing = false;
  let canComment = false;
  let commentMode = false;
  let applying = false;
  let lastTouch = {time:0, target:null, count:0};
  let cursorDot = null;
  let commentTooltip = null;

  const post = message => {
    if (parent !== window) parent.postMessage({route:location.hash.slice(1) || 'home', ...message}, location.origin);
  };
  const has = key => key && Object.hasOwn(values, key);
  const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
  const fieldKey = element => has(element.dataset.wfLocal) ? element.dataset.wfLocal : (element.dataset.wfGlobal || element.dataset.wfImage || element.dataset.wfContent);
  const rawContentText = element => [...element.childNodes]
    .filter(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('wf-comment-badge')))
    .map(node => node.textContent)
    .join('');
  const contentText = element => rawContentText(element).trim();
  const encodeAnchorKey = value => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const decodeAnchorKey = value => { try { const source = value.replace(/-/g, '+').replace(/_/g, '/'); return atob(source + '='.repeat((4 - source.length % 4) % 4)); } catch { return ''; } };
  const commentSelector = '[data-wf-comment-key],[data-wf-content],[data-wf-image],[data-wf-collection],h1,h2,h3,p,summary,label,.placeholder,.btn,.text-link';
  const regionSelector = '#app,#app > header,#app > main,#app > main > *,#app > main section,#app > main .page-intro,#app > main .content-split,#app > footer';

  function fieldMessage(element, link = null) {
    const key = fieldKey(element);
    return {
      type:'wf:edit-content', kind:'text', key,
      globalKey:element.dataset.wfGlobal || null,
      localKey:element.dataset.wfLocal || null,
      globalValue:element.dataset.wfGlobal && has(element.dataset.wfGlobal) ? values[element.dataset.wfGlobal] : element.dataset.wfFallback || contentText(element),
      localValue:element.dataset.wfLocal && has(element.dataset.wfLocal) ? values[element.dataset.wfLocal] : null,
      label:element.dataset.wfLabel || 'Content',
      value:has(key) ? values[key] : contentText(element),
      maxLength:Number(element.dataset.wfMaxlength || 5000),
      urlKey:link?.dataset.wfLink || null,
      urlValue:link?.getAttribute('href') || null
    };
  }

  function imageMessage(element) {
    const key = fieldKey(element);
    const globalKey = element.dataset.wfGlobal || null;
    const localKey = element.dataset.wfLocal || null;
    const globalValue = globalKey && has(globalKey) ? values[globalKey] : '';
    const localValue = localKey && has(localKey) ? values[localKey] : null;
    return {
      type:'wf:edit-image', kind:'image', key,
      globalKey, localKey, globalValue, localValue,
      localScopeLabel:element.dataset.wfScopeLabel || null,
      label:element.dataset.wfLabel || 'Image',
      value:has(key) ? values[key] : globalValue
    };
  }

  function renderLinkCollection(element, items) {
    element.replaceChildren();
    for (const item of items) {
      const anchor = document.createElement('a');
      anchor.href = item.url || '#home';
      anchor.textContent = item.label || 'Untitled link';
      if (item.current) anchor.setAttribute('aria-current', 'page');
      if (element.tagName === 'UL') {
        const li = document.createElement('li'); li.append(anchor); element.append(li);
      } else element.append(anchor);
    }
  }

  function renderAccordions(element, items) {
    element.replaceChildren();
    for (const item of items) {
      const details = document.createElement('details');
      details.className = 'accordion'; details.open = true;
      const summary = document.createElement('summary'); summary.textContent = item.question || 'Accordion heading';
      const body = document.createElement('p'); body.textContent = item.answer || '';
      details.append(summary, body); element.append(details);
    }
  }

  function routeKey() {
    return (location.hash.slice(1) || 'home').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 50) || 'home';
  }

  function assignCommentAnchors() {
    const candidates = [...document.querySelectorAll(commentSelector)].filter(element => !element.closest('.wf-comment-badge') && !element.matches('.wf-comment-badge'));
    candidates.forEach((element, index) => {
      const natural = element.dataset.wfContent || element.dataset.wfImage || element.dataset.wfCollection || element.dataset.wfGlobal || element.dataset.wfLocal;
      if (!element.dataset.wfCommentKey) element.dataset.wfCommentKey = natural || `page.${routeKey()}.${element.tagName.toLowerCase()}.${index + 1}`;
      if (!element.dataset.wfCommentLabel) {
        const text = contentText(element).replace(/\s+/g, ' ');
        element.dataset.wfCommentLabel = element.dataset.wfLabel || text.slice(0, 70) || `${element.tagName.toLowerCase()} area`;
      }
    });
  }

  function commentRegions() {
    const regions = [...new Set(document.querySelectorAll(regionSelector))];
    regions.forEach((region, index) => {
      region.dataset.wfCommentRegion = String(index);
      region.classList.add('wf-comment-region');
    });
    return regions;
  }

  function commentTarget(node) {
    const target = node?.closest?.(commentSelector);
    if (!target || target.closest('.wf-comment-badge')) return null;
    return target;
  }

  function requestPointComment(event) {
    const regions = commentRegions();
    const liveNode = document.elementFromPoint(event.clientX, event.clientY) || event.target;
    const region = liveNode?.closest?.('[data-wf-comment-region]') || regions[0];
    if (!region) return;
    const children = [...region.children].filter(child => !child.classList.contains('wf-comment-badge') && child.getClientRects().length);
    const containingChild = children.find(child => {
      const box = child.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    });
    const nearestChild = containingChild || children.reduce((nearest, child) => {
      const box = child.getBoundingClientRect();
      const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right);
      const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom);
      const distance = dx * dx + dy * dy;
      return !nearest || distance < nearest.distance ? {child, distance} : nearest;
    }, null)?.child;
    const preciseTarget = commentTarget(liveNode);
    const anchor = preciseTarget && region.contains(preciseTarget) ? preciseTarget : (nearestChild || region);
    const rect = anchor.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, Math.round(((event.clientX - rect.left) / Math.max(1, rect.width)) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((event.clientY - rect.top) / Math.max(1, rect.height)) * 1000)));
    const sharedArea = region.matches('#app > footer') ? 'footer' : (region.matches('#app > header') ? 'header' : '');
    const regionToken = sharedArea || region.dataset.wfCommentRegion;
    const anchorToken = preciseTarget && anchor === preciseTarget && preciseTarget.dataset.wfCommentKey
      ? `k${encodeAnchorKey(preciseTarget.dataset.wfCommentKey)}`
      : (anchor === region ? 'r' : `c${children.indexOf(anchor)}`);
    const key = `pin2.${sharedArea ? 'shared' : routeKey()}.${regionToken}.${anchorToken}.${x}.${y}`;
    commentMode = false;
    document.body.classList.remove('wf-comment-mode');
    hideCursorDot();
    post({type:'wf:add-comment', key, label:sharedArea ? `Shared ${sharedArea} comment` : 'Pinned page comment', ...(sharedArea ? {route:`shared:${sharedArea}`} : {})});
  }

  function showCursorDot(event) {
    if (!commentMode || event.pointerType === 'touch') return;
    if (!cursorDot) {
      cursorDot = document.createElement('span');
      cursorDot.className = 'wf-comment-cursor';
      cursorDot.setAttribute('aria-hidden', 'true');
      document.body.append(cursorDot);
    }
    cursorDot.style.left = `${event.clientX}px`;
    cursorDot.style.top = `${event.clientY}px`;
    cursorDot.hidden = false;
  }

  function hideCursorDot() {
    if (cursorDot) cursorDot.hidden = true;
  }

  function showCommentTooltip(badge) {
    if (!badge?.dataset.tooltip) return;
    if (!commentTooltip) {
      commentTooltip = document.createElement('div');
      commentTooltip.className = 'wf-comment-tooltip';
      commentTooltip.setAttribute('role', 'tooltip');
      document.body.append(commentTooltip);
    }
    commentTooltip.textContent = badge.dataset.tooltip;
    commentTooltip.hidden = false;
    const mobile = matchMedia('(max-width:600px)').matches;
    if (mobile) {
      commentTooltip.style.left = '12px';
      commentTooltip.style.right = '12px';
      commentTooltip.style.width = 'auto';
    } else {
      const width = Math.min(260, Math.max(180, window.innerWidth - 24));
      commentTooltip.style.width = `${width}px`;
      commentTooltip.style.right = 'auto';
      const badgeRect = badge.getBoundingClientRect();
      commentTooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, badgeRect.left))}px`;
    }
    const rect = badge.getBoundingClientRect();
    commentTooltip.style.top = '0px';
    commentTooltip.style.bottom = 'auto';
    const height = Math.min(commentTooltip.offsetHeight, Math.max(0, window.innerHeight - 24));
    const fitsAbove = rect.top >= height + 20;
    if (fitsAbove) {
      commentTooltip.style.top = 'auto';
      commentTooltip.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    } else {
      commentTooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 8))}px`;
      commentTooltip.style.bottom = 'auto';
    }
  }

  function hideCommentTooltip() {
    if (commentTooltip) commentTooltip.hidden = true;
  }

  function parsedPoint(key) {
    const modern = key.startsWith('pin2.') ? key.split('.') : null;
    if (modern && modern.length >= 6) return {
      modern:true,
      regionToken:modern.at(-4),
      anchorToken:modern.at(-3),
      x:Number(modern.at(-2)),
      y:Number(modern.at(-1))
    };
    const legacy = key.match(/^pin\.(.+)\.([a-z]+|\d+)\.(\d+)\.(\d+)$/);
    return legacy ? {modern:false, regionToken:legacy[2], anchorToken:'r', x:Number(legacy[3]), y:Number(legacy[4])} : null;
  }

  function pointTarget(point, regions) {
    const region = point.regionToken === 'footer' ? document.querySelector('#app > footer') : point.regionToken === 'header' ? document.querySelector('#app > header') : regions[Number(point.regionToken)];
    if (!region) return null;
    if (point.modern && point.anchorToken.startsWith('k')) {
      const key = decodeAnchorKey(point.anchorToken.slice(1));
      const target = key ? document.querySelector(`[data-wf-comment-key="${CSS.escape(key)}"]`) : null;
      if (target && region.contains(target)) return target;
    }
    if (point.modern && point.anchorToken === 'r' && point.x >= 990 && point.y >= 990) {
      const misplacedLogo = region.matches('#app > header')
        ? region.querySelector('[data-wf-label="Header logo"]')
        : (region.matches('#app > footer') ? region.querySelector('[data-wf-label="Footer logo"]') : null);
      if (misplacedLogo) { point.x = 500; point.y = 500; return misplacedLogo; }
    }
    const children = [...region.children].filter(child => !child.classList.contains('wf-comment-badge') && child.getClientRects().length);
    if (point.modern && /^c\d+$/.test(point.anchorToken)) return children[Number(point.anchorToken.slice(1))] || region;
    if (!point.modern && matchMedia('(max-width:600px)').matches && point.x > 500 && children.length === 2) {
      const first = children[0].getBoundingClientRect();
      const second = children[1].getBoundingClientRect();
      if (second.top >= first.bottom - 2) {
        point.x = Math.min(1000, Math.max(0, (point.x - 500) * 2));
        return children[1];
      }
    }
    if (!point.modern && !matchMedia('(max-width:600px)').matches && point.y > 550 && children.length === 2) {
      const first = children[0].getBoundingClientRect();
      const second = children[1].getBoundingClientRect();
      if (second.left >= first.right - 2) {
        point.y = Math.min(1000, Math.max(0, ((point.y - 550) / 450) * 1000));
        return children[1];
      }
    }
    return region;
  }

  function renderComments() {
    assignCommentAnchors();
    const regions = commentRegions();
    const groups = new Map();
    const currentRoute = location.hash.slice(1) || 'home';
    for (const comment of comments) {
      if (comment.route !== currentRoute && !String(comment.route).startsWith('shared:')) continue;
      if (!groups.has(comment.target_key)) groups.set(comment.target_key, []);
      groups.get(comment.target_key).push(comment);
    }
    document.querySelectorAll('.wf-comment-badge').forEach(badge => { if (!groups.has(badge.dataset.commentKey)) badge.remove(); });
    for (const [key, entries] of groups) {
      const point = parsedPoint(key);
      const target = point ? pointTarget(point, regions) : document.querySelector(`[data-wf-comment-key="${CSS.escape(key)}"]`);
      if (!target) continue;
      if (point) target.classList.add('wf-comment-anchor');
      const latest = entries.at(-1);
      let badge = document.querySelector(`.wf-comment-badge[data-comment-key="${CSS.escape(key)}"]`);
      if (!badge) {
        badge = document.createElement('button'); badge.type = 'button'; badge.className = 'wf-comment-badge';
        if (point) target.append(badge); else target.insertAdjacentElement('afterend', badge);
      }
      const badgeText = `● ${entries.length}`;
      if (badge.textContent !== badgeText) badge.textContent = badgeText;
      badge.dataset.commentKey = key;
      badge.classList.toggle('wf-comment-pin', Boolean(point));
      if (point) {
        badge.style.setProperty('--wf-pin-x', `${point.x / 10}%`);
        badge.style.setProperty('--wf-pin-y', `${point.y / 10}%`);
      }
      badge.setAttribute('aria-label', `Open ${entries.length} comment${entries.length === 1 ? '' : 's'}${point ? ' at this position' : ` on ${target.dataset.wfCommentLabel}`}`);
      badge.dataset.tooltip = `${latest.changed_by} · ${new Date(latest.changed_at).toLocaleString()}\n${latest.body}`;
    }
  }

  function applyContent() {
    if (applying) return;
    applying = true;
    for (const element of document.querySelectorAll('[data-wf-content]')) {
      if (!element.dataset.wfFallback) element.dataset.wfFallback = contentText(element);
      const key = fieldKey(element);
      const value = has(key) ? values[key] : (has(element.dataset.wfGlobal) ? values[element.dataset.wfGlobal] : element.dataset.wfFallback);
      if (rawContentText(element) !== value) {
        const badges = [...element.children].filter(child => child.classList.contains('wf-comment-badge'));
        badges.forEach(badge => badge.remove());
        element.textContent = value;
        element.append(...badges);
      }
      element.classList.toggle('wf-content-editable', editing);
      if (editing) element.setAttribute('aria-label', `Edit ${element.dataset.wfLabel || 'content'}`);
      else element.removeAttribute('aria-label');
    }
    for (const element of document.querySelectorAll('[data-wf-link]')) {
      const key = element.dataset.wfLink;
      if (!element.dataset.wfLinkFallback) element.dataset.wfLinkFallback = element.getAttribute('href') || '';
      element.setAttribute('href', has(key) ? values[key] : element.dataset.wfLinkFallback);
      element.classList.toggle('wf-link-editable', editing);
    }
    for (const element of document.querySelectorAll('[data-wf-collection]')) {
      const key = element.dataset.wfCollection;
      if (!element.dataset.wfRenderedValue) element.dataset.wfRenderedValue = '__fallback__';
      const source = has(key) ? values[key] : element.dataset.wfDefault;
      if (source && element.dataset.wfRenderedValue !== source) {
        const items = parse(source, []);
        if (element.dataset.wfCollectionType === 'accordions') renderAccordions(element, items);
        else renderLinkCollection(element, items);
        element.dataset.wfRenderedValue = source;
      }
      element.classList.toggle('wf-collection-editable', editing);
    }
    for (const element of document.querySelectorAll('[data-wf-image]')) {
      const key = fieldKey(element);
      if (!element.dataset.wfImageFallback) element.dataset.wfImageFallback = element.innerHTML;
      const source = has(key) ? values[key] : (has(element.dataset.wfGlobal) ? values[element.dataset.wfGlobal] : '');
      const media = parse(source, null);
      if (media?.src && element.dataset.wfImageSrc !== media.src) {
        const image = document.createElement('img'); image.src = media.src; image.alt = media.alt || '';
        element.replaceChildren(image); element.dataset.wfImageSrc = media.src;
      } else if (!media && element.dataset.wfImageSrc) {
        element.innerHTML = element.dataset.wfImageFallback; delete element.dataset.wfImageSrc;
      }
      element.classList.toggle('wf-image-has-media', Boolean(media?.src));
      element.classList.toggle('wf-image-editable', editing);
    }
    document.body.classList.toggle('wf-editing', editing);
    document.body.classList.toggle('wf-comment-mode', commentMode);
    assignCommentAnchors();
    commentRegions();
    applying = false;
  }

  const style = document.createElement('style');
  style.textContent = `
    [data-wf-content]{white-space:pre-line}
    .wf-content-editable,.wf-link-editable,.wf-image-editable,.wf-collection-editable{position:relative;cursor:pointer!important;outline:1px dashed #71805c!important;outline-offset:4px;border-radius:3px}
    .wf-content-editable:hover,.wf-link-editable:hover,.wf-image-editable:hover,.wf-collection-editable:hover{outline:2px solid #53643a!important;background:#e8eedb!important}
    .wf-image-editable:after,.wf-collection-editable:after{position:absolute;right:8px;top:8px;background:#252724;color:white;border-radius:999px;padding:4px 8px;font:9px ui-monospace,monospace;z-index:4}
    .wf-image-editable:before{display:none!important}
    .wf-image-editable:after{content:'CHANGE IMAGE';display:block!important;width:auto!important;height:auto!important;left:auto!important;bottom:auto!important;transform:none!important}.wf-collection-editable:after{content:'MANAGE ITEMS'}
    .wf-image-editable:not(.wf-image-has-media){background-image:linear-gradient(30deg,transparent calc(50% - .5px),#d6d6d6 50%,transparent calc(50% + .5px)),linear-gradient(-30deg,transparent calc(50% - .5px),#d6d6d6 50%,transparent calc(50% + .5px))!important}
    [data-wf-image] img{width:100%;height:100%;object-fit:cover;display:block}
    [data-wf-image].wf-image-has-media:not(.wf-image-editable):before,[data-wf-image].wf-image-has-media:not(.wf-image-editable):after{display:none!important}
    .wf-comment-region,.wf-comment-anchor{position:relative}
    .wf-comment-badge{display:inline-flex!important;align-items:center!important;width:auto!important;background:#805ad5!important;color:white!important;border:0!important;border-radius:999px!important;padding:4px 8px!important;margin:4px!important;font:10px Arial,sans-serif!important;position:relative!important;z-index:50!important;cursor:pointer!important}
    .wf-comment-badge.wf-comment-pin{position:absolute!important;left:clamp(18px,var(--wf-pin-x),calc(100% - 18px))!important;top:clamp(14px,var(--wf-pin-y),calc(100% - 14px))!important;transform:translate(-50%,-50%);margin:0!important;box-shadow:0 3px 12px #35245255}
    .wf-comment-tooltip{white-space:pre-wrap;overflow-wrap:anywhere;position:fixed;z-index:2147483647;width:240px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;background:#352452;color:white;padding:10px;border-radius:9px;font:11px/1.45 Arial,sans-serif;box-shadow:0 8px 25px #0003;pointer-events:none}
    .wf-comment-badge.wf-comment-focus{box-shadow:0 0 0 8px #805ad533,0 3px 12px #35245255!important}
    .wf-comment-cursor{position:fixed!important;width:16px!important;height:16px!important;border-radius:50%!important;background:#805ad5!important;border:3px solid white!important;box-shadow:0 2px 10px #35245288!important;transform:translate(-50%,-50%)!important;z-index:2147483647!important;pointer-events:none!important}
    body.wf-editing:before{content:'CONTENT EDIT MODE';position:fixed;right:12px;bottom:12px;z-index:9999;background:#252724;color:white;padding:7px 10px;font:10px ui-monospace,monospace;letter-spacing:.08em;pointer-events:none}
    body.wf-comment-mode,body.wf-comment-mode *{cursor:crosshair!important}
    @media(max-width:600px){.wf-comment-tooltip{width:auto;max-width:none}}
  `;
  document.head.append(style);

  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'wf:content') {
      values = message.content && typeof message.content === 'object' ? message.content : {};
      comments = Array.isArray(message.comments) ? message.comments : [];
      editing = Boolean(message.editing);
      canComment = Boolean(message.commenting);
      if (!canComment) commentMode = false;
      applyContent(); renderComments();
    }
    if (message.type === 'wf:comment-mode') {
      commentMode = Boolean(message.active) && canComment;
      if (!commentMode) hideCursorDot();
      applyContent();
    }
    if (message.type === 'wf:focus-comment') {
      assignCommentAnchors();
      const badge = document.querySelector(`.wf-comment-badge[data-comment-key="${CSS.escape(message.key)}"]`);
      const target = badge || document.querySelector(`[data-wf-comment-key="${CSS.escape(message.key)}"]`);
      if (target) {
        target.scrollIntoView({behavior:'smooth', block:'center'}); target.classList.add('wf-comment-focus');
        setTimeout(() => target.classList.remove('wf-comment-focus'), 2600);
      }
    }
  });

  document.addEventListener('click', event => {
    const badge = event.target.closest('.wf-comment-badge');
    if (badge) { event.preventDefault(); event.stopImmediatePropagation(); post({type:'wf:open-comment', key:badge.dataset.commentKey}); return; }
    if (canComment && !commentMode && event.detail === 3) {
      event.preventDefault(); event.stopImmediatePropagation(); requestPointComment(event);
      return;
    }
    if (commentMode && canComment) {
      event.preventDefault(); event.stopImmediatePropagation(); requestPointComment(event);
      return;
    }
    if (!editing) return;
    const collection = event.target.closest('[data-wf-collection]');
    const image = event.target.closest('[data-wf-image]');
    const link = event.target.closest('[data-wf-link]');
    const element = event.target.closest('[data-wf-content]') || link?.querySelector('[data-wf-content]');
    const interactive = event.target.closest('a,button,summary,input,select,textarea');
    if (collection || image || element || interactive) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (collection) post({type:'wf:edit-collection', kind:collection.dataset.wfCollectionType || 'links', key:collection.dataset.wfCollection, label:collection.dataset.wfLabel || 'Items', value:values[collection.dataset.wfCollection] || collection.dataset.wfDefault});
    else if (image) post(imageMessage(image));
    else if (element) post(fieldMessage(element, link));
  }, true);

  document.addEventListener('pointerover', event => {
    const badge = event.target.closest?.('.wf-comment-badge');
    if (badge) showCommentTooltip(badge);
  }, true);
  document.addEventListener('pointerout', event => {
    if (event.target.closest?.('.wf-comment-badge') && !event.relatedTarget?.closest?.('.wf-comment-badge')) hideCommentTooltip();
  }, true);
  document.addEventListener('focusin', event => {
    const badge = event.target.closest?.('.wf-comment-badge');
    if (badge) showCommentTooltip(badge);
  });
  document.addEventListener('focusout', event => {
    if (event.target.closest?.('.wf-comment-badge')) hideCommentTooltip();
  });

  document.addEventListener('pointermove', showCursorDot, true);
  document.documentElement.addEventListener('pointerleave', hideCursorDot);
  window.addEventListener('blur', hideCursorDot);

  document.addEventListener('pointerup', event => {
    if (!canComment || event.pointerType !== 'touch') return;
    const target = event.target;
    const now = Date.now();
    const count = target && lastTouch.target === target && now - lastTouch.time < 450 ? lastTouch.count + 1 : 1;
    if (count === 3) {
      event.preventDefault(); event.stopImmediatePropagation(); requestPointComment(event);
      lastTouch = {time:0, target:null, count:0};
      return;
    }
    lastTouch = {time:now, target, count};
  }, true);

  document.addEventListener('keydown', event => {
    const modifier = event.metaKey || event.ctrlKey;
    const typing = event.target.closest?.('input,textarea,select,[contenteditable=true]');
    if (!modifier || typing) return;
    if (event.key.toLowerCase() === 'c' && event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation(); post({type:'wf:shortcut', action:'comment'});
    } else if (event.key.toLowerCase() === 'e' && event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation(); post({type:'wf:shortcut', action:'edit'});
    }
  }, true);

  let mutationQueued = false;
  new MutationObserver(records => {
    const meaningful = records.some(record => {
      if (record.target.nodeType === Node.ELEMENT_NODE && record.target.closest('.wf-comment-badge')) return false;
      const changed = [...record.addedNodes, ...record.removedNodes];
      return !changed.length || changed.some(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('wf-comment-badge')));
    });
    if (!meaningful || mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => { mutationQueued = false; applyContent(); renderComments(); });
  }).observe(document.getElementById('app') || document.body, {childList:true, subtree:true});
  applyContent();
  post({type:'wf:content-runtime-ready'});
})();
