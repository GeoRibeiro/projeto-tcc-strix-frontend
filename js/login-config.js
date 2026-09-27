/**
 * Escolhe pra onde o login aponta conforme o host que serve a pagina.
 *
 * Carregado ANTES do login.js (ver html/login.html). Este site nao tem build
 * step, entao nao existe .env: a decisao e' feita em tempo de execucao pela
 * `location.hostname`.
 *
 * Por que nao deixar localhost como padrao: em producao (HTTPS) uma chamada
 * pra http://127.0.0.1 e' mixed content (o navegador bloqueia) e, pior,
 * apontaria pra maquina do VISITANTE. Sem URL de producao configurada o
 * login fica desligado, nunca cai pra localhost.
 */

// Preencher com a URL do Render (API do CUPCAM), ex. "https://....onrender.com".
// Sem barra no final. Vazio = login desligado em producao.
const CUPCAM_API_URL_PRODUCAO = "";

// Preencher com a URL da Vercel (app Next do CUPCAM), ex. "https://....vercel.app".
// Sem barra no final. Vazio = login desligado em producao.
const APP_URL_PRODUCAO = "";

const CUPCAM_API_URL_DEV = "http://127.0.0.1:8000";
const APP_URL_DEV = "http://localhost:3000";

const HOSTS_DE_DESENVOLVIMENTO = ["localhost", "127.0.0.1"];

/**
 * Resolve as URLs do login para um hostname.
 *
 * @param {string} hostname Normalmente `window.location.hostname`.
 * @returns {{ambiente: "dev" | "producao", apiUrl: string, appUrl: string, configurado: boolean}}
 *   `configurado` e' false quando alguma URL de producao ainda esta vazia.
 */
function resolverConfigLogin(hostname) {
  if (HOSTS_DE_DESENVOLVIMENTO.includes(hostname)) {
    return {
      ambiente: "dev",
      apiUrl: CUPCAM_API_URL_DEV,
      appUrl: APP_URL_DEV,
      configurado: true,
    };
  }

  return {
    ambiente: "producao",
    apiUrl: CUPCAM_API_URL_PRODUCAO,
    appUrl: APP_URL_PRODUCAO,
    configurado: Boolean(CUPCAM_API_URL_PRODUCAO && APP_URL_PRODUCAO),
  };
}
