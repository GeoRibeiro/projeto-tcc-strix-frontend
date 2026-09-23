/**
 * Login de verdade (22/09/2026, fatia 1). Chama a API do CUPCAM direto do
 * navegador -- rota /auth/login nao exige X-API-Key de proposito (ver
 * spec), entao nao ha chave nenhuma pra proteger aqui.
 *
 * CUPCAM_API_URL e APP_URL ficam no topo, nao em .env: este site nao tem
 * build step (HTML/CSS/JS puro), entao nao ha onde variavel de ambiente
 * seria lida. Trocar de dominio e' editar estas duas linhas.
 */
const CUPCAM_API_URL = "http://127.0.0.1:8000";
const APP_URL = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", () => {
  const formulario = document.querySelector(".form-auth");
  if (!formulario) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;
    const botao = formulario.querySelector(".botao-auth");

    limparErro();

    if (!email || !senha) {
      mostrarErro("Preencha email e senha.");
      return;
    }

    botao.disabled = true;
    botao.textContent = "Entrando...";

    try {
      const resposta = await fetch(`${CUPCAM_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      if (resposta.status === 429) {
        mostrarErro("Muitas tentativas. Aguarde alguns minutos.");
        return;
      }
      if (!resposta.ok) {
        mostrarErro("Email ou senha inválidos.");
        return;
      }

      const { token } = await resposta.json();
      window.location.href = `${APP_URL}/entrar?token=${encodeURIComponent(token)}`;
    } catch {
      mostrarErro("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  });
});

function mostrarErro(mensagem) {
  limparErro();
  const formulario = document.querySelector(".form-auth");
  const aviso = document.createElement("p");
  aviso.className = "auth-erro";
  aviso.textContent = mensagem;
  aviso.setAttribute("role", "alert");
  formulario.insertBefore(aviso, formulario.querySelector(".botao-auth"));
}

function limparErro() {
  const existente = document.querySelector(".auth-erro");
  if (existente) existente.remove();
}
