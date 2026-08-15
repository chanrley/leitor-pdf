// Lógica da tela de biblioteca: listar, importar, abrir e remover livros.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const grade = document.getElementById('grade-livros');
const estadoVazio = document.getElementById('estado-vazio');
const entradaArquivo = document.getElementById('entrada-arquivo');

function renderizarBiblioteca() {
  const livros = listarLivros();
  grade.innerHTML = '';
  estadoVazio.hidden = livros.length > 0;

  for (const livro of livros) {
    const card = document.createElement('div');
    card.className = 'card-livro';
    card.innerHTML = `
      <button class="btn-remover" title="Remover" data-id="${livro.id}">✕</button>
      <img class="capa" src="${livro.thumbnail || ''}" alt="Capa de ${livro.nome}" />
      <div class="info-livro">
        <p class="titulo-livro">${livro.nome}</p>
        <div class="barra-progresso">
          <div class="barra-progresso-preenchida" style="width:${livro.percentual}%"></div>
        </div>
        <span class="percentual-texto">${livro.percentual}% lido</span>
      </div>
    `;
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.btn-remover')) return;
      window.location.href = `leitor.html?id=${encodeURIComponent(livro.id)}`;
    });
    card.querySelector('.btn-remover').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Remover "${livro.nome}" da biblioteca?`)) return;
      await removerArquivo(livro.id);
      removerMetadadoLivro(livro.id);
      renderizarBiblioteca();
    });
    grade.appendChild(card);
  }
}

async function gerarThumbnail(pdf) {
  const pagina = await pdf.getPage(1);
  const viewportBase = pagina.getViewport({ scale: 1 });
  const escala = 300 / viewportBase.width;
  const viewport = pagina.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const contexto = canvas.getContext('2d');
  await pagina.render({ canvasContext: contexto, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function importarArquivos(arquivos) {
  for (const arquivo of arquivos) {
    if (arquivo.type !== 'application/pdf') continue;
    const id = gerarId(arquivo);

    if (obterLivro(id)) {
      // Livro já está na biblioteca, apenas ignora duplicata.
      continue;
    }

    const bufferArray = await arquivo.arrayBuffer();
    await salvarArquivo(id, arquivo);

    const pdf = await pdfjsLib.getDocument({ data: bufferArray.slice(0) }).promise;
    const thumbnail = await gerarThumbnail(pdf);

    salvarMetadadoLivro({
      id,
      nome: arquivo.name.replace(/\.pdf$/i, ''),
      totalPaginas: pdf.numPages,
      paginaAtual: 1,
      percentual: 0,
      thumbnail,
      atualizadoEm: Date.now(),
    });
  }
  renderizarBiblioteca();
}

entradaArquivo.addEventListener('change', (ev) => {
  const arquivos = Array.from(ev.target.files || []);
  if (arquivos.length) importarArquivos(arquivos);
  entradaArquivo.value = '';
});

renderizarBiblioteca();
