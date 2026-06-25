const botaoAbrir = document.querySelector("#menu-hamburguer");
const botaoFechar = document.querySelector(".fechar-menu");

const body = document.body;
const nav = document.querySelector("nav.mobile");

botaoAbrir.addEventListener("click", abrirMenu);
botaoFechar.addEventListener("click", fecharMenu);

function abrirMenu() {
    body.classList.add("escurecer");
    nav.classList.add("abrir");
}

function fecharMenu() {
    body.classList.remove("escurecer");
    nav.classList.remove("abrir");
}

document.addEventListener("click", (event) => {
    const clicouFora =
        !nav.contains(event.target) &&
        !botaoAbrir.contains(event.target);

    if (clicouFora && nav.classList.contains("abrir")) {
        fecharMenu();
    }
});