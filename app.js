'use strict';
(() => {
  const keys={theme:'rusHistoryTheme',favorites:'rusHistoryFavorites'};
  const readFavorites=()=>{try{const v=JSON.parse(localStorage.getItem(keys.favorites)||'[]');return Array.isArray(v)?v.map(Number).filter(Number.isFinite):[]}catch{return[]}};
  const state={query:'',period:'Все',favoritesOnly:false,favorites:new Set(readFavorites()),activeEventId:null};
  const timeline=document.getElementById('timeline');
  const filters=document.getElementById('periodFilters');
  const searchInput=document.getElementById('searchInput');
  const favoritesOnly=document.getElementById('favoritesOnly');
  const resultCount=document.getElementById('resultCount');
  const emptyState=document.getElementById('emptyState');
  const themeToggle=document.getElementById('themeToggle');
  const modal=document.getElementById('eventModal');
  const modalClose=document.getElementById('modalClose');
  const modalFavorite=document.getElementById('modalFavorite');
  function saveFavorites(){localStorage.setItem(keys.favorites,JSON.stringify([...state.favorites]))}
  function setTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem(keys.theme,theme);themeToggle.textContent=theme==='dark'?'☀':'☾';themeToggle.setAttribute('aria-label',theme==='dark'?'Включить светлую тему':'Включить тёмную тему')}
  function initTheme(){const saved=localStorage.getItem(keys.theme);const preferred=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';setTheme(saved==='dark'||saved==='light'?saved:preferred)}
  function createFilters(){const periods=['Все',...new Set(HISTORY_EVENTS.map(e=>e.period))];filters.innerHTML=periods.map(p=>`<button class="filter-button${p===state.period?' active':''}" type="button" data-period="${p}">${p}</button>`).join('')}
  function visibleEvents(){const q=state.query.trim().toLocaleLowerCase('ru');return HISTORY_EVENTS.filter(e=>{const text=`${e.year} ${e.title} ${e.summary} ${e.description} ${e.period}`.toLocaleLowerCase('ru');return(state.period==='Все'||e.period===state.period)&&(!state.favoritesOnly||state.favorites.has(e.id))&&(!q||text.includes(q))})}
  function render(){const events=visibleEvents();timeline.innerHTML=events.map(e=>{const fav=state.favorites.has(e.id);return `<article class="event-card" data-id="${e.id}" tabindex="0" aria-label="${e.year}. ${e.title}"><img class="event-image" src="${e.image}" alt="Иллюстрация к событию «${e.title}»"><div class="event-body"><div class="event-top"><div><p class="event-year">${e.year}</p><h2 class="event-title">${e.title}</h2></div><button class="favorite-button${fav?' active':''}" type="button" data-favorite-id="${e.id}" aria-label="${fav?'Удалить из избранного':'Добавить в избранное'}">${fav?'★':'☆'}</button></div><p class="event-summary">${e.summary}</p><span class="period-badge">${e.period}</span></div></article>`}).join('');resultCount.textContent=`Событий: ${events.length}`;emptyState.hidden=events.length!==0}
  function updateModalFavorite(){const active=state.favorites.has(state.activeEventId);modalFavorite.textContent=active?'★ Удалить из избранного':'☆ Добавить в избранное'}
  function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites();render();if(state.activeEventId===id)updateModalFavorite()}
  function openModal(id){const e=HISTORY_EVENTS.find(item=>item.id===id);if(!e)return;state.activeEventId=id;const img=document.getElementById('modalImage');img.src=e.image;img.alt=`Иллюстрация к событию «${e.title}»`;document.getElementById('modalPeriod').textContent=e.period;document.getElementById('modalYear').textContent=e.year;document.getElementById('modalTitle').textContent=e.title;document.getElementById('modalDescription').textContent=e.description;updateModalFavorite();modal.showModal()}
  filters.addEventListener('click',event=>{const button=event.target.closest('[data-period]');if(!button)return;state.period=button.dataset.period;createFilters();render()});
  searchInput.addEventListener('input',()=>{state.query=searchInput.value;render()});
  favoritesOnly.addEventListener('change',()=>{state.favoritesOnly=favoritesOnly.checked;render()});
  themeToggle.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
  timeline.addEventListener('click',event=>{const favoriteButton=event.target.closest('[data-favorite-id]');if(favoriteButton){event.stopPropagation();toggleFavorite(Number(favoriteButton.dataset.favoriteId));return}const card=event.target.closest('[data-id]');if(card)openModal(Number(card.dataset.id))});
  timeline.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-id]')){event.preventDefault();openModal(Number(event.target.dataset.id))}});
  modalClose.addEventListener('click',()=>modal.close());
  modalFavorite.addEventListener('click',()=>toggleFavorite(state.activeEventId));
  modal.addEventListener('click',event=>{if(event.target===modal)modal.close()});
  modal.addEventListener('close',()=>{state.activeEventId=null});
  initTheme();createFilters();render();
})();