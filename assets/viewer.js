(() => {
  'use strict';

  const project = window.WIREFRAME_PROJECT;
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const compare = (a, b) => {
    const left = a.id.replace(/^v/, '').split('.').map(Number);
    const right = b.id.replace(/^v/, '').split('.').map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const difference = (left[index] || 0) - (right[index] || 0);
      if (difference) return difference;
    }
    return 0;
  };

  const versions = [...project.versions].sort(compare);
  const latest = versions.at(-1);
  const frame = $('preview');
  const bookingControl = document.createElement('button');
  bookingControl.type = 'button';
  bookingControl.className = 'preview-booking-control';
  bookingControl.textContent = 'Book a visit ↗';
  bookingControl.setAttribute('aria-label', 'Book an appointment in the wireframe');
  bookingControl.hidden = true;
  document.body.append(bookingControl);
  let bookingControlVisible = false;
  function positionBookingControl() {
    const rect = frame.getBoundingClientRect();
    const headerBottom = document.querySelector('.review-header')?.getBoundingClientRect().bottom || 0;
    bookingControl.hidden = !bookingControlVisible || editor.active || commentMode || rect.bottom < headerBottom + 100 || rect.top > innerHeight - 70;
    bookingControl.style.left = Math.max(12, rect.left + 14) + 'px';
    bookingControl.style.bottom = Math.max((document.querySelector('.review-footer')?.getBoundingClientRect().height || 36) + 14, innerHeight - rect.bottom + 14) + 'px';
  }
  bookingControl.addEventListener('click', () => send({type:'wf:open-book'}));
  window.addEventListener('scroll', positionBookingControl, {passive:true});
  window.addEventListener('resize', positionBookingControl);
  const editorConfigured = Boolean(project.editor?.enabled);
  const applePlatform = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
  const shortcuts = applePlatform
    ? {comment:'⌘⇧C', editor:'⌘⇧E'}
    : {comment:'Ctrl ⇧ C', editor:'Ctrl ⇧ E'};
  let pages = [];
  let commonNotes = [];
  let group = 'pages';
  let currentVersion = '';
  let copyTimer;
  let contentHeight = 900;
  let editor = {available:false, editable:false, active:false, content:{}, comments:[], user:null, role:null, version:null, latest:null};
  let selectedField = null;
  let selectedCommentTarget = null;
  let replyToId = null;
  let commentRequest = 0;
  let activityEntries = [];
  let activityCursor = null;
  let activityRequest = 0;
  let commentMode = false;
  let linkTargets = [];
  let imageRemoved = false;
  let imageDraftFile = null;
  let imageRestoreValue = null;
  let historyEntries = [];
  let historyVisible = 3;
  let collectionRowSequence = 0;
  let draggedCollectionRow = null;

  function setHeaderCollapsed(collapsed, persist = true) {
    document.documentElement.classList.toggle('header-collapsed', collapsed);
    const button = $('header-toggle');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.title = collapsed ? 'Show review controls' : 'Hide review controls';
    button.querySelector('span').textContent = collapsed ? 'Show controls' : 'Hide controls';
    if (persist) {
      document.cookie = collapsed
        ? 'wireframe_controls=collapsed; Max-Age=31536000; Path=/; SameSite=Lax'
        : 'wireframe_controls=; Max-Age=0; Path=/; SameSite=Lax';
    }
    requestAnimationFrame(dimensions);
  }

  function showShortcut(id, value) {
    const target = $(id);
    target.replaceChildren(...[...value].map((character, index, characters) => {
      if (!['⌘','⇧'].includes(character) && index !== characters.length - 1) return document.createTextNode(character);
      const symbol = document.createElement('span');
      symbol.className = character === '⌘' ? 'shortcut-command' : (character === '⇧' ? 'shortcut-shift' : 'shortcut-key');
      symbol.textContent = character;
      return symbol;
    }));
  }

  function showImagePreview(src = '', details = {}) {
    const hasImage = Boolean(src);
    $('image-preview-wrap').hidden = !hasImage;
    $('image-preview').innerHTML = hasImage ? `<img src="${esc(src)}" alt="">` : '';
    $('image-drop-title').textContent = hasImage ? 'Drop a replacement image here' : 'Drop an image here';
    $('image-file-meta').hidden = !details.name;
    $('image-file-name').textContent = details.name || '';
    $('image-file-status').textContent = details.status || '';
  }

  function resetImageEditor(value = '', status = 'Current image') {
    let media = null; try { media = value ? JSON.parse(value) : null; } catch {}
    imageRemoved = false;
    imageDraftFile = null;
    imageRestoreValue = null;
    showImagePreview(media?.src || '', media?.src ? {name:media.name || 'Saved image', status} : {});
    setUploadProgress(0, false);
    $('content-image').value = '';
    $('content-image-alt').value = media?.alt || '';
    $('content-count').textContent = '';
  }

  function setImageScope(scope, refreshHistory = true) {
    if (!selectedField || (selectedField.kind || 'text') !== 'image' || !selectedField.globalKey || !selectedField.localKey) return;
    const local = scope === 'local';
    const directValue = local ? selectedField.localValue : selectedField.globalValue;
    const effectiveValue = local && directValue == null ? (selectedField.globalValue ?? selectedField.value ?? '') : (directValue ?? '');
    selectedField.key = local ? selectedField.localKey : selectedField.globalKey;
    selectedField.value = directValue ?? '';
    selectedField.imageEffectiveValue = effectiveValue;
    $('content-field-key').textContent = selectedField.key;
    resetImageEditor(effectiveValue, local && directValue == null && effectiveValue ? 'Inherited item image' : 'Current image');
    if (refreshHistory) loadHistory();
  }

  function rememberSavedImage(value) {
    editor.content[selectedField.key] = value;
    selectedField.value = value;
    selectedField.imageEffectiveValue = value;
    if (selectedField.key === selectedField.globalKey) selectedField.globalValue = value;
    if (selectedField.key === selectedField.localKey) selectedField.localValue = value;
  }

  function selectImageFile(file) {
    if (!file) return;
    const error = $('content-error');
    setUploadProgress(0, false);
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      $('content-image').value = '';
      imageDraftFile = null;
      error.textContent = file.size > 5 * 1024 * 1024 ? 'Images must be 5 MB or smaller.' : 'Choose a JPEG, PNG, WebP or GIF image.';
      error.hidden = false;
      return;
    }
    imageDraftFile = file;
    imageRestoreValue = null;
    const reader = new FileReader();
    reader.onload = () => {
      imageRemoved = false;
      const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
      showImagePreview(String(reader.result || ''), {name:file.name, status:`${size} · Ready to save`});
      error.hidden = true;
    };
    reader.onerror = () => { error.textContent = 'The image could not be previewed.'; error.hidden = false; };
    reader.readAsDataURL(file);
  }

  function setUploadProgress(percent, visible = true) {
    const amount = Math.max(0, Math.min(100, Math.round(percent)));
    $('image-upload-progress').hidden = !visible;
    $('image-upload-percent').textContent = `${amount}%`;
    $('image-upload-bar').value = amount;
    $('image-upload-bar').textContent = `${amount}%`;
  }

  function uploadImage(payload) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/editor/media');
      request.withCredentials = true;
      request.setRequestHeader('content-type', 'application/json');
      request.upload.addEventListener('progress', event => {
        if (event.lengthComputable) setUploadProgress((event.loaded / event.total) * 100);
      });
      request.addEventListener('load', () => {
        let data = {}; try { data = JSON.parse(request.responseText || '{}'); } catch {}
        resolve({ok:request.status >= 200 && request.status < 300, data});
      });
      request.addEventListener('error', () => reject(new Error('The image upload was interrupted. Please try again.')));
      request.addEventListener('abort', () => reject(new Error('The image upload was cancelled.')));
      setUploadProgress(0);
      request.send(JSON.stringify(payload));
    });
  }

  function readURL() {
    const query = new URLSearchParams(location.search);
    return {
      version:versions.find(version => version.id === query.get('version')) || latest,
      route:query.get('page') || 'home',
      device:query.get('device') === 'mobile' ? 'mobile' : 'desktop',
      notes:query.get('notes') === '1'
    };
  }

  let state = readURL();
  setHeaderCollapsed(document.documentElement.classList.contains('header-collapsed'), false);
  showShortcut('comment-shortcut', shortcuts.comment);
  showShortcut('editor-shortcut', shortcuts.editor);
  $('project-name').textContent = project.name;
  document.title = `${project.name} — Wireframe`;
  for (const version of versions.slice().reverse()) {
    const option = document.createElement('option');
    option.value = version.id;
    option.textContent = `${version.displayId || version.id}${version === latest ? ' · Latest' : ''} — ${version.label}`;
    $('version-select').append(option);
  }

  function storeURL(push = false) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('version', state.version.id);
    url.searchParams.set('page', state.route);
    url.searchParams.set('device', state.device);
    if (state.notes) url.searchParams.set('notes', '1');
    try { history[push ? 'pushState' : 'replaceState']({}, '', url); } catch {}
  }

  function announce(text) {
    $('announcement').textContent = text;
    $('announcement').classList.add('visible');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => $('announcement').classList.remove('visible'), 2800);
  }

  function send(data) {
    frame.contentWindow?.postMessage(data, location.protocol === 'file:' ? '*' : location.origin);
  }

  function sendContent() {
    const visibleComments = editor.comments.filter(comment => !comment.deleted_at && (comment.route === state.route || String(comment.route).startsWith('shared:')));
    send({type:'wf:content', content:editor.content, comments:visibleComments, editing:editor.active && editor.editable, commenting:editor.available && editor.editable});
  }

  function selected() {
    return pages.find(page => page.id === state.route.split('?')[0]) || pages[0];
  }

  function notes() {
    const page = selected();
    if (!page) return;
    $('notes-content').innerHTML = `<h2>${esc(page.label)}</h2><p>${esc(page.description)}</p><h3>Page / template type</h3><div class="mapping">${esc(page.wp || 'Page / reusable blocks')}</div><h3>Page behaviour</h3><ul>${(page.notes || []).map(note => `<li>${esc(note)}</li>`).join('')}</ul><h3>Project decisions</h3><ul>${commonNotes.map(note => `<li>${esc(note)}</li>`).join('')}</ul><h3>Snapshot</h3><p>${esc(state.version.displayId || state.version.id)} · ${esc(state.version.label)}<br>${esc(state.version.date || '')}</p>`;
  }

  function navigation() {
    const page = selected();
    if (!page) return;
    group = page.kind === 'template' ? 'templates' : 'pages';
    drawTabs();
    $('page-title').textContent = page.label;
    $('page-number').textContent = String(pages.indexOf(page) + 1).padStart(2, '0');
    $('template-badge').hidden = page.kind !== 'template';
    $('footer-version').textContent = `${state.version.displayId || state.version.id}${state.version === latest ? ' / latest' : ' / archived'}`;
    notes();
  }

  function drawTabs() {
    const visible = pages.filter(page => (page.kind === 'template' ? 'templates' : 'pages') === group);
    $('group-pages').setAttribute('aria-pressed', group === 'pages');
    $('group-templates').setAttribute('aria-pressed', group === 'templates');
    $('page-tabs').innerHTML = visible.map(page => `<button data-page="${esc(page.id)}"${page.id === state.route.split('?')[0] ? ' aria-current="page"' : ''}>${esc(page.label)}</button>`).join('');
    $('page-select').innerHTML = visible.map(page => `<option value="${esc(page.id)}">${esc(page.label)}</option>`).join('');
    $('page-select').value = visible.some(page => page.id === state.route.split('?')[0]) ? state.route.split('?')[0] : '';
  }

  function dimensions() {
    const wrap = $('frame-wrap');
    const available = wrap.clientWidth;
    const width = state.device === 'desktop' ? 1280 : available;
    const scale = state.device === 'desktop' ? Math.min(1, available / width) : 1;
    frame.style.width = `${width}px`;
    frame.style.height = `${contentHeight}px`;
    frame.style.transformOrigin = 'top left';
    frame.style.transform = scale < 1 ? `scale(${scale})` : 'none';
    const style = getComputedStyle(wrap);
    wrap.style.height = `${Math.ceil(contentHeight * scale) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
    positionBookingControl();
    send({type:'wf:viewport'});
    $('dimensions').textContent = `${width} px · ${state.device === 'mobile' ? 'Mobile' : 'Desktop'}${scale < .99 ? ` · ${Math.round(scale * 100)}%` : ''}`;
  }

  function device() {
    for (const name of ['desktop', 'mobile']) $(name).setAttribute('aria-pressed', state.device === name);
    $('frame-wrap').classList.toggle('mobile', state.device === 'mobile');
    requestAnimationFrame(dimensions);
  }

  function setNotes(open) {
    state.notes = open;
    $('review-notes').hidden = !open;
    $('notes-toggle').setAttribute('aria-expanded', String(open));
    storeURL();
    requestAnimationFrame(dimensions);
  }

  function updateEditorButton() {
    positionBookingControl();
    const button = $('editor-toggle');
    const floating = $('floating-editor-toggle');
    for (const target of [button, floating]) {
      target.hidden = !editorConfigured;
      target.disabled = !editor.available || !editor.editable;
      target.setAttribute('aria-pressed', String(editor.active));
      target.setAttribute('aria-keyshortcuts', 'Meta+Shift+E Control+Shift+E');
      target.title = !editor.available ? 'Content storage is unavailable' : (!editor.editable ? 'Archived versions are read-only' : `Edit allowed content in this snapshot · ${shortcuts.editor}`);
    }
    const text = state.version === latest ? (editor.active ? 'Finish editing' : 'Edit content') : 'Archived content';
    button.querySelector('span').textContent = text;
    floating.querySelector('strong').textContent = state.version === latest ? (editor.active ? 'Finish' : 'Edit') : 'Archived';
    const commentButton = $('add-comment');
    commentButton.hidden = !editorConfigured;
    commentButton.disabled = !editor.available || !editor.editable;
    commentButton.setAttribute('aria-pressed', String(commentMode));
    commentButton.setAttribute('aria-keyshortcuts', 'Meta+Shift+C Control+Shift+C');
    commentButton.querySelector('strong').textContent = commentMode ? 'Cancel' : 'Comment';
    commentButton.title = editor.editable ? `${commentMode ? 'Cancel comment placement' : 'Place a comment anywhere on the page'} · ${shortcuts.comment}` : 'Comments are available on the latest editable version.';
    $('access-toggle').hidden = editor.role !== 'admin';
    $('activity-toggle').hidden = editor.role !== 'admin';
  }

  function toggleEditor() {
    if (!editor.editable) return;
    if (commentMode) setCommentMode(false, false);
    editor.active = !editor.active;
    updateEditorButton(); sendContent();
    announce(editor.active ? 'Edit mode on — page links are paused' : 'Edit mode off');
  }

  function setCommentMode(active, notify = true) {
    if (active && !editor.editable) return;
    commentMode = Boolean(active);
    if (commentMode && editor.active) {
      editor.active = false;
      sendContent();
    }
    updateEditorButton();
    send({type:'wf:comment-mode', active:commentMode});
    if (notify) announce(commentMode ? 'Move over the page, then click where the purple dot should stay' : 'Comment placement cancelled');
  }

  async function loadContent() {
    const requestedVersion = state.version.id;
    commentMode = false;
    editor = {...editor, available:false, editable:false, active:false, content:{}, comments:[], user:null, role:null, version:null, latest:null};
    updateEditorButton();
    if (!editorConfigured || location.protocol === 'file:') {
      sendContent();
      return;
    }
    try {
      const response = await fetch(`/api/editor/content?version=${encodeURIComponent(requestedVersion)}`, {credentials:'same-origin'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Content could not be loaded.');
      if (requestedVersion !== state.version.id) return;
      editor = {available:true, editable:Boolean(data.editable), active:false, content:data.content || {}, comments:data.comments || [], user:data.user || null, role:data.role || null, version:data.version || requestedVersion, latest:data.latest || null};
    } catch (error) {
      console.warn(error);
      editor = {...editor, available:false};
    }
    updateEditorButton();
    drawComments();
    sendContent();
  }

  function load() {
    $('version-select').value = state.version.id;
    device();
    setNotes(state.notes);
    if (currentVersion !== state.version.id) {
      pages = [];
      currentVersion = state.version.id;
      frame.src = `${state.version.file}#${state.route}`;
    } else send({type:'wf:go', route:state.route});
    loadContent();
  }

  function go(route) {
    state.route = route;
    storeURL(true);
    send({type:'wf:go', route});
    window.scrollTo({top:0, behavior:'instant'});
  }

  async function loadHistory() {
    const list = $('content-history-list');
    historyEntries = [];
    historyVisible = 3;
    $('history-load-more').hidden = true;
    $('history-count').textContent = '';
    list.innerHTML = '<p>Loading recent changes…</p>';
    try {
      const query = new URLSearchParams({version:state.version.id, key:selectedField.key});
      const response = await fetch(`/api/editor/history?${query}`, {credentials:'same-origin'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'History could not be loaded.');
      historyEntries = data.history || [];
      if (!historyEntries.length) {
        list.innerHTML = '<p>No changes to this field yet.</p>';
        $('history-count').textContent = '0 changes';
        return;
      }
      renderHistory();
    } catch (error) {
      list.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }

  function renderHistory(firstNewIndex = -1) {
    const visible = historyEntries.slice(0, historyVisible);
    const list = $('content-history-list');
    const kind = selectedField?.kind || 'text';
    list.innerHTML = visible.map((entry, index) => {
      const changedAt = new Date(entry.changed_at);
      const changedAtLabel = changedAt.toLocaleString();
      const longChange = historyValueIsLong(entry.old_value, kind) || historyValueIsLong(entry.new_value, kind);
      return `<details class="history-entry" data-history-index="${index}"${index === 0 ? ' open' : ''}>
        <summary class="history-entry-summary" aria-label="${esc(`${index === 0 ? 'Latest change' : 'Change'} by ${entry.changed_by} on ${changedAtLabel}`)}">
          <span class="history-entry-meta"><strong>${esc(entry.changed_by)}</strong><time datetime="${esc(entry.changed_at)}">${esc(changedAtLabel)}</time></span>
          <span class="history-entry-summary-side">${index === 0 ? '<span class="history-latest">Latest</span>' : ''}<span class="history-accordion-icon" aria-hidden="true"></span></span>
        </summary>
        <div class="history-entry-body">
          <div class="history-diff" aria-label="Change details">
            <div class="history-value history-value-before"><span class="history-value-label">Before</span>${historyValueMarkup(entry.old_value, entry.new_value, kind, 'removed')}</div>
            <span class="history-diff-arrow" aria-hidden="true">→</span>
            <div class="history-value history-value-after"><span class="history-value-label">After</span>${historyValueMarkup(entry.new_value, entry.old_value, kind, 'added')}</div>
          </div>
          <div class="history-entry-actions">${longChange ? '<button class="history-expand" type="button" data-history-expand aria-expanded="false">Show full change</button>' : '<span></span>'}<button class="history-restore" type="button" data-restore-index="${index}" aria-label="Restore the value from before this change">Restore “before”</button></div>
        </div>
      </details>`;
    }).join('');
    const remaining = Math.max(0, historyEntries.length - visible.length);
    $('history-count').textContent = `Showing ${visible.length} of ${historyEntries.length}`;
    $('history-load-more').hidden = !remaining;
    $('history-load-more').textContent = `Load next ${Math.min(4, remaining)}${remaining > 4 ? ` · ${remaining} not shown` : ''}`;
    if (firstNewIndex >= 0) requestAnimationFrame(() => {
      const firstNew = list.querySelector(`[data-history-index="${firstNewIndex}"]`);
      if (firstNew) list.scrollTo({top:firstNew.offsetTop - list.offsetTop, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    });
  }

  function historyValueIsLong(value, kind) {
    if (kind === 'image') return false;
    if (kind === 'links' || kind === 'accordions') {
      try { return JSON.parse(value || '[]').length > 3 || String(value || '').length > 180; } catch { return String(value || '').length > 180; }
    }
    return String(value || '').length > 180 || String(value || '').split('\n').length > 3;
  }

  function historyChangedText(value, comparison, changeType) {
    const current = String(value ?? '');
    const other = String(comparison ?? '');
    if (!current) return '<em class="history-empty">Empty</em>';
    if (current === other) return esc(current);
    let start = 0;
    while (start < current.length && start < other.length && current[start] === other[start]) start++;
    let currentEnd = current.length;
    let otherEnd = other.length;
    while (currentEnd > start && otherEnd > start && current[currentEnd - 1] === other[otherEnd - 1]) { currentEnd--; otherEnd--; }
    return `${esc(current.slice(0, start))}<mark class="history-${changeType}">${esc(current.slice(start, currentEnd))}</mark>${esc(current.slice(currentEnd))}`;
  }

  function historyCollectionMarkup(value, comparison, changeType) {
    let items;
    let otherItems;
    try { items = JSON.parse(value || '[]'); } catch { return `<p class="history-value-text">${historyChangedText(value, comparison, changeType)}</p>`; }
    try { otherItems = JSON.parse(comparison || '[]'); } catch { otherItems = []; }
    if (!Array.isArray(items)) return `<p class="history-value-text">${historyChangedText(value, comparison, changeType)}</p>`;
    if (!items.length) return '<em class="history-empty">No items</em>';
    if (!Array.isArray(otherItems)) otherItems = [];
    const labels = items.map((item, index) => {
      const label = item?.label || item?.question || item?.title || item?.url || `Item ${index + 1}`;
      const detail = item?.url ?? item?.answer ?? '';
      return `<li${JSON.stringify(otherItems[index]) === JSON.stringify(item) ? '' : ` class="history-${changeType}"`}><strong>${esc(label)}</strong>${detail ? `<div>${esc(detail)}</div>` : ''}</li>`;
    }).join('');
    return `<span class="history-item-count">${items.length} item${items.length === 1 ? '' : 's'} · in display order</span><ol class="history-item-list">${labels}</ol>`;
  }

  function historyImageMarkup(value) {
    let media = null; try { media = value ? JSON.parse(value) : null; } catch {}
    if (!media?.src) return '<em class="history-empty">No image</em>';
    const name = media.name || 'Saved image';
    return `<div class="history-image"><img src="${esc(media.src)}" alt=""><span><strong>${esc(name)}</strong>${media.alt ? `<small>Alt: ${esc(media.alt)}</small>` : '<small>No alternative text</small>'}</span></div>`;
  }

  function historyValueMarkup(value, comparison, kind, changeType) {
    if (kind === 'image') return historyImageMarkup(value);
    if (kind === 'links' || kind === 'accordions') return historyCollectionMarkup(value, comparison, changeType);
    return `<p class="history-value-text">${historyChangedText(value, comparison, changeType)}</p>`;
  }

  function activityKind(entry) {
    if (entry.target_key.endsWith('.items')) return 'links';
    if (entry.target_key.endsWith('.accordions')) return 'accordions';
    for (const value of [entry.new_value, entry.old_value]) {
      try { if (JSON.parse(value)?.src) return 'image'; } catch {}
    }
    return 'text';
  }

  function renderActivity() {
    $('activity-status').textContent = activityEntries.length ? `${activityEntries.length} changes loaded · newest first` : 'No changes match these filters.';
    $('activity-list').innerHTML = activityEntries.map(entry => {
      const kind = activityKind(entry);
      const action = entry.kind === 'content' ? ({links:'Link list updated', accordions:'Accordions updated', image:'Image updated', text:'Content updated'}[kind])
        : ({comment:'Comment added', reply:'Reply added', deleted:'Comment deleted'}[entry.kind]);
      const location = entry.route || entry.target_key.replace(/[._-]+/g, ' ');
      const details = entry.kind === 'content'
        ? `<div class="history-diff"><div class="history-value history-value-before"><span class="history-value-label">Before</span>${historyValueMarkup(entry.old_value, entry.new_value, kind, 'removed')}</div><span class="history-diff-arrow" aria-hidden="true">→</span><div class="history-value history-value-after"><span class="history-value-label">After</span>${historyValueMarkup(entry.new_value, entry.old_value, kind, 'added')}</div></div>`
        : `<p class="activity-comment">${esc(entry.kind === 'deleted' ? entry.old_value : entry.new_value)}</p>${entry.parent_id ? `<p class="activity-context">Reply to comment #${Number(entry.parent_id)}</p>` : ''}`;
      return `<details class="history-entry is-expanded"><summary class="history-entry-summary"><span class="history-entry-meta"><strong>${esc(action)} · ${esc(location)}</strong><span>${esc(entry.changed_by)} · ${esc(entry.version_id)}</span><time datetime="${esc(entry.changed_at)}">${esc(new Date(entry.changed_at).toLocaleString())}</time></span><span class="history-accordion-icon" aria-hidden="true"></span></summary><div class="history-entry-body"><p class="activity-context">${esc(entry.target_key)}${entry.kind !== 'content' ? ` · Comment #${esc(entry.event_id.split(':')[1])}` : ''}</p>${details}</div></details>`;
    }).join('');
    $('activity-more').hidden = !activityCursor;
  }

  async function loadActivity(append = false) {
    const requestId = ++activityRequest;
    if (!append) { activityEntries = []; activityCursor = null; $('activity-list').replaceChildren(); }
    $('activity-status').textContent = 'Loading changes…';
    $('activity-error').hidden = true;
    $('activity-more').disabled = true;
    $('activity-more').hidden = !append;
    const query = new URLSearchParams({version:$('activity-version').value, kind:$('activity-kind').value});
    if (append && activityCursor) query.set('before', activityCursor);
    try {
      const response = await fetch(`/api/editor/activity?${query}`, {credentials:'same-origin'});
      const data = await response.json();
      if (requestId !== activityRequest) return;
      if (!response.ok) throw new Error(data.error || 'Changes could not be loaded.');
      activityEntries.push(...(data.entries || []));
      activityCursor = data.nextCursor;
      renderActivity();
    } catch (error) {
      if (requestId !== activityRequest) return;
      $('activity-status').textContent = '';
      $('activity-error').textContent = `${error.message} Use Refresh to try again.`;
      $('activity-error').hidden = false;
    } finally { if (requestId === activityRequest) $('activity-more').disabled = false; }
  }

  function displayLink(value) {
    return typeof value === 'string' && value.startsWith('#') ? value.slice(1) : (value || '');
  }

  function normalizeLink(value) {
    const link = value.trim();
    if (!link || /^(?:#|\/|https?:\/\/|mailto:|tel:)/i.test(link)) return link;
    if (/^(?:www\.|[^\s/]+\.[^\s]+$)/i.test(link)) return `https://${link}`;
    return `#${link}`;
  }

  function drawComments() {
    const comments = editor.comments.filter(comment => !comment.deleted_at);
    $('comments-count').textContent = comments.length;
    const list = $('comments-list');
    if (!comments.length) { list.innerHTML = '<p>No comments yet.</p>'; return; }
    list.innerHTML = comments.slice().reverse().map(comment => `<button type="button" data-comment-id="${Number(comment.id)}" data-route="${esc(comment.route)}" data-key="${esc(comment.target_key)}"><strong>${esc(comment.changed_by)}${comment.parent_id ? ' · Reply' : ''}</strong><span>${esc(new Date(comment.changed_at).toLocaleString())}</span><p>${esc(comment.body)}</p></button>`).join('');
  }

  const linkTargetName = item => `${item.label} — ${item.group}`;

  function populateLinkTargetOptions() {
    $('link-target-options').innerHTML = linkTargets.map(item => `<option value="${esc(linkTargetName(item))}"></option>`).join('');
  }

  function linkTargetFor(value = '') {
    const clean = displayLink(value.trim());
    return linkTargets.find(item => item.route === clean || linkTargetName(item) === value.trim());
  }

  function showLinkTarget(input, current = '') {
    const target = linkTargetFor(current);
    input.value = target ? linkTargetName(target) : displayLink(current);
  }

  function selectedLinkRoute(input) {
    const value = input.value.trim();
    if (!value) return '';
    const target = linkTargetFor(value);
    if (!target) throw new Error('Choose a destination from the search results or switch to Custom URL.');
    return target.route;
  }

  function updateCollectionRowLabel(row) {
    const input = row.querySelector('[data-label], [data-question]');
    const fallback = row.classList.contains('collection-accordion-row') ? 'Untitled accordion' : 'Untitled link';
    const title = input?.value.trim() || fallback;
    const titleTarget = row.querySelector('[data-row-title]');
    const dragHandle = row.querySelector('[data-drag-handle]');
    if (titleTarget) titleTarget.textContent = title;
    if (dragHandle) dragHandle.setAttribute('aria-label', `Drag ${title} to reorder`);
  }

  function setCollectionRowOpen(row, open) {
    const toggle = row.querySelector('[data-toggle-row]');
    const body = row.querySelector('.collection-row-body');
    if (!toggle || !body) return;
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  }

  function setCollectionLinkMode(row, mode) {
    const existing = mode === 'existing';
    row.querySelector('.collection-link-existing').hidden = !existing;
    row.querySelector('.collection-link-custom').hidden = existing;
  }

  function collectionItems() {
    return [...$('collection-items').querySelectorAll('.collection-row')].map(row => selectedField.kind === 'accordions' ? {
      question:row.querySelector('[data-question]').value.trim(), answer:row.querySelector('[data-answer]').value.trim()
    } : {
      label:row.querySelector('[data-label]').value.trim(),
      url:normalizeLink(row.querySelector('[data-link-mode]:checked').value === 'existing'
        ? selectedLinkRoute(row.querySelector('[data-link-picker]'))
        : row.querySelector('[data-url]').value)
    }).filter(item => selectedField.kind === 'accordions' ? (item.question || item.answer) : item.label);
  }

  function addCollectionRow(item = {}) {
    const row = document.createElement('div'); row.className = 'collection-row';
    if (selectedField.kind === 'accordions') {
      const rowId = `collection-accordion-${++collectionRowSequence}`;
      row.classList.add('collection-accordion-row', 'collection-sortable-row');
      row.innerHTML = `<div class="collection-row-head"><span class="collection-drag-handle" role="button" tabindex="0" draggable="true" data-drag-handle title="Drag to reorder"><span aria-hidden="true">⠿</span></span><button class="collection-row-toggle" type="button" data-toggle-row aria-expanded="false" aria-controls="${rowId}"><strong data-row-title>${esc(item.question || 'Untitled accordion')}</strong><span class="collection-row-chevron" aria-hidden="true">⌄</span></button><button class="collection-remove" type="button" data-remove-row>Remove</button></div><div class="collection-row-body" id="${rowId}" hidden><label>Question</label><input data-question value="${esc(item.question || '')}"><label>Answer</label><textarea data-answer>${esc(item.answer || '')}</textarea></div>`;
      updateCollectionRowLabel(row);
      setCollectionRowOpen(row, !Object.keys(item).length);
    } else {
      const rowId = `collection-link-${++collectionRowSequence}`;
      const current = displayLink(item.url || '');
      const known = linkTargets.some(target => target.route === current);
      const mode = known || !current ? 'existing' : 'custom';
      row.classList.add('collection-link-row', 'collection-sortable-row');
      row.innerHTML = `<div class="collection-row-head"><span class="collection-drag-handle" role="button" tabindex="0" draggable="true" data-drag-handle title="Drag to reorder"><span aria-hidden="true">⠿</span></span><button class="collection-row-toggle" type="button" data-toggle-row aria-expanded="false" aria-controls="${rowId}"><strong data-row-title>${esc(item.label || 'Untitled link')}</strong><span class="collection-row-chevron" aria-hidden="true">⌄</span></button><button class="collection-remove" type="button" data-remove-row>Remove</button></div><div class="collection-row-body" id="${rowId}" hidden><label>Label</label><input data-label value="${esc(item.label || '')}"><fieldset class="collection-link-mode"><legend>Link destination</legend><label><input type="radio" name="${rowId}-mode" value="existing" data-link-mode${mode === 'existing' ? ' checked' : ''}> Existing page or item</label><label><input type="radio" name="${rowId}-mode" value="custom" data-link-mode${mode === 'custom' ? ' checked' : ''}> Custom URL</label></fieldset><div class="collection-link-existing"><input class="link-target-picker" data-link-picker type="search" list="link-target-options" autocomplete="off" aria-label="Search for an existing page or item" aria-describedby="${rowId}-help" placeholder="Click to browse or type to search"><small id="${rowId}-help" class="link-target-help">Click anywhere in the field to browse all destinations, or start typing to search.</small></div><div class="collection-link-custom" hidden><input data-url type="text" maxlength="1000" value="${esc(mode === 'custom' ? current : '')}" placeholder="https://example.com"></div></div>`;
      showLinkTarget(row.querySelector('[data-link-picker]'), current);
      setCollectionLinkMode(row, mode);
      updateCollectionRowLabel(row);
      setCollectionRowOpen(row, !Object.keys(item).length);
    }
    $('collection-items').append(row);
  }

  function openEditor(field) {
    selectedField = field;
    $('content-dialog-title').textContent = field.label;
    $('content-field-key').textContent = field.key;
    const kind = field.kind || 'text';
    $('content-text-field').hidden = kind !== 'text';
    $('content-image-field').hidden = kind !== 'image';
    $('content-collection-field').hidden = !['links','accordions'].includes(kind);
    $('content-url-field').hidden = kind !== 'text' || !field.urlKey;
    $('content-scope-field').hidden = !(field.globalKey && field.localKey);
    $('content-local-scope-label').textContent = field.localScopeLabel || 'This card/block only';
    if (kind === 'text') {
      $('content-value-label').textContent = field.urlKey ? 'Button or link text' : 'Content';
      $('content-value').maxLength = Math.min(5000, Math.max(1, field.maxLength || 5000));
      $('content-value').value = field.value;
      $('content-count').textContent = `${field.value.length} / ${$('content-value').maxLength}`;
      if (field.urlKey) {
        const existing = displayLink(field.urlValue);
        const known = linkTargets.some(item => item.route === existing);
        document.querySelector(`input[name="link-mode"][value="${known ? 'existing' : 'custom'}"]`).checked = true;
        $('link-existing').hidden = !known; $('link-custom').hidden = known;
        $('content-url').value = known ? '' : existing;
        showLinkTarget($('link-target-picker'), known ? existing : '');
      }
      if (field.globalKey && field.localKey) {
        const useLocal = field.key === field.localKey;
        document.querySelector(`input[name="content-scope"][value="${useLocal ? 'local' : 'global'}"]`).checked = true;
        $('content-value').value = useLocal ? (field.localValue ?? field.value) : (field.globalValue ?? field.value);
        $('content-value').dispatchEvent(new Event('input'));
      }
    } else if (kind === 'image') {
      if (field.globalKey && field.localKey) {
        const useLocal = field.key === field.localKey;
        document.querySelector(`input[name="content-scope"][value="${useLocal ? 'local' : 'global'}"]`).checked = true;
        setImageScope(useLocal ? 'local' : 'global', false);
      } else {
        field.imageEffectiveValue = field.value || '';
        resetImageEditor(field.imageEffectiveValue);
      }
    } else {
      $('collection-items').replaceChildren();
      let items = []; try { items = JSON.parse(field.value || '[]'); } catch {}
      items.forEach(addCollectionRow); if (!items.length) addCollectionRow();
      $('collection-add').textContent = kind === 'accordions' ? '+ Add accordion' : '+ Add link';
      $('content-count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    }
    $('content-user').textContent = editor.user || '';
    $('content-error').hidden = true;
    $('content-dialog').showModal();
    if (kind === 'text') $('content-value').focus();
    loadHistory();
  }

  function openCommentDialog(target) {
    if (!editor.available) return;
    selectedCommentTarget = target;
    setCommentMode(false, false);
    $('comment-dialog-title').textContent = target.label || 'Page comment';
    renderCommentThread(target);
    setReplyTarget(null);
    $('comment-value').hidden = !editor.editable;
    $('comment-value-label').hidden = !editor.editable;
    $('comment-save').hidden = !editor.editable;
    $('comment-value').value = '';
    $('comment-error').hidden = true;
    $('comment-dialog').showModal();
    if (editor.editable) $('comment-value').focus();
    refreshComments();
  }

  async function refreshComments() {
    const requestId = ++commentRequest;
    const version = state.version.id;
    const target = selectedCommentTarget;
    $('comments-refresh').disabled = true;
    try {
      const response = await fetch(`/api/editor/content?version=${encodeURIComponent(version)}`, {credentials:'same-origin'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Comments could not be refreshed.');
      if (requestId !== commentRequest || state.version.id !== version || selectedCommentTarget !== target) return;
      editor.comments = data.comments || [];
      drawComments(); sendContent(); renderCommentThread(target);
      $('comment-error').hidden = true;
    } catch (error) {
      if (requestId !== commentRequest || state.version.id !== version || selectedCommentTarget !== target) return;
      $('comment-error').textContent = error.message;
      $('comment-error').hidden = false;
    } finally { if (requestId === commentRequest) $('comments-refresh').disabled = false; }
  }

  function setReplyTarget(id) {
    const parent = editor.comments.find(comment => Number(comment.id) === Number(id));
    replyToId = parent ? Number(parent.id) : null;
    $('comment-compose').hidden = !parent;
    $('reply-context').textContent = parent ? `Replying to ${parent.changed_by} · #${parent.id}` : '';
    $('reply-cancel').hidden = !parent;
    $('comment-value-label').textContent = parent ? 'Your reply' : 'Add a comment';
    $('comment-save').textContent = parent ? 'Post reply' : 'Add comment';
  }

  function renderCommentThread(target) {
    const matching = editor.comments.filter(comment => comment.target_key === target.key && comment.route === (target.route || state.route));
    const byId = new Map(matching.map(comment => [Number(comment.id), comment]));
    const threads = new Map();
    for (const comment of matching) {
      let root = comment;
      const visited = new Set([Number(root.id)]);
      while (byId.has(Number(root.parent_id)) && !visited.has(Number(root.parent_id))) {
        root = byId.get(Number(root.parent_id)); visited.add(Number(root.id));
      }
      if (!threads.has(root.id)) threads.set(root.id, []);
      threads.get(root.id).push(comment);
    }
    const ordered = [...threads.values()].sort((a, b) => Math.max(...b.map(item => Number(item.id))) - Math.max(...a.map(item => Number(item.id))));
    $('comment-thread').innerHTML = ordered.length ? ordered.map(thread => `<section class="comment-conversation" aria-label="Comment thread">${thread.sort((a, b) => Number(a.id) - Number(b.id)).map(comment => {
      const parent = byId.get(Number(comment.parent_id));
      return `<div class="comment-entry${parent ? ' comment-reply' : ''}" id="thread-comment-${Number(comment.id)}"><div class="comment-entry-head"><span><strong>${esc(comment.changed_by)} · #${Number(comment.id)}</strong><time>${esc(new Date(comment.changed_at).toLocaleString())}</time></span>${editor.editable && !comment.deleted_at && comment.changed_by === editor.user ? `<button type="button" data-delete-comment="${Number(comment.id)}" aria-label="Delete your comment">Delete</button>` : ''}</div>${parent ? `<div class="comment-reply-context">Replying to ${esc(parent.changed_by)} · #${Number(parent.id)}</div>` : ''}<p>${comment.deleted_at ? '<em>Comment deleted</em>' : esc(comment.body)}</p>${editor.editable && !comment.deleted_at ? `<button class="comment-reply-button" type="button" data-reply-comment="${Number(comment.id)}">Reply</button>` : ''}</div>`;
    }).join('')}</section>`).join('') : '<p>No comments here yet.</p>';
  }

  function accountMarkup(account, role) {
    const added = account.created_at ? `Added ${new Date(account.created_at).toLocaleDateString()} by ${account.created_by}` : account.created_by;
    const label = role === 'admin' ? 'global administrator' : 'client';
    return `<div class="account-row"><div><strong>${esc(account.email)}</strong><span>${esc(added || '')}</span></div>${account.removable === false ? '<span class="account-badge">Protected</span>' : `<button type="button" data-remove-account data-role="${role}" data-email="${esc(account.email)}" aria-label="Remove ${esc(account.email)} as ${label}">Remove</button>`}</div>`;
  }

  function renderAccounts(data) {
    const admins = Array.isArray(data.admins) ? data.admins : [];
    const clients = Array.isArray(data.clients) ? data.clients : [];
    $('admin-count').textContent = admins.length;
    $('client-count').textContent = clients.length;
    $('admin-list').innerHTML = admins.length ? admins.map(account => accountMarkup(account, 'admin')).join('') : '<p class="account-empty">No database administrators yet.</p>';
    $('client-list').innerHTML = clients.length ? clients.map(account => accountMarkup(account, 'client')).join('') : '<p class="account-empty">No clients have access to this wireframe yet.</p>';
  }

  async function loadAccounts() {
    $('access-error').hidden = true;
    $('admin-list').innerHTML = '<p class="account-empty">Loading administrators…</p>';
    $('client-list').innerHTML = '<p class="account-empty">Loading clients…</p>';
    const response = await fetch('/api/editor/accounts', {credentials:'same-origin'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Accounts could not be loaded.');
    renderAccounts(data);
  }

  async function openAccessManager() {
    $('access-project-name').textContent = project.name;
    $('access-dialog').showModal();
    try { await loadAccounts(); }
    catch (error) { $('access-error').textContent = error.message; $('access-error').hidden = false; }
  }

  async function saveAccount(role, email, form) {
    const error = $('access-error');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; error.hidden = true;
    try {
      const response = await fetch('/api/editor/accounts', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({role, email})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The account could not be added.');
      form.reset();
      await loadAccounts();
      announce(role === 'admin' ? 'Global administrator added' : 'Client access added');
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { button.disabled = false; }
  }

  async function removeAccount(role, email) {
    if (!confirm(`Remove ${email} as ${role === 'admin' ? 'a global administrator' : 'a client of this wireframe'}?`)) return;
    const error = $('access-error');
    error.hidden = true;
    try {
      const response = await fetch('/api/editor/accounts', {method:'DELETE', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({role, email})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The account could not be removed.');
      await loadAccounts();
      announce('Account access removed');
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
  }

  async function deleteComment(id) {
    const comment = editor.comments.find(item => Number(item.id) === Number(id));
    if (!comment || comment.changed_by !== editor.user) return;
    if (!confirm('Delete this comment? Replies will stay visible. The original text remains in admin change history.')) return;
    const error = $('comment-error');
    error.hidden = true;
    commentRequest++;
    $('comments-refresh').disabled = true;
    try {
      const response = await fetch(`/api/editor/comments/${encodeURIComponent(comment.id)}`, {method:'DELETE', credentials:'same-origin'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The comment could not be deleted.');
      comment.deleted_at = data.deletedAt;
      comment.body = '';
      if (replyToId === Number(comment.id)) setReplyTarget(null);
      drawComments();
      sendContent();
      if (selectedCommentTarget) renderCommentThread(selectedCommentTarget);
      announce('Comment deleted');
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally { $('comments-refresh').disabled = false; }
  }

  async function saveComment() {
    if (!selectedCommentTarget || !editor.editable) return;
    const value = $('comment-value').value.trim();
    const button = $('comment-save');
    const error = $('comment-error');
    if (!value) { error.textContent = 'Write a comment first.'; error.hidden = false; return; }
    button.disabled = true; error.hidden = true;
    commentRequest++;
    $('comments-refresh').disabled = true;
    try {
      const response = await fetch('/api/editor/comments', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({version:state.version.id, route:selectedCommentTarget.route || state.route, key:selectedCommentTarget.key, body:value, parentId:replyToId})});
      const data = await response.json();
      if (!response.ok) {
        const message = response.status === 404 && data.error === 'Editor endpoint not found.'
          ? 'The preview server is using an older editor API. Restart npm run dev, then try again.'
          : (data.error || 'The comment could not be saved.');
        throw new Error(message);
      }
      editor.comments.push(data.comment);
      drawComments(); sendContent(); renderCommentThread(selectedCommentTarget);
      $('comment-value').value = '';
      setReplyTarget(null);
      document.getElementById(`thread-comment-${Number(data.comment.id)}`)?.scrollIntoView({block:'nearest'});
      announce(data.comment.parent_id ? 'Reply added' : 'Comment added');
    } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    finally { button.disabled = false; $('comments-refresh').disabled = false; }
  }

  async function saveEditor() {
    if (!selectedField) return;
    const button = $('content-save');
    const error = $('content-error');
    button.disabled = true;
    error.hidden = true;
    try {
      const kind = selectedField.kind || 'text';
      if (kind === 'image') {
        const scopedKey = selectedField.globalKey && selectedField.localKey
          ? (document.querySelector('input[name="content-scope"]:checked')?.value === 'local' ? selectedField.localKey : selectedField.globalKey)
          : selectedField.key;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(scopedKey || '')) throw new Error('This image target is invalid. Close the editor, reload the preview and try again.');
        selectedField.key = scopedKey;
        const editVersion = editor.version || state.version.id;
        if (editor.latest && editVersion !== editor.latest) throw new Error('This is no longer the latest editable version. Reload the preview and try again.');
        const file = imageDraftFile || $('content-image').files[0];
        let existing = null; try { existing = JSON.parse(selectedField.imageEffectiveValue || selectedField.value || 'null'); } catch {}
        if (imageRestoreValue !== null && !file) {
          const value = imageRestoreValue;
          const response = await fetch('/api/editor/content', {method:'PUT', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({version:editVersion, changes:[{key:selectedField.key, value, baseValue:selectedField.value}]})});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The previous image could not be restored.');
          rememberSavedImage(value);
          sendContent(); $('content-dialog').close(); announce(data.unchanged ? 'Image already matches this version' : 'Previous image restored'); return;
        }
        if (imageRemoved && !file) {
          const response = await fetch('/api/editor/content', {method:'PUT', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({version:editVersion, changes:[{key:selectedField.key, value:'', baseValue:selectedField.value}]})});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The image could not be removed.');
          rememberSavedImage('');
          sendContent(); $('content-dialog').close(); announce(data.unchanged ? 'No image change' : 'Image removed'); return;
        }
        if (!file && !existing) throw new Error('Choose an image to upload.');
        if (file) {
          if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
          const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file); });
          $('image-dropzone').setAttribute('aria-disabled', 'true');
          $('image-remove').disabled = true;
          $('image-file-status').textContent = 'Uploading…';
          const upload = await uploadImage({version:editVersion, key:selectedField.key, name:file.name, type:file.type, alt:$('content-image-alt').value.trim(), data:String(dataUrl).split(',')[1]});
          const data = upload.data;
          if (!upload.ok) throw new Error(data.error || 'The image could not be uploaded.');
          setUploadProgress(100);
          rememberSavedImage(data.value);
        } else {
          const value = JSON.stringify({...existing, alt:$('content-image-alt').value.trim()});
          const response = await fetch('/api/editor/content', {method:'PUT', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({version:editVersion, changes:[{key:selectedField.key, value, baseValue:selectedField.value}]})});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The image description could not be saved.');
          rememberSavedImage(value);
        }
        sendContent(); $('content-dialog').close(); announce('Image saved'); return;
      }

      let key = selectedField.key;
      let value;
      let baseValue = selectedField.value;
      const changes = [];
      if (kind === 'links' || kind === 'accordions') {
        value = JSON.stringify(collectionItems());
      } else {
        value = $('content-value').value;
        if (selectedField.globalKey && selectedField.localKey) {
          const scope = document.querySelector('input[name="content-scope"]:checked').value;
          key = scope === 'local' ? selectedField.localKey : selectedField.globalKey;
          baseValue = scope === 'local' ? (selectedField.localValue ?? selectedField.globalValue ?? selectedField.value) : (selectedField.globalValue ?? selectedField.value);
        }
      }
      changes.push({key, value, baseValue});
      if (kind === 'text' && selectedField.urlKey) {
        const mode = document.querySelector('input[name="link-mode"]:checked').value;
        const normalizedUrl = mode === 'existing' ? normalizeLink(selectedLinkRoute($('link-target-picker'))) : normalizeLink($('content-url').value);
        changes.push({key:selectedField.urlKey, value:normalizedUrl, baseValue:selectedField.urlValue});
      }
      const response = await fetch('/api/editor/content', {
        method:'PUT', credentials:'same-origin', headers:{'content-type':'application/json'},
        body:JSON.stringify({version:state.version.id, changes})
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'The change could not be saved.'), {currentValue:data.currentValue});
      editor.content[key] = value;
      if (selectedField.urlKey) editor.content[selectedField.urlKey] = changes[1].value;
      selectedField.value = value;
      sendContent();
      $('content-dialog').close();
      announce(data.unchanged ? 'No content change' : 'Content saved');
    } catch (failure) {
      error.textContent = failure.currentValue === undefined ? failure.message : `${failure.message} Close and reopen the field to load the current value.`;
      error.hidden = false;
      if ((selectedField?.kind || 'text') === 'image' && imageDraftFile) {
        setUploadProgress(0, false);
        $('image-file-status').textContent = 'Upload failed · Try again';
      }
    } finally {
      button.disabled = false;
      $('image-dropzone').removeAttribute('aria-disabled');
      $('image-remove').disabled = false;
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || (location.protocol !== 'file:' && event.origin !== location.origin)) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'wf:booking-control') {bookingControlVisible = Boolean(message.visible);positionBookingControl();}
    if (message.type === 'wf:ready') {
      pages = message.pages;
      commonNotes = message.notes || [];
      linkTargets = Array.isArray(message.linkTargets) ? message.linkTargets : pages.map(page => ({route:page.id, label:page.label, group:page.kind === 'template' ? 'Templates' : 'Pages'}));
      populateLinkTargetOptions();
      state.route = message.route;
      navigation();
      storeURL();
      sendContent();
    }
    if (message.type === 'wf:content-runtime-ready') sendContent();
    if (message.type === 'wf:edit-content' && editor.active && editor.editable) openEditor(message);
    if (message.type === 'wf:edit-image' && editor.active && editor.editable) openEditor(message);
    if (message.type === 'wf:edit-collection' && editor.active && editor.editable) openEditor(message);
    if (message.type === 'wf:add-comment' && editor.editable) openCommentDialog(message);
    if (message.type === 'wf:open-comment') {
      const found = editor.comments.find(comment => comment.target_key === message.key);
      if (found) openCommentDialog({key:message.key, label:'Comment thread', route:found.route});
    }
    if (message.type === 'wf:shortcut') {
      if (message.action === 'comment') setCommentMode(!commentMode);
      if (message.action === 'edit') toggleEditor();
    }
    if (message.type === 'wf:route') {
      if (state.route !== message.route) {
        state.route = message.route;
        storeURL(true);
        window.scrollTo({top:0, behavior:'instant'});
      }
      navigation();
      sendContent();
    }
    if (message.type === 'wf:height' && Number.isFinite(message.height)) {
      contentHeight = Math.max(500, Math.min(message.height, 40000));
      dimensions();
    }
    if (message.type === 'wf:notes') setNotes(true);
  });

  $('page-tabs').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) go(button.dataset.page); });
  $('page-select').addEventListener('change', event => go(event.target.value));
  for (const name of ['pages', 'templates']) $(`group-${name}`).addEventListener('click', () => { group = name; drawTabs(); });
  for (const name of ['desktop', 'mobile']) $(name).addEventListener('click', () => { state.device = name; device(); storeURL(); });
  $('version-select').addEventListener('change', event => { state.version = versions.find(version => version.id === event.target.value); storeURL(true); load(); });
  $('editor-toggle').addEventListener('click', toggleEditor);
  $('floating-editor-toggle').addEventListener('click', toggleEditor);
  $('access-toggle').addEventListener('click', openAccessManager);
  $('activity-version').insertAdjacentHTML('beforeend', versions.slice().reverse().map(version => `<option value="${esc(version.id)}">${esc(version.id)} · ${esc(version.label)}</option>`).join(''));
  $('activity-toggle').addEventListener('click', () => { $('activity-dialog').showModal(); loadActivity(); });
  $('activity-close').addEventListener('click', () => $('activity-dialog').close());
  $('activity-refresh').addEventListener('click', () => loadActivity());
  $('activity-version').addEventListener('change', () => loadActivity());
  $('activity-kind').addEventListener('change', () => loadActivity());
  $('activity-more').addEventListener('click', () => loadActivity(true));
  $('access-close').addEventListener('click', () => $('access-dialog').close());
  $('client-add-form').addEventListener('submit', event => { event.preventDefault(); saveAccount('client', $('client-email').value, event.currentTarget); });
  $('admin-add-form').addEventListener('submit', event => { event.preventDefault(); saveAccount('admin', $('admin-email').value, event.currentTarget); });
  $('access-dialog').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-account]');
    if (button) removeAccount(button.dataset.role, button.dataset.email);
  });
  $('add-comment').addEventListener('click', () => setCommentMode(!commentMode));
  $('comments-toggle').addEventListener('click', () => { $('comments-panel').hidden = false; $('review-notes').hidden = true; requestAnimationFrame(dimensions); });
  $('close-comments').addEventListener('click', () => { $('comments-panel').hidden = true; requestAnimationFrame(dimensions); $('comments-toggle').focus(); });
  $('comments-list').addEventListener('click', event => {
    const button = event.target.closest('[data-comment-id]'); if (!button) return;
    const target = {key:button.dataset.key, route:button.dataset.route, label:'Comment thread'};
    if (!target.route.startsWith('shared:') && state.route !== target.route) go(target.route);
    setTimeout(() => send({type:'wf:focus-comment', key:target.key}), 180);
    openCommentDialog(target);
  });
  $('notes-toggle').addEventListener('click', () => setNotes(!state.notes));
  $('close-notes').addEventListener('click', () => { setNotes(false); $('notes-toggle').focus(); });
  $('back-top').addEventListener('click', () => window.scrollTo({top:0, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); announce(`Link copied: ${state.version.id} · ${selected()?.label || 'page'} · ${state.device}`); }
    catch { prompt('Copy this review link', location.href); }
  });
  $('header-toggle').addEventListener('click', () => setHeaderCollapsed(!document.documentElement.classList.contains('header-collapsed')));
  $('content-value').addEventListener('input', event => $('content-count').textContent = `${event.target.value.length} / ${event.target.maxLength}`);
  $('content-image').addEventListener('change', event => selectImageFile(event.target.files[0]));
  $('image-dropzone').addEventListener('click', event => {
    if (event.target !== $('content-image')) $('content-image').click();
  });
  $('image-dropzone').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('content-image').click(); }
  });
  for (const name of ['dragenter','dragover']) $('image-dropzone').addEventListener(name, event => {
    event.preventDefault(); event.stopPropagation(); $('image-dropzone').classList.add('is-dragging');
  });
  for (const name of ['dragleave','drop']) $('image-dropzone').addEventListener(name, event => {
    event.preventDefault(); event.stopPropagation(); $('image-dropzone').classList.remove('is-dragging');
  });
  $('image-dropzone').addEventListener('drop', event => selectImageFile(event.dataTransfer?.files?.[0]));
  $('image-remove').addEventListener('click', () => {
    $('content-image').value = '';
    imageDraftFile = null;
    imageRestoreValue = null;
    imageRemoved = true;
    setUploadProgress(0, false);
    showImagePreview();
    $('content-error').hidden = true;
  });
  $('content-form').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); saveEditor(); });
  $('content-dialog').addEventListener('click', event => {
    const picker = event.target.closest('.link-target-picker');
    if (!picker || typeof picker.showPicker !== 'function') return;
    try { picker.showPicker(); } catch {}
  });
  $('comment-form').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); saveComment(); });
  $('comment-thread').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-comment]');
    if (button) deleteComment(button.dataset.deleteComment);
    const reply = event.target.closest('[data-reply-comment]');
    if (reply && editor.editable) { setReplyTarget(Number(reply.dataset.replyComment)); $('comment-value').focus(); }
  });
  $('reply-cancel').addEventListener('click', () => { setReplyTarget(null); $('comment-value').focus(); });
  $('comments-refresh').addEventListener('click', refreshComments);
  document.querySelectorAll('input[name="link-mode"]').forEach(input => input.addEventListener('change', () => { const existing = input.value === 'existing' && input.checked; if (!input.checked) return; $('link-existing').hidden = !existing; $('link-custom').hidden = existing; }));
  document.querySelectorAll('input[name="content-scope"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked || !selectedField) return;
    if ((selectedField.kind || 'text') === 'image') { setImageScope(input.value); return; }
    $('content-value').value = input.value === 'local' ? (selectedField.localValue ?? selectedField.globalValue ?? selectedField.value) : (selectedField.globalValue ?? selectedField.value);
    $('content-value').dispatchEvent(new Event('input'));
  }));
  $('collection-add').addEventListener('click', () => addCollectionRow());
  $('collection-items').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-row]');
    if (remove) { remove.closest('.collection-row').remove(); return; }
    const toggle = event.target.closest('[data-toggle-row]');
    if (toggle) setCollectionRowOpen(toggle.closest('.collection-row'), toggle.getAttribute('aria-expanded') !== 'true');
  });
  $('collection-items').addEventListener('input', event => {
    const row = event.target.closest('.collection-sortable-row');
    if (!row) return;
    if (event.target.matches('[data-label], [data-question]')) updateCollectionRowLabel(row);
  });
  $('collection-items').addEventListener('change', event => {
    const row = event.target.closest('.collection-link-row');
    if (!row) return;
    if (event.target.matches('[data-link-mode]') && event.target.checked) setCollectionLinkMode(row, event.target.value);
  });
  $('collection-items').addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle) { event.preventDefault(); return; }
    draggedCollectionRow = handle.closest('.collection-sortable-row');
    draggedCollectionRow.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedCollectionRow.querySelector('[data-row-title]').textContent);
  });
  $('collection-items').addEventListener('dragover', event => {
    if (!draggedCollectionRow) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target.closest('.collection-sortable-row');
    if (!target || target === draggedCollectionRow) return;
    const bounds = target.getBoundingClientRect();
    const before = event.clientY < bounds.top + bounds.height / 2;
    $('collection-items').insertBefore(draggedCollectionRow, before ? target : target.nextSibling);
  });
  $('collection-items').addEventListener('drop', event => { if (draggedCollectionRow) event.preventDefault(); });
  $('collection-items').addEventListener('dragend', () => {
    if (draggedCollectionRow) draggedCollectionRow.classList.remove('is-dragging');
    draggedCollectionRow = null;
  });
  $('collection-items').addEventListener('keydown', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || !['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const row = handle.closest('.collection-sortable-row');
    const items = $('collection-items');
    event.preventDefault();
    if (event.key === 'ArrowUp' && row.previousElementSibling) items.insertBefore(row, row.previousElementSibling);
    if (event.key === 'ArrowDown' && row.nextElementSibling) items.insertBefore(row, row.nextElementSibling.nextElementSibling);
    if (event.key === 'Home') items.prepend(row);
    if (event.key === 'End') items.append(row);
    handle.focus();
  });
  $('content-history-list').addEventListener('click', event => {
    const expand = event.target.closest('[data-history-expand]');
    if (expand) {
      const entry = expand.closest('.history-entry');
      const expanded = entry.classList.toggle('is-expanded');
      expand.setAttribute('aria-expanded', String(expanded));
      expand.textContent = expanded ? 'Show less' : 'Show full change';
      return;
    }
    const button = event.target.closest('[data-restore-index]');
    if (!button) return;
    const value = historyEntries[Number(button.dataset.restoreIndex)]?.old_value ?? '';
    const kind = selectedField?.kind || 'text';
    $('content-error').hidden = true;
    if (kind === 'image') {
      let media = null; try { media = value ? JSON.parse(value) : null; } catch {}
      imageDraftFile = null;
      imageRestoreValue = value;
      imageRemoved = !media?.src;
      $('content-image').value = '';
      $('content-image-alt').value = media?.alt || '';
      setUploadProgress(0, false);
      showImagePreview(media?.src || '', media?.src ? {name:media.name || 'Previous image', status:'Ready to restore'} : {});
      $('content-count').textContent = media?.src ? 'Previous image selected' : 'Previous empty image state selected';
      return;
    }
    if (kind === 'links' || kind === 'accordions') {
      let items = []; try { items = JSON.parse(value || '[]'); } catch {}
      $('collection-items').replaceChildren();
      items.forEach(addCollectionRow);
      if (!items.length) addCollectionRow();
      $('content-count').textContent = `${items.length} item${items.length === 1 ? '' : 's'} selected from history`;
      return;
    }
    $('content-value').value = value;
    $('content-value').dispatchEvent(new Event('input'));
    $('content-value').focus();
  });
  $('history-load-more').addEventListener('click', () => {
    const firstNewIndex = historyVisible;
    historyVisible += 4;
    renderHistory(firstNewIndex);
  });
  document.addEventListener('keydown', event => {
    const modifier = event.metaKey || event.ctrlKey;
    const typing = event.target.closest?.('input,textarea,select,[contenteditable=true]') || $('content-dialog').open || $('comment-dialog').open;
    if (modifier && !typing && event.key.toLowerCase() === 'c' && event.shiftKey) {
      event.preventDefault();
      setCommentMode(!commentMode);
      return;
    }
    if (modifier && !typing && event.key.toLowerCase() === 'e' && event.shiftKey) {
      event.preventDefault();
      toggleEditor();
      return;
    }
    if (event.key === 'Escape' && state.notes && !$('content-dialog').open) { setNotes(false); $('notes-toggle').focus(); }
  });
  new ResizeObserver(dimensions).observe($('frame-wrap'));
  window.addEventListener('resize', dimensions);
  window.addEventListener('popstate', () => { state = readURL(); load(); });
  load();
})();
