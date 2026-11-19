'use strict';

/**
 * Data access layer. Every page reads and writes data ONLY through this file.
 * Phase 3: talks to the Spring Boot REST API with fetch('/api/...') (same origin, relative URLs).
 * Function names, arguments and return shapes are the same as in phase 1, so no page had to change.
 *
 * Shapes:
 *   User      { id, name, email }
 *   Course    { id, code, name, instructor, credits,
 *               gradeScale: [{ letter, minPercent }] }   8 entries A, B+, B, C+, C, D+, D, F (highest first); F is always 0
 *   Task      { id, courseId, title, dueDate: 'YYYY-MM-DD', status: 'TODO' | 'IN_PROGRESS' | 'DONE' }
 *   GradeItem { id, courseId, name, type: 'COURSEWORK' | 'MIDTERM' | 'FINAL',
 *               score: number | null, maxScore: number, weight: number }
 *   (Overdue is derived from dueDate + status on the frontend, never stored.)
 *
 * Every function is async and rejects with ApiError { status, message, fieldErrors }:
 *   400 validation failed (fieldErrors: { fieldName: 'message' }; grade scale errors use the letter, e.g. 'B+')
 *   401 not logged in or session expired: the browser is sent to login.html
 *       (except login/register, where 401 means a wrong password, and getCurrentUser, which returns null)
 *   403 missing or invalid CSRF token
 *   404 not found, or it belongs to another user
 *   409 conflict (email already registered)
 *   0   the server could not be reached
 *
 * CSRF: the server puts the token in the XSRF-TOKEN cookie; every non-GET request copies it
 * into the X-XSRF-TOKEN header. Cookies are sent with credentials: 'same-origin'.
 *
 * Endpoints:
 *   register / login / logout / getCurrentUser -> POST /api/auth/register, POST /api/auth/login,
 *                                                 POST /api/auth/logout, GET /api/auth/me
 *   getCourses / createCourse                  -> GET, POST /api/courses
 *   updateCourse / deleteCourse                -> PUT, DELETE /api/courses/{id}
 *                                                 (PUT changes code/name/instructor/credits, never the grade scale)
 *   updateGradeScale                           -> PUT /api/courses/{id}/grade-scale  (body: the gradeScale list)
 *   getTasks / createTask                      -> GET, POST /api/tasks
 *   updateTask / updateTaskStatus / deleteTask -> PUT, PATCH, DELETE /api/tasks/{id}
 *   getGradeItems / createGradeItem            -> GET, POST /api/courses/{courseId}/grade-items
 *   updateGradeItem / deleteGradeItem          -> PATCH, DELETE /api/grade-items/{id}
 */
const Api = (() => {
  class ApiError extends Error {
    constructor(status, message, fieldErrors = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.fieldErrors = fieldErrors;
    }
  }

  const SESSION_ENDED = 'Your session has ended. Please log in again.';

  // Phase 1 kept all data (and SHA-256 password hashes) in localStorage. Remove it for good.
  try {
    localStorage.removeItem('studyplanner.db.v1');
  } catch (e) { /* storage blocked: nothing to remove */ }

  // ---------- CSRF token (cookie -> header) ----------

  function readCookie(name) {
    const prefix = name + '=';
    const found = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : null;
  }

  /** The server sets XSRF-TOKEN on any response; if it is missing (rare), ask for it once with a GET. */
  async function csrfToken() {
    let token = readCookie('XSRF-TOKEN');
    if (!token) {
      try {
        await fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      } catch (e) { /* the real request below will report the network error */ }
      token = readCookie('XSRF-TOKEN');
    }
    return token;
  }

  // ---------- one place for every request ----------

  function goToLogin() {
    if (/login\.html$/.test(location.pathname)) return;
    // App (js/app.js) is a top-level const, so it is not on window; check it with typeof.
    if (typeof App !== 'undefined' && typeof App.flashNext === 'function') App.flashNext(SESSION_ENDED, 'muted');
    location.replace('login.html');
  }

  async function errorFrom(res) {
    let body = null;
    try {
      body = await res.json();
    } catch (e) { /* not JSON (e.g. a proxy error page) */ }
    const fallback = {
      400: 'Please fix the highlighted fields.',
      401: SESSION_ENDED,
      403: 'Missing or invalid CSRF token. Reload the page and try again.',
      404: 'Not found.',
      409: 'This conflicts with existing data.'
    }[res.status] || 'Something went wrong. Please try again.';
    const message = body && typeof body.message === 'string' ? body.message : fallback;
    const fieldErrors = body && body.fieldErrors && typeof body.fieldErrors === 'object' ? body.fieldErrors : {};
    return new ApiError(res.status, message, fieldErrors);
  }

  /**
   * method, path, optional JSON body.
   * options.auth: true for login/register (401 there is a wrong password, not an expired session).
   * Returns the parsed JSON, or undefined for 204 No Content.
   */
  async function request(method, path, body, options = {}, retried = false) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      const token = await csrfToken();
      if (token) headers['X-XSRF-TOKEN'] = token;
    }

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
        // Lets a save started while leaving the page (grades.js "pagehide") still reach the server.
        keepalive: method !== 'GET'
      });
    } catch (e) {
      throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
    }

    if (res.ok) {
      if (res.status === 204) return undefined;
      const text = await res.text();
      return text ? JSON.parse(text) : undefined;
    }

    const err = await errorFrom(res);
    // A 403 can mean the CSRF cookie changed meanwhile; the response carries a fresh one, so try once more.
    if (res.status === 403 && method !== 'GET' && !retried) {
      return request(method, path, body, options, true);
    }
    if (res.status === 401 && !options.auth) goToLogin();
    throw err;
  }

  const id = value => encodeURIComponent(value);

  // ==========================================================================
  // Auth
  // ==========================================================================

  /** Creates the account and logs in. 400 field errors, 409 email already used. */
  function register({ name, email, password } = {}) {
    return request('POST', '/api/auth/register', { name, email, password }, { auth: true });
  }

  /** 401 with fieldErrors.password when the email or password is wrong. */
  function login({ email, password } = {}) {
    return request('POST', '/api/auth/login', { email, password }, { auth: true });
  }

  async function logout() {
    await request('POST', '/api/auth/logout', undefined, { auth: true });
  }

  /** Returns the logged-in user, or null when nobody is logged in (never redirects). */
  async function getCurrentUser() {
    try {
      return await request('GET', '/api/auth/me', undefined, { auth: true });
    } catch (err) {
      if (err.status === 401) return null;
      throw err;
    }
  }

  // ==========================================================================
  // Courses
  // ==========================================================================

  function getCourses() {
    return request('GET', '/api/courses');
  }

  /** data: { code, name, instructor, credits } (+ optional gradeScale). New courses get the default scale. */
  function createCourse(data = {}) {
    return request('POST', '/api/courses', data);
  }

  /** Changes code, name, instructor, credits. Never the grade scale. */
  function updateCourse(courseId, data = {}) {
    return request('PUT', `/api/courses/${id(courseId)}`, {
      code: data.code, name: data.name, instructor: data.instructor, credits: data.credits
    });
  }

  /** Replace the course's grade scale (the full list of 8 entries, highest first). */
  function updateGradeScale(courseId, gradeScale) {
    return request('PUT', `/api/courses/${id(courseId)}/grade-scale`, gradeScale);
  }

  /** Deletes the course together with its tasks, grade items and grade scale. */
  async function deleteCourse(courseId) {
    await request('DELETE', `/api/courses/${id(courseId)}`);
  }

  // ==========================================================================
  // Tasks
  // ==========================================================================

  /** All tasks of the user, sorted by due date. */
  function getTasks() {
    return request('GET', '/api/tasks');
  }

  function createTask(data = {}) {
    return request('POST', '/api/tasks', data);
  }

  /** Full update: { title, courseId, dueDate, status }. */
  function updateTask(taskId, data = {}) {
    return request('PUT', `/api/tasks/${id(taskId)}`, {
      title: data.title, courseId: data.courseId, dueDate: data.dueDate, status: data.status
    });
  }

  function updateTaskStatus(taskId, status) {
    return request('PATCH', `/api/tasks/${id(taskId)}`, { status });
  }

  async function deleteTask(taskId) {
    await request('DELETE', `/api/tasks/${id(taskId)}`);
  }

  // ==========================================================================
  // Grade items (assessments)
  // ==========================================================================

  function getGradeItems(courseId) {
    return request('GET', `/api/courses/${id(courseId)}/grade-items`);
  }

  /** data: { name, type, score (null = not graded), maxScore, weight } */
  function createGradeItem(courseId, data = {}) {
    return request('POST', `/api/courses/${id(courseId)}/grade-items`, data);
  }

  /** Partial update (PATCH): send only the fields that changed. score: null = not graded yet. */
  function updateGradeItem(itemId, patch = {}) {
    return request('PATCH', `/api/grade-items/${id(itemId)}`, patch);
  }

  async function deleteGradeItem(itemId) {
    await request('DELETE', `/api/grade-items/${id(itemId)}`);
  }

  return {
    ApiError,
    register, login, logout, getCurrentUser,
    getCourses, createCourse, updateCourse, updateGradeScale, deleteCourse,
    getTasks, createTask, updateTask, updateTaskStatus, deleteTask,
    getGradeItems, createGradeItem, updateGradeItem, deleteGradeItem
  };
})();
