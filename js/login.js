/**
 * Login de verdade (fatia 1). Chama a API do CUPCAM direto do navegador --
 * rota /auth/login nao exige X-API-Key de proposito (ver spec), entao nao ha
 * chave nenhuma pra proteger aqui.
 *
 * As URLs da API e do app vem de js/login-config.js (resolverConfigLogin),
 * que precisa ser carregado antes deste arquivo.
 *
 * Fluxo com `state` (protecao contra login CSRF):
 *   1. O usuario chega aqui vindo de {APP}/entrar/iniciar, que gera um
 *      `state`, grava num cookie do app e manda pra ca com ?state=...
 *   2. Sem `state` na URL, mandamos pra /entrar/iniciar pra gerar um.
 *   3. No sucesso, devolvemos token + o MESMO state pro app, que confere
 *      contra o cookie antes de aceitar o token.
 */

const MENSAGEM_ERRO_GENERICO = "Não foi possível entrar agora. Tente de novo.";
const MENSAGEM_ERRO_REDE = "Não foi possível falar com o servidor. Confira sua conexão e tente de novo.";
const MENSAGEM_NAO_CONFIGURADO = "Login indisponível: o site ainda não foi configurado para produção.";
const MENSAGEM_ESQUECEU_SENHA = "Peça à coordenação para redefinir sua senha.";
const TEXTO_BOTAO = "Entrar";
// So' pro leitor de tela: na tela o botao mostra apenas o spinner, sem frase.
const ROTULO_BOTAO_ENVIANDO = "Entrando";
const ID_ERRO = "auth-erro";

/**
 * A API roda no plano gratuito do Render, que hiberna e leva 30-60 s pra
 * acordar. Nesse meio tempo o balanceador dele pode responder 502/503/504 ou
 * derrubar a conexao -- nao e' erro de verdade, e' o servidor ligando. Por
 * isso esses casos sao tentados de novo em silencio (so' o spinner girando)
 * ate este teto; so' depois disso a pessoa ve uma mensagem.
 */
const TETO_ESPERA_SERVIDOR_MS = 90_000;
const INTERVALO_NOVA_TENTATIVA_MS = 3_000;
const STATUS_SERVIDOR_LIGANDO = [502, 503, 504];

/**
 * Traduz o status HTTP de uma resposta de erro do /auth/login em mensagem.
 * A mensagem nao pode afirmar uma causa que o status nao prova: um 500 com a
 * API fria no Render NAO e' "senha invalida".
 *
 * @param {number} status
 * @returns {{mensagem: string, camposInvalidos: boolean}}
 *   `camposInvalidos` indica se faz sentido marcar email/senha com aria-invalid.
 */
function interpretarErroLogin(status) {
  if (status === 401) {
    return { mensagem: "Email ou senha inválidos.", camposInvalidos: true };
  }
  if (status === 429) {
    return { mensagem: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", camposInvalidos: false };
  }
  if (status === 400 || status === 422) {
    return { mensagem: "Confira o email e a senha digitados.", camposInvalidos: true };
  }
  if (status >= 500) {
    return { mensagem: "O servidor está com problema agora. Tente de novo em instantes.", camposInvalidos: false };
  }
  return { mensagem: MENSAGEM_ERRO_GENERICO, camposInvalidos: false };
}

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

/**
 * Monta a URL de volta pro app. Os dois valores vao codificados porque vem
 * de fora (servidor e query string).
 *
 * @param {string} appUrl
 * @param {string} token
 * @param {string} state
 * @returns {string}
 */
function montarUrlEntrada(appUrl, token, state) {
  return `${appUrl}/entrar?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
}

/**
 * @param {unknown} token
 * @returns {boolean} true so para string nao vazia.
 */
function tokenValido(token) {
  return typeof token === "string" && token.trim() !== "";
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

  formulario.addEventListener("submit", async (evento) => {
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

    // Antes do await: protege contra duplo clique/enter.
    mostrarCarregando(botao);

    let resposta;
    try {
      resposta = await enviarLoginEsperandoServidor(config.apiUrl, { email, senha });
    } catch {
      // Rede fora do ar (ou servidor que nao acordou dentro do teto).
      falhar(MENSAGEM_ERRO_REDE);
      return;
    }

    if (!resposta.ok) {
      const { mensagem, camposInvalidos } = interpretarErroLogin(resposta.status);
      falhar(mensagem, camposInvalidos ? [campoEmail, campoSenha] : []);
      if (camposInvalidos && (resposta.status === 400 || resposta.status === 422)) {
        campoEmail.focus();
      }
      return;
    }

    let token;
    try {
      ({ token } = await resposta.json());
    } catch {
      // Corpo nao-JSON num 2xx: nao e' problema de rede nem de senha.
      falhar(MENSAGEM_ERRO_GENERICO);
      return;
    }

    if (!tokenValido(token)) {
      falhar(MENSAGEM_ERRO_GENERICO);
      return;
    }

    // Sucesso: o botao fica travado enquanto a navegacao acontece.
    window.location.href = montarUrlEntrada(config.appUrl, token, state);
  });

  /**
   * Caminho unico de erro depois do envio: mostra a mensagem e so entao
   * devolve o botao.
   */
  function falhar(mensagem, camposInvalidos = []) {
    mostrarErro(mensagem, camposInvalidos);
    liberarBotao(botao);
  }
});

/**
 * Toque silencioso pra API ir acordando enquanto a pessoa digita. Sem ele, o
 * relogio dos 30-60 s so' comecaria no clique em "Entrar".
 *
 * GET em /auth/login: a rota so' aceita POST, entao a resposta e' um 405
 * inofensivo -- nao tenta login nem conta no limite de tentativas.
 * `no-cors` porque a resposta nao interessa, so' o servidor ter recebido.
 * Falha e' ignorada: o envio de verdade tem as proprias novas tentativas.
 *
 * @param {string} apiUrl
 */
function acordarServidor(apiUrl) {
  fetch(`${apiUrl}/auth/login`, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(
    () => {},
  );
}

/**
 * POST /auth/login com novas tentativas enquanto o servidor esta ligando
 * (ver TETO_ESPERA_SERVIDOR_MS). Qualquer outra resposta -- sucesso, 401,
 * 429, 500 -- volta na hora pra quem chamou decidir.
 *
 * @param {string} apiUrl
 * @param {{email: string, senha: string}} credenciais
 * @returns {Promise<Response>}
 * @throws {TypeError} se a rede falhar ate o teto acabar.
 */
async function enviarLoginEsperandoServidor(apiUrl, credenciais) {
  const limite = Date.now() + TETO_ESPERA_SERVIDOR_MS;

  for (;;) {
    let resposta;
    try {
      resposta = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credenciais),
      });
    } catch (erro) {
      // fetch so rejeita por falha de rede/CORS/bloqueio -- nunca por status.
      if (Date.now() >= limite) throw erro;
      await esperar(INTERVALO_NOVA_TENTATIVA_MS);
      continue;
    }

    if (!STATUS_SERVIDOR_LIGANDO.includes(resposta.status) || Date.now() >= limite) {
      return resposta;
    }
    await esperar(INTERVALO_NOVA_TENTATIVA_MS);
  }
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
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
