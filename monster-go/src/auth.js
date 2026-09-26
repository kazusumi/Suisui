// 管理画面のログイン（パスワードはタブを閉じるまで sessionStorage に保持）
import { api, toast } from './api.js';

const KEY = 'mg.adminPassword';

export function adminPassword() {
  return sessionStorage.getItem(KEY) || '';
}

// ログインできたら onReady(driver) を呼ぶ
export function requireAdmin(onReady) {
  const modal = document.querySelector('#loginModal');
  const form = document.querySelector('#loginForm');
  const tryLogin = async (pw) => {
    const r = await api('admin/check', { admin: pw });
    sessionStorage.setItem(KEY, pw);
    modal.hidden = true;
    document.querySelector('#app').hidden = false;
    onReady(r.driver);
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await tryLogin(new FormData(form).get('password'));
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  document.querySelector('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(KEY);
    location.reload();
  });
  const saved = adminPassword();
  if (saved) {
    tryLogin(saved).catch(() => {
      sessionStorage.removeItem(KEY);
      modal.hidden = false;
    });
  } else {
    modal.hidden = false;
  }
}
