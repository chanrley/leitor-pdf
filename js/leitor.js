// Lógica do leitor: carrega o PDF do IndexedDB, renderiza páginas e
// coordena a virada com efeito visual, salvando o progresso a cada mudança.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// Bloqueio extra do pinch-zoom nativo do navegador (o meta viewport com
// user-scalable=no não é suficiente em aparelhos com "Forçar zoom" ativado
// nas opções de acessibilidade do Chrome — isso amplia a PÁGINA inteira,
// incluindo o cabeçalho, e não deve ser confundido com o zoom da página
// (botões +/-), que só afeta o canvas.
document.addEventListener('touchmove', (ev) => {
  if (ev.touches.length > 1) ev.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (ev) => ev.preventDefault());

const params = new URLSearchParams(window.location.search);
const idLivro = params.get('id');

const dicaCarregando = document.getElementById('dica-carregando');
const molduraLivro = document.getElementById('moldura-livro');
const livroContainer = document.getElementById('livro-container');
const canvasBase = document.getElementById('canvas-base');
const zonaEsquerda = document.getElementById('zona-esquerda');
const zonaDireita = document.getElementById('zona-direita');
const tituloLeitor = document.getElementById('titulo-leitor');
const contadorPaginas = document.getElementById('contador-paginas');
const barraPreenchida = document.getElementById('barra-preenchida');
const btnZoomMais = document.getElementById('btn-zoom-mais');
const btnZoomMenos = document.getElementById('btn-zoom-menos');

let pdf = null;
let meta = null;
let paginaAtual = 1;

// Zoom: o canvas recebe largura/altura REAIS em px (sem transform:scale) e o
// PDF é re-renderizado em resolução maior. O recorte é feito pela .moldura-livro,
// que está fora do contexto 3D do flip — por isso nunca vaza da moldura.
const ZOOM_MINIMO = 0.7;
const ZOOM_MAXIMO = 2.2;
const PASSO_ZOOM = 0.15;
let escalaZoom = 1;

// Tamanho (em px CSS) que a página ocupa com zoom 1, ou seja, cabendo inteira
// dentro da moldura. Calculado a cada renderização.
let larguraBase = 0;
let alturaBase = 0;
let escalaAjuste = 1;

function aplicarZoom() {
  if (larguraBase && alturaBase) {
    const larguraFinal = Math.round(larguraBase * escalaZoom);
    const alturaFinal = Math.round(alturaBase * escalaZoom);
    canvasBase.style.width = `${larguraFinal}px`;
    canvasBase.style.height = `${alturaFinal}px`;

    // Quando a página (já com zoom) cabe na moldura em algum eixo,
    // centralizamos NESSE eixo — sobra espaço igual dos dois lados (ex.:
    // zoom baixo, ou página com aspecto diferente da moldura), o que é mais
    // agradável do que deixar grudada no canto. Os dois eixos são avaliados
    // separadamente (não com "E" lógico): é comum o zoom estourar só a
    // largura (ou só a altura) da moldura, e nesse caso o eixo que ainda
    // cabe deve continuar centralizado — se usássemos um único flag
    // combinado, um eixo transbordando "arrastava" o outro pro canto junto,
    // que era exatamente o bug (página grudada na margem direita mesmo
    // tendo sobra vertical). Só o eixo que efetivamente não cabe mantém a
    // ancoragem no canto + rolagem (ver preservarFocoZoom), senão volta o
    // corte simétrico que já corrigimos antes.
    const wrap = document.getElementById('pagina-base');
    if (wrap) {
      const cabeLargura = larguraFinal <= molduraLivro.clientWidth;
      const cabeAltura = alturaFinal <= molduraLivro.clientHeight;
      wrap.classList.toggle('pagina-canvas-wrap--centralizada-x', cabeLargura);
      wrap.classList.toggle('pagina-canvas-wrap--centralizada-y', cabeAltura);
    }
  }
  btnZoomMais.disabled = escalaZoom >= ZOOM_MAXIMO;
  btnZoomMenos.disabled = escalaZoom <= ZOOM_MINIMO;
}

// Com zoom, o canvas cresce além da moldura. O wrap (.pagina-canvas-wrap)
// rola em vez de recortar (overflow: auto), senão o que ultrapassa a
// moldura some sem que dê pra alcançar.
//
// A posição de rolagem escolhida pelo leitor é lembrada por livro e
// reaplicada sempre — ao virar de página e ao reabrir o app — em vez de
// voltar pro canto superior-esquerdo a cada página. Guardamos como FRAÇÃO
// (0-1), não pixels, porque o tamanho rolável muda de página pra página e
// com o zoom.
function restaurarPosicaoSalva() {
  const wrap = document.getElementById('pagina-base');
  if (!wrap) return;
  const fracX = meta && typeof meta.posX === 'number' ? meta.posX : 0;
  const fracY = meta && typeof meta.posY === 'number' ? meta.posY : 0;
  const maxLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
  wrap.scrollLeft = Math.max(0, Math.min(maxLeft, fracX * wrap.scrollWidth));
  wrap.scrollTop = Math.max(0, Math.min(maxTop, fracY * wrap.scrollHeight));
}

// Salva a posição atual (com debounce, pra não gravar a cada pixel rolado)
// toda vez que o leitor rola a página.
function registrarSalvamentoDePosicao(wrap) {
  let temporizador = null;
  wrap.addEventListener('scroll', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const fracX = wrap.scrollWidth ? wrap.scrollLeft / wrap.scrollWidth : 0;
      const fracY = wrap.scrollHeight ? wrap.scrollTop / wrap.scrollHeight : 0;
      if (meta) {
        meta.posX = fracX;
        meta.posY = fracY;
      }
      salvarPosicao(idLivro, fracX, fracY);
    }, 250);
  });
}

// Executa `fn` (que redimensiona o canvas) mantendo visível o mesmo ponto
// da página que já estava no canto superior-esquerdo da viewport antes da
// mudança — não o CENTRO: quando a página ainda não tem overflow (ex.: o
// primeiro clique de zoom, partindo do ajuste que cabe inteiro na
// moldura), ancorar no centro faz fracX/fracY caírem sempre em 0.5,
// reproduzindo o mesmo corte simétrico do bug original. Ancorando no
// canto, a margem esquerda/topo continua visível desde o primeiro passo
// de zoom, e o crescimento acontece "para dentro" (direita/baixo).
async function preservarFocoZoom(fn) {
  const wrap = document.getElementById('pagina-base');
  if (!wrap) return fn();

  const larguraAntes = wrap.scrollWidth;
  const alturaAntes = wrap.scrollHeight;
  const fracX = larguraAntes ? wrap.scrollLeft / larguraAntes : 0;
  const fracY = alturaAntes ? wrap.scrollTop / alturaAntes : 0;

  const resultado = await fn();

  const maxLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
  wrap.scrollLeft = Math.max(0, Math.min(maxLeft, fracX * wrap.scrollWidth));
  wrap.scrollTop = Math.max(0, Math.min(maxTop, fracY * wrap.scrollHeight));

  return resultado;
}

async function mudarZoom(delta) {
  const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, +(escalaZoom + delta).toFixed(2)));
  if (novo === escalaZoom) return;
  escalaZoom = novo;
  await preservarFocoZoom(async () => {
    aplicarZoom(); // resposta imediata (redimensiona o canvas já desenhado)
    if (pdf) await renderizarPagina(paginaAtual); // re-renderiza nítido
  });
  salvarZoom(idLivro, escalaZoom);
}

btnZoomMais.addEventListener('click', () => mudarZoom(PASSO_ZOOM));
btnZoomMenos.addEventListener('click', () => mudarZoom(-PASSO_ZOOM));

async function iniciar() {
  if (!idLivro) {
    dicaCarregando.textContent = 'Livro não encontrado.';
    return;
  }

  meta = obterLivro(idLivro);
  if (!meta) {
    dicaCarregando.textContent = 'Livro não encontrado na biblioteca.';
    return;
  }

  tituloLeitor.textContent = meta.nome;
  paginaAtual = meta.paginaAtual || 1;
  escalaZoom = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, meta.zoom || 1));

  const blob = await lerArquivo(idLivro);
  if (!blob) {
    dicaCarregando.textContent = 'Arquivo do livro não foi encontrado localmente.';
    return;
  }

  const buffer = await blob.arrayBuffer();
  pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  if (paginaAtual > pdf.numPages) paginaAtual = pdf.numPages;

  dicaCarregando.hidden = true;
  molduraLivro.hidden = false;

  await renderizarPagina(paginaAtual);
  restaurarPosicaoSalva();
  atualizarRodape();

  registrarZonasDeClique(zonaEsquerda, zonaDireita, irParaPaginaAnterior, irParaProximaPagina);
  registrarSalvamentoDePosicao(document.getElementById('pagina-base'));
}

async function renderizarPagina(numero) {
  const pagina = await pdf.getPage(numero);
  const viewportBase = pagina.getViewport({ scale: 1 });

  // A página com zoom 1 cabe INTEIRA dentro da moldura (limita largura e altura).
  const larguraMoldura = molduraLivro.clientWidth || 720;
  const alturaMoldura = molduraLivro.clientHeight || 960;
  escalaAjuste = Math.min(
    larguraMoldura / viewportBase.width,
    alturaMoldura / viewportBase.height
  );
  larguraBase = viewportBase.width * escalaAjuste;
  alturaBase = viewportBase.height * escalaAjuste;

  // Desenha em alta resolução (zoom * densidade de pixels) para o texto ficar
  // nítido ao ampliar, sem que o ELEMENTO canvas dependa de transform.
  const densidade = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = pagina.getViewport({ scale: escalaAjuste * escalaZoom * densidade });

  canvasBase.width = Math.round(viewport.width);
  canvasBase.height = Math.round(viewport.height);
  const contexto = canvasBase.getContext('2d');
  await pagina.render({ canvasContext: contexto, viewport }).promise;

  aplicarZoom();
}

function atualizarRodape() {
  contadorPaginas.textContent = `${paginaAtual} / ${pdf.numPages}`;
  const percentual = Math.round((paginaAtual / pdf.numPages) * 100);
  barraPreenchida.style.width = `${percentual}%`;
}

async function irParaProximaPagina() {
  if (paginaAtual >= pdf.numPages) return;
  const snapshot = canvasBase.toDataURL('image/png');
  const flip = criarCamadaFlip(livroContainer, snapshot, 'proxima', {
    largura: larguraBase * escalaZoom,
    altura: alturaBase * escalaZoom
  });

  paginaAtual += 1;
  await renderizarPagina(paginaAtual);
  restaurarPosicaoSalva();
  await flip;

  atualizarRodape();
  atualizarProgresso(idLivro, paginaAtual, pdf.numPages);
}

async function irParaPaginaAnterior() {
  if (paginaAtual <= 1) return;
  const snapshot = canvasBase.toDataURL('image/png');
  const flip = criarCamadaFlip(livroContainer, snapshot, 'anterior', {
    largura: larguraBase * escalaZoom,
    altura: alturaBase * escalaZoom
  });

  paginaAtual -= 1;
  await renderizarPagina(paginaAtual);
  restaurarPosicaoSalva();
  await flip;

  atualizarRodape();
  atualizarProgresso(idLivro, paginaAtual, pdf.numPages);
}

iniciar();
