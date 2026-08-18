// Camada de armazenamento: IndexedDB para os arquivos PDF (Blob) e
// localStorage para os metadados leves da biblioteca (progresso, thumbnail, etc).

const DB_NOME = 'leitor-pdf-db';
const DB_VERSAO = 1;
const STORE_ARQUIVOS = 'arquivos';
const CHAVE_INDICE = 'leitor-pdf-biblioteca';

let dbPromise = null;

function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ARQUIVOS)) {
        db.createObjectStore(STORE_ARQUIVOS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function salvarArquivo(id, blob) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARQUIVOS, 'readwrite');
    tx.objectStore(STORE_ARQUIVOS).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function lerArquivo(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARQUIVOS, 'readonly');
    const req = tx.objectStore(STORE_ARQUIVOS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function removerArquivo(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARQUIVOS, 'readwrite');
    tx.objectStore(STORE_ARQUIVOS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Metadados (localStorage) ----

function gerarId(arquivo) {
  return `${arquivo.name}-${arquivo.size}-${arquivo.lastModified}`;
}

function lerIndice() {
  try {
    const bruto = localStorage.getItem(CHAVE_INDICE);
    return bruto ? JSON.parse(bruto) : {};
  } catch (e) {
    console.error('Falha ao ler índice da biblioteca', e);
    return {};
  }
}

function salvarIndice(indice) {
  localStorage.setItem(CHAVE_INDICE, JSON.stringify(indice));
}

function listarLivros() {
  const indice = lerIndice();
  return Object.values(indice).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

function obterLivro(id) {
  const indice = lerIndice();
  return indice[id] || null;
}

function salvarMetadadoLivro(meta) {
  const indice = lerIndice();
  indice[meta.id] = meta;
  salvarIndice(indice);
}

function removerMetadadoLivro(id) {
  const indice = lerIndice();
  delete indice[id];
  salvarIndice(indice);
}

function atualizarProgresso(id, paginaAtual, totalPaginas) {
  const indice = lerIndice();
  const meta = indice[id];
  if (!meta) return;
  meta.paginaAtual = paginaAtual;
  meta.totalPaginas = totalPaginas;
  meta.percentual = totalPaginas > 0 ? Math.round((paginaAtual / totalPaginas) * 100) : 0;
  meta.atualizadoEm = Date.now();
  salvarIndice(indice);
}

// Lembra o nível de zoom escolhido, individualmente por livro (como a
// página atual). Não mexe em atualizadoEm — só trocar o zoom não deve
// reordenar a biblioteca por "lido recentemente".
function salvarZoom(id, zoom) {
  const indice = lerIndice();
  const meta = indice[id];
  if (!meta) return;
  meta.zoom = zoom;
  salvarIndice(indice);
}
