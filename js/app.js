// ================================================================
// MyDesk — Main App Logic
// ================================================================

const STORAGE_KEYS = {
  docs: '마이데스크_docs',
  tasks: '마이데스크_tasks',
  calendar: '마이데스크_calendar',
  mood: '마이데스크_mood',
  pomoCount: '마이데스크_pomo_count'
};

let documents = JSON.parse(localStorage.getItem(STORAGE_KEYS.docs)) || [];
let tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks)) || [];
let calendarEvents = JSON.parse(localStorage.getItem(STORAGE_KEYS.calendar)) || {};
let userMood = localStorage.getItem(STORAGE_KEYS.mood) || '';
let pomoCount = parseInt(localStorage.getItem(STORAGE_KEYS.pomoCount) || '0');

let activeDocId = documents[0]?.id || null;
let cloudSyncTimeout = null;

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const welcomeScreen = document.getElementById('welcome-screen');
  const mainContainer = document.getElementById('main-container');
  const idInput = document.getElementById('dotori-id-input');
  const loginBtn = document.getElementById('login-btn');

  // Check for existing session
  let profile = null;
  try { profile = await DotoriStorage.getMyAcorn(); } catch (e) {}

  if (profile) {
    welcomeScreen.style.display = 'none';
    mainContainer.style.display = 'block';
    bootApp();
  } else {
    welcomeScreen.style.display = 'flex';
    mainContainer.style.display = 'none';

    async function attemptLogin() {
      const id = idInput.value.trim().toLowerCase();
      if (!id) { alert('도토리 ID를 입력해주세요.'); return; }

      loginBtn.disabled = true;
      loginBtn.innerText = '불러오는 중...';

      try {
        const result = await DotoriStorage.loginByDotoriId(id);
        if (result) {
          welcomeScreen.style.display = 'none';
          mainContainer.style.display = 'block';
          bootApp();
        } else {
          alert('그런 도토리를 찾을 수 없어요: ' + id);
        }
      } catch (err) {
        console.error(err);
        alert('로그인 실패: ' + (err.message || '알 수 없는 오류'));
      } finally {
        loginBtn.disabled = false;
        loginBtn.innerText = '🌰 들어가기';
      }
    }

    loginBtn.addEventListener('click', attemptLogin);
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptLogin();
    });
    idInput.focus();
  }

  function bootApp() {
    initAuth();
    updateProfileChip();
    updateSidebarAvatar();
    initEditor();
    renderDocTree();
    loadActiveDoc();
    renderTasks();
    renderCalendar();
    updatePomoDisplay();

    // Redraw once more after first paint to prevent flicker
    requestAnimationFrame(() => {
      renderCalendar();
    });

    const moodInput = document.getElementById('userMood');
    if (moodInput) moodInput.value = userMood;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      }
    });

    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
    });
  }
});

async function initAuth() {
  const statusChip = document.getElementById('syncStatus');
  if (!statusChip) return;

  let profile = null;
  try {
    profile = await DotoriStorage.getMyAcorn();
  } catch (e) {
    console.warn('Auth check failed:', e);
  }

  if (!profile) {
    statusChip.innerHTML = '<i class="fa-solid fa-wifi" style="color:#999;"></i> 오프라인 모드';
    statusChip.title = '도토리숲에 로그인하면 자동 백업됩니다.';
    return;
  }

  statusChip.innerHTML = '<i class="fa-regular fa-circle-check"></i> 로컬 저장됨';
  statusChip.title = `${profile.nickname}님으로 동기화 중`;

  try {
    const cloudData = await DotoriStorage.loadMyDeskBackup();
    if (cloudData) {
      if (cloudData.documents) documents = cloudData.documents;
      if (cloudData.tasks) tasks = cloudData.tasks;
      if (cloudData.calendarEvents) calendarEvents = cloudData.calendarEvents;
      if (cloudData.userMood) userMood = cloudData.userMood;
      if (cloudData.pomoCount) pomoCount = cloudData.pomoCount;

      activeDocId = documents[0]?.id || null;
      saveToLocal();
      renderDocTree(); loadActiveDoc(); renderTasks(); renderCalendar(); updatePomoDisplay();
      const moodInput = document.getElementById('userMood');
      if (moodInput) moodInput.value = userMood;

      showToast('☁️ 클라우드 백업을 불러왔습니다.');
    }
  } catch (e) {
    console.warn('Cloud load failed:', e);
  }
}

// ================================================================
// CLOUD SYNC
// ================================================================
function triggerCloudSync() {
  if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);

  const statusChip = document.getElementById('syncStatus');
  if (statusChip) statusChip.innerHTML = '<i class="fa-solid fa-rotate" style="color:#E87BA8;"></i> 동기화 중...';

  cloudSyncTimeout = setTimeout(async () => {
    let profile = null;
    try { profile = await DotoriStorage.getMyAcorn(); } catch (e) {}
    if (!profile) return;

    const workspace = { documents, tasks, calendarEvents, userMood, pomoCount };
    const success = await DotoriStorage.saveMyDeskBackup(workspace);

    if (statusChip) {
      if (success) {
        statusChip.innerHTML = '<i class="fa-regular fa-circle-check" style="color:#4CAF50;"></i> 클라우드 동기화됨';
        setTimeout(() => {
          statusChip.innerHTML = '<i class="fa-regular fa-circle-check"></i> 로컬 저장됨';
        }, 500);
      } else {
        statusChip.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#C04040;"></i> 동기화 실패';
      }
    }
  }, 500);
}

function saveToLocal() {
  localStorage.setItem(STORAGE_KEYS.docs, JSON.stringify(documents));
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  localStorage.setItem(STORAGE_KEYS.calendar, JSON.stringify(calendarEvents));
  localStorage.setItem(STORAGE_KEYS.mood, userMood);
  localStorage.setItem(STORAGE_KEYS.pomoCount, pomoCount);
}

// ================================================================
// TAB SWITCHING
// ================================================================
window.switchTab = function(tab) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.workspace-view').forEach(v => v.style.display = 'none');
  const view = document.getElementById('view-' + tab);
  if (view) view.style.display = 'flex';

  renderSidebarContext(tab);
  if (tab === 'documents') { renderDocTree(); loadActiveDoc(); }
  if (tab === 'todo') renderTasks();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'pomodoro') updatePomoDisplay();
};

// ================================================================
// SIDEBAR CONTEXT
// ================================================================
function renderSidebarContext(tab) {
  const container = document.getElementById('sidebarContext');
  if (!container) return;

  if (tab === 'documents') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:11px;font-weight:bold;color:var(--acorn-dark);"><i class="fa-solid fa-file-lines" style="color:var(--pink-dark);"></i> 페이지</span>
        <button class="btn btn-primary" style="padding:4px 8px;font-size:10px;" onclick="createNewDocument()"><i class="fa-solid fa-plus"></i> 새로 만들기</button>
      </div>
      <div id="docTree" style="display:flex;flex-direction:column;gap:4px;"></div>
    `;
    renderDocTree();
  } else if (tab === 'todo') {
    const active = tasks.filter(t => !t.completed).length;
    const done = tasks.filter(t => t.completed).length;
    container.innerHTML = `
      <div style="font-size:11px;font-weight:bold;color:var(--acorn-dark);margin-bottom:10px;"><i class="fa-solid fa-list-check" style="color:var(--pink-dark);"></i> 요약</div>
      <div style="background:var(--cream);padding:12px;border-radius:6px;border:1px solid var(--cream-dark);font-size:11px;line-height:1.8;">
        <div><b>진행 중:</b> <span style="color:var(--pink-dark);font-weight:bold;">${active}</span></div>
        <div><b>완료:</b> <span style="color:#4CAF50;font-weight:bold;">${done}</span></div>
        <div><b>전체:</b> ${tasks.length}</div>
      </div>
    `;
  } else if (tab === 'calendar') {
    container.innerHTML = `
      <div style="font-size:11px;font-weight:bold;color:var(--acorn-dark);margin-bottom:10px;"><i class="fa-solid fa-calendar-days" style="color:var(--pink-dark);"></i> 빠른 이동</div>
      <div style="background:var(--cream);padding:10px;border-radius:6px;border:1px solid var(--cream-dark);font-size:11px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;">
          <button class="btn" style="padding:3px 8px;font-size:10px;" onclick="jumpMonth(-12)">-1년</button>
          <button class="btn" style="padding:3px 8px;font-size:10px;" onclick="jumpMonth(-1)">-1개월</button>
          <button class="btn btn-primary" style="padding:3px 8px;font-size:10px;" onclick="jumpToday()">오늘</button>
          <button class="btn" style="padding:3px 8px;font-size:10px;" onclick="jumpMonth(1)">+1개월</button>
          <button class="btn" style="padding:3px 8px;font-size:10px;" onclick="jumpMonth(12)">+1년</button>
        </div>
      </div>
    `;
  } else if (tab === 'pomodoro') {
    container.innerHTML = `
      <div style="font-size:11px;font-weight:bold;color:var(--acorn-dark);margin-bottom:10px;"><i class="fa-solid fa-clock" style="color:var(--pink-dark);"></i> 팁</div>
      <div style="background:var(--cream);padding:10px;border-radius:6px;border:1px solid var(--cream-dark);font-size:11px;line-height:1.7;">
        <div>🍅 25분 집중</div>
        <div>☕ 5분 휴식</div>
        <div>🔁 4회 반복</div>
        <div style="margin-top:8px;color:var(--acorn-dark);font-weight:bold;">화이팅! 💪</div>
      </div>
    `;
  }
}

// ================================================================
// DOCUMENTS
// ================================================================
function renderDocTree() {
  const container = document.getElementById('docTree');
  if (!container) return;
  container.innerHTML = '';

  if (documents.length === 0) {
    container.innerHTML = '<div style="font-size:11px;color:#999;text-align:center;padding:10px;">페이지가 없습니다.<br>새로 만들어보세요!</div>';
    return;
  }

  documents.forEach(doc => {
    const el = document.createElement('div');
    el.style.cssText = `padding:8px 10px;border-radius:5px;cursor:pointer;font-size:11px;transition:all 0.15s;${doc.id === activeDocId ? 'background:var(--cream);border-left:3px solid var(--pink);font-weight:bold;color:var(--acorn-dark);' : 'color:var(--text-light);border-left:3px solid transparent;'}`;
    el.innerHTML = `<i class="fa-solid fa-file-lines" style="font-size:10px;margin-right:6px;color:${doc.id === activeDocId ? 'var(--pink-dark)' : 'var(--border-dark)'};"></i>${escapeHtml(doc.title || '제목 없음')}`;
    el.onclick = () => switchDoc(doc.id);
    container.appendChild(el);
  });
}

window.createNewDocument = function() {
  const newDoc = { id: 'doc-' + Date.now(), title: '새 페이지', html: '', text: '' };
  documents.unshift(newDoc);
  activeDocId = newDoc.id;
  saveToLocal();
  renderDocTree();
  loadActiveDoc();
  triggerCloudSync();
  document.getElementById('rteEditor').focus();
};

function switchDoc(id) {
  autoSaveActiveDoc();
  activeDocId = id;
  renderDocTree();
  loadActiveDoc();
}

function loadActiveDoc() {
  const doc = documents.find(d => d.id === activeDocId);
  if (!doc) {
    document.getElementById('rteEditor').innerHTML = '';
    document.getElementById('activeDocTitle').value = '';
    return;
  }
  document.getElementById('activeDocTitle').value = doc.title || '';
  document.getElementById('rteEditor').innerHTML = doc.html || '';
}

function autoSaveActiveDoc() {
  const doc = documents.find(d => d.id === activeDocId);
  if (!doc) return;
  const editor = document.getElementById('rteEditor');
  doc.html = editor.innerHTML;
  doc.text = editor.innerText || '';
  saveToLocal();
  triggerCloudSync();
}

window.updateActiveTitle = function(val) {
  const doc = documents.find(d => d.id === activeDocId);
  if (doc) { doc.title = val; saveToLocal(); renderDocTree(); triggerCloudSync(); }
};

window.deleteActiveDocument = function() {
  if (documents.length <= 1) { showToast('⚠️ 최소 한 개의 페이지는 남겨두어야 해요.'); return; }
  if (!confirm('이 페이지를 삭제할까요?')) return;
  documents = documents.filter(d => d.id !== activeDocId);
  activeDocId = documents[0].id;
  saveToLocal();
  renderDocTree();
  loadActiveDoc();
  triggerCloudSync();
};

function initEditor() {
  const editor = document.getElementById('rteEditor');
  if (!editor) return;
  editor.addEventListener('input', () => { autoSaveActiveDoc(); });
  editor.addEventListener('blur', () => { autoSaveActiveDoc(); });
}

window.rteExec = function(cmd, val = null) {
  document.execCommand(cmd, false, val);
  document.getElementById('rteEditor').focus();
  autoSaveActiveDoc();
};

window.rteInsertLink = function() {
  const url = prompt('링크 주소를 입력하세요:');
  if (url) rteExec('createLink', url);
};

window.rteInsertCallout = function() {
  rteExec('insertHTML', '<blockquote class="callout">💡 메모: 여기에 팁을 적어보세요...</blockquote><p><br></p>');
};

window.rteInsertHR = function() {
  rteExec('insertHTML', '<hr style="border:none;border-top:1px solid #CCCCCC;margin:1em 0;"><p><br></p>');
};

// Update toolbar button active states
document.addEventListener('selectionchange', () => {
  const editor = document.getElementById('rteEditor');
  if (!editor) return;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  // Only update if selection is inside the editor
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  ['bold', 'italic', 'underline', 'strikeThrough'].forEach(cmd => {
    const btn = document.querySelector(`.rte-toolbar button[onclick*="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
});

// ================================================================
// TASKS
// ================================================================
function renderTasks() {
  const container = document.getElementById('taskList');
  if (!container) return;
  if (tasks.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:12px;">할 일이 없습니다. 새로운 할 일을 추가해보세요!</div>';
    return;
  }
  container.innerHTML = '';
  tasks.forEach(task => {
    const el = document.createElement('div');
    el.className = `task-item ${task.completed ? 'completed' : ''}`;
    const pc = task.priority === 'High' ? 'task-priority-high' : task.priority === 'Medium' ? 'task-priority-medium' : 'task-priority-low';
    el.innerHTML = `
      <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask('${task.id}')">
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span class="task-tag ${pc}">${task.priority}</span>
          <span class="task-tag">${escapeHtml(task.category)}</span>
          ${task.due ? `<span class="task-tag">📅 ${escapeHtml(task.due)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn" style="padding:4px 8px;font-size:10px;" onclick="editTask('${task.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:10px;" onclick="deleteTask('${task.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;
    container.appendChild(el);
  });
}

window.toggleTask = function(id) {
  const task = tasks.find(t => t.id === id);
  if (task) { task.completed = !task.completed; saveToLocal(); renderTasks(); triggerCloudSync(); }
};

window.openTaskModal = function() {
  document.getElementById('taskModalTitle').innerText = '할 일 추가';
  document.getElementById('taskId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskPriority').value = 'Medium';
  document.getElementById('taskCategory').value = '일반';
  document.getElementById('taskDue').value = '';
  document.getElementById('taskModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskTitle').focus(), 50);
};

window.editTask = function(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  document.getElementById('taskModalTitle').innerText = '할 일 수정';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskCategory').value = task.category;
  document.getElementById('taskDue').value = task.due || '';
  document.getElementById('taskModal').classList.remove('hidden');
};

window.closeTaskModal = function() {
  document.getElementById('taskModal').classList.add('hidden');
};

window.saveTask = function() {
  const id = document.getElementById('taskId').value;
  const title = document.getElementById('taskTitle').value.trim();
  const priority = document.getElementById('taskPriority').value;
  const category = document.getElementById('taskCategory').value.trim() || '일반';
  const due = document.getElementById('taskDue').value.trim();
  if (!title) { showToast('⚠️ 제목을 입력해주세요'); return; }
  if (id) {
    const task = tasks.find(t => t.id === id);
    if (task) { task.title = title; task.priority = priority; task.category = category; task.due = due; }
  } else {
    tasks.unshift({ id: 'task-' + Date.now(), title, priority, category, completed: false, due });
  }
  saveToLocal(); closeTaskModal(); renderTasks(); triggerCloudSync();
};

window.deleteTask = function(id) {
  if (!confirm('이 할 일을 삭제할까요?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveToLocal(); renderTasks(); triggerCloudSync();
};

// ================================================================
// CALENDAR
// ================================================================
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const title = document.getElementById('calMonthTitle');
  if (!grid || !title) return;

  title.innerText = `${calYear}년 ${MONTHS[calMonth]}`;
  grid.innerHTML = '';

  ['일','월','화','수','목','금','토'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.innerText = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = `cal-cell ${key === todayStr ? 'today' : ''}`;
    const event = calendarEvents[key] ? String(calendarEvents[key]) : '';
    cell.innerHTML = `
      <div class="cal-day-num">${d}</div>
      ${event ? `<div class="cal-dot"></div><div class="cal-event">${escapeHtml(event)}</div>` : ''}
    `;
    cell.onclick = () => openCalModal(key);
    grid.appendChild(cell);
  }
}

window.changeMonth = function(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  else if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
};

window.jumpMonth = function(n) { changeMonth(n); };

window.jumpToday = function() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
};

window.openCalModal = function(key) {
  document.getElementById('calDateKey').value = key;
  document.getElementById('calModalTitle').innerText = key;
  document.getElementById('calText').value = calendarEvents[key] ? String(calendarEvents[key]) : '';
  document.getElementById('calModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('calText').focus(), 50);
};

window.closeCalModal = function() {
  document.getElementById('calModal').classList.add('hidden');
};

window.saveCalEvent = function() {
  const key = document.getElementById('calDateKey').value;
  const val = document.getElementById('calText').value.trim();
  if (val) calendarEvents[key] = val;
  else delete calendarEvents[key];
  saveToLocal();
  closeCalModal(); renderCalendar(); triggerCloudSync();
};

// ================================================================
// POMODORO
// ================================================================
let pomoSeconds = 25 * 60;
let pomoTimer = null;
let pomoRunning = false;
let pomoMode = 'work';

window.setPomoMode = function(mode) {
  pomoMode = mode;
  if (pomoTimer) { clearInterval(pomoTimer); pomoRunning = false; }
  document.querySelectorAll('.pomo-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'work') pomoSeconds = 25 * 60;
  if (mode === 'shortBreak') pomoSeconds = 5 * 60;
  if (mode === 'longBreak') pomoSeconds = 15 * 60;
  updatePomoDisplay();
  document.getElementById('pomoStart').classList.remove('hidden');
  document.getElementById('pomoPause').classList.add('hidden');
  document.getElementById('pomoStatus').innerText = '집중할 준비 완료';
};

function updatePomoDisplay() {
  const m = Math.floor(pomoSeconds / 60);
  const s = pomoSeconds % 60;
  document.getElementById('pomoClock').innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  document.getElementById('pomoCount').innerText = pomoCount;
}

window.startPomodoro = function() {
  if (pomoRunning) return;
  pomoRunning = true;
  document.getElementById('pomoStart').classList.add('hidden');
  document.getElementById('pomoPause').classList.remove('hidden');
  document.getElementById('pomoStatus').innerText = pomoMode === 'work' ? '집중할 시간!' : '휴식 시간!';
  pomoTimer = setInterval(() => {
    pomoSeconds--;
    updatePomoDisplay();
    if (pomoSeconds <= 0) {
      clearInterval(pomoTimer);
      pomoRunning = false;
      playChime();
      if (pomoMode === 'work') {
        pomoCount++;
        saveToLocal();
        triggerCloudSync();
        showToast('🎉 집중 완료! 휴식하세요.');
        setPomoMode('shortBreak');
      } else {
        showToast('☕ 휴식 끝! 다시 집중해볼까요?');
        setPomoMode('work');
      }
    }
  }, 1000);
};

window.pausePomodoro = function() {
  if (!pomoRunning) return;
  clearInterval(pomoTimer);
  pomoRunning = false;
  document.getElementById('pomoStart').classList.remove('hidden');
  document.getElementById('pomoPause').classList.add('hidden');
  document.getElementById('pomoStatus').innerText = '일시정지';
};

window.resetPomodoro = function() {
  if (pomoTimer) { clearInterval(pomoTimer); pomoRunning = false; }
  setPomoMode(pomoMode);
};

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.3);
  } catch (e) {}
}

// ================================================================
// HELPERS
// ================================================================
window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

window.showToast = function(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};

window.saveMood = function(val) {
  userMood = val;
  saveToLocal();
  triggerCloudSync();
};

window.logoutMyDesk = async function() {
  if (!confirm('로그아웃하시겠어요?')) return;
  try { await DotoriStorage.logout(); } catch (e) {}
  localStorage.removeItem('dotori_my_id');
  localStorage.removeItem('dotori_session');
  location.reload();
};

async function updateProfileChip() {
  const chip = document.getElementById('profileChip');
  if (!chip) return;
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (profile) {
      const emoji = profile.mini_me || '🌰';
      chip.innerText = `${emoji} ${profile.nickname}`;
      chip.title = profile.dotori_id;
    } else {
      chip.style.display = 'none';
    }
  } catch (e) {
    chip.style.display = 'none';
  }
}

async function updateSidebarAvatar() {
  const box = document.getElementById('avatarBox');
  if (!box) return;
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (!profile) return;

    if (profile.mini_me_image_url) {
      box.innerHTML = '<img src="' + profile.mini_me_image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;display:block;">';
    } else if (profile.mini_me) {
      box.innerText = profile.mini_me;
    }
  } catch (e) {
    // Keep the default emoji
  }
}