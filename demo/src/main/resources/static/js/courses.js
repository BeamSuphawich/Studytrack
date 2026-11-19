'use strict';

/* Courses: course cards with current grade and open tasks; add / edit / delete. */
(async () => {
  await App.initPage('courses');
  const { escapeHtml } = App;
  const $ = id => document.getElementById(id);

  const state = {
    courses: [],
    tasks: [],
    gradeItems: new Map() // courseId -> GradeItem[]
  };

  async function load() {
    try {
      const [courses, tasks] = await Promise.all([Api.getCourses(), Api.getTasks()]);
      const items = await Promise.all(courses.map(c => Api.getGradeItems(c.id)));
      state.courses = courses;
      state.tasks = tasks;
      state.gradeItems = new Map(courses.map((c, i) => [c.id, items[i]]));
      render();
    } catch (err) {
      App.handleError(err, 'Could not load your courses.');
    }
  }

  /** Semester name from the real current date: Spring (Jan–May), Summer (Jun–Jul), Fall (Aug–Dec). */
  function termLabel(date = new Date()) {
    const m = date.getMonth();
    const term = m <= 4 ? 'Spring' : m <= 6 ? 'Summer' : 'Fall';
    return term + ' ' + date.getFullYear();
  }

  function render() {
    const { courses } = state;
    const credits = courses.reduce((sum, c) => sum + c.credits, 0);
    $('courses-sub').textContent = courses.length
      ? `${termLabel()} · ${App.plural(courses.length, 'course')} · ${App.plural(credits, 'credit')}`
      : termLabel();

    $('courses-empty').hidden = courses.length > 0;
    $('course-grid').hidden = courses.length === 0;
    $('course-grid').innerHTML = courses.map(cardHtml).join('');
  }

  function cardHtml(c) {
    const grade = App.calcGrade(state.gradeItems.get(c.id) || [], c.gradeScale);
    const open = state.tasks.filter(t => t.courseId === c.id && t.status !== 'DONE').length;
    const meta = [c.instructor, App.plural(c.credits, 'credit')].filter(Boolean).join(' · ');
    const gradeText = grade.current === null
      ? '<span class="kv__value kv__value--muted">No grades yet</span>'
      : `<span class="kv__value">${grade.letter} · ${App.formatPct(grade.current)}</span>`;

    return `
      <article class="card card--clickable course-card">
        <div class="course-card__top">
          <span class="tag">${escapeHtml(c.code)}</span>
          <div class="course-card__actions">
            <button type="button" class="btn-ghost-sm" data-action="edit" data-id="${c.id}" aria-label="Edit ${escapeHtml(c.code)}">Edit</button>
            <button type="button" class="btn-ghost-sm btn-ghost-sm--danger" data-action="delete" data-id="${c.id}" aria-label="Delete ${escapeHtml(c.code)}">Delete</button>
          </div>
        </div>
        <div class="course-card__titles">
          <h2 class="course-card__name">${escapeHtml(c.name)}</h2>
          <p class="course-card__meta">${escapeHtml(meta)}</p>
        </div>
        <div class="course-card__stats">
          <div class="kv"><span class="kv__label">Current grade</span>${gradeText}</div>
          <div class="kv"><span class="kv__label">Open tasks</span><span class="kv__value">${open}</span></div>
        </div>
        <a class="course-card__link" href="grades.html?course=${c.id}">View grades<span class="sr-only"> for ${escapeHtml(c.code)}</span> →</a>
      </article>`;
  }

  // ---------- actions ----------

  const findCourse = id => state.courses.find(c => c.id === Number(id));

  function confirmDeleteCourse(course) {
    const taskCount = state.tasks.filter(t => t.courseId === course.id).length;
    App.confirmDelete({
      title: 'Delete course?',
      message: `${course.code} ${course.name} and its ${App.plural(taskCount, 'task')} and all grades will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete course',
      onConfirm: async () => {
        await Api.deleteCourse(course.id);
        App.toast('Course deleted', 'danger');
        await load();
      }
    });
  }

  $('main').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'add-course') {
      App.openCourseForm({ onSaved: load });
    } else if (action === 'edit') {
      const course = findCourse(el.dataset.id);
      if (course) App.openCourseForm({ course, onSaved: load });
    } else if (action === 'delete') {
      const course = findCourse(el.dataset.id);
      if (course) confirmDeleteCourse(course);
    }
  });

  await load();
})();
