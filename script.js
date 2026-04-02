let allMedia = {};
let currentFilter = 'all';
let currentVideo = null;

async function loadData() {
  try {
    const [mediaRes, tagsRes] = await Promise.all([
      fetch('index.json?t=' + Date.now()),
      fetch('tags.json?t=' + Date.now()).catch(() => ({ json: () => ({}) }))
    ]);

    allMedia = await mediaRes.json();
    const tagsData = await tagsRes.json().catch(() => ({}));

    // Merge tags
    Object.keys(allMedia).forEach(id => {
      allMedia[id].tags = tagsData[id] || [];
    });

    console.log(`✅ Loaded ${Object.keys(allMedia).length} media items`);
    renderGroupedGallery(Object.values(allMedia));
    renderTagCloud();
    setupFilterButtons();
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

  const groups = {};
  filteredItems.forEach(item => {
    const dateKey = new Date(item.dateTaken).toISOString().split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  sortedDates.forEach(dateKey => {
    const groupItems = groups[dateKey];
    const displayDate = new Date(dateKey).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const section = document.createElement('div');
    section.className = 'mb-12';

    const header = document.createElement('div');
    header.className = `group-header flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 px-6 py-5 rounded-2xl cursor-pointer transition-all border border-zinc-800`;
    header.innerHTML = `
      <div>
        <h2 class="text-2xl font-semibold text-white">${displayDate}</h2>
        <p class="text-zinc-500 text-sm mt-0.5">${groupItems.length} items</p>
      </div>
      <span class="chevron text-4xl text-zinc-400 transition-transform duration-300">›</span>
    `;
    header.addEventListener('click', () => toggleGroup(header));

    const contentDiv = document.createElement('div');
    contentDiv.className = 'group-content grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-5';

    groupItems.forEach(item => {
      const div = document.createElement('div');
      div.className = `media-item cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 transition-all duration-300 aspect-square relative`;

      if (item.type === 'video') {
        // Use the generated thumbnail from ./thumbnails/
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

      div.addEventListener('click', () => showModal(item));
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

function showModal(item) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  const meta = document.getElementById('modalMeta');

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
          class="max-h-[78vh] max-w-[92vw] rounded-2xl"
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
          alt="">
      </div>`;
  }

  content.innerHTML = mediaHTML;

  meta.innerHTML = `
    <div class="flex justify-between items-center">
      <p class="text-zinc-400 text-sm">${new Date(item.dateTaken).toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })}</p>
      <button id="closeBtn" class="text-5xl leading-none text-zinc-400 hover:text-white transition-colors px-4">×</button>
    </div>

    <a href="${item.fullUrl}" download 
       class="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-8 py-3.5 rounded-2xl font-medium transition-all">
      ⬇️ Download Original ${item.type === 'video' ? 'Video' : 'Photo'}
    </a>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (item.type === 'video') {
    currentVideo = document.getElementById('modalVideo');
  }

  document.addEventListener('keydown', handleEscKey);

  setTimeout(() => {
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }, 10);
}

function handleEscKey(e) {
  if (e.key === "Escape") closeModal();
}

function closeModal() {
  const modal = document.getElementById('modal');

  if (currentVideo) {
    currentVideo.pause();
    currentVideo.currentTime = 0;
    currentVideo = null;
  }

  document.removeEventListener('keydown', handleEscKey);
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

window.onload = loadData;