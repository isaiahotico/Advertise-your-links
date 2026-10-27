/**
 * Paperhouse Inc. - Advance Ads CDN & Content Hub Engine
 * Handles Firebase Realtime DB, Auto-Ads, Credits Regen, Cards Skins, Feeds & Chat.
 */

// --- 1. FIREBASE CONFIGURATION & INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg",
  authDomain: "freegcash-ads.firebaseapp.com",
  databaseURL: "https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "freegcash-ads",
  storageBucket: "freegcash-ads.firebasestorage.app",
  messagingSenderId: "608086825364",
  appId: "1:608086825364:web:3a8e628d231b52c6171781"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

// Anonymous authentication to provide unique secure UID
auth.signInAnonymously().catch(err => {
  console.warn("Auth note: Running in client-session mode", err);
});

// Current User State
let currentUser = {
  uid: localStorage.getItem('ph_uid') || 'usr_' + Math.random().toString(36).substring(2, 10),
  name: localStorage.getItem('ph_username') || 'Member_' + Math.floor(1000 + Math.random() * 9000),
  credits: 5
};
localStorage.setItem('ph_uid', currentUser.uid);
localStorage.setItem('ph_username', currentUser.name);

// Global caches
let allLoadedPosts = [];
let activeViewingPostId = null;

// --- 2. CREDIT SYSTEM (MAX 5, HOURLY REGENERATION, MIDNIGHT REFRESH) ---
function initCreditSystem() {
  const now = new Date();
  const todayKey = now.toDateString();
  const lastResetDate = localStorage.getItem('ph_last_reset_date');
  const lastHourRegen = parseInt(localStorage.getItem('ph_last_hour_regen') || '0', 10);
  let savedCredits = parseInt(localStorage.getItem('ph_user_credits') || '5', 10);

  // Midnight Refresh logic: If day changed, refresh fully to 5
  if (lastResetDate !== todayKey) {
    savedCredits = 5;
    localStorage.setItem('ph_last_reset_date', todayKey);
    localStorage.setItem('ph_last_hour_regen', Date.now().toString());
  } else {
    // Hourly Regen logic: 1 credit per hour up to 5 max
    const hoursElapsed = Math.floor((Date.now() - lastHourRegen) / (1000 * 60 * 60));
    if (hoursElapsed > 0 && savedCredits < 5) {
      savedCredits = Math.min(5, savedCredits + hoursElapsed);
      localStorage.setItem('ph_last_hour_regen', Date.now().toString());
    }
  }

  currentUser.credits = savedCredits;
  localStorage.setItem('ph_user_credits', currentUser.credits.toString());
  updateCreditUI();
}

function updateCreditUI() {
  const el = document.getElementById('creditCounter');
  const profEl = document.getElementById('profileCredits');
  if (el) el.innerText = `${currentUser.credits}/5 Credits`;
  if (profEl) profEl.innerText = currentUser.credits;
}

function deductCredit(amount = 1) {
  if (currentUser.credits < amount) {
    showToast("Not enough credits! Watch ads in Office or wait for hourly regeneration.", "error");
    return false;
  }
  currentUser.credits -= amount;
  localStorage.setItem('ph_user_credits', currentUser.credits.toString());
  updateCreditUI();
  return true;
}

function addCredit(amount = 1) {
  currentUser.credits = Math.min(5, currentUser.credits + amount);
  localStorage.setItem('ph_user_credits', currentUser.credits.toString());
  updateCreditUI();
}

// --- 3. AUTO ADS ENGINE WITH 5-MINUTE COOLDOWNS ---
function initAutoAds() {
  const lastInterstitialRun = parseInt(localStorage.getItem('ph_last_inapp_ad') || '0', 10);
  const lastRewardedRun = parseInt(localStorage.getItem('ph_last_rewarded_seq') || '0', 10);
  const now = Date.now();
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  // Auto Show Rewarded Interstitial 3 times in a row if 5-minute cooldown expired
  if (now - lastRewardedRun >= COOLDOWN_MS) {
    localStorage.setItem('ph_last_rewarded_seq', now.toString());
    runRewardedSequence(3);
  }

  // Auto In-App Interstitial Ad (frequency 2, interval 30s, timeout 5s)
  if (now - lastInterstitialRun >= COOLDOWN_MS) {
    localStorage.setItem('ph_last_inapp_ad', now.toString());
    setTimeout(() => {
      if (typeof show_10555663 === 'function') {
        show_10555663({
          type: 'inApp',
          inAppSettings: {
            frequency: 2,
            capping: 0.1,
            interval: 30,
            timeout: 5,
            everyPage: false
          }
        });
      }
    }, 5000);
  }
}

// Rewarded sequence runner
function runRewardedSequence(remaining) {
  if (remaining <= 0) return;
  if (typeof show_10555663 === 'function') {
    show_10555663().then(() => {
      addCredit(1);
      setTimeout(() => runRewardedSequence(remaining - 1), 3000);
    }).catch(() => {
      // Ad skipped or network delay
    });
  }
}

// Office Manual Rewarded Ads
function triggerRewardedInterstitial() {
  if (typeof show_10555663 === 'function') {
    show_10555663().then(() => {
      addCredit(1);
      showToast("Reward received! +1 Credit added.", "success");
    }).catch(e => {
      showToast("Ad ended or failed to load.", "error");
    });
  } else {
    showToast("Ad SDK loading... Please wait a moment.", "error");
  }
}

function triggerRewardedPopup() {
  if (typeof show_10555663 === 'function') {
    show_10555663('pop').then(() => {
      addCredit(1);
      showToast("Popup watched! +1 Credit awarded.", "success");
    }).catch(e => {
      showToast("Popup closed.", "info");
    });
  } else {
    showToast("Ad SDK loading... Please wait a moment.", "error");
  }
}

// --- 4. POSTS DISCOVERY, PUBLIC LIMIT (500 VIEWS) & RANDOMIZATION ---
function listenToPosts() {
  document.getElementById('feedLoading').classList.remove('hidden');
  const postsRef = db.ref('posts');

  postsRef.on('value', snapshot => {
    document.getElementById('feedLoading').classList.add('hidden');
    const data = snapshot.val();
    allLoadedPosts = [];

    if (data) {
      Object.keys(data).forEach(id => {
        allLoadedPosts.push({ id, ...data[id] });
      });
    }

    renderFeed();
    renderUserPosts();
    renderLeaderboards('day');
  });
}

// Feed shows only posts with < 500 views, randomized and capped at 30 items
function renderFeed() {
  const container = document.getElementById('postsGrid');
  container.innerHTML = '';

  // Filter public items under 500 views
  const eligiblePosts = allLoadedPosts.filter(p => (p.views || 0) < 500);

  // Shuffle randomly
  const shuffled = [...eligiblePosts].sort(() => 0.5 - Math.random());
  const selectedPosts = shuffled.slice(0, 30);

  if (selectedPosts.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-slate-900/50 rounded-2xl border border-slate-800">
        <i class="fa-solid fa-bullhorn text-4xl text-slate-600 mb-2"></i>
        <p class="text-sm text-slate-300 font-semibold">No active campaigns available</p>
        <p class="text-xs text-slate-500 mt-1">Be the first to publish or earn credits to promote!</p>
      </div>`;
    return;
  }

  selectedPosts.forEach(post => {
    container.appendChild(createPostCardElement(post));
  });
}

function refreshFeed() {
  renderFeed();
  showToast("Feed refreshed with 30 random campaigns!", "success");
}

// Card Generator with Skins and Shimmer Animations
function createPostCardElement(post) {
  const card = document.createElement('div');
  const skinClass = post.skin || 'skin-gold';
  card.className = `${skinClass} animated-border rounded-xl p-3 flex flex-col justify-between cursor-pointer transform hover:-translate-y-1 transition duration-200 select-none`;

  const thumb = post.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=60';
  const views = post.views || 0;
  const likes = post.likes ? Object.keys(post.likes).length : (post.likeCount || 0);

  card.innerHTML = `
    <div>
      <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-950 mb-2">
        <img src="${thumb}" alt="${escapeHtml(post.title)}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=60'">
        <span class="absolute top-1 left-1 bg-black/70 backdrop-blur-xs text-[9px] font-bold px-1.5 py-0.5 rounded text-amber-300 uppercase tracking-wider">
          ${escapeHtml(post.category || 'Link')}
        </span>
        <span class="absolute bottom-1 right-1 bg-black/75 text-[9px] text-white px-1.5 py-0.5 rounded">
          <i class="fa-solid fa-eye text-[8px] text-sky-400"></i> ${views}/500
        </span>
      </div>
      <h3 class="text-xs font-bold text-white line-clamp-2 mb-1">${escapeHtml(post.title)}</h3>
      <p class="text-[10px] text-slate-400 truncate mb-2">By ${escapeHtml(post.ownerName || 'User')}</p>
    </div>

    <div class="pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
      <span class="text-rose-400 font-semibold"><i class="fa-solid fa-heart mr-0.5"></i> ${likes}</span>
      <span class="text-emerald-400 font-semibold">View Ad <i class="fa-solid fa-chevron-right text-[8px]"></i></span>
    </div>
  `;

  card.onclick = () => openPostDetail(post.id);
  return card;
}

// --- 5. POST DETAILS MODAL & EXPANDED ACTIONS ---
function openPostDetail(postId) {
  const post = allLoadedPosts.find(p => p.id === postId);
  if (!post) return;

  activeViewingPostId = postId;

  // Increment views
  incrementPostView(postId);

  // Set Modal Info
  document.getElementById('detailTitle').innerText = post.title;
  document.getElementById('detailBadge').innerText = (post.category || 'Ads').toUpperCase();
  document.getElementById('detailOwner').innerText = post.ownerName || 'Unknown';
  document.getElementById('detailViewsLimit').innerText = `Views: ${Math.min(500, (post.views || 0) + 1)} / 500 Max Public Cap`;
  document.getElementById('detailDescription').innerText = post.description || '';

  const likes = post.likes ? Object.keys(post.likes).length : (post.likeCount || 0);
  document.getElementById('detailLikesCount').innerText = likes;

  // Media (Video player or Embedded Player)
  const mediaContainer = document.getElementById('detailMediaContainer');
  mediaContainer.innerHTML = '';

  if (post.videoUrl) {
    if (post.videoUrl.includes('youtube.com') || post.videoUrl.includes('youtu.be')) {
      const ytId = extractYouTubeID(post.videoUrl);
      mediaContainer.innerHTML = `<iframe class="w-full h-full" src="https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1" frameborder="0" allowfullscreen></iframe>`;
    } else {
      mediaContainer.innerHTML = `<video src="${post.videoUrl}" controls autoplay muted class="w-full h-full object-cover"></video>`;
    }
  } else if (post.thumbnail) {
    mediaContainer.innerHTML = `<img src="${post.thumbnail}" class="w-full h-full object-cover">`;
  } else {
    mediaContainer.innerHTML = `<div class="text-slate-500 text-xs flex flex-col items-center"><i class="fa-solid fa-bullhorn text-2xl mb-1"></i><span>Promoted Campaign</span></div>`;
  }

  // Like button hook
  const likeBtn = document.getElementById('detailLikeBtn');
  likeBtn.onclick = () => toggleLikePost(postId);

  // Open Link In Internal Browser
  const openLinkBtn = document.getElementById('detailOpenLinkBtn');
  openLinkBtn.onclick = () => {
    if (post.link) {
      openInternalBrowser(post.link, post.title);
    } else {
      showToast("No destination link specified.", "error");
    }
  };

  // Comments Stream Hook
  loadPostComments(postId);

  document.getElementById('modalPostDetail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modalPostDetail').classList.add('hidden');
  const mediaContainer = document.getElementById('detailMediaContainer');
  if (mediaContainer) mediaContainer.innerHTML = '';
  activeViewingPostId = null;
}

function incrementPostView(postId) {
  const postRef = db.ref(`posts/${postId}/views`);
  postRef.transaction(current => (current || 0) + 1);
}

function toggleLikePost(postId) {
  const userLikeRef = db.ref(`posts/${postId}/likes/${currentUser.uid}`);
  userLikeRef.once('value', snapshot => {
    if (snapshot.exists()) {
      userLikeRef.remove();
      showToast("Like removed", "info");
    } else {
      userLikeRef.set(true);
      showToast("Campaign liked!", "success");
    }
  });
}

// Comments handling
function loadPostComments(postId) {
  const commentsList = document.getElementById('detailCommentsList');
  const countEl = document.getElementById('detailCommentCount');
  commentsList.innerHTML = '<p class="text-[10px] text-slate-500">Loading comments...</p>';

  db.ref(`posts/${postId}/comments`).on('value', snapshot => {
    const data = snapshot.val();
    commentsList.innerHTML = '';
    if (!data) {
      countEl.innerText = '0';
      commentsList.innerHTML = '<p class="text-[10px] text-slate-500 italic">No comments yet. Start the conversation!</p>';
      return;
    }
    const entries = Object.values(data);
    countEl.innerText = entries.length;
    entries.forEach(c => {
      const row = document.createElement('div');
      row.className = 'bg-slate-800/80 p-2 rounded-lg border border-slate-700/60';
      row.innerHTML = `
        <div class="flex items-center justify-between mb-0.5">
          <span class="font-bold text-slate-200 text-[11px]">${escapeHtml(c.author || 'User')}</span>
          <span class="text-[9px] text-slate-500">${new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <p class="text-slate-300 text-[11px]">${escapeHtml(c.text)}</p>
      `;
      commentsList.appendChild(row);
    });
    commentsList.scrollTop = commentsList.scrollHeight;
  });
}

function handleSendComment(e) {
  e.preventDefault();
  if (!activeViewingPostId) return;
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if (!text) return;

  const commentRef = db.ref(`posts/${activeViewingPostId}/comments`).push();
  commentRef.set({
    uid: currentUser.uid,
    author: currentUser.name,
    text: text,
    timestamp: Date.now()
  }).then(() => {
    input.value = '';
  });
}

// --- 6. CAMPAIGN CREATION ---
function openCreateModal() {
  if (currentUser.credits < 1) {
    showToast("You need 1 Credit to publish. Visit Office to earn!", "error");
    return;
  }
  document.getElementById('modalCreatePost').classList.remove('hidden');
}

function closeCreateModal() {
  document.getElementById('modalCreatePost').classList.add('hidden');
}

function handleCreatePost(e) {
  e.preventDefault();
  if (!deductCredit(1)) return;

  const title = document.getElementById('postTitle').value.trim();
  const category = document.getElementById('postCategory').value;
  const skin = document.getElementById('postSkin').value;
  const link = document.getElementById('postLink').value.trim();
  const thumbnail = document.getElementById('postThumbnail').value.trim();
  const videoDuration = parseInt(document.getElementById('postVideoDuration').value || '30', 10);
  const videoUrl = document.getElementById('postVideoUrl').value.trim();
  const description = document.getElementById('postDescription').value.trim();

  const newPost = {
    title,
    category,
    skin,
    link,
    thumbnail,
    videoDuration: Math.min(300, Math.max(30, videoDuration)),
    videoUrl,
    description,
    ownerUid: currentUser.uid,
    ownerName: currentUser.name,
    views: 0,
    timestamp: Date.now()
  };

  db.ref('posts').push(newPost).then(() => {
    showToast("Ad campaign launched successfully!", "success");
    closeCreateModal();
    document.getElementById('createPostForm').reset();
  }).catch(err => {
    showToast("Failed to create post. Try again.", "error");
    addCredit(1); // refund
  });
}

// --- 7. USER PROFILE & PERMANENT VAULT ---
function renderUserPosts() {
  const container = document.getElementById('myPostsGrid');
  const countEl = document.getElementById('profilePostCount');
  container.innerHTML = '';

  const myPosts = allLoadedPosts.filter(p => p.ownerUid === currentUser.uid);
  if (countEl) countEl.innerText = myPosts.length;

  if (myPosts.length === 0) {
    container.innerHTML = `<p class="col-span-full text-xs text-slate-500 py-6 text-center italic">No campaigns published yet.</p>`;
    return;
  }

  myPosts.forEach(post => {
    const card = createPostCardElement(post);
    container.appendChild(card);
  });
}

function toggleEditUsername() {
  const box = document.getElementById('editNameContainer');
  box.classList.toggle('hidden');
}

function saveNewUsername() {
  const input = document.getElementById('newUsernameInput');
  const val = input.value.trim();
  if (val.length >= 2) {
    currentUser.name = val;
    localStorage.setItem('ph_username', val);
    document.getElementById('profileDisplayName').innerText = val;
    document.getElementById('avatarDisplay').innerText = val.charAt(0).toUpperCase();
    toggleEditUsername();
    showToast("Display name updated!", "success");
  }
}

// --- 8. REAL-TIME PEER & COMMUNITY CHAT ---
function initChatEngine() {
  const chatContainer = document.getElementById('chatMessages');
  db.ref('community_chat').limitToLast(50).on('value', snapshot => {
    const data = snapshot.val();
    chatContainer.innerHTML = '';
    if (!data) {
      chatContainer.innerHTML = '<p class="text-center text-slate-500 italic">No messages yet. Send a greeting!</p>';
      return;
    }

    Object.values(data).forEach(msg => {
      const isMe = msg.uid === currentUser.uid;
      const bubble = document.createElement('div');
      bubble.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;

      bubble.innerHTML = `
        <span class="text-[9px] text-slate-400 mb-0.5 px-1">${escapeHtml(msg.author || 'User')} • ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div class="px-3 py-2 rounded-2xl max-w-[80%] ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'}">
          ${escapeHtml(msg.text)}
        </div>
      `;
      chatContainer.appendChild(bubble);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  db.ref('community_chat').push({
    uid: currentUser.uid,
    author: currentUser.name,
    text: text,
    timestamp: Date.now()
  }).then(() => {
    input.value = '';
  });
}

// --- 9. LEADERBOARDS (DAY / WEEK) ---
function renderLeaderboards(period) {
  const container = document.getElementById('leaderboardList');
  const dayBtn = document.getElementById('lbDayBtn');
  const weekBtn = document.getElementById('lbWeekBtn');
  container.innerHTML = '';

  if (period === 'day') {
    dayBtn.className = "px-3 py-1 text-xs rounded-lg font-bold bg-amber-500 text-slate-950 transition";
    weekBtn.className = "px-3 py-1 text-xs rounded-lg font-medium text-slate-300 hover:text-white transition";
  } else {
    weekBtn.className = "px-3 py-1 text-xs rounded-lg font-bold bg-amber-500 text-slate-950 transition";
    dayBtn.className = "px-3 py-1 text-xs rounded-lg font-medium text-slate-300 hover:text-white transition";
  }

  const timeWindow = period === 'day' ? (24 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000);
  const now = Date.now();

  const filtered = allLoadedPosts.filter(p => (now - (p.timestamp || 0)) <= timeWindow);
  // Sort by combined score of views + likes
  filtered.sort((a, b) => {
    const likesA = a.likes ? Object.keys(a.likes).length : (a.likeCount || 0);
    const likesB = b.likes ? Object.keys(b.likes).length : (b.likeCount || 0);
    return ((b.views || 0) + likesB * 2) - ((a.views || 0) + likesA * 2);
  });

  const top10 = filtered.slice(0, 10);

  if (top10.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-6">No campaigns ranked for this timeframe yet.</p>`;
    return;
  }

  top10.forEach((item, index) => {
    const rankColor = index === 0 ? 'text-amber-400 font-extrabold text-base' :
                      index === 1 ? 'text-slate-300 font-bold text-sm' :
                      index === 2 ? 'text-amber-600 font-bold text-sm' : 'text-slate-500 text-xs';
    const likes = item.likes ? Object.keys(item.likes).length : (item.likeCount || 0);

    const row = document.createElement('div');
    row.className = 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 p-3 rounded-xl flex items-center justify-between cursor-pointer transition';
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="w-6 text-center ${rankColor}">#${index + 1}</span>
        <div>
          <h4 class="text-xs font-bold text-white line-clamp-1">${escapeHtml(item.title)}</h4>
          <span class="text-[10px] text-slate-400">By ${escapeHtml(item.ownerName || 'User')} • ${escapeHtml(item.category || 'Link')}</span>
        </div>
      </div>
      <div class="flex items-center gap-3 text-xs">
        <span class="text-sky-400 font-semibold"><i class="fa-solid fa-eye text-[10px]"></i> ${item.views || 0}</span>
        <span class="text-rose-400 font-semibold"><i class="fa-solid fa-heart text-[10px]"></i> ${likes}</span>
      </div>
    `;
    row.onclick = () => openPostDetail(item.id);
    container.appendChild(row);
  });
}

// --- 10. IN-APP SEAMLESS BROWSER MODAL ---
function openInternalBrowser(url, title = 'Paperhouse Portal') {
  document.getElementById('browserTitle').innerText = title;
  document.getElementById('browserUrl').innerText = url;
  document.getElementById('browserExternalBtn').href = url;

  const iframe = document.getElementById('browserIframe');
  iframe.src = url;

  document.getElementById('modalBrowser').classList.remove('hidden');
}

function closeInternalBrowser() {
  const iframe = document.getElementById('browserIframe');
  iframe.src = 'about:blank';
  document.getElementById('modalBrowser').classList.add('hidden');
}

// --- 11. NAVIGATION & UI TABS ---
function switchTab(tabId) {
  const views = ['feed', 'leaderboard', 'office', 'chat', 'profile'];
  views.forEach(v => {
    const el = document.getElementById(`view${capitalize(v)}`);
    const navBtn = document.getElementById(`nav-${v}`);
    if (el) el.classList.add('hidden');
    if (navBtn) {
      navBtn.classList.remove('text-emerald-400');
      navBtn.classList.add('text-slate-400');
    }
  });

  const activeView = document.getElementById(`view${capitalize(tabId)}`);
  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeView) activeView.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('text-emerald-400');
    activeBtn.classList.remove('text-slate-400');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 12. UTILITIES, COFFEE MODAL, AND TOASTS ---
function openCoffeeModal() {
  document.getElementById('modalCoffee').classList.remove('hidden');
}

function closeCoffeeModal() {
  document.getElementById('modalCoffee').classList.add('hidden');
}

function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg, "success");
  }).catch(() => {
    showToast("Copied: " + text, "info");
  });
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = message;
  if (type === 'error') {
    toastIcon.className = 'fa-solid fa-circle-exclamation text-rose-400';
  } else if (type === 'info') {
    toastIcon.className = 'fa-solid fa-circle-info text-sky-400';
  } else {
    toastIcon.className = 'fa-solid fa-circle-check text-emerald-400';
  }

  toast.classList.remove('opacity-0', '-translate-y-10', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-10', 'pointer-events-none');
  }, 3200);
}

function extractYouTubeID(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- 13. DOM READY INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Sync Profile info
  const nameEl = document.getElementById('profileDisplayName');
  const uidEl = document.getElementById('profileUserId');
  const avatarEl = document.getElementById('avatarDisplay');
  if (nameEl) nameEl.innerText = currentUser.name;
  if (uidEl) uidEl.innerText = `UID: ${currentUser.uid}`;
  if (avatarEl) avatarEl.innerText = currentUser.name.charAt(0).toUpperCase();

  // Run modules
  initCreditSystem();
  listenToPosts();
  initChatEngine();
  initAutoAds();
});