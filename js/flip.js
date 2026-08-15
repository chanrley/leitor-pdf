// Efeito visual de flip 3D: cria uma camada temporária com o snapshot da
// página atual e a anima com rotateY, simulando a página virando.

function criarCamadaFlip(container, dataUrlImagem, direcao, tamanho) {
  const camada = document.createElement('div');
  camada.className = 'pagina-canvas-wrap';
  camada.style.zIndex = '10';
  const img = document.createElement('img');
  img.src = dataUrlImagem;
  // Mesmo tamanho real (px) do canvas atual — sem transform:scale, para que o
  // recorte da .moldura-livro se aplique de forma confiável.
  if (tamanho && tamanho.largura && tamanho.altura) {
    img.style.width = `${Math.round(tamanho.largura)}px`;
    img.style.height = `${Math.round(tamanho.altura)}px`;
  }
  camada.appendChild(img);
  container.appendChild(camada);

  // Força reflow antes de aplicar a classe de animação.
  // eslint-disable-next-line no-unused-expressions
  camada.offsetWidth;

  camada.classList.add(direcao === 'proxima' ? 'virando-frente' : 'virando-verso');

  return new Promise((resolve) => {
    camada.addEventListener(
      'transitionend',
      () => {
        camada.remove();
        resolve();
      },
      { once: true }
    );
  });
}

function registrarZonasDeClique(zonaEsquerda, zonaDireita, aoAnterior, aoProxima) {
  let bloqueado = false;

  async function executar(fn) {
    if (bloqueado) return;
    bloqueado = true;
    try {
      await fn();
    } finally {
      bloqueado = false;
    }
  }

  zonaEsquerda.addEventListener('click', () => executar(aoAnterior));
  zonaDireita.addEventListener('click', () => executar(aoProxima));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') executar(aoAnterior);
    if (ev.key === 'ArrowRight') executar(aoProxima);
  });
}
