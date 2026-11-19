'use strict';

/**
 * Shared helpers used by every page:
 * auth guard, navbar + mobile tab bar, modal / confirm dialog, toast,
 * date helpers, form error helpers, and the ONE grade calculation.
 * Pages get data only through Api (js/api.js).
 */
const App = (() => {
  // ==========================================================================
  // Constants
  // ==========================================================================

  /** Status value -> label and badge key (CSS uses data-status="todo|progress|done|overdue"). */
  const STATUS = {
    TODO: { label: 'To Do', key: 'todo' },
    IN_PROGRESS: { label: 'In Progress', key: 'progress' },
    DONE: { label: 'Done', key: 'done' }
  };
  const STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'DONE'];

  const TYPE_LABEL = { COURSEWORK: 'Coursework', MIDTERM: 'Midterm', FINAL: 'Final' };
  const TYPE_ORDER = ['COURSEWORK', 'MIDTERM', 'FINAL'];

  /**
   * Default grade scale for new courses. Each course stores its own copy (course.gradeScale).
   * Highest first; the last entry (F) is always 0 = "below D". Letters are fixed, only minPercent is editable.
   */
  const DEFAULT_GRADE_SCALE = [
    { letter: 'A', minPercent: 80 }, { letter: 'B+', minPercent: 75 }, { letter: 'B', minPercent: 70 },
    { letter: 'C+', minPercent: 65 }, { letter: 'C', minPercent: 60 }, { letter: 'D+', minPercent: 55 },
    { letter: 'D', minPercent: 50 }, { letter: 'F', minPercent: 0 }
  ];

  const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', href: 'index.html', icon: '<span class="ti-dash"><span></span><span></span><span></span><span></span></span>' },
    { key: 'courses', label: 'Courses', href: 'courses.html', icon: '<span class="ti-courses"></span>' },
    { key: 'tasks', label: 'Tasks', href: 'tasks.html', icon: '<span class="ti-tasks"></span>' },
    { key: 'grades', label: 'Grades', href: 'grades.html', icon: '<span class="ti-grades"><span></span><span></span><span></span></span>' }
  ];

  // ==========================================================================
  // HTML helpers
  // ==========================================================================

  /** Escape user text before putting it into innerHTML. */
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  /** App logo (clipboard + clock). Each inlined copy needs a unique mask id. */
  function logoSvg(size, maskId) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><mask id="${maskId}"><rect width="24" height="24" fill="#fff" stroke="none"></rect><circle cx="18" cy="18" r="5.2" fill="#000" stroke="none"></circle></mask><g mask="url(#${maskId})"><path d="M8.5 4H6.5a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"></path><rect x="8.5" y="2.5" width="6" height="3" rx="1"></rect><rect x="7.25" y="7.25" width="2.5" height="2.5" rx=".5"></rect><rect x="7.25" y="11.25" width="2.5" height="2.5" rx=".5"></rect><rect x="7.25" y="15.25" width="2.5" height="2.5" rx=".5"></rect><path d="M12 8.5h3.5M12 12.5h3.5M12 16.5h.8"></path></g><circle cx="18" cy="18" r="3.9"></circle><path d="M18 16v2.1l1.3 1.1"></path></svg>`;
  }

  // ==========================================================================
  // Dates (always the real current date of this machine)
  // ==========================================================================

  function toISODate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function todayISO() {
    return toISODate(new Date());
  }

  /** 'YYYY-MM-DD' (or a full ISO date-time) -> local Date at midnight. */
  function parseISODate(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(iso, days) {
    const d = parseISODate(iso);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  /** Whole days from today until the date (negative = in the past). */
  function daysUntil(iso) {
    return Math.round((parseISODate(iso) - parseISODate(todayISO())) / 864e5);
  }

  function formatDate(iso, options = { month: 'short', day: 'numeric' }) {
    return parseISODate(iso).toLocaleDateString('en-US', options);
  }

  /** Overdue is derived, never stored: not done and the due date has passed. */
  function isOverdue(task) {
    return task.status !== 'DONE' && daysUntil(task.dueDate) < 0;
  }

  /** Due label and tone ('danger' | 'warn' | 'muted') for a task. */
  function dueInfo(task) {
    const d = daysUntil(task.dueDate);
    if (task.status === 'DONE') return { label: 'Due ' + formatDate(task.dueDate), tone: 'muted' };
    if (d < 0) return { label: 'Overdue by ' + plural(-d, 'day'), tone: 'danger' };
    if (d === 0) return { label: 'Due today', tone: 'warn' };
    if (d === 1) return { label: 'Due tomorrow', tone: 'warn' };
    if (d < 7) return { label: 'Due in ' + d + ' days · ' + formatDate(task.dueDate, { weekday: 'short' }), tone: 'muted' };
    return { label: 'Due ' + formatDate(task.dueDate), tone: 'muted' };
  }

  // ==========================================================================
  // Toast + messages carried to the next page
  // ==========================================================================

  let toastTimer = null;

  /** kind: 'success' (green) | 'danger' (red) | 'info' (accent) | 'muted' (gray) */
  function toast(message, kind = 'success') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="toast__dot" aria-hidden="true"></span><span class="toast__msg"></span>';
      el.hidden = true;
      document.body.append(el);
    }
    el.dataset.kind = kind;
    el.querySelector('.toast__msg').textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  const FLASH_KEY = 'studyplanner.flash';

  /** Show a toast on the NEXT page (e.g. after login or logout redirects). */
  function flashNext(message, kind = 'success') {
    try {
      sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, kind }));
    } catch (e) { /* storage blocked: skip the message */ }
  }

  function showPendingFlash() {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FLASH_KEY);
      const { message, kind } = JSON.parse(raw);
      toast(message, kind);
    } catch (e) { /* ignore */ }
  }

  /** Show an API error to the user. 401 is handled by api.js (redirect to login). */
  function handleError(err, fallback = 'Something went wrong. Please try again.') {
    if (err && err.status === 401) return;
    console.error(err);
    toast(err && err.status ? err.message : fallback, 'danger');
  }

  // ==========================================================================
  // Auth guard + navbar
  // ==========================================================================

  /** Resolves with the logged-in user, or sends the browser to login.html. */
  async function requireAuth() {
    let user = null;
    try {
      user = await Api.getCurrentUser();
    } catch (e) {
      user = null;
    }
    if (!user) {
      location.replace('login.html');
      return new Promise(() => {}); // never resolves: the page stops here
    }
    return user;
  }

  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  /** Inject the top navbar and the mobile bottom tab bar (identical on every page). */
  function renderNav(activeKey, user) {
    const links = NAV_ITEMS.map(item => `
      <a class="nav__link" href="${item.href}"${item.key === activeKey ? ' aria-current="page"' : ''}>${item.label}</a>`).join('');

    const header = document.createElement('header');
    header.className = 'nav';
    header.innerHTML = `
      <div class="nav__inner">
        <a class="brand" href="index.html" aria-label="Study Planner, go to Dashboard">
          <span class="logo-tile">${logoSvg(20, 'logo-nav')}</span>
          <span class="brand__name">Study Planner</span>
        </a>
        <nav class="nav__links" aria-label="Main">${links}</nav>
        <div class="nav__right">
          <span class="avatar" title="${escapeHtml(user.name)}" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
          <span class="nav__user">${escapeHtml(user.name)}</span>
          <button type="button" class="btn-logout" data-action="logout">Log out</button>
        </div>
      </div>`;
    document.body.prepend(header);

    const tabbar = document.createElement('nav');
    tabbar.className = 'tabbar';
    tabbar.setAttribute('aria-label', 'Main');
    tabbar.innerHTML = NAV_ITEMS.map(item => `
      <a class="tabbar__item" href="${item.href}"${item.key === activeKey ? ' aria-current="page"' : ''}>
        <span class="tabbar__icon" aria-hidden="true">${item.icon}</span>${item.label}
      </a>`).join('');
    const main = document.querySelector('main');
    if (main) main.after(tabbar); else document.body.append(tabbar);
    document.body.classList.add('has-tabbar');

    header.querySelector('[data-action=logout]').addEventListener('click', logout);
  }

  async function logout() {
    try {
      await Api.logout();
    } catch (e) { /* go to login anyway */ }
    flashNext('You’ve been logged out', 'muted');
    location.href = 'login.html';
  }

  /** Common start for every logged-in page. Resolves with the user. */
  async function initPage(activeKey) {
    const user = await requireAuth();
    renderNav(activeKey, user);
    showPendingFlash();
    return user;
  }

  // ==========================================================================
  // Form field errors
  // ==========================================================================

  /** errors: { fieldName: 'message' }. Fields not in `errors` are cleared. */
  function setFieldErrors(root, errors = {}) {
    root.querySelectorAll('[data-error-for]').forEach(el => {
      const name = el.dataset.errorFor;
      const message = errors[name] || '';
      el.textContent = message;
      const control = root.querySelector(`[name="${name}"]`);
      if (control) {
        if (message) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      }
    });
  }

  /** Remove a field's error as soon as the user edits it. */
  function bindErrorClearing(root) {
    const clear = e => {
      const name = e.target.name;
      if (!name) return;
      const errEl = root.querySelector(`[data-error-for="${name}"]`);
      if (errEl) errEl.textContent = '';
      e.target.removeAttribute('aria-invalid');
    };
    root.addEventListener('input', clear);
    root.addEventListener('change', clear);
  }

  function focusFirstInvalid(root) {
    const el = root.querySelector('[aria-invalid="true"]');
    if (el) el.focus();
  }

  /** HTML for a labeled input with an error line under it. */
  function fieldHtml({ name, label, type = 'text', value = '', placeholder = '', optional = false,
    inputmode = '', autocomplete = '', className = '', id = '' }) {
    const attrs = [
      `class="input ${className}"`, `name="${name}"`, `type="${type}"`, `value="${escapeHtml(value)}"`,
      placeholder ? `placeholder="${escapeHtml(placeholder)}"` : '',
      inputmode ? `inputmode="${inputmode}"` : '',
      autocomplete ? `autocomplete="${autocomplete}"` : '',
      id ? `id="${id}"` : ''
    ].filter(Boolean).join(' ');
    return `<label class="field">${escapeHtml(label)}${optional ? ' <span class="field__optional">Optional</span>' : ''}
      <input ${attrs}>
      <span class="field__error" data-error-for="${name}"></span>
    </label>`;
  }

  // ==========================================================================
  // Modal (becomes a bottom sheet on mobile via CSS) + confirm dialog
  // ==========================================================================

  let activeModal = null;

  /**
   * Open a form modal.
   * onSubmit(form) runs on Save / Enter. Return true to close the modal,
   * false to keep it open (e.g. validation errors). Errors thrown are shown as a toast.
   */
  function openModal({ title, sub = '', bodyHtml = '', submitLabel = 'Save', submitKind = 'primary', onSubmit, onOpen }) {
    closeModal();
    const opener = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>
        <div class="modal__head">
          <div class="modal__titles">
            <h2 class="modal__title" id="modal-title">${escapeHtml(title)}</h2>
            ${sub ? `<p class="modal__sub">${escapeHtml(sub)}</p>` : ''}
          </div>
          <button type="button" class="btn-close" data-close aria-label="Close">×</button>
        </div>
        ${bodyHtml ? `<div class="modal__body">${bodyHtml}</div>` : ''}
        <div class="modal__actions">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-${submitKind}">${escapeHtml(submitLabel)}</button>
        </div>
      </form>`;
    const form = overlay.querySelector('form');
    const submitBtn = form.querySelector('[type=submit]');

    // Close on backdrop click (only when the press started on the backdrop too).
    let downOnOverlay = false;
    overlay.addEventListener('mousedown', e => { downOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', e => { if (downOnOverlay && e.target === overlay) closeModal(); });
    form.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeModal));
    bindErrorClearing(form);

    let busy = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      submitBtn.disabled = true;
      try {
        const shouldClose = await onSubmit(form);
        if (shouldClose) closeModal();
      } catch (err) {
        if (err && err.status === 400 && err.fieldErrors && Object.keys(err.fieldErrors).length) {
          setFieldErrors(form, err.fieldErrors);
          focusFirstInvalid(form);
        } else {
          handleError(err);
        }
      } finally {
        busy = false;
        submitBtn.disabled = false;
      }
    });

    // Esc closes; Tab stays inside the dialog.
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'Tab') {
        const focusables = [...form.querySelectorAll('button, input, select, textarea, a[href]')]
          .filter(el => !el.disabled && el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.append(overlay);
    document.body.classList.add('modal-open');
    activeModal = { overlay, opener, onKey };

    if (onOpen) onOpen(form);
    const firstInput = form.querySelector('.modal__body input, .modal__body select');
    (firstInput || submitBtn).focus();
    return form;
  }

  function closeModal() {
    if (!activeModal) return;
    const { overlay, opener, onKey } = activeModal;
    activeModal = null;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  }

  /** Delete confirmation. onConfirm() runs when the user presses the red button. */
  function confirmDelete({ title, message, confirmLabel = 'Delete', onConfirm }) {
    return openModal({
      title,
      bodyHtml: `<div class="notice-danger"><span class="notice-danger__icon" aria-hidden="true">!</span><span>${escapeHtml(message)}</span></div>`,
      submitLabel: confirmLabel,
      submitKind: 'danger',
      onSubmit: async () => {
        await onConfirm();
        return true;
      }
    });
  }

  // ==========================================================================
  // Shared forms: Task and Course (used on Dashboard, Courses, Tasks, Grades)
  // ==========================================================================

  /** HTML for a labeled <select>. options: [{ value, label }] */
  function selectHtml({ name, label, options, value = '' }) {
    const opts = options.map(o => `<option value="${escapeHtml(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
    return `<label class="field">${escapeHtml(label)}
      <select class="input" name="${name}">${opts}</select>
      <span class="field__error" data-error-for="${name}"></span>
    </label>`;
  }

  /**
   * Add / Edit task modal. With no courses yet, opens the Add course form instead
   * (a task always belongs to a course).
   * defaults: { courseId, dueDate } for a new task. onSaved() runs after a successful save.
   */
  function openTaskForm({ task = null, courses, defaults = {}, onSaved }) {
    if (!courses.length) return openCourseForm({ onSaved });
    const v = task || { title: '', courseId: defaults.courseId ?? '', dueDate: defaults.dueDate || todayISO(), status: 'TODO' };
    return openModal({
      title: task ? 'Edit task' : 'New task',
      sub: 'Set the course, due date and status.',
      submitLabel: task ? 'Save changes' : 'Add task',
      bodyHtml: `
        ${fieldHtml({ name: 'title', label: 'Task title', value: v.title, placeholder: 'e.g. Problem Set 8' })}
        ${selectHtml({
          name: 'courseId', label: 'Course', value: v.courseId,
          options: [{ value: '', label: 'Select a course' }].concat(courses.map(c => ({ value: c.id, label: c.code + ' — ' + c.name })))
        })}
        <div class="form-grid">
          ${fieldHtml({ name: 'dueDate', label: 'Due date', type: 'date', value: v.dueDate })}
          ${selectHtml({ name: 'status', label: 'Status', value: v.status, options: STATUS_ORDER.map(s => ({ value: s, label: STATUS[s].label })) })}
        </div>`,
      onSubmit: async form => {
        const f = form.elements;
        const data = { title: f.title.value.trim(), courseId: f.courseId.value, dueDate: f.dueDate.value, status: f.status.value };
        const errors = {};
        if (!data.title) errors.title = 'Enter a task title.';
        if (!data.courseId) errors.courseId = 'Choose a course.';
        if (!data.dueDate) errors.dueDate = 'Pick a due date.';
        if (Object.keys(errors).length) {
          setFieldErrors(form, errors);
          focusFirstInvalid(form);
          return false;
        }
        data.courseId = Number(data.courseId);
        if (task) await Api.updateTask(task.id, data);
        else await Api.createTask(data);
        toast(task ? 'Task updated' : 'Task added');
        if (onSaved) await onSaved();
        return true;
      }
    });
  }

  /** Add / Edit course modal. onSaved(course) runs after a successful save. */
  function openCourseForm({ course = null, onSaved } = {}) {
    const v = course || { code: '', name: '', instructor: '', credits: 3 };
    return openModal({
      title: course ? 'Edit course' : 'New course',
      sub: 'Course details appear on your tasks and grades.',
      submitLabel: course ? 'Save changes' : 'Add course',
      bodyHtml: `
        <div class="form-grid form-grid--sm">
          ${fieldHtml({ name: 'code', label: 'Course code', value: v.code, placeholder: 'CS201', className: 'input--upper' })}
          ${fieldHtml({ name: 'credits', label: 'Credits', value: String(v.credits), placeholder: '3', inputmode: 'numeric' })}
        </div>
        ${fieldHtml({ name: 'name', label: 'Course name', value: v.name, placeholder: 'Data Structures & Algorithms' })}
        ${fieldHtml({ name: 'instructor', label: 'Instructor', value: v.instructor, placeholder: 'Dr. Sarah Chen', optional: true })}`,
      onSubmit: async form => {
        const f = form.elements;
        const creditsRaw = f.credits.value.trim();
        const data = {
          code: f.code.value.trim().toUpperCase(),
          name: f.name.value.trim(),
          instructor: f.instructor.value.trim(),
          credits: Number(creditsRaw)
        };
        const errors = {};
        if (!data.code) errors.code = 'Enter a course code.';
        if (!data.name) errors.name = 'Enter a course name.';
        if (!/^\d+$/.test(creditsRaw) || data.credits < 1 || data.credits > 6) errors.credits = 'Credits must be 1–6.';
        if (Object.keys(errors).length) {
          setFieldErrors(form, errors);
          focusFirstInvalid(form);
          return false;
        }
        const saved = course ? await Api.updateCourse(course.id, data) : await Api.createCourse(data);
        toast(course ? 'Course updated' : 'Course added');
        if (onSaved) await onSaved(saved);
        return true;
      }
    });
  }

  // ==========================================================================
  // Grades: the ONE shared calculation used by every page
  // ==========================================================================
  // Rounding rule: percentages are rounded to 1 decimal FIRST, and the letter
  // grade is chosen from that rounded value (so 79.96 -> 80.0% -> A with A >= 80).
  // Every function takes the course's own grade scale (course.gradeScale).

  function round1(n) {
    return Math.round((n + Number.EPSILON) * 10) / 10;
  }

  /** 75.66 -> "75.7", 80 -> "80" (points and plain numbers). */
  function formatNumber(n) {
    return String(round1(n));
  }

  /** Percentages always show 1 decimal: 98 -> "98.0%". */
  function formatPct(n) {
    return round1(n).toFixed(1) + '%';
  }

  /** The course's scale sorted highest first; falls back to the default when missing. */
  function usableScale(scale) {
    const list = Array.isArray(scale) && scale.length ? scale : DEFAULT_GRADE_SCALE;
    return list.slice().sort((a, b) => b.minPercent - a.minPercent);
  }

  function letterOf(pct, scale) {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
    const p = round1(pct);
    const list = usableScale(scale);
    const hit = list.find(s => p >= s.minPercent);
    return (hit || list[list.length - 1]).letter;
  }

  /** "A ≥ 85.0% · B+ ≥ 75.0% · … · D ≥ 50.0%" */
  function formatScale(scale) {
    return usableScale(scale).slice(0, -1).map(s => `${s.letter} ≥ ${formatPct(s.minPercent)}`).join(' · ');
  }

  function isDefaultScale(scale) {
    const list = usableScale(scale);
    return list.length === DEFAULT_GRADE_SCALE.length
      && list.every((s, i) => s.letter === DEFAULT_GRADE_SCALE[i].letter && s.minPercent === DEFAULT_GRADE_SCALE[i].minPercent);
  }

  /** Graded = has a score and the values are valid. Empty score = not graded (never 0). */
  function isGraded(item) {
    return item.score !== null && item.score !== undefined && item.maxScore > 0
      && item.score >= 0 && item.score <= item.maxScore && item.weight > 0;
  }

  /** Points = score / max * weight (null when not graded). */
  function itemPoints(item) {
    return isGraded(item) ? item.score / item.maxScore * item.weight : null;
  }

  /**
   * Current grade from graded assessments only.
   * current = earned points / graded weight * 100 (null when nothing is graded yet).
   */
  function calcGrade(items, scale) {
    let earned = 0;
    let gradedWeight = 0;
    let totalWeight = 0;
    let ungradedOther = 0;
    let final = null;
    items.forEach(item => {
      const w = Number(item.weight) || 0;
      totalWeight += w;
      if (item.type === 'FINAL' && !final) final = item;
      if (isGraded(item)) {
        earned += item.score / item.maxScore * w;
        gradedWeight += w;
      } else if (item.type !== 'FINAL') {
        ungradedOther += w;
      }
    });
    const current = gradedWeight > 0 ? earned / gradedWeight * 100 : null;
    return {
      earned, gradedWeight, totalWeight, ungradedOther, final, current,
      letter: letterOf(current, scale),
      weightsOk: Math.abs(totalWeight - 100) < 0.01
    };
  }

  /**
   * Possible final grade range, using calcGrade (no separate formula):
   * low  = every ungraded assessment scores 0,
   * high = every ungraded assessment scores full marks.
   * Returns null when nothing is graded yet.
   */
  function gradeRange(items, scale) {
    if (!items.some(isGraded)) return null;
    const fill = full => items.map(item => (isGraded(item) ? item : { ...item, score: full ? item.maxScore : 0 }));
    const low = calcGrade(fill(false), scale);
    const high = calcGrade(fill(true), scale);
    return { low, high, locked: low.letter === high.letter };
  }

  /**
   * What-if final exam.
   * Assumption: every ungraded assessment except the final scores the current average.
   * base = earned + ungradedOther * current%. Needed final % = (target - base) / finalWeight * 100.
   * Because of the rounding rule, a target of 80 is reached at 79.95.
   * Needed final scores are rounded UP to whole points.
   */
  function whatIf(items, scale) {
    const g = calcGrade(items, scale);
    const fin = g.final;
    if (!items.length) return { available: false, grade: g, reason: 'Add assessments first, including a Final exam.' };
    if (!fin) return { available: false, grade: g, reason: 'Add an assessment with type “Final” to use the calculator.' };
    if (isGraded(fin)) {
      return {
        available: false, grade: g,
        reason: 'Your final is already graded — your course grade is ' + g.letter + ' (' + formatPct(g.current) + ').'
      };
    }
    if (g.current === null && g.ungradedOther > 0) {
      // No average to assume yet: the other assessments would count as 0, which is misleading.
      return { available: false, grade: g, reason: 'Enter at least one score to use the calculator.' };
    }
    const base = g.earned + g.ungradedOther * ((g.current ?? 0) / 100);
    // Every grade except the lowest one (F) can be a target.
    const rows = usableScale(scale).slice(0, -1).map(({ letter, minPercent: min }) => {
      const needPct = (min - 0.05 - base) / fin.weight * 100;
      let state = 'need';
      if (needPct <= 0) state = 'secured';
      else if (needPct > 100) state = 'out';
      const points = state === 'need' ? Math.max(0, Math.ceil(needPct / 100 * fin.maxScore - 1e-9)) : null;
      return { letter, min, needPct, state, points };
    });
    // Default target: the lowest grade that is not secured yet; the highest grade if all are secured.
    const open = rows.filter(r => r.state !== 'secured');
    const defaultTarget = open.length ? open[open.length - 1].letter : rows[0].letter;
    return { available: true, grade: g, final: fin, base, maxPct: base + fin.weight, rows, defaultTarget };
  }

  /** Parse a number typed by the user. */
  function parseNumber(raw) {
    const s = String(raw ?? '').trim();
    if (s === '') return { empty: true };
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { invalid: true };
    return { value: Number(s) };
  }

  /**
   * Validate an assessment typed by the user (used by BOTH the inline row and the Edit modal).
   * raw: { name, type, score, maxScore, weight } as strings.
   * Returns { ok, errors, values } where values are numbers (score null = not graded).
   */
  function validateGradeItem(raw) {
    const errors = {};
    const values = { name: String(raw.name ?? '').trim(), type: raw.type, score: null, maxScore: NaN, weight: NaN };

    if (!values.name) errors.name = 'Enter a name.';
    if (!TYPE_LABEL[values.type]) errors.type = 'Choose a type.';

    const max = parseNumber(raw.maxScore);
    if (max.empty) errors.maxScore = 'Enter the max score.';
    else if (max.invalid) errors.maxScore = 'Max score must be a number.';
    else if (max.value < 0) errors.maxScore = 'Max score can’t be negative.';
    else if (max.value === 0) errors.maxScore = 'Max score must be greater than 0.';
    else values.maxScore = max.value;

    const weight = parseNumber(raw.weight);
    if (weight.empty) errors.weight = 'Enter the weight.';
    else if (weight.invalid) errors.weight = 'Weight must be a number.';
    else if (weight.value < 0) errors.weight = 'Weight can’t be negative.';
    else if (weight.value === 0) errors.weight = 'Weight must be greater than 0%.';
    else if (weight.value > 100) errors.weight = 'Weight can’t be more than 100%.';
    else values.weight = weight.value;

    const score = parseNumber(raw.score);
    if (score.invalid) errors.score = 'Score must be a number.';
    else if (!score.empty) {
      if (score.value < 0) errors.score = 'Score can’t be negative.';
      else if (!errors.maxScore && score.value > values.maxScore) {
        errors.score = 'Score is higher than the max score (' + formatNumber(values.maxScore) + ').';
      } else values.score = score.value;
    }

    return { ok: Object.keys(errors).length === 0, errors, values };
  }

  /**
   * Validate a grade scale typed by the user (the Edit grade scale modal).
   * raw: { A: '85', 'B+': '75', ..., D: '50' } as strings (F is fixed at 0, not editable).
   * Rules: numbers 0–100, strictly decreasing from A to D (so no duplicates), and D above 0.
   * Returns { ok, errors (keyed by letter), scale: [{ letter, minPercent }, ..., { letter: 'F', minPercent: 0 }] }.
   */
  function validateGradeScale(raw) {
    const errors = {};
    const editable = DEFAULT_GRADE_SCALE.slice(0, -1);
    const lowest = DEFAULT_GRADE_SCALE[DEFAULT_GRADE_SCALE.length - 1];
    const values = {};

    editable.forEach(({ letter }) => {
      const n = parseNumber(raw[letter]);
      if (n.empty) errors[letter] = 'Enter a percentage.';
      else if (n.invalid) errors[letter] = 'Must be a number.';
      else if (n.value < 0 || n.value > 100) errors[letter] = 'Must be between 0 and 100.';
      else values[letter] = n.value;
    });

    // Each grade must be lower than the nearest valid grade above it.
    let prev = null;
    editable.forEach(({ letter }) => {
      if (values[letter] === undefined) return;
      if (prev && values[letter] >= prev.value) {
        errors[letter] = values[letter] === prev.value
          ? `Can’t be the same as ${prev.letter} (${formatPct(prev.value)}).`
          : `Must be lower than ${prev.letter} (${formatPct(prev.value)}).`;
      }
      prev = { letter, value: values[letter] };
    });

    const lastLetter = editable[editable.length - 1].letter;
    if (!errors[lastLetter] && values[lastLetter] === 0) {
      errors[lastLetter] = `Must be above 0 so ${lowest.letter} is possible.`;
    }

    const scale = editable.map(({ letter }) => ({ letter, minPercent: values[letter] }))
      .concat({ letter: lowest.letter, minPercent: 0 });
    return { ok: Object.keys(errors).length === 0, errors, scale };
  }

  return {
    STATUS, STATUS_ORDER, TYPE_LABEL, TYPE_ORDER, DEFAULT_GRADE_SCALE,
    escapeHtml, plural, logoSvg,
    toISODate, todayISO, parseISODate, addDays, daysUntil, formatDate, isOverdue, dueInfo,
    toast, flashNext, showPendingFlash, handleError,
    requireAuth, initPage, renderNav, logout,
    setFieldErrors, bindErrorClearing, focusFirstInvalid, fieldHtml,
    openModal, closeModal, confirmDelete,
    selectHtml, openTaskForm, openCourseForm,
    round1, formatNumber, formatPct, letterOf, formatScale, isDefaultScale, isGraded, itemPoints,
    calcGrade, gradeRange, whatIf,
    parseNumber, validateGradeItem, validateGradeScale
  };
})();
