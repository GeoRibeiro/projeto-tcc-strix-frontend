/**
 * Login de verdade. Envia email e senha ao APP do CUPCAM (Vercel), e nao mais
 * direto a API do Render.
 *
 * POR QUE (29/09/2026): a API roda no plano gratuito do Render, que hiberna e
 * leva 30-60 s pra acordar. Antes a pessoa ficava AQUI, com o botao girando,
 * ate' a API responder. Agora o formulario vai direto pro app, que esta sempre
 * de pe: ele guarda as credenciais cifradas por ate' 2 min e mostra a tela
 * "Servidores ligando" com um cronometro enquanto tenta o login.
 *
 * As URLs da API e do app vem de js/login-config.js (resolverConfigLogin),
 * que precisa ser carregado antes deste arquivo.
 *
 * Fluxo com `state` (protecao contra login CSRF):
 *   1. O usuario chega aqui vindo de {APP}/entrar/iniciar, que gera um
 *      `state`, grava num cookie do app e manda pra ca com ?state=...
 *   2. Sem `state` na URL, mandamos pra /entrar/iniciar pra gerar um.
 *   3. O formulario leva o MESMO state pro app, que o confere contra o
 *      cookie antes de usar as credenciais.
 */

const MENSAGEM_NAO_CONFIGURADO = "Login indisponível: o site ainda não foi configurado para produção.";
const MENSAGEM_ESQUECEU_SENHA = "Peça à coordenação para redefinir sua senha.";
const TEXTO_BOTAO = "Entrar";
// So' pro leitor de tela: na tela o botao mostra apenas o spinner, sem frase.
const ROTULO_BOTAO_ENVIANDO = "Entrando";
const ID_ERRO = "auth-erro";

/**
 * Le o `state` da query string. String vazia/so espacos conta como ausente.
 *
 * @param {string} search Normalmente `window.location.search`.
 * @returns {string | null}
 */
function lerStateDaUrl(search) {
  const state = new URLSearchParams(search).get("state");
  return state && state.trim() ? state : null;
}

document.addEventListener("DOMContentLoaded", () => {
  const formulario = document.querySelector(".form-auth");
  if (!formulario) return;

  const campoEmail = document.getElementById("email");
  const campoSenha = document.getElementById("senha");
  const botao = formulario.querySelector(".botao-auth");

  ligarAvisoEsqueceuSenha();

  const config = resolverConfigLogin(window.location.hostname);
  if (!config.configurado) {
    desabilitarFormulario(formulario);
    mostrarErro(MENSAGEM_NAO_CONFIGURADO);
    return;
  }

  const state = lerStateDaUrl(window.location.search);
  if (!state) {
    // Sem state nao ha como o app conferir a origem do login: vai buscar um.
    // replace (e nao href) pra esta visita sem state nao ficar no historico.
    window.location.replace(`${config.appUrl}/entrar/iniciar`);
    return;
  }

  acordarServidor(config.apiUrl);

  // Voltar do app pelo botao "voltar" pode restaurar a pagina do bfcache com
  // o botao ainda travado no spinner.
  window.addEventListener("pageshow", (evento) => {
    if (evento.persisted) liberarBotao(botao);
  });

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (botao.disabled) return;

    const email = campoEmail.value.trim();
    const senha = campoSenha.value;

    limparErro();

    const vazios = [];
    if (!email) vazios.push(campoEmail);
    if (!senha) vazios.push(campoSenha);
    if (vazios.length) {
      mostrarErro("Preencha email e senha.", vazios);
      vazios[0].focus();
      return;
    }

    // Protege contra duplo clique/enter enquanto a pagina troca.
    mostrarCarregando(botao);

    // Envio NATIVO do formulario (nao fetch): o navegador navega pro app na
    // hora, levando email, senha e state no corpo do POST — nunca na URL.
    // O `state` entra como campo oculto; os dois campos ja' tem `name`.
    const campoState = document.createElement("input");
    campoState.type = "hidden";
    campoState.name = "state";
    campoState.value = state;
    formulario.append(campoState);
    campoEmail.value = email;

    formulario.method = "post";
    formulario.action = `${config.appUrl}/entrar/credenciais`;
    // submit() nao dispara o evento "submit" de novo (sem laco).
    formulario.submit();
  });
});

/**
 * Toque silencioso pra API ir acordando enquanto a pessoa digita. Sem ele, o
 * relogio dos 30-60 s so' comecaria no clique em "Entrar".
 *
 * GET em /auth/login: a rota so' aceita POST, entao a resposta e' um 405
 * inofensivo -- nao tenta login nem conta no limite de tentativas.
 * `no-cors` porque a resposta nao interessa, so' o servidor ter recebido.
 * Falha e' ignorada: quem insiste ate' a API responder e' a tela de espera do app.
 *
 * @param {string} apiUrl
 */
function acordarServidor(apiUrl) {
  fetch(`${apiUrl}/auth/login`, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(
    () => {},
  );
}

/**
 * Troca o texto do botao por um spinner. O rotulo acessivel continua dizendo
 * o que esta acontecendo (aria-label + aria-busy) pra quem usa leitor de tela.
 */
function mostrarCarregando(botao) {
  botao.disabled = true;
  botao.classList.add("carregando");
  botao.setAttribute("aria-busy", "true");
  botao.setAttribute("aria-label", ROTULO_BOTAO_ENVIANDO);

  const spinner = document.createElement("span");
  spinner.className = "botao-spinner";
  spinner.setAttribute("aria-hidden", "true");
  botao.replaceChildren(spinner);
}

function liberarBotao(botao) {
  botao.disabled = false;
  botao.classList.remove("carregando");
  botao.removeAttribute("aria-busy");
  botao.removeAttribute("aria-label");
  botao.textContent = TEXTO_BOTAO;
}

function desabilitarFormulario(formulario) {
  formulario.querySelectorAll("input, button").forEach((elemento) => {
    elemento.disabled = true;
  });
}

/**
 * Mostra a mensagem de erro (sempre via textContent -- nunca innerHTML) e
 * liga os campos invalidos a ela por aria-describedby.
 *
 * @param {string} mensagem
 * @param {HTMLElement[]} [camposInvalidos]
 */
function mostrarErro(mensagem, camposInvalidos = []) {
  limparErro();
  const formulario = document.querySelector(".form-auth");
  const aviso = document.createElement("p");
  aviso.id = ID_ERRO;
  aviso.className = "auth-erro";
  aviso.setAttribute("role", "alert");
  aviso.textContent = mensagem;
  formulario.insertBefore(aviso, formulario.querySelector(".botao-auth"));

  camposInvalidos.forEach((campo) => {
    campo.setAttribute("aria-invalid", "true");
    campo.setAttribute("aria-describedby", ID_ERRO);
  });
}

function limparErro() {
  const existente = document.getElementById(ID_ERRO);
  if (existente) existente.remove();

  document.querySelectorAll(".form-auth [aria-invalid]").forEach((campo) => {
    campo.removeAttribute("aria-invalid");
    campo.removeAttribute("aria-describedby");
  });
}

/**
 * Fatia 1 nao tem recuperacao de senha: so o admin redefine. O "link" vira
 * um aviso inline, anunciado pela regiao aria-live do proprio HTML.
 */
function ligarAvisoEsqueceuSenha() {
  const gatilho = document.querySelector(".link-senha");
  const aviso = document.getElementById("aviso-senha");
  if (!gatilho || !aviso) return;

  gatilho.addEventListener("click", (evento) => {
    evento.preventDefault();
    aviso.textContent = MENSAGEM_ESQUECEU_SENHA;
  });
}
