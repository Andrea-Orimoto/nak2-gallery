let allMedia = {};
let currentVideo = null;

async function loadIndex() {
  try {
    const res = await fetch('index.json?t=' + Date.now());
    allMedia = await res.json();
    console.log(`✅ Loaded ${Object.keys(allMedia).length} media items (${Object.values(allMedia).filter(i => i.type === 'video').length} videos)`);
    renderGroupedGallery(Object.values(allMedia));
    renderTagCloud();
  } catch (err) {
    console.error('Failed to load index.json', err);
  }
}

function renderGroupedGallery(items) {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';

  items.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));

  const groups = {};
  items.forEach(item => {
    const dateKey = new Date(item.dateTaken).toISOString().split('T')[0];
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  sortedDates.forEach(dateKey => {
    const groupItems = groups[dateKey];
    const displayDate = new Date(dateKey).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const section = document.createElement('div');
    section.className = 'mb-12';

    section.innerHTML = `
      <div onclick="toggleGroup(this)" 
           class="group-header flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 px-6 py-5 rounded-2xl cursor-pointer transition-all border border-zinc-800">
        <div>
          <h2 class="text-2xl font-semibold text-white">${displayDate}</h2>
          <p class="text-zinc-500 text-sm mt-0.5">${groupItems.length} items</p>
        </div>
        <span class="chevron text-4xl text-zinc-400 transition-transform duration-300">›</span>
      </div>
      
      <div class="group-content grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-5">
      </div>
    `;

    const contentDiv = section.querySelector('.group-content');
    const chevron = section.querySelector('.chevron');

    groupItems.forEach(item => {
      const div = document.createElement('div');
      div.className = `media-item cursor-pointer overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500 transition-all duration-300 aspect-square relative`;

      const iconHTML = item.type === 'video' 
        ? `<div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
             <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
               <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor"/>
               <polygon points="10,9 10,15 15,12" fill="currentColor"/>
             </svg>
           </div>`
        : `<div class="absolute top-3 right-3 bg-black/75 backdrop-blur-sm text-white p-1.5 rounded-xl shadow-md">
             <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
               <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
             </svg>
           </div>`;

      const mediaHTML = item.type === 'video' 
        ? `<video src="${item.thumbUrl}" muted loop playsinline class="w-full h-full object-cover"></video>`
        : `<img src="${item.thumbUrl}" loading="lazy" class="w-full h-full object-cover" alt="${item.caption || ''}">`;

      div.innerHTML = `${mediaHTML}${iconHTML}`;

      div.addEventListener('click', () => showModal(item));
      contentDiv.appendChild(div);
    });

    gallery.appendChild(section);

    contentDiv.style.display = 'grid';
    chevron.style.transform = 'rotate(90deg)';
  });
}

function showModal(item) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  const meta = document.getElementById('modalMeta');

  let mediaHTML = '';

  if (item.type === 'video') {
    mediaHTML = `
      <div class="flex items-center justify-center w-full h-full p-4">
        <video id="modalVideo" 
               src="${item.fullUrl}" 
               controls 
               autoplay 
               playsinline 
               class="max-h-[85vh] max-w-[90vw] rounded-2xl">
        </video>
      </div>`;
  } else {
    mediaHTML = `
      <div class="flex items-center justify-center w-full h-full p-4">
        <img id="modalImage" 
             src="${item.fullUrl}" 
             class="max-h-[85vh] max-w-[90vw] object-contain rounded-2xl" 
             alt="${item.caption || ''}">
      </div>`;
  }

  content.innerHTML = mediaHTML;

  meta.innerHTML = `
    <div class="flex justify-between items-start gap-4">
      <div class="flex-1">
        <p class="text-zinc-400 text-sm">${new Date(item.dateTaken).toLocaleDateString('en-US', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        })}</p>
        <p class="mt-1 text-lg leading-tight">${item.caption || '<span class="text-zinc-500 italic">No caption</span>'}</p>
      </div>
      <button id="closeBtn" 
              class="text-5xl leading-none text-zinc-400 hover:text-white transition-colors px-3 -mt-1">×</button>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      ${item.tags && item.tags.length 
        ? item.tags.map(tag => `
          <span onclick="filterByTag('${tag}')" 
                class="tag px-4 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-full cursor-pointer transition-colors">
            #${tag}
          </span>`).join('')
        : '<span class="text-zinc-500 text-sm">No tags yet • Add them in index.json</span>'}
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

  // Add ESC key listener
  document.addEventListener('keydown', handleEscKey);

  setTimeout(() => {
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }, 10);
}

function handleEscKey(e) {
  if (e.key === "Escape") {
    closeModal();
  }
}

function closeModal() {
  const modal = document.getElementById('modal');

  // Stop video if playing
  if (currentVideo) {
    currentVideo.pause();
    currentVideo.currentTime = 0;
    currentVideo = null;
  }

  // Remove ESC listener
  document.removeEventListener('keydown', handleEscKey);

  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleGroup(header) {
  const content = header.nextElementSibling;
  const chevron = header.querySelector('.chevron');

  if (content.style.display === 'none') {
    content.style.display = 'grid';
    chevron.style.transform = 'rotate(90deg)';
  } else {
    content.style.display = 'none';
    chevron.style.transform = 'rotate(0deg)';
  }
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

function clearFilters() {
  document.getElementById('search').value = '';
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value = '';
  document.getElementById('filterImages').checked = true;
  document.getElementById('filterVideos').checked = true;
  renderGroupedGallery(Object.values(allMedia));
}

window.onload = () => {
  loadIndex();

  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
      renderGroupedGallery(Object.values(allMedia));
      return;
    }
    const filtered = Object.values(allMedia).filter(item => 
      (item.caption || '').toLowerCase().includes(term) ||
      (item.tags || []).some(t => t.toLowerCase().includes(term))
    );
    renderGroupedGallery(filtered);
  });
};