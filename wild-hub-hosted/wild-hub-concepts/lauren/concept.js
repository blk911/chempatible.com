(() => {
  'use strict';

  // Verified public Lauren Landers Sailing uploads, 2026-10-05.
  // This allowlist is the only source of media IDs; page URLs and user edits never supply them.
  const catalog = Object.freeze([
  {
    "id": "89Oi_lb0_qg",
    "title": "we BUILD a PRIVATE marina in the middle of  NOWHERE! [ep 210]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=89Oi_lb0_qg",
    "thumbnailUrl": "https://i.ytimg.com/vi/89Oi_lb0_qg/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/89Oi_lb0_qg/hqdefault.jpg",
    "summary": "Lauren and her buddy boats adapt to a weather shift and tie up beside palm trees for a memorable stop.",
    "duration": "12:40",
    "topics": [
      "Island life",
      "Sailing friends"
    ]
  },
  {
    "id": "gsVVXtGATMc",
    "title": "GIRL SOLO-sailing; 2 raw & real days on a 51' sailboat with DOLPHINS! [ep 15]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=gsVVXtGATMc",
    "thumbnailUrl": "https://i.ytimg.com/vi/gsVVXtGATMc/hqdefault.jpg?sqp=-oaymwEjCNACELwBSFryq4qpAxUIARUAAAAAGAElAADIQj0AgKJDeAE=&rs=AOn4CLAJ8k_7K_z8BZ5VfGP3O_I2nEV6bg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/gsVVXtGATMc/hqdefault.jpg",
    "summary": "Two days of single-handed sailing in the Bahamas, with hand-steering, an autopilot fix and visiting dolphins.",
    "duration": "32:45",
    "topics": [
      "Solo sailing",
      "Dolphins"
    ]
  },
  {
    "id": "JfosPsUkxgM",
    "title": "the DREAMIEST days at sea; solo but not alone [ep 209]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=JfosPsUkxgM",
    "thumbnailUrl": "https://i.ytimg.com/vi/JfosPsUkxgM/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/JfosPsUkxgM/hqdefault.jpg",
    "summary": "Provisioning and a weather wait lead to an unexpected dive before a trip to another atoll.",
    "duration": "22:56",
    "topics": [
      "Island life",
      "Diving"
    ]
  },
  {
    "id": "hvitDMF5bp4",
    "title": "no one comes here.. sketchy pass, AMAZING diving [ep 202]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=hvitDMF5bp4",
    "thumbnailUrl": "https://i.ytimg.com/vi/hvitDMF5bp4/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/hvitDMF5bp4/hqdefault.jpg",
    "summary": "A return to an atoll with three other boats brings narrow passes and distinctive diving on both sides.",
    "duration": "16:32",
    "topics": [
      "Diving",
      "Passage planning"
    ]
  },
  {
    "id": "FGezr6qvvcA",
    "title": "a girl and her boat cat; a search for food & seashells [ep 197]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=FGezr6qvvcA",
    "thumbnailUrl": "https://i.ytimg.com/vi/FGezr6qvvcA/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/FGezr6qvvcA/hqdefault.jpg",
    "summary": "A search for groceries leads to a manta cleaning station and a quieter side of the island with fresh produce.",
    "duration": "17:39",
    "topics": [
      "Boat life",
      "Mako"
    ]
  },
  {
    "id": "yibwaMhw9ng",
    "title": "on the HUNT; why I swim with SHARKS  [ep 196]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=yibwaMhw9ng",
    "thumbnailUrl": "https://i.ytimg.com/vi/yibwaMhw9ng/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/yibwaMhw9ng/hqdefault.jpg",
    "summary": "Freediving, spearfishing and relaxed evenings ashore fill a week shared with sailing friends.",
    "duration": "38:56",
    "topics": [
      "Diving",
      "Sailing friends"
    ]
  },
  {
    "id": "KIWA-uUt8B8",
    "title": "scariest sail yet? I should have turned around [ep 199]",
    "kind": "video",
    "url": "https://www.youtube.com/watch?v=KIWA-uUt8B8",
    "thumbnailUrl": "https://i.ytimg.com/vi/KIWA-uUt8B8/maxresdefault.jpg",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/KIWA-uUt8B8/hqdefault.jpg",
    "summary": "A family visit leads to a westbound sail through the Tuamotus and a challenging weather window.",
    "duration": "18:08",
    "topics": [
      "Passage planning",
      "Boat life"
    ]
  },
  {
    "id": "b-RAZ5LvEhU",
    "title": "Boat crawl 🍻 the sailors version of a bar crawl 🤪",
    "kind": "short",
    "url": "https://www.youtube.com/shorts/b-RAZ5LvEhU",
    "thumbnailUrl": "https://i.ytimg.com/vi/b-RAZ5LvEhU/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AG2CIACgA-KAgwIABABGGUgVChUMA8=&rs=AOn4CLD0J8eh7bwjXrkn90F8NjVDC16LeQ",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/b-RAZ5LvEhU/hqdefault.jpg",
    "summary": "A sailing take on a bar crawl, moving the gathering from boat to boat.",
    "duration": "1:15",
    "topics": [
      "Sailing friends",
      "Island life"
    ]
  },
  {
    "id": "znig5OOFdsI",
    "title": "Up the mast alone at sea! Day 2 of crossing the Pacific Ocean alone",
    "kind": "short",
    "url": "https://www.youtube.com/shorts/znig5OOFdsI",
    "thumbnailUrl": "https://i.ytimg.com/vi/znig5OOFdsI/maxresdefault.jpg?sqp=-oaymwEmCIAKENAF8quKqQMa8AEB-AHOBYACgAqKAgwIABABGHIgTyg-MA8=&rs=AOn4CLBkDrQM4khzqZJQOrzU8H_Wft2P9A",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/znig5OOFdsI/hqdefault.jpg",
    "summary": "A solo mast climb at sea on the second day of a Pacific crossing.",
    "duration": "1:19",
    "topics": [
      "Solo sailing",
      "Boat life"
    ]
  },
  {
    "id": "Z-apwbbvy4Y",
    "title": "BOAT CAT swimming at the beach!! #sailboat",
    "kind": "short",
    "url": "https://www.youtube.com/shorts/Z-apwbbvy4Y",
    "thumbnailUrl": "https://i.ytimg.com/vi/Z-apwbbvy4Y/maxresdefault.jpg?sqp=-oaymwEoCIAKENAF8quKqQMcGADwAQH4Ac4FgAKACooCDAgAEAEYNSBTKH8wDw==&rs=AOn4CLAOsEs6gh6PxGmvE5NVoLb9tg2KIw",
    "thumbnailFallbackUrl": "https://i.ytimg.com/vi/Z-apwbbvy4Y/hqdefault.jpg",
    "summary": "Lauren’s boat cat goes for a swim at the beach.",
    "duration": "0:39",
    "topics": [
      "Mako",
      "Island life"
    ]
  }
].map(item => Object.freeze({ ...item, topics: Object.freeze(item.topics) })));
  const mediaById = new Map(catalog.map(item => [item.id, item]));
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  const defaultTitle = 'Lauren Landers Sailing';
  const defaultIntro = 'The stories between the videos. A closer circle around life aboard Soul de La Mar.';
  const defaults = () => ({ title: defaultTitle, intro: defaultIntro, theme: 'ocean', layout: 'grid', filter: 'all', featured: 'gsVVXtGATMc' });
  let state = defaults();
  let supportChoice = 'one-time';
  let currentMediaId = null;
  let lastSectionHash = window.location.hash;
  let toastTimer;
  const returnFocus = new WeakMap();
  const $ = id => document.getElementById(id);
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const getMedia = id => typeof id === 'string' && idPattern.test(id) ? mediaById.get(id) : undefined;
  const typeLabel = media => media.kind === 'short' ? 'Public Short' : 'Public video';

  function announce(message) {
    clearTimeout(toastTimer);
    $('preview-status').textContent = message;
    toastTimer = setTimeout(() => { $('preview-status').textContent = ''; }, 5000);
  }

  function approvedThumbnail(url, id) {
    if (!getMedia(id)) return false;
    try {
      const parsed = new URL(url);
      return parsed.origin === 'https://i.ytimg.com'
        && (parsed.pathname === `/vi/${id}/maxresdefault.jpg` || parsed.pathname === `/vi/${id}/hqdefault.jpg`);
    } catch { return false; }
  }

  function setThumbnail(image, media, container, eager = false) {
    // Give each selection its own image: queued events from an older poster
    // must never reach the handlers or failure state of the current selection.
    const previous = image;
    image = create('img');
    if (previous.id) image.id = previous.id;
    previous.onload = null;
    previous.onerror = null;
    previous.replaceWith(image);
    container.classList.remove('image-unavailable');
    container.querySelector('.thumbnail-fallback')?.remove();
    image.alt = media.title;
    image.width = 480;
    image.height = 360;
    image.loading = eager ? 'eager' : 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.setAttribute('referrerpolicy', 'no-referrer');
    image.setAttribute('fetchpriority', eager ? 'high' : 'auto');
    const fallback = media.thumbnailFallbackUrl;
    const preferred = approvedThumbnail(media.thumbnailUrl, media.id) ? media.thumbnailUrl : fallback;
    let triedFallback = preferred === fallback;
    let requestedUrl = preferred;
    let loaded = false;
    let failed = false;
    const isCurrent = () => image.parentElement === container && image.src === requestedUrl;
    image.onload = () => {
      if (!isCurrent() || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0
        || image.currentSrc !== requestedUrl || !approvedThumbnail(image.currentSrc, media.id)) return;
      loaded = true;
      image.onerror = null;
      container.classList.remove('image-unavailable');
      container.querySelector('.thumbnail-fallback')?.remove();
    };
    image.onerror = () => {
      if (!isCurrent() || loaded || failed) return;
      if (!triedFallback && approvedThumbnail(fallback, media.id)) {
        triedFallback = true;
        requestedUrl = fallback;
        image.src = requestedUrl;
        return;
      }
      failed = true;
      image.onerror = null;
      container.classList.add('image-unavailable');
      const note = create('span', 'thumbnail-fallback');
      note.append(create('span', '', 'Thumbnail unavailable'), create('span', '', 'The video is still available to explore'));
      note.setAttribute('aria-hidden', 'true');
      container.append(note);
    };
    image.src = preferred;
  }

  function mediaButton(media, className, label) {
    const button = create('button', className, label);
    button.type = 'button';
    button.dataset.openMedia = media.id;
    button.setAttribute('aria-label', `Open ${media.kind === 'short' ? 'Short' : 'video'} details: ${media.title}`);
    return button;
  }

  function renderShort(media) {
    const article = create('article', 'short-card');
    article.dataset.mediaId = media.id;
    article.dataset.mediaKind = media.kind;
    article.setAttribute('aria-labelledby', `title-${media.id}`);
    const poster = mediaButton(media, 'short-poster');
    const image = create('img');
    poster.append(image);
    setThumbnail(image, media, poster);
    const open = create('span', 'short-open');
    open.setAttribute('aria-hidden', 'true');
    open.append(create('span', '', '▶'), create('span', '', `${media.duration} · Explore`));
    poster.append(create('span', 'short-kind', 'YouTube Short'), open);
    const title = create('h4');
    title.id = `title-${media.id}`;
    title.append(mediaButton(media, 'short-title', media.title));
    article.append(poster, title, create('p', 'short-attribution', 'Lauren Landers Sailing · YouTube'));
    return article;
  }

  function renderVideo(media) {
    const article = create('article', 'video-card');
    article.dataset.mediaId = media.id;
    article.dataset.mediaKind = media.kind;
    article.setAttribute('aria-labelledby', `title-${media.id}`);
    const poster = mediaButton(media, 'video-poster');
    const image = create('img');
    poster.append(image);
    setThumbnail(image, media, poster);
    const play = create('span', 'poster-play');
    play.setAttribute('aria-hidden', 'true');
    play.append(create('span', '', '▶'));
    poster.append(play, create('span', 'video-duration', media.duration));
    const body = create('div', 'video-body');
    const meta = create('p', 'video-meta');
    meta.append(create('span', '', 'Public video'), create('span', '', media.topics[0]));
    const title = create('h4', 'video-title');
    title.id = `title-${media.id}`;
    title.append(mediaButton(media, '', media.title));
    const bottom = create('div', 'video-bottom');
    const open = mediaButton(media, 'video-open');
    const arrow = create('span', '', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    open.append(create('span', '', 'View video'), arrow);
    bottom.append(create('span', 'video-attribution', 'Lauren Landers Sailing · YouTube'), open);
    body.append(meta, title, create('p', 'video-summary', media.summary), bottom);
    article.append(poster, body);
    return article;
  }

  function renderLibrary() {
    const videos = catalog.filter(media => media.kind === 'video');
    const shorts = catalog.filter(media => media.kind === 'short');
    $('video-grid').replaceChildren(...videos.map(renderVideo));
    $('shorts-rail').replaceChildren(...shorts.map(renderShort));
    $('catalog-total').textContent = String(catalog.length);
    $('count-all').textContent = String(catalog.length);
    $('count-video').textContent = String(videos.length);
    $('count-short').textContent = String(shorts.length);
    renderFilter();
  }

  function renderFilter() {
    $('shorts-section').hidden = state.filter === 'video';
    $('videos-section').hidden = state.filter === 'short';
    const count = catalog.filter(media => state.filter === 'all' || media.kind === state.filter).length;
    $('result-count').textContent = state.filter === 'all' ? `${count} public videos & Shorts` : `${count} public ${state.filter === 'short' ? 'Shorts' : 'videos'}`;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter)));
  }

  function syncSectionNavigation(closeOnNavigation = false) {
    const hash = window.location.hash;
    const isSection = ['', '#watch', '#crew', '#about'].includes(hash);
    const activeHash = isSection && hash ? hash : '#watch';
    document.querySelectorAll('.section-nav a').forEach(link => {
      if (link.getAttribute('href') === activeHash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (closeOnNavigation && isSection && hash !== lastSectionHash) {
      // Section navigation cancels any open preview dialog and ends player audio.
      // Unsaved editor fields never enter state, so closing preserves cancellation.
      document.querySelectorAll('dialog[open]').forEach(dialog => closeDialog(dialog));
    }
    lastSectionHash = hash;
  }

  function renderAppearance() {
    document.body.classList.remove('theme-ocean', 'theme-sand', 'theme-dusk', 'layout-grid', 'layout-feed');
    document.body.classList.add(`theme-${state.theme}`, `layout-${state.layout}`);
    if (state.title === defaultTitle) {
      $('hub-title').replaceChildren(document.createTextNode('Lauren Landers'), create('br'), create('em', '', 'Sailing'));
    } else {
      $('hub-title').textContent = state.title;
    }
    $('hub-intro').textContent = state.intro;
    const featured = getMedia(state.featured);
    setThumbnail($('hero-image'), featured, document.querySelector('.hero-media'), true);
    $('hero-video-title').textContent = featured.title;
    $('hero-source').href = featured.url;
    $('hero-play').setAttribute('aria-label', `Play featured video: ${featured.title}`);
    $('hero-image-play').setAttribute('aria-label', `Play featured video: ${featured.title}`);
    document.querySelectorAll('[data-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === state.layout)));
  }

  function stopPlayback() {
    // Removing the frame also ends audio, including after external dialog.close().
    $('player-mount').replaceChildren();
    $('player-poster').hidden = false;
  }

  function finishClosing(dialog) {
    if (dialog.id === 'media-dialog') stopPlayback();
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
    const previous = returnFocus.get(dialog);
    returnFocus.delete(dialog);
    if (!document.querySelector('dialog[open]')) {
      if (previous?.isConnected && !previous.closest('[hidden]')) previous.focus();
      else if (previous) document.querySelector('[data-filter][aria-pressed="true"]')?.focus();
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.id === 'media-dialog') stopPlayback();
    if (dialog.id === 'editor-dialog') $('editor-form').querySelectorAll('input, textarea').forEach(field => field.setCustomValidity(''));
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    finishClosing(dialog);
  }

  function openDialog(dialog) {
    if (dialog.open) return;
    const active = document.activeElement;
    const activeDialog = active?.closest('dialog[open]');
    const opener = activeDialog ? returnFocus.get(activeDialog) : active;
    document.querySelectorAll('dialog[open]').forEach(open => closeDialog(open));
    returnFocus.set(dialog, opener);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
    dialog.querySelector('button, a[href], input, textarea, select')?.focus();
  }

  function selectSupport(choice) {
    if (!['one-time', 'monthly'].includes(choice)) return false;
    supportChoice = choice;
    document.querySelectorAll('[data-support-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.supportChoice === choice));
    });
    $('support-selection-title').textContent = choice === 'monthly' ? 'Support me monthly' : 'Send a little support';
    $('support-selection-detail').textContent = choice === 'monthly' ? 'Monthly support' : 'A one-time contribution';
    return true;
  }

  function openSupport(choice = supportChoice) {
    if (!selectSupport(choice)) return;
    openDialog($('support-dialog'));
  }

  function openMedia(id, playRequested = false) {
    const media = getMedia(id);
    if (!media) return;
    stopPlayback();
    currentMediaId = media.id;
    $('media-dialog-title').textContent = media.title;
    $('media-dialog-kind').textContent = `${typeLabel(media)} · ${media.duration}`;
    $('media-dialog-source').href = media.url;
    $('player-stage').classList.toggle('is-short', media.kind === 'short');
    setThumbnail($('player-image'), media, $('player-poster'));
    $('player-play').setAttribute('aria-label', `Play ${media.kind === 'short' ? 'Short' : 'video'}: ${media.title}`);
    $('player-help').textContent = 'Press Play to load YouTube’s player. If playback is unavailable here, use Watch on YouTube.';
    openDialog($('media-dialog'));
    if (playRequested) startPlayback();
  }

  function startPlayback() {
    const media = getMedia(currentMediaId);
    if (!media || !$('media-dialog').open || $('player-mount').childElementCount) return;
    const frame = create('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${media.id}?autoplay=1&rel=0`;
    frame.title = media.title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.setAttribute('allowfullscreen', '');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.addEventListener('error', () => {
      if (frame.isConnected) $('player-help').textContent = 'The player could not be reached. You can still watch this video on YouTube.';
    });
    $('player-poster').hidden = true;
    $('player-mount').replaceChildren(frame);
    $('player-help').textContent = 'Playback requested. If YouTube cannot play this video here, use Watch on YouTube.';
    // No iframe load event is treated as proof that playback succeeded.
  }

  function openEditor() {
    $('editor-form').querySelectorAll('input, textarea').forEach(field => field.setCustomValidity(''));
    $('edit-title').value = state.title;
    $('edit-intro').value = state.intro;
    $('edit-layout').value = state.layout;
    $('edit-featured').replaceChildren(...catalog.filter(media => media.kind === 'video').map(media => {
      const option = create('option', '', media.title);
      option.value = media.id;
      return option;
    }));
    $('edit-featured').value = state.featured;
    document.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === state.theme; });
    $('reset-confirm').hidden = true;
    openDialog($('editor-dialog'));
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button, a');
    if (!button) return;
    if (button.dataset.openMedia) openMedia(button.dataset.openMedia);
    if (['all', 'video', 'short'].includes(button.dataset.filter)) {
      state.filter = button.dataset.filter;
      renderFilter();
    }
    if (['grid', 'feed'].includes(button.dataset.layout)) {
      state.layout = button.dataset.layout;
      renderAppearance();
    }
    if (button.hasAttribute('data-close-dialog')) closeDialog(button.closest('dialog'));
    if (button.hasAttribute('data-open-join')) openDialog($('join-dialog'));
    if (button.hasAttribute('data-open-support')) openSupport(button.dataset.openSupport || supportChoice);
    if (button.hasAttribute('data-support-choice') && $('support-dialog').open) selectSupport(button.dataset.supportChoice);
  });

  window.addEventListener('hashchange', () => syncSectionNavigation(true));

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => { if (!dialog.open) finishClosing(dialog); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(dialog); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, a[href], input, textarea, select, iframe, [tabindex="0"]')].filter(element => !element.disabled && !element.closest('[hidden]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  });

  $('hero-play').addEventListener('click', () => openMedia(state.featured, true));
  $('hero-image-play').addEventListener('click', () => openMedia(state.featured, true));
  $('player-play').addEventListener('click', startPlayback);
  $('next-video').addEventListener('click', () => {
    const nextIndex = (catalog.findIndex(media => media.id === currentMediaId) + 1) % catalog.length;
    openMedia(catalog[nextIndex].id);
    $('player-play').focus();
  });
  $('edit-preview').addEventListener('click', openEditor);
  $('membership-info').addEventListener('click', () => openDialog($('membership-dialog')));
  $('editor-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('editor-form').reportValidity()) return;
    for (const id of ['edit-title', 'edit-intro']) {
      const field = $(id);
      if (!field.value.trim()) {
        field.setCustomValidity('Please add text for the introduction.');
        field.reportValidity();
        field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
        return;
      }
    }
    const theme = document.querySelector('input[name="theme"]:checked')?.value;
    const layout = $('edit-layout').value;
    const featured = getMedia($('edit-featured').value);
    if (!['ocean', 'sand', 'dusk'].includes(theme) || !['grid', 'feed'].includes(layout) || featured?.kind !== 'video') return;
    state = { ...state, title: $('edit-title').value.trim(), intro: $('edit-intro').value.trim(), theme, layout, featured: featured.id };
    renderAppearance();
    closeDialog($('editor-dialog'));
    announce('Preview updated. Edits reset on refresh.');
  });
  $('reset-preview').addEventListener('click', () => { $('reset-confirm').hidden = false; $('confirm-reset').focus(); });
  $('cancel-reset').addEventListener('click', () => { $('reset-confirm').hidden = true; $('reset-preview').focus(); });
  $('confirm-reset').addEventListener('click', () => {
    state = defaults();
    renderAppearance();
    renderFilter();
    closeDialog($('editor-dialog'));
    announce('Original preview restored.');
  });

  renderLibrary();
  renderAppearance();
  syncSectionNavigation();
})();
