let allMedia = {};
let currentFilter = 'all';
let selectedTags = new Set();
let firebaseDB = null;
let externalTagCatalog = [];
let currentVideo = null;
let visibleItems = [];
let currentIndex = -1;
let renderedItemCount = 0;
let gallerySections = new Map();
let visibleGroupCounts = new Map();
let galleryLoadObserver = null;

const FILTER_STORAGE_KEY = 'nak2GalleryFilters';
const TRANSITION_MS = 220;
const INITIAL_RENDER_COUNT = 60;
const RENDER_BATCH_SIZE = 50;
const MIN_GALLERY_FILL_VH = 1.6;
let isAnimatingModal = false;

let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let isDraggingModal = false;
let swipeLocked = null;

const SWIPE_THRESHOLD_PX = 70;
const SWIPE_THRESHOLD_RATIO = 0.18;
const SWIPE_VERTICAL_LOCK = 24;

function normalizeTag(value) {
  return String(value || '').trim().replace(/^#/, '').replace(/[\s.#$\/\[\]]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map(normalizeTag).filter(Boolean))].sort();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function loadFilterState() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
    if (['all', 'image', 'video'].includes(saved.mediaType)) currentFilter = saved.mediaType;
    selectedTags = new Set(normalizeTags(saved.tags || []).slice(0, 1));
  } catch {
    currentFilter = 'all';
    selectedTags = new Set();
  }
}

function saveFilterState() {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
    mediaType: currentFilter,
    tags: [...selectedTags]
  }));
}

async function loadTagsData() {
  firebaseDB = window.getFirebaseDatabase?.() || null;

  if (firebaseDB) {
    try {
      const [mediaTagsSnapshot, catalogSnapshot] = await Promise.all([
        firebaseDB.ref('mediaTags').once('value'),
        firebaseDB.ref('tagCatalog').once('value')
      ]);
      return {
        mediaTags: mediaTagsSnapshot.val() || {},
        tagCatalog: Object.keys(catalogSnapshot.val() || {})
      };
    } catch (err) {
      console.warn('Firebase tags unavailable, using tags.json fallback', err);
    }
  }

  try {
    const response = await fetch('tags.json?t=' + Date.now());
    if (!response.ok) return { mediaTags: {}, tagCatalog: [] };
    return { mediaTags: await response.json(), tagCatalog: [] };
  } catch {
    return { mediaTags: {}, tagCatalog: [] };
  }
}

async function loadData() {
  try {
    loadFilterState();

    const [mediaRes, tagsPayload] = await Promise.all([
      fetch('index.json?t=' + Date.now()),
      loadTagsData()
    ]);

    allMedia = await mediaRes.json();
    const tagsData = tagsPayload.mediaTags || {};
    externalTagCatalog = normalizeTags(tagsPayload.tagCatalog || []);

    Object.keys(allMedia).forEach(id => {
      allMedia[id].tags = normalizeTags(tagsData[id] || []);
    });

    console.log(`✅ Loaded ${Object.keys(allMedia).length} media items`);
    setupFilterButtons();
    updateFilterButtons();
    renderTagCloud();
    renderGroupedGallery(Object.values(allMedia));
    setupModalNavigation();
  } catch (err) {
    console.error('Failed to load data', err);
  }
}

function setupFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
}

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('bg-zinc-800', 'text-zinc-300');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('bg-zinc-800', 'text-zinc-300');
    }
  });
}

function setFilter(filter) {
  currentFilter = filter;
  saveFilterState();
  updateFilterButtons();

  renderGroupedGallery(Object.values(allMedia));
}

function getDateKey(item) {
  return new Date(item.dateTaken).toISOString().split('T')[0];
}

function getDisplayDate(dateKey) {
  return new Date(dateKey).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function renderGroupedGallery(items) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  disconnectGalleryObserver();
  gallerySections = new Map();
  visibleGroupCounts = new Map();
  renderedItemCount = 0;

  let filteredItems = items;
  if (currentFilter === 'image') filteredItems = items.filter(item => item.type === 'image');
  else if (currentFilter === 'video') filteredItems = items.filter(item => item.type === 'video');

  if (selectedTags.size) {
    filteredItems = filteredItems.filter(item => {
      const itemTags = new Set(item.tags || []);
      return itemTags.has([...selectedTags][0]);
    });
  }

  filteredItems.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));

  visibleItems = filteredItems;
  currentIndex = -1;
  visibleItems.forEach(item => {
    const dateKey = getDateKey(item);
    visibleGroupCounts.set(dateKey, (visibleGroupCounts.get(dateKey) || 0) + 1);
  });

  if (!filteredItems.length) {
    gallery.innerHTML = `
      <div class="text-center py-16 text-zinc-500">
        <p class="text-lg text-zinc-300">No media matches the current filters.</p>
        <button id="emptyClearFilters" class="mt-4 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Clear filters</button>
      </div>
    `;
    document.getElementById('emptyClearFilters')?.addEventListener('click', clearGalleryFilters);
    return;
  }

  renderNextGalleryBatch({ targetCount: INITIAL_RENDER_COUNT, fillViewport: true });
  setupGalleryObserver();
  return;
  /*

      <span class="chevron text-4xl text-zinc-400 transition-transform duration-300">›</span>
    `;
    header.addEventListener('click', () => toggleGroup(header));

    const contentDiv = document.createElement('div');
    contentDiv.className = 'group-content grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-5';

    groupEntries.forEach(({ item, index }) => {
      const div = document.createElement('div');
      div.className = 'media-item cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 transition-all duration-300 aspect-square relative';

      if (item.type === 'video') {
        const thumbSrc = item.thumbUrl || 'https://via.placeholder.com/640x360/374151/9CA3AF?text=Video';

        div.innerHTML = `
          <img src="${thumbSrc}" 
               loading="lazy" 
               class="w-full h-full object-cover" 
               alt="Video"
               onerror="this.src='https://via.placeholder.com/640x360/374151/9CA3AF?text=Video'; this.onerror=null;">
          <div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor"/>
              <polygon points="10,9 10,15 15,12" fill="currentColor"/>
            </svg>
          </div>`;
      } else {
        div.innerHTML = `
          <img src="${item.thumbUrl}" 
               loading="lazy" 
               class="w-full h-full object-cover" 
               alt="${item.caption || ''}">
          <div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>`;
      }

      div.addEventListener('click', () => showModalByIndex(index));
      contentDiv.appendChild(div);
    });

    section.appendChild(header);
    section.appendChild(contentDiv);
    gallery.appendChild(section);

    contentDiv.style.display = 'grid';
    header.querySelector('.chevron').style.transform = 'rotate(90deg)';
  });
  */
}

function disconnectGalleryObserver() {
  if (!galleryLoadObserver) return;
  galleryLoadObserver.disconnect();
  galleryLoadObserver = null;
}

function setupGalleryObserver() {
  if (!('IntersectionObserver' in window)) return;

  const sentinel = document.getElementById('galleryLoadSentinel');
  if (!sentinel) return;

  galleryLoadObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      renderNextGalleryBatch();
    }
  }, { rootMargin: '900px 0px' });

  galleryLoadObserver.observe(sentinel);
}

function ensureGallerySentinel() {
  const gallery = document.getElementById('gallery');
  let sentinel = document.getElementById('galleryLoadSentinel');

  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'galleryLoadSentinel';
    sentinel.className = 'h-8';
  }

  gallery.appendChild(sentinel);
}

function renderNextGalleryBatch(options = {}) {
  const gallery = document.getElementById('gallery');
  if (!gallery || renderedItemCount >= visibleItems.length) {
    disconnectGalleryObserver();
    document.getElementById('galleryLoadSentinel')?.remove();
    return;
  }

  let targetCount = Math.min(
    visibleItems.length,
    Math.max(options.targetCount || renderedItemCount + RENDER_BATCH_SIZE, renderedItemCount + 1)
  );

  appendGalleryItems(targetCount);

  if (options.fillViewport) {
    const minHeight = window.innerHeight * MIN_GALLERY_FILL_VH;
    let safety = 0;

    while (renderedItemCount < visibleItems.length && gallery.scrollHeight < minHeight && safety < 8) {
      targetCount = Math.min(visibleItems.length, renderedItemCount + RENDER_BATCH_SIZE);
      appendGalleryItems(targetCount);
      safety += 1;
    }
  }

  if (renderedItemCount < visibleItems.length) {
    ensureGallerySentinel();
  } else {
    disconnectGalleryObserver();
    document.getElementById('galleryLoadSentinel')?.remove();
  }
}

function appendGalleryItems(targetCount) {
  const end = Math.min(targetCount, visibleItems.length);
  if (end <= renderedItemCount) return;

  const gallery = document.getElementById('gallery');
  const fragment = document.createDocumentFragment();

  for (let index = renderedItemCount; index < end; index += 1) {
    const item = visibleItems[index];
    const dateKey = getDateKey(item);
    const sectionData = getOrCreateDateSection(dateKey, fragment);

    sectionData.entries.push({ item, index });
    sectionData.content.appendChild(createMediaCard(item, index));
  }

  renderedItemCount = end;
  gallery.appendChild(fragment);
  updateRenderedGroupCounts();
}

function getOrCreateDateSection(dateKey, fragment) {
  if (gallerySections.has(dateKey)) return gallerySections.get(dateKey);

  const section = document.createElement('div');
  section.className = 'mb-12';

  const header = document.createElement('div');
  header.className = 'group-header flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 px-6 py-5 rounded-2xl cursor-pointer transition-all border border-zinc-800';
  header.innerHTML = `
    <div>
      <h2 class="text-2xl font-semibold text-white">${getDisplayDate(dateKey)}</h2>
      <p class="text-zinc-500 text-sm mt-0.5"><span class="group-count">${visibleGroupCounts.get(dateKey) || 0}</span> items</p>
    </div>
    <span class="chevron text-4xl text-zinc-400 transition-transform duration-300">â€º</span>
  `;
  header.querySelector('.chevron').innerHTML = '&rsaquo;';
  header.addEventListener('click', () => toggleGroup(header));

  const content = document.createElement('div');
  content.className = 'group-content grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-5';
  content.style.display = 'grid';
  header.querySelector('.chevron').style.transform = 'rotate(90deg)';

  section.appendChild(header);
  section.appendChild(content);
  fragment.appendChild(section);

  const sectionData = { section, header, content, entries: [] };
  gallerySections.set(dateKey, sectionData);
  return sectionData;
}

function updateRenderedGroupCounts() {
  gallerySections.forEach(({ header, entries }) => {
    const count = header.querySelector('.group-count');
    if (count) count.textContent = String(visibleGroupCounts.get(getDateKey(entries[0].item)) || entries.length);
  });
}

function renderCardTags(item) {
  const tags = normalizeTags(item.tags || []);
  if (!tags.length) return '';

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return `
    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 pt-8 pointer-events-none">
      <div class="flex flex-wrap gap-1.5">
        ${visibleTags.map(tag => `<span class="max-w-full truncate rounded-full bg-black/65 px-2 py-0.5 text-[11px] leading-5 text-zinc-100 backdrop-blur-sm">#${escapeHtml(tag)}</span>`).join('')}
        ${remainingCount > 0 ? `<span class="rounded-full bg-black/65 px-2 py-0.5 text-[11px] leading-5 text-zinc-300 backdrop-blur-sm">+${remainingCount}</span>` : ''}
      </div>
    </div>
  `;
}

function createMediaCard(item, index) {
  const div = document.createElement('div');
  div.className = 'media-item cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 transition-all duration-300 aspect-square relative';
  const tagOverlay = renderCardTags(item);

  if (item.type === 'video') {
    const thumbSrc = item.thumbUrl || 'https://via.placeholder.com/640x360/374151/9CA3AF?text=Video';

    div.innerHTML = `
      <img src="${escapeHtml(thumbSrc)}"
           loading="lazy"
           decoding="async"
           class="w-full h-full object-cover"
           alt="Video"
           onerror="this.src='https://via.placeholder.com/640x360/374151/9CA3AF?text=Video'; this.onerror=null;">
      <div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor"/>
          <polygon points="10,9 10,15 15,12" fill="currentColor"/>
        </svg>
      </div>
      ${tagOverlay}`;
  } else {
    div.innerHTML = `
      <img src="${escapeHtml(item.thumbUrl)}"
           loading="lazy"
           decoding="async"
           class="w-full h-full object-cover"
           alt="${escapeHtml(item.caption || '')}">
      <div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      ${tagOverlay}`;
  }

  div.addEventListener('click', () => showModalByIndex(index));
  return div;
}

function toggleGroup(header) {
  const content = header.nextElementSibling;
  const chevron = header.querySelector('.chevron');

  if (content.style.display === 'none' || content.style.display === '') {
    content.style.display = 'grid';
    chevron.style.transform = 'rotate(90deg)';
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
}

function getModalContentEl() {
  return document.getElementById('modalContent');
}

function getModalMetaEl() {
  return document.getElementById('modalMeta');
}

function setModalVisualOffset(x) {
  const content = getModalContentEl();
  const meta = getModalMetaEl();
  if (!content || !meta) return;

  const width = Math.max(content.clientWidth, 1);
  const progress = Math.min(Math.abs(x) / width, 1);
  const opacity = 1 - progress * 0.35;

  content.style.transform = `translateX(${x}px)`;
  content.style.opacity = String(opacity);
  meta.style.opacity = String(Math.max(0.55, opacity));
}

function setModalTransition(enabled) {
  const content = getModalContentEl();
  const meta = getModalMetaEl();
  if (!content || !meta) return;

  if (enabled) {
    content.style.transition = `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease`;
    meta.style.transition = `opacity ${TRANSITION_MS}ms ease`;
  } else {
    content.style.transition = 'none';
    meta.style.transition = 'none';
  }
}

function resetModalVisualState() {
  const content = getModalContentEl();
  const meta = getModalMetaEl();
  if (!content || !meta) return;

  content.style.transform = 'translateX(0)';
  content.style.opacity = '1';
  meta.style.opacity = '1';
}

function animateSnapBack() {
  if (isAnimatingModal) return;
  isAnimatingModal = true;
  updateModalNavButtons();

  setModalTransition(true);
  resetModalVisualState();

  setTimeout(() => {
    isAnimatingModal = false;
    updateModalNavButtons();
  }, TRANSITION_MS);
}

function animateToIndex(index, direction) {
  const content = getModalContentEl();
  const meta = getModalMetaEl();
  if (!content || !meta || isAnimatingModal) return;

  isAnimatingModal = true;
  updateModalNavButtons();

  const width = Math.max(content.clientWidth, window.innerWidth || 1);
  const exitX = direction === 'left' ? -width : width;
  const enterX = direction === 'left' ? width : -width;

  setModalTransition(true);
  content.style.transform = `translateX(${exitX}px)`;
  content.style.opacity = '0.25';
  meta.style.opacity = '0.35';

  setTimeout(() => {
    currentIndex = index;
    showModal(visibleItems[index]);

    const newContent = getModalContentEl();
    const newMeta = getModalMetaEl();
    if (!newContent || !newMeta) {
      isAnimatingModal = false;
      updateModalNavButtons();
      return;
    }

    newContent.style.transition = 'none';
    newMeta.style.transition = 'none';
    newContent.style.transform = `translateX(${enterX}px)`;
    newContent.style.opacity = '0.25';
    newMeta.style.opacity = '0.35';

    requestAnimationFrame(() => {
      newContent.style.transition = `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease`;
      newMeta.style.transition = `opacity ${TRANSITION_MS}ms ease`;
      newContent.style.transform = 'translateX(0)';
      newContent.style.opacity = '1';
      newMeta.style.opacity = '1';

      setTimeout(() => {
        isAnimatingModal = false;
        updateModalNavButtons();
      }, TRANSITION_MS);
    });
  }, TRANSITION_MS);
}

function showModalByIndex(index, direction = 'none', animate = false) {
  if (index < 0 || index >= visibleItems.length) return;

  if (!animate || currentIndex < 0 || document.getElementById('modal').classList.contains('hidden')) {
    currentIndex = index;
    showModal(visibleItems[index]);
    updateModalNavButtons();
    return;
  }

  if (direction === 'none') {
    currentIndex = index;
    showModal(visibleItems[index]);
    updateModalNavButtons();
    return;
  }

  animateToIndex(index, direction);
}

function showModal(item) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  const meta = document.getElementById('modalMeta');

  if (currentVideo) {
    currentVideo.pause();
    currentVideo.currentTime = 0;
    currentVideo = null;
  }

  let mediaHTML = '';

  if (item.type === 'video') {
    mediaHTML = `
      <div class="flex items-center justify-center w-full h-full p-4 bg-black">
        <video 
          id="modalVideo" 
          src="${item.fullUrl}" 
          controls 
          autoplay 
          playsinline 
          class="max-h-[65vh] max-w-[92vw] rounded-2xl"
          style="width: auto; height: auto;">
        </video>
      </div>`;
  } else {
    mediaHTML = `
      <div class="flex items-center justify-center w-full h-full p-4 bg-black">
        <img 
          id="modalImage" 
          src="${item.fullUrl}" 
          class="max-h-[75vh] max-w-[92vw] object-contain rounded-2xl" 
          alt="${item.caption || ''}">
      </div>`;
  }

  content.innerHTML = mediaHTML;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  let buttonsHTML = '';

  if (isMobile) {
    buttonsHTML = `
      <button onclick="saveToPhotos('${item.fullUrl}', '${item.type}')" 
              class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-8 py-3.5 rounded-2xl font-medium transition-all">
        📸 Save to Photos
      </button>`;
  } else {
    buttonsHTML = `
      <a href="${item.fullUrl}" download 
         class="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 px-8 py-3.5 rounded-2xl font-medium transition-all">
        ⬇️ Download Original ${item.type === 'video' ? 'Video' : 'Photo'}
      </a>`;
  }

  const tagsHTML = (item.tags || []).length
    ? `<div class="mt-4 flex flex-wrap gap-2">${item.tags.map(tag => `<span class="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs">#${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';

  meta.innerHTML = `
    <div class="flex justify-between items-center gap-4">
      <div class="flex items-center gap-3">
        <button id="metaPrevBtn"
                class="text-2xl leading-none text-zinc-400 hover:text-white transition-colors px-2"
                aria-label="Previous date">
          ‹
        </button>
        <p class="text-zinc-400 text-sm">${new Date(item.dateTaken).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}</p>
        <button id="metaNextBtn"
                class="text-2xl leading-none text-zinc-400 hover:text-white transition-colors px-2"
                aria-label="Next date">
          ›
        </button>
      </div>
      <button id="closeBtn" class="text-5xl leading-none text-zinc-400 hover:text-white transition-colors px-4">×</button>
    </div>

    <div class="mt-6">
      ${buttonsHTML}
      ${tagsHTML}
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  resetModalVisualState();

  if (item.type === 'video') {
    currentVideo = document.getElementById('modalVideo');
  }

  document.removeEventListener('keydown', handleModalKey);
  document.addEventListener('keydown', handleModalKey);

  setTimeout(() => {
    const closeBtn = document.getElementById('closeBtn');
    const metaPrevBtn = document.getElementById('metaPrevBtn');
    const metaNextBtn = document.getElementById('metaNextBtn');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (metaPrevBtn) metaPrevBtn.addEventListener('click', showPrevDate);
    if (metaNextBtn) metaNextBtn.addEventListener('click', showNextDate);

    updateModalNavButtons();
  }, 10);
}

function handleModalKey(e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowLeft') showPrevItem();
  if (e.key === 'ArrowRight') showNextItem();
}

function showPrevItem() {
  if (!visibleItems.length || isAnimatingModal) return;
  const prevIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
  showModalByIndex(prevIndex, 'right', true);
}

function showNextItem() {
  if (!visibleItems.length || isAnimatingModal) return;
  const nextIndex = (currentIndex + 1) % visibleItems.length;
  showModalByIndex(nextIndex, 'left', true);
}

function getDateKeyAtIndex(index) {
  if (index < 0 || index >= visibleItems.length) return null;
  return new Date(visibleItems[index].dateTaken).toISOString().split('T')[0];
}

function getDateStartIndices() {
  const starts = [];

  visibleItems.forEach((item, index) => {
    const currentDate = new Date(item.dateTaken).toISOString().split('T')[0];
    const prevDate = index > 0
      ? new Date(visibleItems[index - 1].dateTaken).toISOString().split('T')[0]
      : null;

    if (index === 0 || currentDate !== prevDate) {
      starts.push(index);
    }
  });

  return starts;
}

function showPrevDate() {
  if (!visibleItems.length || currentIndex < 0 || isAnimatingModal) return;

  const dateStarts = getDateStartIndices();
  if (!dateStarts.length) return;

  const currentDate = getDateKeyAtIndex(currentIndex);
  const currentGroupIndex = dateStarts.findIndex(startIndex => getDateKeyAtIndex(startIndex) === currentDate);
  const prevGroupIndex = (currentGroupIndex - 1 + dateStarts.length) % dateStarts.length;

  showModalByIndex(dateStarts[prevGroupIndex], 'right', true);
}

function showNextDate() {
  if (!visibleItems.length || currentIndex < 0 || isAnimatingModal) return;

  const dateStarts = getDateStartIndices();
  if (!dateStarts.length) return;

  const currentDate = getDateKeyAtIndex(currentIndex);
  const currentGroupIndex = dateStarts.findIndex(startIndex => getDateKeyAtIndex(startIndex) === currentDate);
  const nextGroupIndex = (currentGroupIndex + 1) % dateStarts.length;

  showModalByIndex(dateStarts[nextGroupIndex], 'left', true);
}

function updateModalNavButtons() {
  const modalPrev = document.getElementById('modalPrev');
  const modalNext = document.getElementById('modalNext');
  const metaPrevBtn = document.getElementById('metaPrevBtn');
  const metaNextBtn = document.getElementById('metaNextBtn');

  const hasItems = visibleItems.length > 0 && !isAnimatingModal;

  [modalPrev, modalNext, metaPrevBtn, metaNextBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !hasItems;
    btn.style.opacity = hasItems ? '1' : '0.35';
    btn.style.pointerEvents = hasItems ? 'auto' : 'none';
  });
}

function handleTouchStart(e) {
  if (!e.touches || e.touches.length !== 1 || isAnimatingModal) return;

  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchCurrentX = touchStartX;
  isDraggingModal = false;
  swipeLocked = null;
}

function handleTouchMove(e) {
  if (!e.touches || e.touches.length !== 1 || isAnimatingModal) return;

  const x = e.touches[0].clientX;
  const y = e.touches[0].clientY;
  const deltaX = x - touchStartX;
  const deltaY = y - touchStartY;

  if (!swipeLocked) {
    if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
    swipeLocked = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
  }

  if (swipeLocked !== 'horizontal') return;
  if (Math.abs(deltaY) > SWIPE_VERTICAL_LOCK) return;

  touchCurrentX = x;
  isDraggingModal = true;

  setModalTransition(false);
  setModalVisualOffset(deltaX);

  e.preventDefault();
}

function handleTouchEnd() {
  if (isAnimatingModal) return;
  if (!swipeLocked || swipeLocked !== 'horizontal') {
    isDraggingModal = false;
    return;
  }

  const content = getModalContentEl();
  const width = Math.max(content?.clientWidth || 0, window.innerWidth || 1);
  const deltaX = touchCurrentX - touchStartX;
  const threshold = Math.max(SWIPE_THRESHOLD_PX, width * SWIPE_THRESHOLD_RATIO);

  if (!isDraggingModal) return;

  if (Math.abs(deltaX) >= threshold) {
    if (deltaX < 0) {
      showNextItem();
    } else {
      showPrevItem();
    }
  } else {
    animateSnapBack();
  }

  isDraggingModal = false;
  swipeLocked = null;
}

function setupModalNavigation() {
  const modal = document.getElementById('modal');
  const modalPrev = document.getElementById('modalPrev');
  const modalNext = document.getElementById('modalNext');
  const modalContent = document.getElementById('modalContent');

  if (modalPrev && !modalPrev.dataset.bound) {
    modalPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      showPrevItem();
    });
    modalPrev.dataset.bound = 'true';
  }

  if (modalNext && !modalNext.dataset.bound) {
    modalNext.addEventListener('click', (e) => {
      e.stopPropagation();
      showNextItem();
    });
    modalNext.dataset.bound = 'true';
  }

  if (modal && !modal.dataset.bound) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal.dataset.bound = 'true';
  }

  if (modalContent && !modalContent.dataset.swipeBound) {
    modalContent.addEventListener('touchstart', handleTouchStart, { passive: true });
    modalContent.addEventListener('touchmove', handleTouchMove, { passive: false });
    modalContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    modalContent.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    modalContent.dataset.swipeBound = 'true';
  }
}

function closeModal() {
  const modal = document.getElementById('modal');

  if (currentVideo) {
    currentVideo.pause();
    currentVideo.currentTime = 0;
    currentVideo = null;
  }

  isDraggingModal = false;
  swipeLocked = null;
  setModalTransition(false);
  resetModalVisualState();

  document.removeEventListener('keydown', handleModalKey);
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function renderTagCloud() {
  const allTags = new Set();
  externalTagCatalog.forEach(tag => allTags.add(tag));
  Object.values(allMedia).forEach(item => (item.tags || []).forEach(t => allTags.add(t)));

  const cloud = document.getElementById('tagCloud');
  const tags = Array.from(allTags).sort();

  if (!tags.length) {
    cloud.innerHTML = '<p class="text-sm text-zinc-500">No tags have been added yet.</p>';
    return;
  }

  cloud.innerHTML = `
    ${tags.map(tag => {
      const active = selectedTags.has(tag);
      return `
        <button type="button"
                data-tag="${escapeHtml(tag)}"
                class="tag-filter px-4 py-1.5 text-sm rounded-full cursor-pointer transition-all ${active ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}"
                aria-pressed="${active}">
          #${escapeHtml(tag)}
        </button>
      `;
    }).join('')}
    <button id="clearTagFilters"
            type="button"
            class="px-4 py-1.5 text-sm rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all ${selectedTags.size ? '' : 'hidden'}">
      Clear tags
    </button>
  `;

  cloud.querySelectorAll('.tag-filter').forEach(button => {
    button.addEventListener('click', () => toggleTagFilter(button.dataset.tag));
  });
  document.getElementById('clearTagFilters')?.addEventListener('click', clearTagFilters);
}

function filterByTag(tag) {
  toggleTagFilter(tag);
}

function toggleTagFilter(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized) return;

  if (selectedTags.has(normalized)) selectedTags.delete(normalized);
  else selectedTags = new Set([normalized]);

  saveFilterState();
  renderTagCloud();
  renderGroupedGallery(Object.values(allMedia));
}

function clearTagFilters() {
  selectedTags.clear();
  saveFilterState();
  renderTagCloud();
  renderGroupedGallery(Object.values(allMedia));
}

function clearGalleryFilters() {
  currentFilter = 'all';
  selectedTags.clear();
  saveFilterState();
  updateFilterButtons();
  renderTagCloud();
  renderGroupedGallery(Object.values(allMedia));
}

window.saveToPhotos = async function(url, type) {
  const isVideo = type === 'video';
  const itemName = isVideo ? 'Video' : 'Photo';

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load');

    const blob = await response.blob();
    const fileName = isVideo ? 'video.mp4' : 'photo.jpg';
    const file = new File([blob], fileName, {
      type: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg')
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Save ${itemName}`
        });

        showToast(`✅ ${itemName} saved to Photos!`);
      } catch (shareErr) {
        if (shareErr.name === 'AbortError' || shareErr.message.toLowerCase().includes('cancel')) {
          return;
        }
        console.error(shareErr);
      }
      return;
    }

    alert(`To save to Photos:\n\nLong-press the ${itemName.toLowerCase()} and tap "Save ${itemName}"`);
  } catch (err) {
    console.error(err);
    alert(`Please long-press the ${itemName.toLowerCase()} directly to save it.`);
  }
};

function showToast(message) {
  console.log('Toast triggered:', message);

  const existing = document.getElementById('custom-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'custom-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #10b981;
    color: white;
    padding: 16px 28px;
    border-radius: 9999px;
    font-size: 16px;
    font-weight: 600;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
    z-index: 99999;
    white-space: nowrap;
    opacity: 0;
    transition: all 0.4s ease;
    pointer-events: none;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '1'; }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(30px)';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

window.onload = loadData;
