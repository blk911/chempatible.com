(() => {
  'use strict';

  const seeds = [
    { id: 'two-days-under-sail', title: 'Two days under sail', caption: 'A two-day, single-handed passage, an autopilot challenge, and dolphins along the way. From Lauren Landers Sailing’s public episode 15.', category: 'at-sea', source: 'https://www.youtube.com/watch?v=gsVVXtGATMc', index: 1 },
    { id: 'remote-marina', title: 'A marina in the middle of nowhere', caption: 'Explore Lauren’s public episode 210, featuring a remote marina project.', category: 'boat-life', source: 'https://www.youtube.com/watch?v=89Oi_lb0_qg', index: 2 },
    { id: 'departure-day', title: 'Before the lines come off', caption: 'An idea for a departure-day journal: the preparation, small rituals, and anticipation before a passage.', category: 'at-sea', index: 3 },
    { id: 'boat-job-notebook', title: 'The boat-job notebook', caption: 'A place for the fixes, experiments, and little improvements that keep life afloat moving.', category: 'boat-life', index: 4 },
    { id: 'mako-off-watch', title: 'Mako, off watch', caption: 'A proposed corner for the quieter moments with the boat’s feline companion.', category: 'boat-life', index: 5 },
    { id: 'below-the-blue', title: 'Below the blue', caption: 'An idea for ocean observations: reef details, marine life, and things worth looking at more closely.', category: 'at-sea', index: 6 },
    { id: 'between-passages', title: 'The days between passages', caption: 'A proposed journal of ordinary boat life: making a meal, organizing a small space, and watching the weather.', category: 'boat-life', index: 7 },
    { id: 'ask-life-afloat', title: 'Ask about life afloat', caption: 'A sample community prompt: what would you most like to understand about living aboard?', category: 'community', index: 8 },
    { id: 'chart-table', title: 'From the chart table', caption: 'A concept for reflecting on past journeys, with maps and notes added only when the creator chooses to share them.', category: 'at-sea', index: 9 },
    { id: 'small-wins', title: 'Small wins, open water', caption: 'A proposed series about learning by doing, celebrating progress, and making room for the next adventure.', category: 'community', index: 10 }
  ];
  const categoryNames = { 'at-sea': 'At sea', 'boat-life': 'Boat life', community: 'Community' };
  const defaultTitle = 'Life afloat, a little closer.';
  const defaultIntro = 'An idea for a smaller circle around the big blue. Stories from the water, the everyday in between, and room to connect.';
  const defaults = () => ({ title: defaultTitle, intro: defaultIntro, theme: 'ocean', layout: 'grid', view: 'visitor', filter: 'all', posts: seeds.map(post => ({ ...post })) });
  let state = defaults();
  let editorDraft = null;
  let selectedPostId = seeds[0].id;
  let returnFocus = null;
  let toastTimer;
  const $ = id => document.getElementById(id);
  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function announce(message) {
    clearTimeout(toastTimer);
    $('preview-status').textContent = message;
    toastTimer = setTimeout(() => { $('preview-status').textContent = ''; }, 5200);
  }

  function renderPosts() {
    const posts = state.posts.filter(post => state.filter === 'all' || post.category === state.filter);
    const fragment = document.createDocumentFragment();
    posts.forEach(post => {
      const article = create('article', 'post-card');
      article.dataset.postId = post.id;
      article.setAttribute('aria-labelledby', `title-${post.id}`);
      const art = create('div', `post-art crop-${post.index}`);
      const img = create('img');
      img.src = './assets/sailing-hero.webp';
      img.alt = 'Illustrative sailing artwork; not Lauren’s footage';
      img.width = 1536;
      img.height = 1024;
      img.loading = 'lazy';
      if (post.category === 'community') {
        art.classList.add('editorial-art', post.index === 8 ? 'art-question' : 'art-progress');
        const lettering = create('div', 'editorial-lettering');
        lettering.setAttribute('aria-hidden', 'true');
        lettering.append(
          create('span', 'graphic-kicker', post.index === 8 ? 'A shared curiosity' : 'Learning as you go'),
          create('span', 'graphic-title', post.index === 8 ? 'Good questions.\nBetter company.' : 'Small steps.\nOpen horizons.')
        );
        art.append(lettering, create('span', 'post-index', String(post.index).padStart(2, '0')), create('span', 'art-mark', 'Editorial concept'));
      } else {
        art.append(img, create('span', 'post-index', String(post.index).padStart(2, '0')), create('span', 'art-mark', 'Illustrative artwork'));
      }
      if (post.source) {
        const play = create('span', 'video-play');
        play.setAttribute('aria-hidden', 'true');
        play.append(create('span', '', '▶'));
        art.append(play);
      }
      const body = create('div', 'post-body');
      const label = create('p', 'sample-ribbon');
      label.append(create('span', '', 'Editorial sample'));
      if (post.source) {
        const dot = create('span', 'ribbon-dot');
        dot.setAttribute('aria-hidden', 'true');
        label.append(dot, create('span', '', 'Public video'));
      }
      const title = create('h3', '', post.title);
      title.id = `title-${post.id}`;
      body.append(label, title, create('p', 'post-caption', post.caption));
      if (post.source) body.append(create('p', 'post-attribution', 'Lauren Landers Sailing · YouTube'));
      const bottom = create('div', 'post-bottom');
      const open = create('button', 'post-open');
      open.type = 'button';
      open.dataset.openPost = post.id;
      open.setAttribute('aria-label', `Read sample: ${post.title}`);
      open.append(create('span', '', post.source ? 'View story' : 'Read'));
      const arrow = create('span', '', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      open.append(arrow);
      bottom.append(create('span', 'post-category', categoryNames[post.category]), open);
      body.append(bottom);
      article.append(art, body);
      fragment.append(article);
    });
    $('post-grid').replaceChildren(fragment);
    $('result-count').textContent = `${posts.length} editorial ${posts.length === 1 ? 'sample' : 'samples'}`;
    document.querySelectorAll('[data-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
    });
  }

  function renderTitle() {
    const title = $('hub-title');
    if (state.title === defaultTitle) {
      title.replaceChildren(document.createTextNode('Life afloat,'), document.createElement('br'), create('em', '', 'a little closer.'));
    } else {
      title.textContent = state.title;
    }
    $('hub-intro').textContent = state.intro;
  }

  function renderView() {
    document.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
    });
    const isMember = state.view === 'member';
    $('member-sample').hidden = !isMember;
    $('view-notice').textContent = isMember
      ? 'Member sample · This display does not check sign-in or change membership or access.'
      : 'Visitor sample · All ten editorial examples are available to explore.';
  }

  function render() {
    document.body.classList.remove('theme-ocean', 'theme-sand', 'theme-dusk', 'layout-grid', 'layout-feed');
    document.body.classList.add(`theme-${state.theme}`, `layout-${state.layout}`);
    renderTitle();
    renderPosts();
    renderView();
  }

  function openDialog(dialog) {
    returnFocus = document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
    const first = dialog.querySelector('button, a[href], input, textarea, select, [tabindex="0"]');
    if (first) first.focus();
  }

  function closeDialog(dialog) {
    if (dialog.id === 'editor-dialog') {
      $('editor-form').querySelectorAll('input, textarea').forEach(field => field.setCustomValidity(''));
    }
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    document.body.classList.remove('dialog-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function openPost(id) {
    const post = state.posts.find(item => item.id === id);
    if (!post) return;
    $('post-dialog-title').textContent = post.title;
    $('post-dialog-caption').textContent = post.caption;
    $('post-dialog-meta').textContent = `Editorial sample / ${categoryNames[post.category]}`;
    $('detail-art').className = `detail-art crop-${post.index}`;
    const attribution = $('post-dialog-attribution');
    attribution.textContent = post.source ? 'Public video by Lauren Landers Sailing · YouTube' : 'An editorial idea by Wild Hub';
    const link = $('post-dialog-source');
    link.hidden = !post.source;
    if (post.source) link.href = post.source;
    else link.removeAttribute('href');
    openDialog($('post-dialog'));
  }

  function capturePostDraft() {
    if (!editorDraft) return;
    const post = editorDraft.posts.find(item => item.id === selectedPostId);
    post.title = $('edit-post-title').value;
    post.caption = $('edit-post-caption').value;
  }

  function loadPostDraft(id) {
    selectedPostId = id;
    const post = editorDraft.posts.find(item => item.id === id);
    $('edit-post-title').setCustomValidity('');
    $('edit-post-caption').setCustomValidity('');
    $('edit-post-title').value = post.title;
    $('edit-post-caption').value = post.caption;
  }

  function openEditor() {
    $('editor-form').querySelectorAll('input, textarea').forEach(field => field.setCustomValidity(''));
    editorDraft = { ...state, posts: state.posts.map(post => ({ ...post })) };
    $('edit-title').value = state.title;
    $('edit-intro').value = state.intro;
    $('edit-layout').value = state.layout;
    document.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === state.theme; });
    const select = $('edit-post-select');
    select.replaceChildren(...editorDraft.posts.map(post => {
      const option = create('option', '', `${String(post.index).padStart(2, '0')} · ${post.title}`);
      option.value = post.id;
      return option;
    }));
    if (!editorDraft.posts.some(post => post.id === selectedPostId)) selectedPostId = seeds[0].id;
    select.value = selectedPostId;
    loadPostDraft(selectedPostId);
    $('reset-confirm').hidden = true;
    openDialog($('editor-dialog'));
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.hasAttribute('data-open-post')) openPost(target.dataset.openPost);
    if (target.hasAttribute('data-filter')) {
      state.filter = target.dataset.filter;
      renderPosts();
    }
    if (target.hasAttribute('data-view')) {
      state.view = target.dataset.view;
      renderView();
    }
    if (target.hasAttribute('data-open-join')) openDialog($('join-dialog'));
    if (target.hasAttribute('data-close-dialog')) closeDialog(target.closest('dialog'));
    if (target.closest('.section-nav')) {
      document.querySelectorAll('.section-nav a').forEach(link => { link.removeAttribute('aria-current'); });
      target.setAttribute('aria-current', 'location');
    }
  });

  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(dialog);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, a[href], input, textarea, select, [tabindex="0"]')].filter(element => !element.disabled && !element.closest('[hidden]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  });

  $('edit-preview').addEventListener('click', openEditor);
  $('membership-info').addEventListener('click', () => openDialog($('membership-dialog')));
  $('edit-post-select').addEventListener('change', event => {
    capturePostDraft();
    loadPostDraft(event.target.value);
  });
  $('editor-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('editor-form').reportValidity()) return;
    capturePostDraft();
    const invalid = editorDraft.posts.find(post => !post.title.trim() || !post.caption.trim());
    if (invalid) {
      $('edit-post-select').value = invalid.id;
      loadPostDraft(invalid.id);
      const field = !invalid.title.trim() ? $('edit-post-title') : $('edit-post-caption');
      field.setCustomValidity('Please add text for this editorial sample.');
      field.reportValidity();
      field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
      return;
    }
    if (!$('edit-title').value.trim() || !$('edit-intro').value.trim()) {
      const field = !$('edit-title').value.trim() ? $('edit-title') : $('edit-intro');
      field.setCustomValidity('Please add text for this introduction.');
      field.reportValidity();
      field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
      return;
    }
    state = {
      ...editorDraft,
      title: $('edit-title').value.trim(),
      intro: $('edit-intro').value.trim(),
      theme: document.querySelector('input[name="theme"]:checked').value,
      layout: $('edit-layout').value,
      posts: editorDraft.posts.map(post => ({ ...post, title: post.title.trim(), caption: post.caption.trim() }))
    };
    render();
    closeDialog($('editor-dialog'));
    announce('Preview updated on this page');
  });
  $('reset-preview').addEventListener('click', () => {
    $('reset-confirm').hidden = false;
    $('confirm-reset').focus();
  });
  $('cancel-reset').addEventListener('click', () => {
    $('reset-confirm').hidden = true;
    $('reset-preview').focus();
  });
  $('confirm-reset').addEventListener('click', () => {
    state = defaults();
    editorDraft = null;
    selectedPostId = seeds[0].id;
    $('founder-welcome').checked = false;
    $('welcome-status').hidden = true;
    render();
    closeDialog($('editor-dialog'));
    announce('Original preview restored on this page');
  });
  $('founder-welcome').addEventListener('change', event => {
    $('welcome-status').hidden = !event.target.checked;
  });

  render();
})();
