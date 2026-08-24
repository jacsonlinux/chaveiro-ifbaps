#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAppConfig } from "../dist/config/env.js";

const config = createAppConfig();
const runtime = config.suapRuntime;
const baseUrl = runtime.baseUrl;
const loginUrl = runtime.loginUrl;
const username = runtime.username;
const password = runtime.password;

if (!baseUrl || !loginUrl || !username || !password) {
  throw new Error("configuracao SUAP incompleta para leitura de pessoas");
}

const outputPath = process.env.PEOPLE_JSON_PATH
  ? resolve(process.env.PEOPLE_JSON_PATH)
  : "/etc/chaveiro-ifbaps/pessoas-ps.json";

const browser = await chromium.launch({ headless: config.suap.browserHeadless });
const page = await browser.newPage();
page.setDefaultTimeout(config.suap.browserTimeoutMs);

await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
await page.locator('input[name="username"], input#id_username').first().fill(username);
await page.locator('input[name="password"], input#id_password').first().fill(password);
await Promise.all([
  page.waitForLoadState("domcontentloaded"),
  page.locator('button[type="submit"], input[type="submit"]').first().click(),
]);

const people = new Map();

for (let p = 1; p <= 7; p++) {
  const url = new URL(`/admin/rh/servidor/?excluido__exact=0&setoruo=27&p=${p}`, baseUrl).toString();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const rows = await page.evaluate(() => {
    const table = Array.from(document.querySelectorAll("table")).find((t) => t.innerText.includes("Dados Principais"));
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll("td")).map((c) => (c.textContent ?? "").trim()))
      .filter((cells) => cells.some((c) => c.includes("Nome:")));
  });
  for (const cells of rows) {
    const nomeCell = cells.find((c) => c.includes("Nome:")) ?? "";
    const cargoCell = cells.find((c) => c.includes("Cargo:")) ?? "";
    const nameMatch = nomeCell.match(/Nome:(.*?)\((\d+)\)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const matricula = nameMatch[2];
    const emailMatch = nomeCell.match(/E-mail:([^\n]*)/);
    const email = emailMatch && emailMatch[1].trim() ? emailMatch[1].trim() : null;
    const cargoMatch = cargoCell.match(/Cargo:(.*?)(?:Situação:|$)/);
    const cargo = cargoMatch && cargoMatch[1].trim() ? cargoMatch[1].trim() : null;
    const situacaoMatch = cargoCell.match(/Situação:(.*?)(?:$)/);
    const situacao = situacaoMatch && situacaoMatch[1].trim() ? situacaoMatch[1].trim() : null;
    people.set(matricula, { name, matricula, email, cargo, situacao });
  }
}

const normalizeText = (value) =>
  (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const result = [...people.values()]
  .map((person) => {
    const cargoText = (person.cargo ?? "").toUpperCase();
    let cargo = null;
    if (/^PROF(?:ESSOR)?/.test(cargoText)) cargo = "professor";
    else if (/^(TECNICO|ASSISTENTE|BIBLIOTECARIO|ADMINISTRADOR|ANALISTA|CONTADOR|PSICOLOGO|PEDAGOGO|NUTRICIONISTA|AUXILIAR|TRADUTOR|REVISOR|SECRETARIO|MEDICO|ENFERMEIRO|TEC )/.test(cargoText)) cargo = "tecnico";
    return {
      name: normalizeText(person.name),
      matricula: person.matricula,
      email: person.email ? person.email.toLowerCase() : null,
      cargo
    };
  })
  .filter((person) => person.cargo !== null)
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(
  `salvo ${result.length} pessoas em ${outputPath}`
);
await browser.close();