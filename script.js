let allMedia = {};
let currentFilter = 'all';
let currentVideo = null;
let visibleItems = [];
let currentIndex = -1;

let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;
const SWIPE_VERTICAL_TOLERANCE = 80;

async function loadData() {
  try {
    const [mediaRes, tagsRes] = await Promise.all([
      fetch('index.json?t=' + Date.now()),
      fetch('tags.json?t=' + Date.now()).catch(() => ({ json: () => ({}) }))
    ]);

    allMedia = await mediaRes.json();
    const tagsData = await tagsRes.json().catch(() => ({}));

    Object.keys(allMedia).forEach(id => {
      allMedia[id].tags = tagsData[id] || [];
    });

    console.log(`✅ Loaded ${Object.keys(allMedia).length} media items`);
    renderGroupedGallery(Object.values(allMedia));
    renderTagCloud();
    setupFilterButtons();
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

function setFilter(filter) {
  currentFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('bg-zinc-800', 'text-zinc-300');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('bg-zinc-800', 'text-zinc-300');
    }
  });

  renderGroupedGallery(Object.values(allMedia));
}

function renderGroupedGallery(items) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  let filteredItems = items;
  if (currentFilter === 'image') filteredItems = items.filter(item => item.type === 'image');
  else if (currentFilter === 'video') filteredItems = items.filter(item => item.type === 'video');

  filteredItems.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));

  visibleItems = filteredItems;

  const groups = {};
  filteredItems.forEach((item, index) => {
    const dateKey = new Date(item.dateTaken).toISOString().split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push({ item, index });
  });

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  sortedDates.forEach(dateKey => {
    const groupEntries = groups[dateKey];
    const displayDate = new Date(dateKey).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const section = document.createElement('div');
    section.className = 'mb-12';

    const header = document.createElement('div');
    header.className = 'group-header flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 px-6 py-5 rounded-2xl cursor-pointer transition-all border border-zinc-800';
    header.innerHTML = `
      <div>
        <h2 class="text-2xl font-semibold text-white">${displayDate}</h2>
        <p class="text-zinc-500 text-sm mt-0.5">${groupEntries.length} items</p>
      </div>
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

function showModalByIndex(index) {
  if (index < 0 || index >= visibleItems.length) return;
  currentIndex = index;
  showModal(visibleItems[index]);
  updateModalNavButtons();
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
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

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
  if (!visibleItems.length) return;
  const prevIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
  showModalByIndex(prevIndex);
}

function showNextItem() {
  if (!visibleItems.length) return;
  const nextIndex = (currentIndex + 1) % visibleItems.length;
  showModalByIndex(nextIndex);
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
  if (!visibleItems.length || currentIndex < 0) return;

  const dateStarts = getDateStartIndices();
  if (!dateStarts.length) return;

  const currentDate = getDateKeyAtIndex(currentIndex);
  const currentGroupIndex = dateStarts.findIndex(startIndex => getDateKeyAtIndex(startIndex) === currentDate);
  const prevGroupIndex = (currentGroupIndex - 1 + dateStarts.length) % dateStarts.length;

  showModalByIndex(dateStarts[prevGroupIndex]);
}

function showNextDate() {
  if (!visibleItems.length || currentIndex < 0) return;

  const dateStarts = getDateStartIndices();
  if (!dateStarts.length) return;

  const currentDate = getDateKeyAtIndex(currentIndex);
  const currentGroupIndex = dateStarts.findIndex(startIndex => getDateKeyAtIndex(startIndex) === currentDate);
  const nextGroupIndex = (currentGroupIndex + 1) % dateStarts.length;

  showModalByIndex(dateStarts[nextGroupIndex]);
}

function updateModalNavButtons() {
  const modalPrev = document.getElementById('modalPrev');
  const modalNext = document.getElementById('modalNext');
  const metaPrevBtn = document.getElementById('metaPrevBtn');
  const metaNextBtn = document.getElementById('metaNextBtn');

  const hasItems = visibleItems.length > 0;

  [modalPrev, modalNext, metaPrevBtn, metaNextBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !hasItems;
    btn.style.opacity = hasItems ? '1' : '0.35';
    btn.style.pointerEvents = hasItems ? 'auto' : 'none';
  });
}

function handleTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
  if (!e.changedTouches || e.changedTouches.length !== 1) return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;

  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
  if (Math.abs(deltaY) > SWIPE_VERTICAL_TOLERANCE) return;

  if (deltaX < 0) {
    showNextItem();
  } else {
    showPrevItem();
  }
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
    modalContent.addEventListener('touchend', handleTouchEnd, { passive: true });
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

  document.removeEventListener('keydown', handleModalKey);
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function renderTagCloud() {
  const allTags = new Set();
  Object.values(allMedia).forEach(item => (item.tags || []).forEach(t => allTags.add(t)));

  const cloud = document.getElementById('tagCloud');
  cloud.innerHTML = Array.from(allTags).map(tag => `
    <span onclick="filterByTag('${tag}')" 
          class="tag px-4 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-full cursor-pointer transition-all">
      #${tag}
    </span>
  `).join('');
}

function filterByTag(tag) {
  alert(`Filtering by #${tag} (full filter system coming soon)`);
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