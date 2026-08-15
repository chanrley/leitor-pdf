// Alternância de tema claro/escuro, compartilhada entre biblioteca e leitor.
// Persiste a escolha em localStorage e aplica via atributo data-tema no <html>.

const CHAVE_TEMA = 'leitor-pdf-tema';

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  document.querySelectorAll('.btn-tema').forEach((btn) => {
    btn.textContent = tema === 'escuro' ? '☀️' : '🌙';
  });
}

function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro';
  const proximo = atual === 'escuro' ? 'claro' : 'escuro';
  localStorage.setItem(CHAVE_TEMA, proximo);
  aplicarTema(proximo);
}

function iniciarTema() {
  const temaSalvo = localStorage.getItem(CHAVE_TEMA)
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
  aplicarTema(temaSalvo);
  document.querySelectorAll('.btn-tema').forEach((btn) => {
    btn.addEventListener('click', alternarTema);
  });
}

iniciarTema();

// Registra o service worker (cache do app + PDF.js) para permitir uso offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Não foi possível registrar o service worker.', e);
    });
  });
}
