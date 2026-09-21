const body = document.body;

function aplicarTema() {
    const temaSalvo = localStorage.getItem("tema");

    if (temaSalvo === "escuro") {
        body.classList.add("dark-mode");
    } else {
        body.classList.remove("dark-mode");
    }
}

aplicarTema();

const botoesTema = document.querySelectorAll(".tema");

botoesTema.forEach(botao => {
    botao.addEventListener("click", () => {
        const modoEscuro = body.classList.toggle("dark-mode");

        localStorage.setItem(
            "tema",
            modoEscuro ? "escuro" : "claro"
        );
    });
});

const botaoAbrir = document.querySelector("#menu-hamburguer");
const botaoFechar = document.querySelector(".fechar-menu");
const nav = document.querySelector("nav.mobile");

function abrirMenu() {
    body.classList.add("escurecer");
    nav.classList.add("abrir");
}

function fecharMenu() {
    body.classList.remove("escurecer");
    nav.classList.remove("abrir");
}

if (botaoAbrir && nav) {
    botaoAbrir.addEventListener("click", abrirMenu);
}

if (botaoFechar) {
    botaoFechar.addEventListener("click", fecharMenu);
}

document.addEventListener("click", event => {
    if (!nav || !botaoAbrir) return;

    const clicouFora =
        !nav.contains(event.target) &&
        !botaoAbrir.contains(event.target);

    if (clicouFora && nav.classList.contains("abrir")) {
        fecharMenu();
    }
});

const paginaAtual = window.location.pathname.split("/").pop() || "index.html";

document.querySelectorAll("nav a").forEach(link => {
    const href = link.getAttribute("href");

    if (!href || href === "#") return;

    const arquivo = href.split("/").pop();

    if (arquivo === paginaAtual) {
        link.classList.add("pagina-ativa");
    }
});

const seletoresRevelar = [
    "main > div",
    "main > section",
    ".cards-desafios",
    ".card-diferencial",
    ".card-pessoa",
    ".card-tecno",
    ".card-guiauso",
    ".card-dica-uso",
    ".card-recebe-isso",
    ".card-artigo"
];

const elementosRevelar = document.querySelectorAll(seletoresRevelar.join(", "));

const primeiroBloco = document.querySelector("main > div, main > section");

const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (elementosRevelar.length && !semAnimacao) {
    const aoEntrarNaTela = (entradas, observador) => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;

            entrada.target.classList.add("aparecer");
            observador.unobserve(entrada.target);
        });
    };

    const observador = new IntersectionObserver(aoEntrarNaTela, {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.1
    });

    elementosRevelar.forEach(elemento => {
        if (elemento === primeiroBloco) return;

        elemento.classList.add("revelar");
        observador.observe(elemento);
    });
}

const botoesSenha = document.querySelectorAll(".mostrar-senha");

botoesSenha.forEach(botao => {
    botao.addEventListener("click", () => {
        const campo = document.querySelector("#" + botao.dataset.alvo);

        if (!campo) return;

        const visivel = campo.type === "text";

        campo.type = visivel ? "password" : "text";

        botao.setAttribute(
            "aria-label",
            visivel ? "Mostrar senha" : "Ocultar senha"
        );

        const icone = botao.querySelector("i");

        if (icone) {
            icone.className = visivel ? "ph ph-eye" : "ph ph-eye-slash";
        }
    });
});
