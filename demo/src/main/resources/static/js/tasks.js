'use strict';

/*
 * Tasks: Group by Status (board) or Course (list), course filter and "Overdue only".
 * All three work together. They are kept in the URL (?group=&course=&overdue=1),
 * so a refresh or a link from the Dashboard keeps the same view.
 */
(async () => {
  await App.initPage('tasks');
  const { escapeHtml, STATUS, STATUS_ORDER } = App;
  const $ = id => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const state = {
    courses: [],
    tasks: [],
    group: params.get('group') === 'course' ? 'course' : 'status',
    filter: params.get('course') || 'all',   // 'all' or a course id (string)
    overdueOnly: params.get('overdue') === '1'
  };

  async function load() {
    try {
      const [courses, tasks] = await Promise.all([Api.getCourses(), Api.getTasks()]);
      state.courses = courses;
      state.tasks = tasks;
      if (state.filter !== 'all' && !courses.some(c => String(c.id) === state.filter)) {
        state.filter = 'all';
        syncUrl();
      }
      render();
    } catch (err) {
      App.handleError(err, 'Could not load your tasks.');
    }
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.group !== 'status') p.set('group', state.group);
    if (state.filter !== 'all') p.set('course', state.filter);
    if (state.overdueOnly) p.set('overdue', '1');
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  // ---------- helpers ----------

  const statusKey = task => STATUS[task.status].key;
  const courseById = id => state.courses.find(c => c.id === id);

  /** Tasks after the course filter and the "Overdue only" toggle. */
  function visibleTasks() {
    return state.tasks.filter(t =>
      (state.filter === 'all' || String(t.courseId) === state.filter)
      && (!state.overdueOnly || App.isOverdue(t)));
  }

  function statusSelectHtml(task) {
    const options = STATUS_ORDER.map(s =>
      `<option value="${s}"${s === task.status ? ' selected' : ''}>${STATUS[s].label}</option>`).join('');
    return `<select class="status-select" data-status="${statusKey(task)}" data-action="status" data-id="${task.id}"
      aria-label="Status of “${escapeHtml(task.title)}”">${options}</select>`;
  }

  function editDeleteHtml(task, raised) {
    const mod = raised ? ' btn-ghost-sm--raised' : '';
    return `
      <button type="button" class="btn-ghost-sm${mod}" data-action="edit" data-id="${task.id}" aria-label="Edit “${escapeHtml(task.title)}”">Edit</button>
      <button type="button" class="btn-ghost-sm${mod} btn-ghost-sm--danger" data-action="delete" data-id="${task.id}" aria-label="Delete “${escapeHtml(task.title)}”">Delete</button>`;
  }

  const titleClass = task => (task.status === 'DONE' ? ' is-done' : '');

  // ---------- render ----------

  function render() {
    renderHeader();
    renderToolbar();

    const noTasks = state.tasks.length === 0;
    $('tasks-empty').hidden = !noTasks;
    $('task-view').hidden = noTasks;
    if (noTasks) {
      const hasCourses = state.courses.length > 0;
      $('tasks-empty-text').textContent = hasCourses
        ? 'Add assignments, readings and exams with due dates so nothing slips.'
        : 'Tasks belong to a course. Add a course first, then create tasks for it.';
      $('tasks-empty-cta').textContent = hasCourses ? 'Add task' : 'Add course';
      return;
    }
    $('task-view').innerHTML = state.group === 'status' ? boardHtml() : byCourseHtml();
  }

  function renderHeader() {
    const total = state.tasks.length;
    const open = state.tasks.filter(t => t.status !== 'DONE').length;
    const overdue = state.tasks.filter(App.isOverdue).length;
    $('tasks-sub').textContent = total
      ? `${open} open · ${overdue} overdue`
      : 'Track assignments, readings and exams.';
  }

  function renderToolbar() {
    document.querySelectorAll('[data-action=group]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.group === state.group));
    });

    const select = $('course-filter');
    select.innerHTML = [{ value: 'all', label: 'All courses' }]
      .concat(state.courses.map(c => ({ value: String(c.id), label: c.code + ' — ' + c.name })))
      .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
    select.value = state.filter;

    const overdueCount = state.tasks.filter(App.isOverdue).length;
    const toggle = $('overdue-toggle');
    toggle.setAttribute('aria-pressed', String(state.overdueOnly));
    toggle.textContent = `Overdue only (${overdueCount})`;
  }

  function boardHtml() {
    const tasks = visibleTasks();
    const columns = STATUS_ORDER.map(status => {
      const items = tasks.filter(t => t.status === status);
      const key = STATUS[status].key;
      const body = items.length
        ? items.map(taskCardHtml).join('')
        : '<div class="board__empty">No tasks here</div>';
      return `
        <section class="board__col" aria-label="${STATUS[status].label}, ${App.plural(items.length, 'task')}">
          <div class="board__head">
            <span class="badge badge--lg" data-status="${key}">${STATUS[status].label}</span>
            <span class="board__count">${items.length}</span>
          </div>
          ${body}
        </section>`;
    }).join('');
    return `<div class="board">${columns}</div>`;
  }

  function taskCardHtml(task) {
    const due = App.dueInfo(task);
    const course = courseById(task.courseId);
    return `
      <article class="task-card">
        <div class="task-card__top">
          <span class="tag tag--on-raised">${escapeHtml(course ? course.code : '—')}</span>
          <div class="task-card__actions">${editDeleteHtml(task, true)}</div>
        </div>
        <h3 class="task-card__title${titleClass(task)}">${escapeHtml(task.title)}</h3>
        <div class="task-card__bottom">
          <span class="due" data-tone="${due.tone}">${due.label}</span>
          ${statusSelectHtml(task)}
        </div>
      </article>`;
  }

  function byCourseHtml() {
    const tasks = visibleTasks();
    const courses = state.courses.filter(c => state.filter === 'all' || String(c.id) === state.filter);
    return `<div class="stack">${courses.map(c => {
      const items = tasks.filter(t => t.courseId === c.id);
      const rows = items.length
        ? items.map(taskRowHtml).join('')
        : '<p class="course-group__empty">No tasks for this course.</p>';
      return `
        <section class="course-group">
          <div class="course-group__head">
            <span class="tag">${escapeHtml(c.code)}</span>
            <h2 class="course-group__name">${escapeHtml(c.name)}</h2>
            <span class="course-group__count">${App.plural(items.length, 'task')}</span>
          </div>
          ${rows}
        </section>`;
    }).join('')}</div>`;
  }

  function taskRowHtml(task) {
    const due = App.dueInfo(task);
    const done = task.status === 'DONE';
    return `
      <div class="task-row">
        <button type="button" class="check" role="checkbox" aria-checked="${done}" data-action="toggle-done" data-id="${task.id}"
          aria-label="Done: ${escapeHtml(task.title)}">${done ? '✓' : ''}</button>
        <div class="task-row__body">
          <span class="task-row__title${titleClass(task)}">${escapeHtml(task.title)}</span>
          <span class="due" data-tone="${due.tone}">${due.label}</span>
        </div>
        <div class="task-row__actions">
          ${statusSelectHtml(task)}
          ${editDeleteHtml(task, false)}
        </div>
      </div>`;
  }

  // ---------- actions ----------

  const findTask = id => state.tasks.find(t => t.id === Number(id));

  /** Re-render, then put focus back on the same control (its task may have moved column). */
  async function reloadKeepingFocus(action, id) {
    await load();
    const el = document.querySelector(`[data-action="${action}"][data-id="${id}"]`);
    if (el) el.focus();
  }

  async function setStatus(task, status, control) {
    if (control) control.disabled = true;
    try {
      await Api.updateTaskStatus(task.id, status);
      if (status === 'DONE' && task.status !== 'DONE') App.toast('Marked as done');
      await reloadKeepingFocus(control ? control.dataset.action : '', task.id);
    } catch (err) {
      if (control) control.disabled = false;
      App.handleError(err);
      await load();
    }
  }

  function openAddTask() {
    App.openTaskForm({
      courses: state.courses,
      defaults: { courseId: state.filter !== 'all' ? Number(state.filter) : '' },
      onSaved: load
    });
  }

  $('main').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT') return;
    const task = el.dataset.id ? findTask(el.dataset.id) : null;

    switch (el.dataset.action) {
      case 'add-task':
        if (state.courses.length) openAddTask();
        else App.openCourseForm({ onSaved: load });
        break;
      case 'group':
        state.group = el.dataset.group;
        syncUrl();
        render();
        break;
      case 'toggle-overdue':
        state.overdueOnly = !state.overdueOnly;
        syncUrl();
        render();
        break;
      case 'toggle-done':
        if (task) setStatus(task, task.status === 'DONE' ? 'TODO' : 'DONE', el);
        break;
      case 'edit':
        if (task) App.openTaskForm({ task, courses: state.courses, onSaved: load });
        break;
      case 'delete':
        if (task) {
          App.confirmDelete({
            title: 'Delete task?',
            message: `“${task.title}” will be permanently removed.`,
            confirmLabel: 'Delete task',
            onConfirm: async () => {
              await Api.deleteTask(task.id);
              App.toast('Task deleted', 'danger');
              await load();
            }
          });
        }
        break;
      default:
        break;
    }
  });

  $('main').addEventListener('change', e => {
    if (e.target.id === 'course-filter') {
      state.filter = e.target.value;
      syncUrl();
      render();
    } else if (e.target.dataset.action === 'status') {
      const task = findTask(e.target.dataset.id);
      if (task) setStatus(task, e.target.value, e.target);
    }
  });

  syncUrl();
  await load();
})();
