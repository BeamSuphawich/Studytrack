'use strict';

/*
 * Grades: assessments per course, current grade, what-if final exam.
 *
 * Assessments can be edited in two ways that share App.validateGradeItem:
 *  - inline in the row (score / max / weight): every keystroke is validated,
 *    valid values are saved (PATCH) after a short pause or when the field loses focus;
 *  - the Edit modal (name / type / weight / max / score).
 * Invalid values show a text error and are never saved or used: until they are fixed,
 * every calculation uses the row's last valid (saved) values.
 */
(async () => {
  await App.initPage('grades');
  const { escapeHtml, TYPE_LABEL, TYPE_ORDER } = App;
  const $ = id => document.getElementById(id);
  const SAVE_DELAY_MS = 400;
  const NUM_FIELDS = ['score', 'maxScore', 'weight'];

  const state = {
    courses: [],
    courseId: null,
    items: [],            // saved grade items of the selected course
    drafts: new Map(),    // itemId -> { score, maxScore, weight } as typed (strings)
    target: null,         // target grade picked by the user in What-if (null = automatic default)
    shownTarget: null     // target currently shown (picked or default)
  };
  const saveTimers = new Map();

  const currentCourse = () => state.courses.find(c => c.id === state.courseId);
  const findItem = id => state.items.find(i => i.id === Number(id));
  const numStr = n => (n === null || n === undefined ? '' : String(n));
  const savedStrings = item => ({ score: numStr(item.score), maxScore: numStr(item.maxScore), weight: numStr(item.weight) });

  // ==========================================================================
  // Loading
  // ==========================================================================

  async function loadCourses(preferredId) {
    try {
      state.courses = await Api.getCourses();
      const wanted = Number(preferredId ?? new URLSearchParams(location.search).get('course'));
      state.courseId = state.courses.some(c => c.id === wanted)
        ? wanted
        : (state.courses.length ? state.courses[0].id : null);
      syncUrl();
      await loadItems();
    } catch (err) {
      App.handleError(err, 'Could not load your grades.');
    }
  }

  async function loadItems() {
    state.drafts.clear();
    state.items = state.courseId ? await Api.getGradeItems(state.courseId) : [];
    render();
  }

  function syncUrl() {
    history.replaceState(null, '', location.pathname + (state.courseId ? '?course=' + state.courseId : ''));
  }

  // ==========================================================================
  // Row state: draft (if valid) or saved values
  // ==========================================================================

  function rowState(item) {
    const draft = state.drafts.get(item.id);
    if (!draft) return { item, valid: true, errors: {} };
    const v = App.validateGradeItem({ name: item.name, type: item.type, ...draft });
    return v.ok
      ? { item: { ...item, ...v.values }, valid: true, errors: {} }
      : { item, valid: false, errors: v.errors };   // invalid: keep last saved values
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  function render() {
    const hasCourses = state.courses.length > 0;
    $('grades-empty').hidden = hasCourses;
    $('grades-content').hidden = !hasCourses;
    if (!hasCourses) return;
    renderTabs();
    renderCourseHead();
    renderRows();
    renderSummary();
  }

  function renderTabs() {
    $('course-tabs').innerHTML = state.courses.map(c => {
      const on = c.id === state.courseId;
      return `<button type="button" role="tab" class="course-tab" data-action="tab" data-id="${c.id}"
        aria-selected="${on}" aria-controls="grades-panel" tabindex="${on ? 0 : -1}" title="${escapeHtml(c.name)}">${escapeHtml(c.code)}</button>`;
    }).join('');
  }

  function renderCourseHead() {
    const c = currentCourse();
    $('course-name').textContent = c.code + ' · ' + c.name;
    $('course-meta').textContent = [c.instructor, App.plural(c.credits, 'credit')].filter(Boolean).join(' · ');
  }

  function renderRows() {
    const body = $('assess-body');
    if (!state.items.length) {
      $('assess-foot').hidden = true;
      body.innerHTML = `
        <div class="empty empty--sm">
          <div class="empty__title">No assessments yet</div>
          <div class="empty__text">Add coursework, midterm and final exam with their weights from the syllabus.</div>
          <button type="button" class="btn btn-primary" data-action="add-assess">Add assessment</button>
        </div>`;
      return;
    }
    $('assess-foot').hidden = false;
    body.innerHTML = `
      <div class="assess-head" aria-hidden="true">
        <span class="col-name">Assessment</span>
        <span class="col-score">Score / Max</span>
        <span class="col-weight">Weight</span>
        <span class="col-points">Points</span>
        <span class="col-actions"></span>
      </div>
      ${state.items.map(rowHtml).join('')}`;
    state.items.forEach(updateRow);
  }

  function rowHtml(item) {
    const v = state.drafts.get(item.id) || savedStrings(item);
    const name = escapeHtml(item.name);
    const errId = 'err-' + item.id;
    const cell = (field, value, label, extra = '') =>
      `<input class="input input--cell ${extra}" name="${field}" inputmode="decimal" value="${escapeHtml(value)}"
        aria-label="${label} for ${name}" aria-describedby="${errId}"${field === 'score' ? ' placeholder="—"' : ''}>`;
    return `
      <div class="assess-row" data-id="${item.id}">
        <div class="assess-row__name">
          <button type="button" class="text-btn" data-action="edit" data-id="${item.id}" title="Edit name and type">${name}</button>
          <span class="type-tag" data-type="${item.type}">${TYPE_LABEL[item.type]}</span>
        </div>
        <div class="assess-row__fields">
          <span class="assess-row__score">
            ${cell('score', v.score, 'Score')}
            <span aria-hidden="true">/</span>
            ${cell('maxScore', v.maxScore, 'Max score')}
          </span>
          <span class="assess-row__weight">
            ${cell('weight', v.weight, 'Weight percent', 'input--cell-sm')}
            <span aria-hidden="true">%</span>
          </span>
          <span class="assess-row__points" data-role="points"></span>
          <span class="assess-row__actions">
            <button type="button" class="btn-ghost-sm" data-action="edit" data-id="${item.id}" aria-label="Edit ${name}">Edit</button>
            <button type="button" class="btn-ghost-sm btn-ghost-sm--danger btn-x" data-action="delete" data-id="${item.id}" aria-label="Delete ${name}">×</button>
          </span>
        </div>
        <p class="assess-row__error" id="${errId}" aria-live="polite"></p>
      </div>`;
  }

  /** Update one row's errors and points without re-rendering it (keeps focus and caret). */
  function updateRow(item) {
    const row = $('assess-body').querySelector(`.assess-row[data-id="${item.id}"]`);
    if (!row) return;
    const rs = rowState(item);
    NUM_FIELDS.forEach(field => {
      const input = row.querySelector(`[name="${field}"]`);
      if (rs.errors[field]) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    row.querySelector('.assess-row__error').textContent =
      ['score', 'maxScore', 'weight'].map(f => rs.errors[f]).filter(Boolean).join(' ');
    const points = App.itemPoints(rs.item);
    const el = row.querySelector('[data-role=points]');
    el.textContent = points === null ? '—' : App.round1(points).toFixed(1);
    el.classList.toggle('is-empty', points === null);
  }

  /** Footer, Current grade card and What-if: always from the same effective items and the course's scale. */
  function renderSummary() {
    const scale = currentCourse().gradeScale;
    const states = state.items.map(rowState);
    const items = states.map(s => s.item);
    const invalidCount = states.filter(s => !s.valid).length;
    const g = App.calcGrade(items, scale);

    // Footer
    if (state.items.length) {
      const weightMsg = g.weightsOk
        ? `Weights total ${App.formatPct(100)}`
        : `Weights total ${App.formatPct(g.totalWeight)} — they should add up to 100.0%`;
      const invalidMsg = invalidCount
        ? `<span class="weight-msg weight-msg--error">${App.plural(invalidCount, 'row')} with errors: the last saved values are used until fixed.</span>`
        : '';
      $('assess-foot').innerHTML = `
        <span class="weight-msg" data-ok="${g.weightsOk}">${weightMsg}</span>
        ${invalidMsg}
        <span class="formula">Points = score ÷ max × weight</span>`;
    }

    // Current grade: "Course grade" only when every assessment has a score.
    const allGraded = items.length > 0 && items.every(App.isGraded);
    $('grade-title').textContent = allGraded ? 'Course grade' : 'Grade so far';
    $('g-letter').textContent = g.letter;
    $('g-pct').textContent = g.current === null ? 'No scores yet' : App.formatPct(g.current);
    const graded = Math.min(100, g.gradedWeight);
    $('g-bar-fill').style.width = graded + '%';
    $('g-bar').setAttribute('aria-valuenow', String(App.round1(graded)));
    $('g-graded').textContent = App.formatPct(g.gradedWeight) + ' of the course graded';

    // Possible final grade: ungraded at 0 (low) to full marks (high). Hidden until something is graded.
    const range = App.gradeRange(items, scale);
    $('g-range').hidden = !range;
    if (range) {
      $('g-range').textContent = range.locked
        ? `Grade locked in: ${range.low.letter}`
        : `Final grade range: ${range.low.letter} to ${range.high.letter}`;
    }

    $('g-earned').textContent = g.current === null ? '—' : App.formatNumber(g.earned) + ' / 100';
    $('g-scale').textContent = (App.isDefaultScale(scale) ? 'Default scale: ' : 'Custom scale: ') + App.formatScale(scale);

    renderWhatIf(items, scale);
  }

  function renderWhatIf(items, scale) {
    const body = $('whatif-body');
    const w = App.whatIf(items, scale);
    if (!w.available) {
      body.innerHTML = `<p class="whatif__unavailable">${escapeHtml(w.reason)}</p>`;
      return;
    }
    const fin = w.final;
    const finName = escapeHtml(fin.name);
    const finLower = escapeHtml(fin.name.toLowerCase());
    const finMax = App.formatNumber(fin.maxScore);
    // Until the user picks a target, use the lowest grade that is not secured yet.
    const row = w.rows.find(r => r.letter === (state.target || w.defaultTarget)) || w.rows[0];
    state.shownTarget = row.letter;
    const article = row.letter[0] === 'A' ? 'an' : 'a';

    // The box always matches the row's label below (Secured / Out of reach / points needed).
    let box;
    if (row.state === 'secured') {
      box = { kicker: 'Secured', headline: `Already secured: ${row.letter} or above`,
        detail: `Even a 0 on the ${finLower} keeps you at ${row.letter} or above.` };
    } else if (row.state === 'out') {
      box = { kicker: 'Out of reach', headline: `${row.letter} isn’t possible`,
        detail: `A perfect ${finLower} brings you to ${App.formatPct(w.maxPct)} (${App.letterOf(w.maxPct, scale)}).` };
    } else {
      box = { kicker: `You need on the ${finLower}`, headline: `${row.points} / ${finMax}`,
        detail: `Score at least ${row.points} to finish with ${article} ${row.letter} (≥ ${App.formatPct(row.min)}).` };
    }

    const needText = r => (r.state === 'secured' ? 'Secured' : r.state === 'out' ? 'Out of reach' : `${r.points} / ${finMax}`);
    const rowsHtml = w.rows.map(r => {
      const on = r.letter === row.letter;
      return `
        <button type="button" role="radio" class="target" data-action="target" data-letter="${r.letter}"
          aria-checked="${on}" tabindex="${on ? 0 : -1}">
          <span class="target__letter">${r.letter}</span>
          <span class="target__min">≥ ${App.formatPct(r.min)}</span>
          <span class="target__need" data-state="${r.state}">${needText(r)}</span>
        </button>`;
    }).join('');

    const g = w.grade;
    const note = g.ungradedOther > 0
      ? `Assumption: your other ungraded assessments (${App.formatPct(g.ungradedOther)} of the course) are counted at your current average of ${App.formatPct(g.current)}. ${finName} is worth ${App.formatPct(fin.weight)} of your grade.`
      : `All other assessments are graded, so nothing is assumed. ${finName} is worth ${App.formatPct(fin.weight)} of your grade.`;

    body.innerHTML = `
      <div class="whatif__box" data-state="${row.state}" aria-live="polite">
        <span class="whatif__kicker">${box.kicker}</span>
        <span class="whatif__headline">${box.headline}</span>
        <span class="whatif__detail">${box.detail}</span>
      </div>
      <div class="target-list" role="radiogroup" aria-label="Target grade">${rowsHtml}</div>
      <p class="whatif__note">${note}</p>`;
  }

  // ==========================================================================
  // Inline editing (debounced PATCH; invalid values are never saved)
  // ==========================================================================

  function scheduleSave(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(() => saveDraft(id), SAVE_DELAY_MS));
  }

  function cancelSave(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
  }

  function flushSave(id) {
    cancelSave(id);
    return saveDraft(id);
  }

  function flushAll() {
    return Promise.all([...saveTimers.keys()].map(flushSave));
  }

  async function saveDraft(id) {
    saveTimers.delete(id);
    const draft = state.drafts.get(id);
    const item = findItem(id);
    if (!draft || !item) return;
    const v = App.validateGradeItem({ name: item.name, type: item.type, ...draft });
    if (!v.ok) return;
    const patch = {};
    NUM_FIELDS.forEach(f => { if (v.values[f] !== item[f]) patch[f] = v.values[f]; });
    try {
      if (Object.keys(patch).length) {
        const saved = await Api.updateGradeItem(id, patch);
        state.items = state.items.map(i => (i.id === saved.id ? saved : i));
      }
      // Drop the draft only if nothing new was typed while saving.
      if (state.drafts.get(id) === draft) state.drafts.delete(id);
    } catch (err) {
      App.handleError(err, 'Could not save the assessment.');
    }
  }

  function onRowInput(e) {
    const input = e.target;
    const row = input.closest('.assess-row');
    if (!row || !NUM_FIELDS.includes(input.name)) return;
    const item = findItem(row.dataset.id);
    if (!item) return;
    const draft = {};
    NUM_FIELDS.forEach(f => { draft[f] = row.querySelector(`[name="${f}"]`).value; });
    state.drafts.set(item.id, draft);
    updateRow(item);
    renderSummary();
    scheduleSave(item.id);
  }

  $('assess-body').addEventListener('input', onRowInput);
  $('assess-body').addEventListener('change', e => {
    const row = e.target.closest('.assess-row');
    if (row) flushSave(Number(row.dataset.id));
  });
  // Save anything still waiting when leaving the page.
  window.addEventListener('pagehide', () => { flushAll(); });

  // ==========================================================================
  // Add / Edit modal (same validation as the inline row)
  // ==========================================================================

  function openAssessForm(item) {
    const course = currentCourse();
    const values = item ? (state.drafts.get(item.id) || savedStrings(item)) : { score: '', maxScore: '100', weight: '' };
    let type = item ? item.type : 'COURSEWORK';

    App.openModal({
      title: item ? 'Edit assessment' : 'New assessment',
      sub: `${item ? 'Changes apply to' : 'Added to'} ${course.code} ${course.name}.`,
      submitLabel: item ? 'Save changes' : 'Add assessment',
      bodyHtml: `
        ${App.fieldHtml({ name: 'name', label: 'Assessment name', value: item ? item.name : '', placeholder: 'e.g. Quiz 3' })}
        <div class="field">
          <span id="type-label">Type</span>
          <div class="segmented segmented--3" role="radiogroup" aria-labelledby="type-label">
            ${TYPE_ORDER.map(t => `<button type="button" role="radio" class="segmented__btn" data-type="${t}"
              aria-checked="${t === type}" tabindex="${t === type ? 0 : -1}">${TYPE_LABEL[t]}</button>`).join('')}
          </div>
          <span class="field__error" data-error-for="type"></span>
        </div>
        <div class="form-grid-3">
          ${App.fieldHtml({ name: 'weight', label: 'Weight (%)', value: values.weight, placeholder: '10', inputmode: 'decimal' })}
          ${App.fieldHtml({ name: 'maxScore', label: 'Max score', value: values.maxScore, placeholder: '100', inputmode: 'decimal' })}
          ${App.fieldHtml({ name: 'score', label: 'Score', value: values.score, placeholder: '—', inputmode: 'decimal' })}
        </div>
        <p class="field__hint">Leave score empty if it hasn’t been graded yet.</p>`,
      onOpen: form => {
        const radios = [...form.querySelectorAll('[role=radio]')];
        const select = (btn, focus) => {
          type = btn.dataset.type;
          radios.forEach(r => {
            const on = r === btn;
            r.setAttribute('aria-checked', String(on));
            r.tabIndex = on ? 0 : -1;
          });
          if (focus) btn.focus();
        };
        radios.forEach((btn, i) => {
          btn.addEventListener('click', () => select(btn, false));
          btn.addEventListener('keydown', e => {
            const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
            if (!step) return;
            e.preventDefault();
            select(radios[(i + step + radios.length) % radios.length], true);
          });
        });
      },
      onSubmit: async form => {
        const f = form.elements;
        const v = App.validateGradeItem({
          name: f.name.value, type, score: f.score.value, maxScore: f.maxScore.value, weight: f.weight.value
        });
        if (!v.ok) {
          App.setFieldErrors(form, v.errors);
          App.focusFirstInvalid(form);
          return false;
        }
        if (item) {
          cancelSave(item.id);
          const saved = await Api.updateGradeItem(item.id, v.values);
          state.drafts.delete(item.id);
          state.items = state.items.map(i => (i.id === saved.id ? saved : i));
          App.toast('Assessment updated');
        } else {
          const saved = await Api.createGradeItem(state.courseId, v.values);
          state.items = state.items.concat(saved);
          App.toast('Assessment added');
        }
        renderRows();
        renderSummary();
        return true;
      }
    });
  }

  function confirmDeleteItem(item) {
    const course = currentCourse();
    App.confirmDelete({
      title: 'Delete assessment?',
      message: `“${item.name}” and its score will be removed from ${course.code}.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        cancelSave(item.id);
        await Api.deleteGradeItem(item.id);
        state.drafts.delete(item.id);
        state.items = state.items.filter(i => i.id !== item.id);
        App.toast('Assessment deleted', 'danger');
        renderRows();
        renderSummary();
      }
    });
  }

  // ==========================================================================
  // Edit grade scale modal (per course). Saved only when every value is valid.
  // ==========================================================================

  function openScaleForm() {
    const course = currentCourse();
    const scale = course.gradeScale;
    const editable = scale.slice(0, -1);
    const lowest = scale[scale.length - 1];
    const above = editable[editable.length - 1].letter;

    const rows = editable.map(s => `
      <div class="scale-row">
        <label class="scale-row__letter" for="scale-${escapeHtml(s.letter)}">${escapeHtml(s.letter)}</label>
        <span class="scale-row__input">
          <span aria-hidden="true">≥</span>
          <input class="input input--cell" id="scale-${escapeHtml(s.letter)}" name="${escapeHtml(s.letter)}" inputmode="decimal"
            value="${escapeHtml(App.formatNumber(s.minPercent))}" aria-label="Minimum percent for ${escapeHtml(s.letter)}">
          <span aria-hidden="true">%</span>
        </span>
        <span class="field__error scale-row__error" data-error-for="${escapeHtml(s.letter)}"></span>
      </div>`).join('');

    App.openModal({
      title: 'Edit grade scale',
      sub: `Minimum percentage for each grade in ${course.code} ${course.name}.`,
      submitLabel: 'Save scale',
      bodyHtml: `
        <div class="scale-list">
          ${rows}
          <div class="scale-row scale-row--fixed">
            <span class="scale-row__letter">${escapeHtml(lowest.letter)}</span>
            <span class="small-muted">Below ${escapeHtml(above)}</span>
          </div>
        </div>
        <div class="scale-actions">
          <button type="button" class="btn btn-secondary btn-secondary--sm" data-reset>Reset to default</button>
          <p class="field__hint" data-scale-hint>Grades go from highest to lowest. Your grade % is rounded to 1 decimal before the letter is chosen.</p>
        </div>`,
      onOpen: form => {
        form.querySelector('[data-reset]').addEventListener('click', () => {
          App.DEFAULT_GRADE_SCALE.slice(0, -1).forEach(s => { form.elements[s.letter].value = String(s.minPercent); });
          App.setFieldErrors(form, {});
          form.querySelector('[data-scale-hint]').textContent = 'Default values filled in. Press “Save scale” to apply them.';
        });
      },
      onSubmit: async form => {
        const raw = {};
        editable.forEach(s => { raw[s.letter] = form.elements[s.letter].value; });
        const v = App.validateGradeScale(raw);
        if (!v.ok) {
          App.setFieldErrors(form, v.errors);
          App.focusFirstInvalid(form);
          return false;
        }
        const saved = await Api.updateGradeScale(course.id, v.scale);
        state.courses = state.courses.map(c => (c.id === saved.id ? saved : c));
        App.toast('Grade scale updated');
        renderSummary();
        return true;
      }
    });
  }

  // ==========================================================================
  // Course tabs, target grade, buttons
  // ==========================================================================

  async function selectCourse(id, focus) {
    if (id === state.courseId) return;
    await flushAll();
    state.courseId = id;
    state.target = null; // each course starts with its own default target
    syncUrl();
    try {
      await loadItems();
    } catch (err) {
      App.handleError(err, 'Could not load the assessments.');
    }
    if (focus) {
      const tab = $('course-tabs').querySelector(`[data-id="${id}"]`);
      if (tab) tab.focus();
    }
  }

  function selectTarget(letter, focus) {
    state.target = letter;
    renderSummary();
    if (focus) {
      const btn = $('whatif-body').querySelector(`[data-letter="${letter}"]`);
      if (btn) btn.focus();
    }
  }

  $('main').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'tab':
        selectCourse(Number(el.dataset.id), false);
        break;
      case 'add-course':
        App.openCourseForm({ onSaved: course => loadCourses(course.id) });
        break;
      case 'add-assess':
        openAssessForm(null);
        break;
      case 'edit': {
        const item = findItem(el.dataset.id);
        if (item) openAssessForm(item);
        break;
      }
      case 'delete': {
        const item = findItem(el.dataset.id);
        if (item) confirmDeleteItem(item);
        break;
      }
      case 'target':
        selectTarget(el.dataset.letter, true);
        break;
      case 'edit-scale':
        openScaleForm();
        break;
      default:
        break;
    }
  });

  // Arrow keys: move between course tabs and between target grades.
  $('main').addEventListener('keydown', e => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    const tab = e.target.closest('.course-tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const i = state.courses.findIndex(c => c.id === state.courseId);
      const next = state.courses[(i + step + state.courses.length) % state.courses.length];
      selectCourse(next.id, true);
      return;
    }
    const target = e.target.closest('.target');
    if (target) {
      e.preventDefault();
      const letters = currentCourse().gradeScale.slice(0, -1).map(s => s.letter);
      const i = letters.indexOf(state.shownTarget);
      selectTarget(letters[(i + step + letters.length) % letters.length], true);
    }
  });

  await loadCourses();
})();
