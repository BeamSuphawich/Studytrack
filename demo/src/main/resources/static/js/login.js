'use strict';

/* Login / Register page (two tabs on one page). */
(async () => {
  // Already logged in: go straight to the dashboard.
  try {
    if (await Api.getCurrentUser()) {
      location.replace('index.html');
      return;
    }
  } catch (e) { /* show the form */ }

  App.showPendingFlash();

  const TEXT = {
    login: {
      title: 'Welcome back',
      sub: 'Log in to see your courses and deadlines.',
      cta: 'Log in',
      switchText: 'Don’t have an account?',
      switchLink: 'Register'
    },
    register: {
      title: 'Create your account',
      sub: 'Free for students. Takes less than a minute.',
      cta: 'Create account',
      switchText: 'Already have an account?',
      switchLink: 'Log in'
    }
  };

  const form = document.getElementById('auth-form');
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const submitBtn = document.getElementById('auth-submit');
  const passwordInput = form.elements.password;
  let mode = location.hash === '#register' ? 'register' : 'login';

  function setMode(next) {
    mode = next;
    const t = TEXT[mode];
    tabs.forEach(tab => {
      const on = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== mode; });
    document.getElementById('auth-title').textContent = t.title;
    document.getElementById('auth-sub').textContent = t.sub;
    submitBtn.textContent = t.cta;
    document.getElementById('switch-text').textContent = t.switchText;
    document.getElementById('switch-link').textContent = t.switchLink;
    passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    passwordInput.placeholder = mode === 'login' ? 'Your password' : 'At least 8 characters';
    App.setFieldErrors(form, {});
    history.replaceState(null, '', mode === 'register' ? '#register' : location.pathname);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  // Arrow keys move between the two tabs.
  document.querySelector('[role=tablist]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = mode === 'login' ? 'register' : 'login';
    setMode(next);
    tabs.find(tab => tab.dataset.mode === next).focus();
  });

  document.getElementById('switch-link').addEventListener('click', () => {
    setMode(mode === 'login' ? 'register' : 'login');
    form.querySelector('.field:not([hidden]) .input').focus();
  });

  document.getElementById('forgot').addEventListener('click', () => {
    App.toast('Password reset isn’t available yet.', 'info');
  });

  App.bindErrorClearing(form);

  function validate(v) {
    const errors = {};
    if (mode === 'register' && !v.name.trim()) errors.name = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'Enter a valid email address.';
    if (v.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (mode === 'register' && v.confirm !== v.password) errors.confirm = 'Passwords don’t match.';
    return errors;
  }

  let busy = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const values = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      password: form.elements.password.value,
      confirm: form.elements.confirm.value
    };
    const errors = validate(values);
    App.setFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      App.focusFirstInvalid(form);
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    try {
      if (mode === 'login') {
        const user = await Api.login({ email: values.email, password: values.password });
        App.flashNext('Welcome back, ' + user.name.split(/\s+/)[0]);
      } else {
        await Api.register({ name: values.name, email: values.email, password: values.password });
        App.flashNext('Account created — welcome!');
      }
      location.href = 'index.html';
    } catch (err) {
      if (err && err.fieldErrors && Object.keys(err.fieldErrors).length) {
        App.setFieldErrors(form, err.fieldErrors);
        App.focusFirstInvalid(form);
      } else {
        App.handleError(err);
      }
    } finally {
      busy = false;
      submitBtn.disabled = false;
    }
  });

  setMode(mode);
})();
