'use strict';

/* Dashboard: greeting, task overview, calendar, upcoming tasks. */
(async () => {
  const user = await App.initPage('dashboard');
  const { escapeHtml, STATUS } = App;
  const $ = id => document.getElementById(id);

  const WEEKDAYS = [['Mon', 'M'], ['Tue', 'T'], ['Wed', 'W'], ['Thu', 'T'], ['Fri', 'F'], ['Sat', 'S'], ['Sun', 'S']];
  const UPCOMING_LIMIT = 6;

  const today = App.todayISO();
  const state = {
    courses: [],
    tasks: [],          // sorted by due date (from Api)
    selected: today,    // selected day in the calendar
    month: monthOf(today)
  };

  function monthOf(iso) {
    const d = App.parseISODate(iso);
    return { y: d.getFullYear(), m: d.getMonth() };
  }

  async function load() {
    try {
      const [courses, tasks] = await Promise.all([Api.getCourses(), Api.getTasks()]);
      state.courses = courses;
      state.tasks = tasks;
      render();
    } catch (err) {
      App.handleError(err, 'Could not load your tasks.');
    }
  }

  // ---------- helpers ----------

  const statusKey = task => STATUS[task.status].key;
  /** Calendar chips / dots show overdue in red, otherwise the status color. */
  const tintKey = task => (App.isOverdue(task) ? 'overdue' : statusKey(task));
  const badgeHtml = task => `<span class="badge" data-status="${statusKey(task)}">${STATUS[task.status].label}</span>`;

  function courseCode(task) {
    const c = state.courses.find(x => x.id === task.courseId);
    return c ? c.code : '—';
  }

  function tasksByDate() {
    const map = new Map();
    state.tasks.forEach(t => {
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate).push(t);
    });
    return map;
  }

  // ---------- render ----------

  function render() {
    renderHeader();
    renderOverview();
    renderCalendar();
    renderUpcoming();
  }

  function renderHeader() {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const firstName = user.name.trim().split(/\s+/)[0];
    $('today-long').textContent = App.formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' });
    $('greeting').textContent = `Good ${part}, ${firstName}`;

    const dueThisWeek = state.tasks.filter(t => {
      const d = App.daysUntil(t.dueDate);
      return t.status !== 'DONE' && d >= 0 && d < 7;
    }).length;
    const overdue = state.tasks.filter(App.isOverdue).length;
    $('dash-sub').textContent = state.tasks.length
      ? `You have ${App.plural(dueThisWeek, 'task')} due this week${overdue ? ` and ${overdue} overdue.` : '.'}`
      : 'No tasks yet. Add your first one to start planning.';

    $('setup-banner').hidden = state.courses.length > 0;
  }

  function renderOverview() {
    const counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    state.tasks.forEach(t => { counts[t.status] += 1; });
    const total = state.tasks.length;
    const overdue = state.tasks.filter(App.isOverdue).length;

    $('done-of-total').textContent = `${counts.DONE} of ${App.plural(total, 'task')} done`;

    const bar = $('stackbar');
    bar.setAttribute('aria-label', `${counts.DONE} done, ${counts.IN_PROGRESS} in progress, ${counts.TODO} to do`);
    const widths = { done: counts.DONE, progress: counts.IN_PROGRESS, todo: counts.TODO };
    bar.querySelectorAll('.stackbar__seg').forEach(seg => {
      const n = widths[seg.dataset.status];
      seg.hidden = n === 0;
      seg.style.width = total ? (n / total * 100) + '%' : '0';
    });

    const tiles = [
      ['todo', 'To Do', counts.TODO, 'tasks.html?group=status'],
      ['progress', 'In Progress', counts.IN_PROGRESS, 'tasks.html?group=status'],
      ['done', 'Done', counts.DONE, 'tasks.html?group=status'],
      ['overdue', 'Overdue', overdue, 'tasks.html?group=status&overdue=1']
    ];
    $('stat-grid').innerHTML = tiles.map(([key, label, n, href]) => `
      <a class="stat" data-status="${key}" href="${href}">
        <span class="badge" data-status="${key}">${label}</span>
        <span class="stat__num">${n}</span>
      </a>`).join('');
  }

  function renderCalendar() {
    const { y, m } = state.month;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    const byDate = tasksByDate();

    $('cal-title').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let html = WEEKDAYS.map(([long, short]) =>
      `<div class="cal__wd" aria-hidden="true"><span class="wd-long">${long}</span><span class="wd-short">${short}</span></div>`).join('');

    for (let i = 0; i < cellCount; i++) {
      const date = new Date(y, m, 1 - offset + i);
      const iso = App.toISODate(date);
      const list = byDate.get(iso) || [];
      const isSelected = iso === state.selected;
      const cls = ['cal__cell'];
      if (date.getMonth() !== m) cls.push('is-outside');
      if (iso === today) cls.push('is-today');
      if (isSelected) cls.push('is-selected');

      const label = App.formatDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
        + (iso === today ? ', today' : '')
        + (list.length ? ', ' + App.plural(list.length, 'task') : '');
      const chips = list.slice(0, 2).map(t =>
        `<span class="chip" data-status="${tintKey(t)}">${escapeHtml(t.title)}</span>`).join('');
      const more = list.length > 2 ? `<span class="cal__more">+${list.length - 2} more</span>` : '';
      const dots = list.slice(0, 3).map(t => `<span class="dot" data-status="${tintKey(t)}"></span>`).join('');

      html += `
        <button type="button" class="${cls.join(' ')}" data-action="select-day" data-date="${iso}"
          aria-pressed="${isSelected}" aria-label="${escapeHtml(label)}" tabindex="${isSelected ? 0 : -1}">
          <span class="cal__num" aria-hidden="true">${date.getDate()}</span>
          <span class="cal__chips" aria-hidden="true">${chips}${more}</span>
          <span class="cal__dots" aria-hidden="true">${dots}</span>
        </button>`;
    }
    $('cal-grid').innerHTML = html;
    // Keep the grid reachable with Tab when the selected day is in another month.
    if (!$('cal-grid').querySelector('[tabindex="0"]')) {
      const firstDay = $('cal-grid').querySelector(`[data-date="${App.toISODate(first)}"]`);
      if (firstDay) firstDay.tabIndex = 0;
    }

    // Selected day list
    const sel = state.selected;
    $('sel-label').textContent = (sel === today ? 'Today · ' : '')
      + App.formatDate(sel, { weekday: 'long', month: 'short', day: 'numeric' });
    const list = byDate.get(sel) || [];
    $('sel-list').innerHTML = list.length
      ? list.map(t => `
          <button type="button" class="day-row" data-action="edit-task" data-id="${t.id}" title="Edit task">
            <span class="tag tag--on-raised">${escapeHtml(courseCode(t))}</span>
            <span class="day-row__title${t.status === 'DONE' ? ' is-done' : ''}">${escapeHtml(t.title)}</span>
            ${badgeHtml(t)}
          </button>`).join('')
      : '<p class="day-empty">Nothing due on this day.</p>';
  }

  function renderUpcoming() {
    const open = state.tasks.filter(t => t.status !== 'DONE');
    if (!open.length) {
      $('upcoming-list').innerHTML = `
        <div class="empty empty--sm">
          <span class="empty__icon empty__icon--done" aria-hidden="true"><span class="empty__ring"></span></span>
          <div class="empty__title">You’re all caught up</div>
          <div class="empty__text">No upcoming deadlines. Add a task to plan your week.</div>
        </div>`;
      return;
    }
    $('upcoming-list').innerHTML = open.slice(0, UPCOMING_LIMIT).map(t => {
      const due = App.dueInfo(t);
      return `
        <div class="up-row">
          <button type="button" class="check" role="checkbox" aria-checked="false"
            data-action="mark-done" data-id="${t.id}" aria-label="Mark “${escapeHtml(t.title)}” as done"></button>
          <div class="up-row__body">
            <button type="button" class="text-btn" data-action="edit-task" data-id="${t.id}" title="Edit task">${escapeHtml(t.title)}</button>
            <span class="up-row__meta">
              <span class="tag">${escapeHtml(courseCode(t))}</span>
              <span class="due" data-tone="${due.tone}">${due.label}</span>
            </span>
          </div>
          ${badgeHtml(t)}
        </div>`;
    }).join('');
  }

  // ---------- calendar navigation ----------

  function selectDay(iso, focus) {
    state.selected = iso;
    const target = monthOf(iso);
    if (target.y !== state.month.y || target.m !== state.month.m) state.month = target;
    renderCalendar();
    if (focus) {
      const cell = $('cal-grid').querySelector(`[data-date="${iso}"]`);
      if (cell) cell.focus();
    }
  }

  function shiftMonth(delta) {
    const d = new Date(state.month.y, state.month.m + delta, 1);
    state.month = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  }

  // Arrow keys move the selected day (one tab stop for the whole grid).
  $('cal-grid').addEventListener('keydown', e => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const cell = e.target.closest('.cal__cell');
    if (!step || !cell) return;
    e.preventDefault();
    selectDay(App.addDays(cell.dataset.date, step), true);
  });

  // ---------- actions ----------

  const findTask = id => state.tasks.find(t => t.id === Number(id));

  $('main').addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'add-task':
        App.openTaskForm({ courses: state.courses, defaults: { dueDate: state.selected }, onSaved: load });
        break;
      case 'add-course':
        App.openCourseForm({ onSaved: load });
        break;
      case 'edit-task': {
        const task = findTask(el.dataset.id);
        if (task) App.openTaskForm({ task, courses: state.courses, onSaved: load });
        break;
      }
      case 'mark-done': {
        el.disabled = true;
        try {
          await Api.updateTaskStatus(Number(el.dataset.id), 'DONE');
          App.toast('Marked as done');
          await load();
        } catch (err) {
          el.disabled = false;
          App.handleError(err);
        }
        break;
      }
      case 'select-day':
        selectDay(el.dataset.date, true);
        break;
      case 'cal-prev':
        shiftMonth(-1);
        break;
      case 'cal-next':
        shiftMonth(1);
        break;
      case 'cal-today':
        selectDay(today, false);
        break;
      default:
        break;
    }
  });

  await load();
})();
